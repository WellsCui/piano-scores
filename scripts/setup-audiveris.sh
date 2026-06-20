#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# On macOS, Audiveris ships as a .dmg — install to /Applications
# On Linux, it ships as a .deb — fall back to the jar-based approach

# ── Already installed? ────────────────────────────────────────────────────────
if [ -f "/Applications/Audiveris.app/Contents/MacOS/Audiveris" ]; then
  echo "Audiveris already installed at /Applications/Audiveris.app"
  exit 0
fi

if [ -f "$PROJECT_DIR/bin/audiveris/bin/Audiveris" ]; then
  echo "Audiveris already installed at $PROJECT_DIR/bin/audiveris"
  exit 0
fi

# ── Fetch release info ────────────────────────────────────────────────────────
echo "Fetching latest Audiveris release info..."
API_JSON=$(curl -sf "https://api.github.com/repos/Audiveris/audiveris/releases/latest")
VERSION=$(echo "$API_JSON" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
echo "Latest version: $VERSION"

# ── macOS ─────────────────────────────────────────────────────────────────────
if [ "$(uname)" = "Darwin" ]; then
  ARCH=$(uname -m)   # arm64 or x86_64
  DMG_URL=$(echo "$API_JSON" | grep "browser_download_url" | grep "macosx-${ARCH}\.dmg" | cut -d'"' -f4)

  if [ -z "$DMG_URL" ]; then
    echo "Error: No macOS DMG found for arch $ARCH in release $VERSION."
    echo "Visit https://github.com/Audiveris/audiveris/releases to download manually."
    exit 1
  fi

  echo "Downloading $DMG_URL ..."
  TMP=$(mktemp -d)
  trap 'hdiutil detach "$TMP/mnt" -quiet 2>/dev/null || true; rm -rf "$TMP"' EXIT

  curl -L --progress-bar -o "$TMP/audiveris.dmg" "$DMG_URL"

  echo "Mounting disk image..."
  hdiutil attach "$TMP/audiveris.dmg" -mountpoint "$TMP/mnt" -quiet -nobrowse

  APP_SRC=$(find "$TMP/mnt" -maxdepth 2 -name "Audiveris.app" | head -1)
  if [ -z "$APP_SRC" ]; then
    echo "Error: Could not find Audiveris.app inside the disk image."
    exit 1
  fi

  echo "Installing Audiveris.app to /Applications ..."
  cp -R "$APP_SRC" /Applications/

  echo ""
  echo "✓ Audiveris $VERSION installed at /Applications/Audiveris.app"
  echo "  Restart the Next.js server and try PDF conversion again."
  exit 0
fi

# ── Linux / fallback ──────────────────────────────────────────────────────────
# Verify Java 17+
if ! command -v java &>/dev/null; then
  echo "Error: Java is not installed. Audiveris requires Java 17+."
  echo "  Ubuntu: sudo apt install openjdk-17-jdk"
  exit 1
fi

JAVA_MAJOR=$(java -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')
if [ "${JAVA_MAJOR:-0}" -lt 17 ] 2>/dev/null; then
  echo "Warning: Java 17+ required, found Java ${JAVA_MAJOR}."
fi

# Look for a Linux zip/tar or deb
DEB_URL=$(echo "$API_JSON" | grep "browser_download_url" | grep "ubuntu.*\.deb" | head -1 | cut -d'"' -f4)
if [ -n "$DEB_URL" ]; then
  echo "Found .deb: $DEB_URL"
  echo "Install with: curl -L '$DEB_URL' -o audiveris.deb && sudo dpkg -i audiveris.deb"
  exit 1
fi

echo "Error: No supported package found for this platform in release $VERSION."
echo "Visit https://github.com/Audiveris/audiveris/releases"
exit 1
