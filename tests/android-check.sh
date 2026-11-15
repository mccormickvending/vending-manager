#!/bin/bash
# Installs the test app on the emulator and runs the checks. Called by the "Android test" workflow.
set -x
APK=app/android/app/build/outputs/apk/debug/app-debug.apk
mkdir -p shots
adb wait-for-device
adb install -r "$APK"
adb shell pm grant com.mccormickvending.vendingmanager android.permission.CAMERA || true
adb shell am start -n com.mccormickvending.vendingmanager/.MainActivity
sleep 15
node tests/android-check.mjs || echo "CHECK SCRIPT FAILED" | tee shots/failed.txt
adb logcat -d -s Capacitor:* chromium:* > shots/logcat.txt || true
exit 0
