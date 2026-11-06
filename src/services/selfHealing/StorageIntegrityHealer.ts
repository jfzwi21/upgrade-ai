import { NativeModules, Platform } from "react-native";
import type { StorageHealth } from "./SafeModeService";

export type VacuumStatus =
  | "performed"
  | "not_needed"
  | "skipped"
  | "failed"
  | "not_run";

export type StorageIntegrityReport = {
  health: StorageHealth;
  integrityCheck: string[];
  vacuum: VacuumStatus;
  detail?: string;
};

export interface StorageIntegrityNativeModule {
  checkAndOptimize(): Promise<{
    status: "not_present" | "healthy" | "corrupt" | "error";
    integrityCheck?: string[];
    vacuum?: VacuumStatus;
    detail?: string;
  }>;
}

const nativeModule = NativeModules.StorageIntegrityModule as
  | StorageIntegrityNativeModule
  | undefined;

/**
 * Checks SQLite only when Safe Mode is entered. The native implementation first
 * runs PRAGMA integrity_check and only runs VACUUM when the check is clean. It
 * never drops tables or replaces a damaged database file.
 */
export class StorageIntegrityHealer {
  constructor(
    private readonly native:
      | StorageIntegrityNativeModule
      | undefined = nativeModule,
  ) {}

  async checkAndRepair(): Promise<StorageIntegrityReport> {
    if (Platform.OS !== "android" || !this.native) {
      return {
        health: "unavailable",
        integrityCheck: [],
        vacuum: "not_run",
        detail: "Android SQLite integrity module is unavailable.",
      };
    }

    try {
      const result = await this.native.checkAndOptimize();
      const health: StorageHealth =
        result.status === "healthy"
          ? "healthy"
          : result.status === "corrupt"
          ? "corrupt"
          : result.status === "not_present"
          ? "not_present"
          : "unavailable";

      return {
        health,
        integrityCheck: Array.isArray(result.integrityCheck)
          ? result.integrityCheck
          : [],
        vacuum: result.vacuum ?? "not_run",
        ...(result.detail ? { detail: result.detail } : {}),
      };
    } catch (error) {
      console.warn(
        "[StorageIntegrityHealer] SQLite check failed; preserving the database:",
        error,
      );
      return {
        health: "unavailable",
        integrityCheck: [],
        vacuum: "not_run",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const storageIntegrityHealer = new StorageIntegrityHealer();
