const fs = require('fs');
const path = require('path');

function getAndroidBuildMetadata(rootDir = path.resolve(__dirname, '..'), env = process.env) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const gradleConfig = fs.readFileSync(path.join(rootDir, 'android/app/build.gradle'), 'utf8');
  const defaultCodeMatch = gradleConfig.match(/versionCode\s*\([\s\S]*?\?:\s*(\d+)\s*\)/);
  if (!defaultCodeMatch) {
    throw new Error('Could not read the default Android versionCode from android/app/build.gradle');
  }

  const hasNameOverride = Boolean(env.UPGRADE_AI_VERSION_NAME);
  const hasCodeOverride = Boolean(env.UPGRADE_AI_VERSION_CODE);
  if (hasNameOverride !== hasCodeOverride) {
    throw new Error('Set both UPGRADE_AI_VERSION_NAME and UPGRADE_AI_VERSION_CODE when overriding the Android version');
  }

  const versionName = env.UPGRADE_AI_VERSION_NAME || packageJson.version;
  const versionCode = env.UPGRADE_AI_VERSION_CODE || defaultCodeMatch[1];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versionName)) {
    throw new Error(`Invalid Android version name: ${versionName}`);
  }
  if (!/^\d+$/.test(String(versionCode)) || Number(versionCode) < 1 || Number(versionCode) > 2100000000) {
    throw new Error(`Invalid Android version code: ${versionCode}`);
  }

  return { versionName, versionCode: String(versionCode) };
}

module.exports = { getAndroidBuildMetadata };
