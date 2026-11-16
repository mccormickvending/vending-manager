#!/bin/bash
# Builds the iPhone app for the simulator, runs the self-test inside it, and saves results. Called by "iOS test".
set -x
mkdir -p shots
BUNDLE=com.mccormickvending.vendingmanager
cp tests/ios-selftest.js app/ios/App/App/public/selftest.js
python3 -c "p='app/ios/App/App/public/index.html'; s=open(p,encoding='utf-8').read(); i=s.rfind('</body>'); open(p,'w',encoding='utf-8').write(s[:i]+'<script src=\"selftest.js\"></script>'+s[i:])"
echo "selftest tags in index.html: $(grep -c selftest.js app/ios/App/App/public/index.html)"
cd app/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGNING_ALLOWED=NO -quiet || { echo "BUILD FAILED"; exit 1; }
cd ../../..
APPDIR=app/ios/App/build/Build/Products/Debug-iphonesimulator/App.app
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; c=[x for k in sorted(d, reverse=True) if 'iOS' in k for x in d[k] if x['name'].startswith('iPhone')]; print(c[0]['udid'])")
xcrun simctl list devices available | grep -m3 iPhone
xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APPDIR"
xcrun simctl launch "$UDID" $BUNDLE
sleep 15; xcrun simctl io "$UDID" screenshot shots/01-open.png
DATA=$(xcrun simctl get_app_container "$UDID" $BUNDLE data)
for i in $(seq 1 36); do [ -f "$DATA/Documents/selftest-1.json" ] && break; sleep 5; done
sleep 10; xcrun simctl io "$UDID" screenshot shots/02-share-sheet.png
echo "---- progress"; cat "$DATA/Documents/selftest-progress.json" || echo "NO PROGRESS FILE"
echo "---- results 1"; cat "$DATA/Documents/selftest-1.json" | tee shots/selftest-1.json || echo "NO RESULTS FILE (1)"
echo "---- app console"; xcrun simctl spawn "$UDID" log show --last 10m --style compact --predicate 'process == "App"' 2>/dev/null | grep -iE "SELFTEST|error|exception" | tail -60
xcrun simctl terminate "$UDID" $BUNDLE; sleep 3
xcrun simctl launch "$UDID" $BUNDLE
for i in $(seq 1 24); do [ -f "$DATA/Documents/selftest-2.json" ] && break; sleep 5; done
xcrun simctl io "$UDID" screenshot shots/03-after-restart.png
cat "$DATA/Documents/selftest-2.json" | tee shots/selftest-2.json || echo "NO RESULTS FILE (2)"
exit 0
