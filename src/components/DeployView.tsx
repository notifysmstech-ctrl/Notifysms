import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Laptop, MonitorDown, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface DeployManifest {
  serverUrl: string;
  pwa: {
    name: string;
    shortName: string;
    installable: boolean;
    platforms: string[];
  };
  windowsExe: {
    packageName: string;
    downloadUrl: string;
    targets: string[];
    runtime: string;
    boundServerUrl: string;
    files: string[];
  };
  androidApk: {
    packageName: string;
    downloadUrl: string;
    targets: string[];
    runtime: string;
    boundServerUrl: string;
    files: string[];
  };
}

export const DeployView: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [manifest, setManifest] = useState<DeployManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/deploy/manifest')
      .then((r) => r.json())
      .then((data: DeployManifest) => {
        if (active) setManifest(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          Cross-Platform Deployment (.exe, .apk &amp; Desktop App)
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Install RelaySMS directly on Windows PC or Android today, or download the pre-configured Electron (<span className="font-mono">.exe</span>) and Capacitor (<span className="font-mono">.apk</span>) build kits bound to this server.
        </p>
      </div>

      {/* Direct Installable App Banner (PWA) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
              <MonitorDown className="h-4 w-4" />
              Instant Standalone App Install (Windows, macOS, Linux &amp; Android)
            </div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Install RelaySMS Directly on This Device
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-600">
              Installs RelaySMS as a standalone window with desktop Start Menu / taskbar shortcuts and offline workspace caching via Web App Manifest &amp; Service Worker.
            </p>
          </div>

          <div className="shrink-0">
            {isInstalled ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Running as Installed App
              </span>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                Install App Now
              </button>
            ) : isIOS ? (
              <span className="text-xs text-slate-600">
                In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.
              </span>
            ) : (
              <span className="text-xs text-slate-600">
                Use Chrome or Edge address bar <strong>Install RelaySMS</strong> icon, or download the native build kits below.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Windows .exe & Android .apk Packaging Kits */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Windows .exe Packaging Kit */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Windows PC Installer Kit (.exe)
                    </h2>
                    <div className="text-xs text-slate-500">
                      {manifest?.windowsExe.runtime}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-600">
                Complete Electron + <span className="font-mono">electron-builder</span> project pre-configured to connect to{' '}
                <span className="font-mono text-slate-800">{manifest?.windowsExe.boundServerUrl}</span>. Generates both a Windows NSIS setup wizard and a standalone portable <span className="font-mono">.exe</span>.
              </p>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-medium text-slate-800">Output Targets</div>
                <ul className="mt-1.5 space-y-1 font-mono text-xs text-slate-600">
                  {manifest?.windowsExe.targets.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-medium text-slate-800">Included Package Files</div>
                <div className="mt-1.5 font-mono text-xs text-slate-500">
                  {manifest?.windowsExe.files.join(' · ')}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
                <div>1. Extract RelaySMS-Windows-EXE-Kit.zip</div>
                <div>2. Double-click BUILD_WINDOWS_EXE.bat (requires Node.js 18+)</div>
                <div>3. Run dist-exe\RelaySMS-Setup-1.0.0.exe</div>
              </div>
            </div>

            <a
              href={manifest?.windowsExe.downloadUrl || '/api/deploy/windows-exe-kit.zip'}
              download="RelaySMS-Windows-EXE-Kit.zip"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Download Windows .exe Build Kit (.zip)
            </a>
          </section>

          {/* Android .apk Packaging Kit */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Android Mobile Package Kit (.apk)
                    </h2>
                    <div className="text-xs text-slate-500">
                      {manifest?.androidApk.runtime}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-600">
                Complete Capacitor + Android Gradle project pre-bound to{' '}
                <span className="font-mono text-slate-800">{manifest?.androidApk.boundServerUrl}</span>. Includes a native Java <span className="font-mono">SmsBridgePlugin</span> (<span className="font-mono">SEND_SMS</span> permission) for optional direct SIM card dispatch on Android handsets.
              </p>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-medium text-slate-800">Output Targets</div>
                <ul className="mt-1.5 space-y-1 font-mono text-xs text-slate-600">
                  {manifest?.androidApk.targets.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-medium text-slate-800">Included Package Files</div>
                <div className="mt-1.5 font-mono text-xs text-slate-500">
                  {manifest?.androidApk.files.join(' · ')}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
                <div>1. Extract RelaySMS-Android-APK-Kit.zip</div>
                <div>2. Run BUILD_ANDROID_APK.bat (or ./BUILD_ANDROID_APK.sh)</div>
                <div>3. Sideload android/app/build/outputs/apk/debug/app-debug.apk</div>
              </div>
            </div>

            <a
              href={manifest?.androidApk.downloadUrl || '/api/deploy/android-apk-kit.zip'}
              download="RelaySMS-Android-APK-Kit.zip"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Download Android .apk Build Kit (.zip)
            </a>
          </section>
        </div>
      )}
    </div>
  );
};
