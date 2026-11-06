import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useState, useEffect } from "react";
import { resolveDefaultChatRoute } from "@/utils/defaultChatRoute";
import { repairPartialOnboarding } from "@/hooks/useOnboardingHook";
import { SafeModeService } from "@/services/selfHealing/SafeModeService";

const DEFAULT_INITIAL_ROUTE = PATHS.home;

type InitialRoute = {
  path: string;
  params?: { [key: string]: any };
};

async function determineInitialRoute() {
  await repairPartialOnboarding();
  const welcomeCompleted = await uiStore.getFromStorage('onboarding_welcome_completed', false);
  const modelSelectionCompleted = await uiStore.getFromStorage('onboarding_model_selection_completed', false);
  const surveyCompleted = await uiStore.getFromStorage('onboarding_survey_completed', false);
  const dataHandlingCompleted = await uiStore.getFromStorage('onboarding_data_handling_completed', false);

  if (!welcomeCompleted) return PATHS.onboarding.welcome;
  else if (!modelSelectionCompleted) return PATHS.onboarding.model_selection;
  else if (!surveyCompleted) return PATHS.onboarding.survey;
  else if (!dataHandlingCompleted) return PATHS.onboarding.data_handling;
  else return DEFAULT_INITIAL_ROUTE;
}

/**
 * Determines if the user needs to be redirected to the onboarding flow or the home screen
 * on app load.
 */
export default function useInitialRoute(): { initialRoute: InitialRoute, isLoading: boolean } {
  const [initialRoute, setInitialRoute] = useState<InitialRoute>({
    path: DEFAULT_INITIAL_ROUTE,
    params: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  // Debugging for storage
  // uiStore.getAllFromStorage().then(console.log);

  useEffect(() => {
    let active = true;

    async function checkForInitialRoute() {
      try {
        const staticRoute = await determineInitialRoute();
        if (!active) return;

        // If the user is not onboarded, redirect to the onboarding flow.
        if (staticRoute !== DEFAULT_INITIAL_ROUTE) {
          setInitialRoute({ path: staticRoute, params: {} });
          return;
        }

        // A crash-loop launch must not reopen the last workspace/thread that may have caused it.
        // Its data remains untouched; the user can still reach healthy workspaces from Home.
        if (SafeModeService.isEnabled()) {
          setInitialRoute({ path: PATHS.home, params: {} });
          return;
        }

        // Onboarded: open the last chat (or the first workspace's thread).
        const chatRoute = await resolveDefaultChatRoute();
        if (!active) return;
        const route: InitialRoute = chatRoute
          ? { path: PATHS.workspace_chat, params: chatRoute }
          : { path: staticRoute, params: {} };
        console.log('[InitialRoute]', route.path, route.params);
        setInitialRoute(route);
      } catch (error) {
        // Storage/initialization failures must not leave the splash screen up forever
        // or become an unhandled rejection that can terminate the JS runtime.
        console.error('[InitialRoute] Failed to determine startup route; opening Home', error);
        if (active) setInitialRoute({ path: PATHS.home, params: {} });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void checkForInitialRoute();
    return () => {
      active = false;
    };
  }, []);

  return { initialRoute, isLoading };
}
