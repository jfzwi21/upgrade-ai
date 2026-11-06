/**
 * @format
 */

import {AppRegistry} from 'react-native';
// Web globals (URL, streams, TextEncoder, crypto, Buffer). Loaded here rather than only through App so the
// headless scheduled-jobs task, which never loads App, gets them too.
import './src/utils/polyfills';
// UI language: detected from the device on import, then switched to the one picked in Settings (if any).
import {hydrateLanguage} from './src/i18n';
import notifee from '@notifee/react-native';
import {name as appName} from './app.json';
import {SCHEDULED_JOBS_HEADLESS_TASK} from './src/utils/ScheduledJobs/constants';

hydrateLanguage();

// Notifee requires a background handler to be registered at module scope. Taps on our
// notifications are handled in-app (`useNotificationTapNavigation`): while the app is alive they
// arrive as foreground events, and after a cold start via `getInitialNotification`.
notifee.onBackgroundEvent(async () => {});

// Scheduled jobs that come due while the app is closed. Import the database-dependent runner only
// when WorkManager actually starts this headless task, not while the foreground app is booting.
AppRegistry.registerHeadlessTask(SCHEDULED_JOBS_HEADLESS_TASK, () => (...args) =>
  require('./src/utils/ScheduledJobs/scheduler').runHeadlessScheduledJobs(...args),
);

// StartupBootstrap checks crash-loop state and, in Safe Mode, SQLite integrity before importing App.
// Keeping this require lazy prevents WatermelonDB and model screens from opening the database first.
AppRegistry.registerComponent(appName, () => require('./src/components/StartupBootstrap').default);

// Quick Actions card (Android): the "Ask with AnythingLLM" entry in the text-selection toolbar of other apps.
// Rendered by quickcontext/QuickContextActivity.kt in the same JS runtime as the main app.
AppRegistry.registerComponent('AnythingLLMQuickContext', () => require('./src/quickContext/QuickContextApp').default);

// Digital assistant overlay (Android): opened by the assist gesture once AnythingLLM is the default assistant app.
// Rendered by assistant/AssistantActivity.kt in the same JS runtime as the main app.
AppRegistry.registerComponent('AnythingLLMAssistant', () => require('./src/assistant/AssistantApp').default);
