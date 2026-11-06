import React, { ComponentType, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeModeService } from "@/services/selfHealing/SafeModeService";
import { storageIntegrityHealer } from "@/services/selfHealing/StorageIntegrityHealer";
import { PerformanceSentinel } from "@/services/selfHealing/PerformanceSentinel";
import SelfHealingErrorBoundary from "@/components/SelfHealingErrorBoundary";
import { navigationRef, resetToWhenReady } from "@/utils/navigationRef";
import { PATHS } from "@/utils/paths";
import {
  WATCHDOG_STARTUP_WINDOW_MS,
  watchdogService,
} from "@/services/selfHealing/WatchdogService";

const STARTUP_BACKGROUND = "#101114";

type RootAppComponent = ComponentType;

/**
 * Keep this module free of database-using screen imports. In Safe Mode, SQLite is
 * inspected here before App (and therefore WatermelonDB) is imported.
 */
export default function StartupBootstrap() {
  const [RootApp, setRootApp] = useState<RootAppComponent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    let healthyTimer: ReturnType<typeof setTimeout> | null = null;
    const launchStartedAt = Date.now();

    const prepare = async () => {
      try {
        const watchdogStatus = await watchdogService.start();
        let safeMode = watchdogStatus.safeMode;
        SafeModeService.setEnabled(safeMode);
        await SafeModeService.loadQuarantinedWorkspaceSlugs();

        if (safeMode) {
          const storageReport = await storageIntegrityHealer.checkAndRepair();
          SafeModeService.setStorageHealth(storageReport.health);
          if (
            storageReport.health === "corrupt" ||
            storageReport.health === "unavailable"
          ) {
            SafeModeService.setEnabled(true, storageReport.health);
          }
        }

        // Requiring App here is deliberate: no database-dependent UI code is loaded before checks finish.
        const loadedApp = require("../../App").default as RootAppComponent;
        if (!mounted) return;
        setRootApp(() => loadedApp);
        PerformanceSentinel.recordStartupStage("startup_gate_ready").catch(
          error => {
            console.warn(
              "[StartupBootstrap] Startup measurement failed:",
              error,
            );
          },
        );

        const elapsed = Date.now() - launchStartedAt;
        healthyTimer = setTimeout(() => {
          watchdogService.markStartupHealthy().catch(error => {
            console.warn(
              "[StartupBootstrap] Could not mark startup healthy:",
              error,
            );
          });
        }, Math.max(0, WATCHDOG_STARTUP_WINDOW_MS - elapsed));
      } catch (error) {
        console.error(
          "[StartupBootstrap] Startup recovery setup failed:",
          error,
        );
        SafeModeService.setEnabled(true, "unavailable");
        if (!mounted) return;
        try {
          // Best-effort fail-open path for an unavailable checker; the app remains usable.
          const loadedApp = require("../../App").default as RootAppComponent;
          setRootApp(() => loadedApp);
          PerformanceSentinel.recordStartupStage("startup_gate_ready").catch(
            measureError => {
              console.warn(
                "[StartupBootstrap] Startup measurement failed:",
                measureError,
              );
            },
          );
          const elapsed = Date.now() - launchStartedAt;
          healthyTimer = setTimeout(() => {
            watchdogService.markStartupHealthy().catch(healthyError => {
              console.warn(
                "[StartupBootstrap] Could not mark startup healthy:",
                healthyError,
              );
            });
          }, Math.max(0, WATCHDOG_STARTUP_WINDOW_MS - elapsed));
        } catch (loadError) {
          console.error(
            "[StartupBootstrap] App module failed to load:",
            loadError,
          );
          setLoadFailed(true);
        }
      }
    };

    prepare().catch(error => {
      console.error("[StartupBootstrap] Unexpected bootstrap error:", error);
      SafeModeService.setEnabled(true, "unavailable");
      setLoadFailed(true);
    });
    return () => {
      mounted = false;
      if (healthyTimer) clearTimeout(healthyTimer);
    };
  }, []);

  if (RootApp) {
    return (
      <SafeAreaProvider>
        <SelfHealingErrorBoundary
          onError={error => {
            SafeModeService.setEnabled(true);
            watchdogService.markStartupFailed().catch(watchdogError => {
              console.warn(
                "[StartupBootstrap] Could not record a render failure:",
                watchdogError,
              );
            });
            const route = navigationRef.getCurrentRoute();
            if (route?.name === PATHS.workspace_chat) {
              const params = route.params as
                | { wsSlug?: string; workspaceSlug?: string }
                | undefined;
              const workspaceSlug = params?.wsSlug ?? params?.workspaceSlug;
              if (workspaceSlug) {
                SafeModeService.quarantineWorkspace(
                  workspaceSlug,
                  `${error.name}: ${error.message}`,
                ).catch(quarantineError => {
                  console.warn(
                    "[StartupBootstrap] Could not quarantine workspace:",
                    quarantineError,
                  );
                });
              }
            }
          }}
          onReset={() => {
            SafeModeService.setEnabled(true);
            resetToWhenReady(PATHS.home);
          }}>
          <RootApp />
        </SelfHealingErrorBoundary>
      </SafeAreaProvider>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: STARTUP_BACKGROUND,
        paddingHorizontal: 28,
      }}>
      {loadFailed ? (
        <Text style={{ color: "#F2F4F7", fontSize: 15, textAlign: "center" }}>
          تعذّر تشغيل الواجهة. بياناتك لم تُحذف؛ أعد فتح التطبيق للمحاولة مرة
          أخرى.
        </Text>
      ) : (
        <>
          <ActivityIndicator color="#F2F4F7" size="large" />
          <Text
            style={{
              color: "#D0D5DD",
              fontSize: 14,
              marginTop: 14,
              textAlign: "center",
            }}>
            جارٍ فحص التطبيق وتجهيزه…
          </Text>
        </>
      )}
    </View>
  );
}
