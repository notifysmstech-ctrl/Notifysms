import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

function readTextWithServerUrl(filePath: string, serverUrl: string): string {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.replace(/\{\{RELAYSMS_SERVER_URL\}\}/g, serverUrl);
}

export async function buildWindowsExeKitZip(serverUrl: string): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder('RelaySMS-Windows-EXE-Kit');
  if (!root) throw new Error('Failed to create zip folder');

  const desktopDir = path.resolve(process.cwd(), 'desktop');
  const publicDir = path.resolve(process.cwd(), 'public');

  root.file(
    'electron-main.cjs',
    readTextWithServerUrl(path.join(desktopDir, 'electron-main.cjs'), serverUrl)
  );
  root.file(
    'preload.cjs',
    fs.readFileSync(path.join(desktopDir, 'preload.cjs'), 'utf8')
  );
  root.file(
    'package.json',
    fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8')
  );
  root.file(
    'BUILD_WINDOWS_EXE.bat',
    fs.readFileSync(path.join(desktopDir, 'BUILD_WINDOWS_EXE.bat'), 'utf8')
  );
  root.file(
    'README.txt',
    [
      'RelaySMS Windows Desktop (.exe) Build Kit',
      '========================================',
      `Bound RelaySMS Server URL: ${serverUrl}`,
      '',
      'Steps to build RelaySMS-Setup-1.0.0.exe on Windows 10/11:',
      '1. Install Node.js 18+ (https://nodejs.org).',
      '2. Double-click BUILD_WINDOWS_EXE.bat (or run: npm install && npm run dist:win).',
      '3. Find your compiled installers in dist-exe\\:',
      '   - RelaySMS-Setup-1.0.0.exe (NSIS Windows Installer)',
      '   - RelaySMS-1.0.0-portable.exe (Portable single-file executable)',
      '',
      'You can also override the target server URL at launch via:',
      '  set RELAYSMS_URL=https://your-server-url',
    ].join('\r\n')
  );

  const assetsFolder = root.folder('assets');
  if (assetsFolder) {
    const iconSvg = path.join(publicDir, 'icon.svg');
    const iconPng = path.join(publicDir, 'pwa-512x512.png');
    if (fs.existsSync(iconSvg)) {
      assetsFolder.file('icon.svg', fs.readFileSync(iconSvg));
    }
    if (fs.existsSync(iconPng)) {
      assetsFolder.file('icon.png', fs.readFileSync(iconPng));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function buildAndroidApkKitZip(serverUrl: string): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder('RelaySMS-Android-APK-Kit');
  if (!root) throw new Error('Failed to create zip folder');

  const mobileDir = path.resolve(process.cwd(), 'mobile');
  const publicDir = path.resolve(process.cwd(), 'public');

  root.file(
    'capacitor.config.ts',
    readTextWithServerUrl(path.join(mobileDir, 'capacitor.config.ts'), serverUrl)
  );
  root.file(
    'package.json',
    fs.readFileSync(path.join(mobileDir, 'package.json'), 'utf8')
  );
  root.file(
    'BUILD_ANDROID_APK.sh',
    readTextWithServerUrl(path.join(mobileDir, 'BUILD_ANDROID_APK.sh'), serverUrl)
  );
  root.file(
    'BUILD_ANDROID_APK.bat',
    readTextWithServerUrl(path.join(mobileDir, 'BUILD_ANDROID_APK.bat'), serverUrl)
  );

  const manifestPath = path.join(mobileDir, 'android/app/src/main/AndroidManifest.xml');
  const pluginPath = path.join(
    mobileDir,
    'android/app/src/main/java/com/relaysms/app/SmsBridgePlugin.java'
  );

  if (fs.existsSync(manifestPath)) {
    root.file('android-overrides/AndroidManifest.xml', fs.readFileSync(manifestPath, 'utf8'));
  }
  if (fs.existsSync(pluginPath)) {
    root.file('android-overrides/SmsBridgePlugin.java', fs.readFileSync(pluginPath, 'utf8'));
  }

  const iconPng = path.join(publicDir, 'pwa-512x512.png');
  if (fs.existsSync(iconPng)) {
    root.file('resources/icon.png', fs.readFileSync(iconPng));
  }

  root.file(
    'README.txt',
    [
      'RelaySMS Android (.apk) Build Kit',
      '=================================',
      `Bound RelaySMS Server URL: ${serverUrl}`,
      '',
      'Includes Capacitor wrapper + optional native Android SmsManager bridge',
      '(android-overrides/SmsBridgePlugin.java) with SEND_SMS permission.',
      '',
      'Prerequisites:',
      '- Node.js 18+',
      '- Java JDK 17+ & Android SDK (Android Studio)',
      '',
      'Build Steps:',
      '1. Run BUILD_ANDROID_APK.bat (Windows) or ./BUILD_ANDROID_APK.sh (macOS/Linux).',
      '2. Copy android-overrides/AndroidManifest.xml & SmsBridgePlugin.java into android/app/src/main/ if enabling local SIM dispatch.',
      '3. Install the generated android/app/build/outputs/apk/debug/app-debug.apk on your Android device via ADB or USB.',
    ].join('\n')
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function getDeployManifest(serverUrl: string) {
  return {
    serverUrl,
    pwa: {
      name: 'RelaySMS Bulk Messaging',
      shortName: 'RelaySMS',
      installable: true,
      platforms: ['Windows (Edge / Chrome)', 'macOS', 'Linux', 'Android', 'iOS Safari'],
    },
    windowsExe: {
      packageName: 'RelaySMS-Windows-EXE-Kit.zip',
      downloadUrl: '/api/deploy/windows-exe-kit.zip',
      targets: ['RelaySMS-Setup-1.0.0.exe (NSIS Installer)', 'RelaySMS-1.0.0-portable.exe (Portable)'],
      runtime: 'Electron 35 + electron-builder',
      boundServerUrl: serverUrl,
      files: [
        'electron-main.cjs',
        'preload.cjs',
        'package.json',
        'BUILD_WINDOWS_EXE.bat',
        'assets/icon.svg',
        'assets/icon.png',
      ],
    },
    androidApk: {
      packageName: 'RelaySMS-Android-APK-Kit.zip',
      downloadUrl: '/api/deploy/android-apk-kit.zip',
      targets: ['app-debug.apk', 'app-release.apk'],
      runtime: 'Capacitor 7 + Android Gradle + SmsBridgePlugin (SIM SmsManager)',
      boundServerUrl: serverUrl,
      files: [
        'capacitor.config.ts',
        'package.json',
        'BUILD_ANDROID_APK.sh',
        'BUILD_ANDROID_APK.bat',
        'android-overrides/AndroidManifest.xml',
        'android-overrides/SmsBridgePlugin.java',
        'resources/icon.png',
      ],
    },
  };
}
