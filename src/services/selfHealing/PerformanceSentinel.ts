import { AppState, Image, NativeModules, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const METRICS_KEY = "upgrade-ai:self-healing:performance-metrics:v1";
const MAX_SAMPLES = 24;
const JS_BOOT_STARTED_AT = Date.now();

type StartupTimingModule = {
  getProcessUptimeMs: () => Promise<number>;
};

export type PerformanceSample = {
  stage: string;
  measuredAt: number;
  jsStartupMs: number;
  nativeProcessUptimeMs: number | null;
  usedMemoryBytes: number | null;
  totalMemoryBytes: number | null;
};

let appStateSubscription: { remove: () => void } | null = null;
let cleanupInFlight: Promise<void> | null = null;

async function sampleMemory(): Promise<{
  usedMemoryBytes: number | null;
  totalMemoryBytes: number | null;
}> {
  try {
    const DeviceInfo = (await import("react-native-device-info")).default;
    const [usedMemoryBytes, totalMemoryBytes] = await Promise.all([
      DeviceInfo.getUsedMemory(),
      DeviceInfo.getTotalMemory(),
    ]);
    return { usedMemoryBytes, totalMemoryBytes };
  } catch (error) {
    console.warn("[PerformanceSentinel] Memory sampling unavailable:", error);
    return { usedMemoryBytes: null, totalMemoryBytes: null };
  }
}

async function sampleNativeProcessUptime(): Promise<number | null> {
  try {
    const timingModule = NativeModules.StartupTimingModule as
      | StartupTimingModule
      | undefined;
    if (!timingModule) return null;
    const uptime = await timingModule.getProcessUptimeMs();
    return Number.isFinite(uptime) ? uptime : null;
  } catch (error) {
    console.warn(
      "[PerformanceSentinel] Native startup timing unavailable:",
      error,
    );
    return null;
  }
}

async function saveSample(sample: PerformanceSample): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(METRICS_KEY);
    let previous: PerformanceSample[] = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) previous = parsed;
      } catch {
        previous = [];
      }
    }
    await AsyncStorage.setItem(
      METRICS_KEY,
      JSON.stringify([...previous, sample].slice(-MAX_SAMPLES)),
    );
  } catch (error) {
    console.warn(
      "[PerformanceSentinel] Could not persist local performance sample:",
      error,
    );
  }
}

async function releaseHeavyRuntimes(reason: string): Promise<void> {
  if (cleanupInFlight) return cleanupInFlight;
  cleanupInFlight = (async () => {
    const jobs: Promise<unknown>[] = [];
    jobs.push(
      import("@/store/ModelStore")
        .then(module => module.modelStore.releaseContext())
        .catch(error =>
          console.warn(
            "[PerformanceSentinel] Could not release chat model:",
            error,
          ),
        ),
    );
    jobs.push(
      import("@/utils/Embedder/onDevice")
        .then(module => new module.default().cleanup())
        .catch(error =>
          console.warn(
            "[PerformanceSentinel] Could not release embedder:",
            error,
          ),
        ),
    );

    if (Platform.OS === "android") {
      const imageWithMemoryCache = Image as typeof Image & {
        clearMemoryCache?: () => void | Promise<void>;
      };
      if (imageWithMemoryCache.clearMemoryCache) {
        jobs.push(
          Promise.resolve()
            .then(() => imageWithMemoryCache.clearMemoryCache?.())
            .then(() => undefined)
            .catch(error => {
              console.warn(
                "[PerformanceSentinel] Could not clear image memory cache:",
                error,
              );
            }),
        );
      }
    }

    await Promise.allSettled(jobs);
    console.info(
      `[PerformanceSentinel] Released transient runtimes (${reason}).`,
    );
  })().finally(() => {
    cleanupInFlight = null;
  });
  return cleanupInFlight;
}

export const PerformanceSentinel = {
  async recordStartupStage(stage: string): Promise<PerformanceSample> {
    const [memory, nativeProcessUptimeMs] = await Promise.all([
      sampleMemory(),
      sampleNativeProcessUptime(),
    ]);
    const sample: PerformanceSample = {
      stage,
      measuredAt: Date.now(),
      jsStartupMs: Date.now() - JS_BOOT_STARTED_AT,
      nativeProcessUptimeMs,
      ...memory,
    };
    console.info("[PerformanceSentinel] Startup sample:", sample);
    await saveSample(sample);
    return sample;
  },

  async recordRuntimeMemory(stage: string): Promise<PerformanceSample> {
    const [memory, nativeProcessUptimeMs] = await Promise.all([
      sampleMemory(),
      sampleNativeProcessUptime(),
    ]);
    const sample: PerformanceSample = {
      stage,
      measuredAt: Date.now(),
      jsStartupMs: Date.now() - JS_BOOT_STARTED_AT,
      nativeProcessUptimeMs,
      ...memory,
    };
    console.info("[PerformanceSentinel] Runtime memory sample:", sample);
    saveSample(sample).catch(error => {
      console.warn(
        "[PerformanceSentinel] Could not persist runtime sample:",
        error,
      );
    });
    return sample;
  },

  async getRecentSamples(): Promise<PerformanceSample[]> {
    try {
      const stored = await AsyncStorage.getItem(METRICS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? (parsed as PerformanceSample[]) : [];
    } catch {
      return [];
    }
  },

  install(): () => void {
    if (appStateSubscription) return () => undefined;
    appStateSubscription = AppState.addEventListener("change", state => {
      if (state === "background") {
        releaseHeavyRuntimes("background").catch(error => {
          console.warn(
            "[PerformanceSentinel] Background cleanup failed:",
            error,
          );
        });
      }
    });
    return () => {
      appStateSubscription?.remove();
      appStateSubscription = null;
    };
  },

  async enterSafeMode(): Promise<void> {
    await releaseHeavyRuntimes("safe-mode");
  },
};
