import AsyncStorage from "@react-native-async-storage/async-storage";

export const WATCHDOG_STARTUP_WINDOW_MS = 15_000;
export const WATCHDOG_STORAGE_KEY = "upgrade-ai:self-healing:watchdog:v1";
const WATCHDOG_STATE_VERSION = 1;
const SAFE_MODE_FAILURE_THRESHOLD = 2;

export interface WatchdogStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface PersistedWatchdogState {
  version: typeof WATCHDOG_STATE_VERSION;
  /** Start time of the last launch that has not yet passed the startup window. */
  lastLaunchStartedAt: number | null;
  consecutiveFailures: number;
  /** Prevent a JS-caught startup error from being counted again at the next launch. */
  lastFailureCounted: boolean;
}

export interface WatchdogStatus {
  safeMode: boolean;
  consecutiveFailures: number;
  /** False means storage could not be read or written; the app should continue normally. */
  storageAvailable: boolean;
}

const emptyState = (): PersistedWatchdogState => ({
  version: WATCHDOG_STATE_VERSION,
  lastLaunchStartedAt: null,
  consecutiveFailures: 0,
  lastFailureCounted: false,
});

function parseState(raw: string | null): PersistedWatchdogState {
  if (!raw) return emptyState();

  try {
    const value = JSON.parse(raw) as Partial<PersistedWatchdogState>;
    const lastLaunchStartedAt = value.lastLaunchStartedAt;
    const consecutiveFailures = value.consecutiveFailures;

    if (
      value.version !== WATCHDOG_STATE_VERSION ||
      (lastLaunchStartedAt !== null &&
        (typeof lastLaunchStartedAt !== "number" ||
          !Number.isFinite(lastLaunchStartedAt))) ||
      typeof consecutiveFailures !== "number" ||
      !Number.isFinite(consecutiveFailures) ||
      consecutiveFailures < 0
    ) {
      return emptyState();
    }

    return {
      version: WATCHDOG_STATE_VERSION,
      lastLaunchStartedAt,
      consecutiveFailures: Math.floor(consecutiveFailures),
      lastFailureCounted: value.lastFailureCounted === true,
    };
  } catch {
    // A corrupt watchdog record must never prevent the app from starting. Only this key is reset.
    return emptyState();
  }
}

/**
 * Tracks incomplete startup attempts in AsyncStorage. A caller must invoke
 * markStartupHealthy() only after the first 15 seconds have elapsed; until then,
 * an unmarked launch is treated as a possible early crash on the next launch.
 */
export class WatchdogService {
  private launchPromise: Promise<WatchdogStatus> | null = null;
  private status: WatchdogStatus = {
    safeMode: false,
    consecutiveFailures: 0,
    storageAvailable: true,
  };

  constructor(
    private readonly storage: WatchdogStorage = AsyncStorage,
    private readonly now: () => number = Date.now,
  ) {}

  start(): Promise<WatchdogStatus> {
    if (!this.launchPromise) this.launchPromise = this.recordLaunch();
    return this.launchPromise.then(() => this.status);
  }

  /** Mark the current launch healthy and clear the consecutive-failure streak. */
  async markStartupHealthy(): Promise<WatchdogStatus> {
    await this.start();
    if (!this.status.storageAvailable) return this.status;

    const healthyState: PersistedWatchdogState = {
      version: WATCHDOG_STATE_VERSION,
      lastLaunchStartedAt: null,
      consecutiveFailures: 0,
      lastFailureCounted: false,
    };

    try {
      await this.storage.setItem(
        WATCHDOG_STORAGE_KEY,
        JSON.stringify(healthyState),
      );
      this.status = {
        safeMode: false,
        consecutiveFailures: 0,
        storageAvailable: true,
      };
    } catch (error) {
      console.warn(
        "[Watchdog] Unable to persist healthy startup state:",
        error,
      );
      this.status = { ...this.status, storageAvailable: false };
    }

    return this.status;
  }

  /** Count a caught early UI-startup failure while leaving the launch pending for crash detection. */
  async markStartupFailed(): Promise<WatchdogStatus> {
    await this.start();
    if (!this.status.storageAvailable) return this.status;

    try {
      const current = parseState(
        await this.storage.getItem(WATCHDOG_STORAGE_KEY),
      );
      if (current.lastLaunchStartedAt === null) return this.status;
      const elapsed = this.now() - current.lastLaunchStartedAt;
      if (elapsed < 0 || elapsed > WATCHDOG_STARTUP_WINDOW_MS)
        return this.status;
      if (current.lastFailureCounted) return this.status;

      const consecutiveFailures = current.consecutiveFailures + 1;
      await this.storage.setItem(
        WATCHDOG_STORAGE_KEY,
        JSON.stringify({ ...current, consecutiveFailures, lastFailureCounted: true }),
      );
      this.status = {
        safeMode: consecutiveFailures >= SAFE_MODE_FAILURE_THRESHOLD,
        consecutiveFailures,
        storageAvailable: true,
      };
    } catch (error) {
      console.warn(
        "[Watchdog] Unable to persist early startup failure:",
        error,
      );
      this.status = { ...this.status, storageAvailable: false };
    }

    return this.status;
  }

  private async recordLaunch(): Promise<WatchdogStatus> {
    try {
      const previous = parseState(
        await this.storage.getItem(WATCHDOG_STORAGE_KEY),
      );
      const startedAt = this.now();
      // A pending launch means its 15-second success marker never ran, regardless of
      // how long the user waited before relaunching. markStartupHealthy() clears it.
      const previousLaunchCrashedEarly =
        previous.lastLaunchStartedAt !== null && !previous.lastFailureCounted;
      const consecutiveFailures = previousLaunchCrashedEarly
        ? previous.consecutiveFailures + 1
        : previous.consecutiveFailures;
      const nextState: PersistedWatchdogState = {
        version: WATCHDOG_STATE_VERSION,
        lastLaunchStartedAt: startedAt,
        consecutiveFailures,
        lastFailureCounted: false,
      };

      await this.storage.setItem(
        WATCHDOG_STORAGE_KEY,
        JSON.stringify(nextState),
      );
      this.status = {
        safeMode: consecutiveFailures >= SAFE_MODE_FAILURE_THRESHOLD,
        consecutiveFailures,
        storageAvailable: true,
      };
    } catch (error) {
      // Failing closed here could lock users out of their data if local storage is unavailable.
      console.warn(
        "[Watchdog] Unable to persist startup state; continuing without crash-loop detection:",
        error,
      );
      this.status = {
        safeMode: false,
        consecutiveFailures: 0,
        storageAvailable: false,
      };
    }

    return this.status;
  }
}

export const watchdogService = new WatchdogService();
