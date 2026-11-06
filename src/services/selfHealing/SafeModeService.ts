import AsyncStorage from "@react-native-async-storage/async-storage";

const QUARANTINED_WORKSPACES_KEY =
  "upgrade-ai:self-healing:quarantined-workspaces:v1";

export type StorageHealth =
  | "not_checked"
  | "healthy"
  | "corrupt"
  | "unavailable"
  | "not_present";
export type SafeModeSnapshot = {
  enabled: boolean;
  storageHealth: StorageHealth;
  quarantinedWorkspaceSlugs: string[];
};

type QuarantineRecord = {
  slug: string;
  quarantinedAt: number;
  reason: string;
};

let snapshot: SafeModeSnapshot = {
  enabled: false,
  storageHealth: "not_checked",
  quarantinedWorkspaceSlugs: [],
};
const listeners = new Set<(value: SafeModeSnapshot) => void>();

function publish(next: SafeModeSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener(snapshot));
}

function parseQuarantineRecords(raw: string | null): QuarantineRecord[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (record): record is QuarantineRecord =>
        !!record &&
        typeof record === "object" &&
        typeof (record as QuarantineRecord).slug === "string" &&
        typeof (record as QuarantineRecord).quarantinedAt === "number" &&
        typeof (record as QuarantineRecord).reason === "string",
    );
  } catch {
    return [];
  }
}

export const SafeModeService = {
  getSnapshot(): SafeModeSnapshot {
    return snapshot;
  },

  isEnabled(): boolean {
    return snapshot.enabled;
  },

  setEnabled(
    enabled: boolean,
    storageHealth: StorageHealth = snapshot.storageHealth,
  ) {
    publish({ ...snapshot, enabled, storageHealth });
  },

  setStorageHealth(storageHealth: StorageHealth) {
    publish({ ...snapshot, storageHealth });
  },

  setQuarantinedWorkspaceSlugs(slugs: string[]) {
    publish({ ...snapshot, quarantinedWorkspaceSlugs: [...new Set(slugs)] });
  },

  subscribe(listener: (value: SafeModeSnapshot) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async loadQuarantinedWorkspaceSlugs(): Promise<string[]> {
    try {
      const records = parseQuarantineRecords(
        await AsyncStorage.getItem(QUARANTINED_WORKSPACES_KEY),
      );
      const slugs = records.map(record => record.slug);
      this.setQuarantinedWorkspaceSlugs(slugs);
      return slugs;
    } catch (error) {
      console.warn("[SafeMode] Unable to read quarantined workspaces:", error);
      return snapshot.quarantinedWorkspaceSlugs;
    }
  },

  async quarantineWorkspace(slug: string, reason: string): Promise<void> {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) return;

    try {
      const records = parseQuarantineRecords(
        await AsyncStorage.getItem(QUARANTINED_WORKSPACES_KEY),
      );
      const updated = [
        ...records.filter(record => record.slug !== normalizedSlug),
        {
          slug: normalizedSlug,
          quarantinedAt: Date.now(),
          reason: reason.slice(0, 240),
        },
      ];
      await AsyncStorage.setItem(
        QUARANTINED_WORKSPACES_KEY,
        JSON.stringify(updated),
      );
      this.setQuarantinedWorkspaceSlugs(updated.map(record => record.slug));
    } catch (error) {
      console.warn("[SafeMode] Unable to quarantine workspace:", error);
    }
  },

  async restoreWorkspace(slug: string): Promise<void> {
    try {
      const records = parseQuarantineRecords(
        await AsyncStorage.getItem(QUARANTINED_WORKSPACES_KEY),
      );
      const updated = records.filter(record => record.slug !== slug);
      await AsyncStorage.setItem(
        QUARANTINED_WORKSPACES_KEY,
        JSON.stringify(updated),
      );
      this.setQuarantinedWorkspaceSlugs(updated.map(record => record.slug));
    } catch (error) {
      console.warn(
        "[SafeMode] Unable to restore quarantined workspace:",
        error,
      );
    }
  },
};
