#!/usr/bin/env bash
set -euo pipefail
echo "======================================================"
echo "  RelaySMS Android (.apk) Build Script"
echo "======================================================"
npm install
mkdir -p www
echo "<html><body><script>location.replace('{{RELAYSMS_SERVER_URL}}')</script></body></html>" > www/index.html
if [ ! -d "android/gradle" ]; then
  npx cap add android || true
fi
npx cap sync android
cd android
./gradlew assembleDebug
echo "APK generated at: android/app/build/outputs/apk/debug/app-debug.apk"
