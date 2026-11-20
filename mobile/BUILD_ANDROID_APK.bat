@echo off
setlocal
echo ======================================================
echo   RelaySMS Android (.apk) Build Script (Windows)
echo ======================================================
call npm install
if not exist www mkdir www
echo ^<html^>^<body^>^<script^>location.replace('{{RELAYSMS_SERVER_URL}}')^</script^>^</body^>^</html^> > www\index.html
if not exist android\gradle (
  call npx cap add android
)
call npx cap sync android
cd android
call gradlew.bat assembleDebug
echo Build finished! Check android\app\build\outputs\apk\debug\app-debug.apk
pause
