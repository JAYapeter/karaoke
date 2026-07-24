#!/bin/bash
# Karaoke — double-click launcher (macOS).
# Double-click this file in Finder to start the karaoke server and open the host page.
set -e

# Run from the repo this script lives in, regardless of where it's launched from.
cd "$(dirname "$0")"

# Finder-launched shells get a bare PATH; add the usual Homebrew / Node locations.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "🎤  Starting Karaoke…"
echo

# 1. Node is required to run anything.
if ! command -v node >/dev/null 2>&1; then
  echo "❌  Node.js isn't installed."
  echo "    Install the LTS version from https://nodejs.org  (or: brew install node)"
  echo "    Then double-click this file again."
  echo
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

# 2. yt-dlp powers song search + downloads; ffmpeg merges YouTube's separate 1080p
#    video and audio streams. Both are required — without ffmpeg, songs won't play at all.
MISSING=""
command -v yt-dlp >/dev/null 2>&1 || MISSING="$MISSING yt-dlp"
command -v ffmpeg >/dev/null 2>&1 || MISSING="$MISSING ffmpeg"
if [ -n "$MISSING" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "📦  Installing$MISSING (needed for song search and HD video)…"
    # shellcheck disable=SC2086
    brew install $MISSING || echo "⚠️  Install failed — search or HD video may not work until it succeeds."
  else
    echo "⚠️  Missing$MISSING and Homebrew isn't installed."
    echo "    Install Homebrew (https://brew.sh), then run: brew install$MISSING"
  fi
  echo
fi

# 3. Install app dependencies on first run.
if [ ! -d node_modules ]; then
  echo "📦  Installing app dependencies (first run only — takes a minute)…"
  npm install
  echo
fi

# 4. Open the host page once the server answers. (3000 is the default port.)
# ponytail: hardcoded 3000; matches PORT default in src/lib/config.ts.
(
  until curl -s "http://localhost:3000" >/dev/null 2>&1; do sleep 1; done
  open "http://localhost:3000/source"
) &

# 5. Boot the server (prints the LAN URL + QR for phones). Close this window to stop.
echo "✅  Server starting — a browser tab will open, and your phone can scan the QR below."
echo "    Leave this window open while singing. Close it to stop the server."
echo
npm run dev
