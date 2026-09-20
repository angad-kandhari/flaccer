#!/bin/bash
# Builds a drag-to-Applications DMG from the packaged app (run `npm run pack` first).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=FLACCER
VERSION=$(node -p "require('./package.json').version")
APP="dist/${NAME}-darwin-arm64/${NAME}.app"
OUT="dist/${NAME}-${VERSION}.dmg"
STAGE="$(mktemp -d)/${NAME}"
[ -d "$APP" ] || { echo "missing $APP - run npm run pack first" >&2; exit 1; }

mkdir -p "$STAGE/.background"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp build/dmg-background.png "$STAGE/.background/background.png"

TMP="$(mktemp -d)/${NAME}-rw.dmg"
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -fs HFS+ -format UDRW "$TMP" >/dev/null
DEV=$(hdiutil attach -readwrite -noverify -noautoopen "$TMP" | awk '/\/Volumes\// {print $1; exit}')
VOL="/Volumes/$NAME"
sleep 1

# Lay out the Finder window (icon view, background, positions). Skipped if Finder automation is denied.
osascript <<APPLESCRIPT || echo "note: Finder layout skipped (automation permission?)"
tell application "Finder"
  tell disk "$NAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 860, 520}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 128
    set text size of opts to 13
    set background picture of opts to file ".background:background.png"
    set position of item "$NAME.app" of container window to {180, 220}
    set position of item "Applications" of container window to {480, 220}
    close
    open
    update without registering applications
    delay 1
    close
  end tell
end tell
APPLESCRIPT

chmod -Rf go-w "$VOL" 2>/dev/null || true
sync
hdiutil detach "$DEV" -quiet || { sleep 2; hdiutil detach "$DEV" -force -quiet; }
rm -f "$OUT"
hdiutil convert "$TMP" -format UDZO -imagekey zlib-level=9 -o "$OUT" >/dev/null
rm -rf "$(dirname "$TMP")" "$(dirname "$STAGE")"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
