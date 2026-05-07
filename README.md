# Karaoke

Local-LAN home karaoke web app.

## Requirements

- macOS with Homebrew
- Node.js ≥ 22
- `yt-dlp` (`brew install yt-dlp`) — tested with version range documented below

## Tested yt-dlp versions

`2026.04.x` and newer. If extraction fails, run:

```bash
brew upgrade yt-dlp
npm run check-ytdlp
```

## Quickstart

```bash
npm install
npm run check-ytdlp     # smoke test
npm run dev             # prints LAN URL, source token, QR
```

1. Open the printed URL on the MacBook (e.g. `http://localhost:3000/source`), paste the source token, click "▶ Start show".
2. Scan the QR with your phone or open the LAN URL on any device on the same WiFi.
3. Search, paste, queue, sing.

## Tech notes

See `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` for the full design.
