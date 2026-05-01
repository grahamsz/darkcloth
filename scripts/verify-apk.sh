#!/usr/bin/env bash
# Verify the APK in public/downloads/ is signed and ready for deployment.
# Fails fast if files are missing, mismatched, or unsigned.
set -euo pipefail

APK_V10="public/downloads/phototracker-android-v1.0.apk"
APK_LATEST="public/downloads/phototracker.apk"
MIN_SIZE=5000000  # signed release APK should be well above 5 MB

fail() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$APK_V10" ]    || fail "$APK_V10 not found — run 'scripts/build-apk.sh' to rebuild"
[ -f "$APK_LATEST" ] || fail "$APK_LATEST not found"

# Both aliases must be identical
SUM_V10=$(sha256sum "$APK_V10"    | cut -d' ' -f1)
SUM_LAT=$(sha256sum "$APK_LATEST" | cut -d' ' -f1)
[ "$SUM_V10" = "$SUM_LAT" ] \
  || fail "APK sha256 mismatch: phototracker.apk must be a copy of the versioned APK (got $SUM_V10 vs $SUM_LAT)"

# Minimum size guard catches stub or empty files
APK_SIZE=$(wc -c < "$APK_V10")
[ "$APK_SIZE" -ge "$MIN_SIZE" ] \
  || fail "APK too small (${APK_SIZE} bytes < ${MIN_SIZE}) — file may be a placeholder or corrupt"

# Signature check — use apksigner when available
APKSIGNER=""
for candidate in \
  "${ANDROID_HOME:-}/build-tools/34.0.0/apksigner" \
  "${HOME}/Android/Sdk/build-tools/34.0.0/apksigner" \
  "$(command -v apksigner 2>/dev/null || true)"; do
  [ -x "$candidate" ] && APKSIGNER="$candidate" && break
done

if [ -n "$APKSIGNER" ]; then
  "$APKSIGNER" verify "$APK_V10" \
    || fail "apksigner rejected $APK_V10 — APK is unsigned or has an invalid signature"
  echo "ok: APK signature verified via apksigner (sha256 $SUM_V10, ${APK_SIZE} bytes)"
else
  echo "warn: apksigner not found; skipped cryptographic check (sha256 $SUM_V10, ${APK_SIZE} bytes)"
fi
