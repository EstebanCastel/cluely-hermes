#!/bin/bash
# Build Echo, sign it with the STABLE self-signed identity ("Echo Local Signing")
# and install to ~/Applications. Using the same signing identity on every build is
# what lets macOS remember the Microphone / Screen Recording permissions across
# rebuilds (ad-hoc `-s -` changes identity each time and forces re-prompts).
#
# One-time setup of the cert (already done once; recreate only if it's gone):
#   see scripts/create-signing-cert.sh
set -e

CERT="Echo Local Signing"
APP_SRC="dist/mac-arm64/Echo.app"
APP_DEST="$HOME/Applications/Echo.app"
STAGE="/tmp/Echo-stage.app"

cd "$(dirname "$0")/.."

echo "▸ Cerrando instancias de Echo…"
ps -A -o pid,comm | grep -w "Echo" | awk '{print $1}' | xargs kill -9 2>/dev/null || true
sleep 1

echo "▸ Building…"
rm -rf dist/mac-arm64 dist/Echo-*.dmg* 2>/dev/null || true
npm run build:mac >/dev/null 2>&1

echo "▸ Firmando con '$CERT' (fuera de iCloud)…"
rm -rf "$STAGE"
ditto "$APP_SRC" "$STAGE"
xattr -cr "$STAGE"
if security find-identity -v 2>/dev/null | grep -q "$CERT" || codesign --force --deep -s "$CERT" "$STAGE" 2>/dev/null; then
  codesign --force --deep -s "$CERT" "$STAGE"
else
  echo "  ⚠ Certificado '$CERT' no encontrado; firma ad-hoc (los permisos se re-pedirán)."
  codesign --force --deep -s - "$STAGE"
fi

echo "▸ Instalando en ~/Applications…"
rm -rf "$APP_DEST"
ditto "$STAGE" "$APP_DEST"
rm -rf "$STAGE" "$APP_SRC"
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true

codesign --verify "$APP_DEST" && echo "✓ Echo instalada y firmada ($CERT)"
echo "▸ Abriendo…"
open "$APP_DEST"
