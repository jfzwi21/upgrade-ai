const { execSync } = require('child_process');
const readline = require('readline');
const os = require('os');
const path = require('path');
const { getAndroidBuildMetadata } = require('./androidBuildMetadata');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to execute commands with proper error handling
function executeCommand(command) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

// Determine OS-specific commands
const isWindows = os.platform() === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';

// Dev installs reuse the release version number, so their sourcemap is kept apart from the
// release one - it decodes `index.android.bundle:<line>:<col>` frames from this build only.
const fs = require('fs');
const { versionName: version, versionCode } = getAndroidBuildMetadata();
const sourcemapFolder = path.join('sourcemaps', 'android', `v${version}-${versionCode}-dev`);
fs.mkdirSync(sourcemapFolder, { recursive: true });
const sourcemapPath = path.join(sourcemapFolder, 'index.android.bundle.map');

// Bundle the React Native app
console.log('Bundling React Native app...');
executeCommand(`npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res --sourcemap-output "${sourcemapPath}"`);
console.log(`Sourcemap saved to: ${sourcemapPath}`);

// Build the Android app
console.log('Building Android app...');
executeCommand(`cd android && ${gradleCommand} assembleDebug -PUPGRADE_AI_VERSION_NAME=${version} -PUPGRADE_AI_VERSION_CODE=${versionCode}`);

// Ask user to install the APK
rl.question('Install the apk? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y') {
    console.log('Installing APK...');
    executeCommand('adb install -r android/app/build/outputs/apk/debug/app-debug.apk');
  } else {
    console.log('Skipping installation');
  }

  // Cleanup
  console.log('Cleaning up...');
  const bundlePath = path.join('android', 'app', 'src', 'main', 'assets', 'index.android.bundle');
  
  if (isWindows) {
    executeCommand(`if exist ${bundlePath} del ${bundlePath}`);
  } else {
    executeCommand(`rm -f ${bundlePath}`);
  }
  
  executeCommand(`cd android && ${gradleCommand} clean`);

  rl.close();
});
