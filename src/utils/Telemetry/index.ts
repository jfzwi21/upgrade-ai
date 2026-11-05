import { getApp } from '@react-native-firebase/app'
import { getAnalytics, logEvent, setAnalyticsCollectionEnabled } from '@react-native-firebase/analytics'
import { getCrashlytics, log as logCrashlytics, recordError, setAttributes, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics'
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { isDebugMode } from '@/utils/constants';

/** AsyncStorage key holding "false" once the user opts out under Settings > Utility > Anonymous telemetry */
const TELEMETRY_ENABLED_KEY = 'anythingllm_telemetry_enabled';

/**
 * Telemetry class for logging events to Firebase Analytics
 * There are custom events and standard events
 * Predefined events: https://rnfirebase.io/analytics/usage#predefined-events
 * Reserved events: https://rnfirebase.io/analytics/usage#reserved-events
 */
class Telemetry {
    private static instance: Telemetry;
    private analytics: ReturnType<typeof getAnalytics> | null = null;
    private crashlytics: ReturnType<typeof getCrashlytics> | null = null;
    private initialized = false;
    private isReady = false;
    private initializePromise: Promise<void> | null = null;
    private pendingEvents: Array<{ name: string; params: Record<string, any> }> = [];
    /**
     * Cached opt-out state so `logEvent` can bail synchronously. Hydrated from storage during
     * initialization; Firebase initialization failures leave telemetry disabled.
     */
    private enabled = true;
    private ready: Promise<void> = Promise.resolve();

    private disableTelemetry(message: string, error: unknown) {
        this.enabled = false;
        this.analytics = null;
        this.crashlytics = null;
        this.log(message, error);
    }

    /** Firebase APIs can throw when native Firebase is unavailable or not configured. */
    private async safelyCallFirebase(action: string, callback: () => unknown | Promise<unknown>): Promise<void> {
        try {
            await callback();
        } catch (error) {
            this.disableTelemetry(`[Telemetry] ${action} failed; telemetry disabled`, error);
        }
    }

    /**
     * Custom events are events that are not predefined by Firebase Analytics
     * We set them here so it is easier to manage and track them across the app
     */
    CUSTOM_EVENTS = {
        ONBOARDING: {
            COMPLETED: 'onboarding_completed',
            SURVEY_RESPONSE: 'onboarding_survey_response',
        },
        ACTIONS: {
            WORKSPACE_CREATED: 'workspace_created',
            CHAT_COMPLETED: 'chat_completed',
            /** The user pressed stop while a reply was generating - nothing was saved */
            CHAT_ABORTED: 'chat_aborted',
            /** A document was attached to a workspace (payload: documentType, mode = embedded | full) */
            DOCUMENT_IMPORTED: 'document_added',
            /** An image was attached to a prompt from the gallery, the camera or the share sheet (payload: source) */
            IMAGE_ATTACHED: 'image_attached',
            /** Another app shared files/images to AnythingLLM through the share sheet (payload: files, images) */
            CONTENT_SHARED: 'content_shared',
            /** An anythingllm://pull-hf link (Hugging Face "Use this model") opened the on-device picker (payload: repo, hasFile) */
            HF_PULL_LINK_OPENED: 'hf_pull_link_opened',
            /** Text highlighted in another app was sent to the Quick Actions card (payload: mode, action) */
            QUICK_CONTEXT_USED: 'quick_context_used',
            /** The selection-toolbar entry was switched on or off in Settings > Special tools (payload: enabled) */
            QUICK_CONTEXT_TOGGLED: 'quick_context_toggled',
            /** "Set up" / "Change" in Settings > Device Assistant, which opens Android's assistant settings (payload: alreadyDefault) */
            ASSISTANT_SETUP_OPENED: 'assistant_setup_opened',
            /** The assist gesture opened the assistant overlay */
            ASSISTANT_INVOKED: 'assistant_invoked',
            /** A prompt was sent from the assistant overlay (payload: screenshot, voice, followUp) */
            ASSISTANT_CHAT_SENT: 'assistant_chat_sent',
            /** An assistant behavior was switched in Settings > Assistant (payload: preference, enabled) */
            ASSISTANT_PREFERENCE_TOGGLED: 'assistant_preference_toggled',
            /** A background theme was picked in Settings > Assistant (payload: theme) */
            ASSISTANT_THEME_CHANGED: 'assistant_theme_changed',
            TOOL_CALLED: 'tool_called',
            /** The user switched a tool on from the tools sheet (payload: tool, provider) - disabling and suggestion-chip toggles are not tracked */
            TOOL_ENABLED: 'tool_enabled',
            LLM_SETTINGS_UPDATED: 'llm_settings_updated',
            /** A chat thread was exported (txt/md/json/pdf) and handed to the share sheet */
            THREAD_EXPORTED: 'thread_exported',
            /** A chat thread was forked into a new thread with a copy of its history */
            THREAD_FORKED: 'thread_forked',
            /** A user/assistant message pair was deleted from a thread */
            CHAT_DELETED: 'chat_deleted',
            /** A user/assistant message pair was removed and its prompt re-submitted */
            CHAT_RETRIED: 'chat_retried',
            /** The user switched the memory system on (disabling is not tracked) */
            MEMORIES_ENABLED: 'memories_enabled',
            /** The user saved a memory from the thread menu (payload: scope) */
            MEMORY_SAVED: 'memory_saved',
            /** A scheduled job was created (payload: tools count, notify) */
            SCHEDULED_JOB_CREATED: 'scheduled_job_created',
            SCHEDULED_JOB_RAN: 'scheduled_job_ran',
            /** The user approved a reminder from chat (payload: kind alarm|timer|calendar) */
            REMINDER_SET: 'reminder_set',
            /** The feature highlights carousel was dismissed (payload: audience new_user|upgrade, cards) */
            HIGHLIGHTS_VIEWED: 'highlights_viewed',

            /** The user use the QR code to connect to an AnythingLLM intance */
            EXTERNAL_CONNECTION_ESTABLISHED: 'external_connection_established',
            /** External workspace imported from the AnythingLLM Desktop */
            EXTERNAL_WORKSPACE_IMPORTED: 'external_workspace_imported',
        },
        /** The user switched anonymous telemetry off - the final event we send before going quiet */
        DISABLED_TELEMETRY: 'disabled_telemetry',
    } as const;

    constructor() {
        if (Telemetry.instance) return Telemetry.instance;
        Telemetry.instance = this;
    }

    /** Initialize Firebase only after the first app UI has committed (or when explicitly needed headlessly). */
    initialize(): Promise<void> {
        if (this.initializePromise) return this.initializePromise;
        this.initialized = true;
        try {
            this.analytics = getAnalytics(getApp());
            // Creating the Crashlytics instance installs its global JS error handler, so fatal JS
            // errors and native crashes are reported with their message and stack. Follows the same opt-out.
            this.crashlytics = getCrashlytics();
        } catch (error) {
            this.disableTelemetry('[Telemetry] Firebase is unavailable; telemetry disabled', error);
        }
        this.initializePromise = AsyncStorage.getItem(TELEMETRY_ENABLED_KEY)
            .then(async value => {
                if (!this.analytics || !this.crashlytics) {
                    this.enabled = false;
                    return;
                }
                this.enabled = value !== 'false';
                if (!this.enabled) {
                    const analytics = this.analytics;
                    const crashlytics = this.crashlytics;
                    await this.safelyCallFirebase('could not apply telemetry preference', () => Promise.all([
                        setAnalyticsCollectionEnabled(analytics, false),
                        setCrashlyticsCollectionEnabled(crashlytics, false),
                    ]));
                }
            })
            .catch(error => this.disableTelemetry('[Telemetry] could not initialize telemetry', error))
            .then(() => {
                this.isReady = true;
                const queued = this.pendingEvents.splice(0);
                queued.forEach(({ name, params }) => this.dispatchEvent(name, params));
            });
        this.ready = this.initializePromise;
        return this.initializePromise;
    }

    log(message: any, ...args: any[]) {
        console.log(`\x1b[32m[Telemetry]\x1b[0m`, message, ...args)
    }

    /**
     * Log a custom event to Firebase Analytics
     * https://rnfirebase.io/analytics/usage#custom-events
     */
    logEvent(name: string, params: Record<string, any> = {}) {
        if (!this.initialized) {
            if (this.pendingEvents.length < 100) this.pendingEvents.push({ name, params });
            return;
        }
        if (this.isReady) this.dispatchEvent(name, params);
        else this.ready.then(() => this.dispatchEvent(name, params));
    }

    private dispatchEvent(name: string, params: Record<string, any>) {
        const analytics = this.analytics;
        if (!this.enabled || !analytics) return;
        if (isDebugMode) this.log(`Tracking event: ${name}`, params);
        this.safelyCallFirebase('Analytics event logging', () => logEvent(analytics, name, params));
    }

    /**
     * Report an error the app recovered from (eg. caught by an error boundary) to Crashlytics as a
     * non-fatal issue. Uncaught errors are reported automatically by Crashlytics' global handler.
     * @param context - extra detail logged alongside the report, eg. the React component stack
     */
    recordError(error: Error, context?: string) {
        const crashlytics = this.crashlytics;
        if (!this.enabled || !crashlytics) return;
        this.safelyCallFirebase('Crashlytics error reporting', async () => {
            if (context) await logCrashlytics(crashlytics, context.slice(0, 2000));
            await recordError(crashlytics, error);
        });
    }

    /**
     * Runs a llama.rn `initLlama` call and stamps Crashlytics custom keys around it. A SIGSEGV inside
     * llama.cpp has no JS stack, so these keys are the only record of which GGUF was loading when it died.
     * Keys are per `kind` (`llama_<kind>_*`) so a concurrent embedder load never overwrites the chat model's.
     * `llama_<kind>_state` reads "loading" on a crash that happened during the load itself.
     * @param kind - which runtime is loading, eg. "chat", "embedder", "reranker"
     * @param path - absolute path of the GGUF being loaded
     * @param details - extra context, eg. source (catalog/imported) or n_ctx
     */
    async trackNativeModelLoad<T>(
        kind: string,
        path: string,
        details: Record<string, string | number | boolean>,
        load: () => Promise<T>,
    ): Promise<T> {
        if (!this.enabled || !this.crashlytics) return load();
        const file = path.split('/').pop() || path;
        const sizeMb = await RNFS.stat(path).then((s) => Math.round(Number(s.size) / (1024 * 1024))).catch(() => -1);
        const extra = Object.fromEntries(Object.entries(details).map(([key, value]) => [`llama_${kind}_${key}`, String(value)]));
        // Awaited so the keys reach the native SDK before the load can crash the process.
        await this.setCrashContext(`llama ${kind}: loading ${file} (${sizeMb}MB)`, {
            [`llama_${kind}_state`]: 'loading',
            [`llama_${kind}_model`]: file,
            [`llama_${kind}_size_mb`]: String(sizeMb),
            ...extra,
        });
        try {
            const result = await load();
            this.setCrashContext(`llama ${kind}: loaded ${file}`, { [`llama_${kind}_state`]: 'loaded' });
            return result;
        } catch (error) {
            this.setCrashContext(`llama ${kind}: failed to load ${file}`, { [`llama_${kind}_state`]: 'failed' });
            throw error;
        }
    }

    /** Adds a breadcrumb and custom keys to any crash report from here on. Never throws. */
    private async setCrashContext(breadcrumb: string, attributes: Record<string, string>) {
        const crashlytics = this.crashlytics;
        if (!this.enabled || !crashlytics) return;
        this.safelyCallFirebase('Crashlytics context recording', async () => {
            await logCrashlytics(crashlytics, breadcrumb);
            await setAttributes(crashlytics, attributes);
        });
    }

    /** Whether anonymous telemetry is currently on. Resolves once the stored setting has been read. */
    async isEnabled(): Promise<boolean> {
        await this.initialize();
        return this.enabled;
    }

    /**
     * Turn anonymous telemetry on or off and persist the choice.
     * Disabling sends one last `DISABLED_TELEMETRY` event so we can count opt-outs, then stops
     * Firebase analytics and crash report collection; every later `logEvent` call returns early.
     */
    async setEnabled(enabled: boolean): Promise<void> {
        await this.initialize();
        if (enabled === this.enabled) return;
        const analytics = this.analytics;
        const crashlytics = this.crashlytics;
        if (!analytics || !crashlytics) {
            this.enabled = false;
            await AsyncStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled));
            return;
        }
        if (!enabled) this.logEvent(this.CUSTOM_EVENTS.DISABLED_TELEMETRY);
        this.enabled = enabled;
        await AsyncStorage.setItem(TELEMETRY_ENABLED_KEY, String(enabled));
        await this.safelyCallFirebase('Analytics collection setting', () => setAnalyticsCollectionEnabled(analytics, enabled));
        if (this.analytics && this.crashlytics) {
            // Crash reports stay off in dev builds (firebase.json crashlytics_debug_enabled)
            await this.safelyCallFirebase('Crashlytics collection setting', () => setCrashlyticsCollectionEnabled(crashlytics, enabled && !__DEV__));
        }
        if (isDebugMode) this.log(`Anonymous telemetry ${enabled ? 'enabled' : 'disabled'}`);
    }
}

const telemetry = new Telemetry();
export default telemetry;
