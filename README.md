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

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `KARAOKE_LAN_HOST` | (auto-detected from `os.networkInterfaces()`) | Override the host string the source-page QR encodes for phones to scan. Useful when the server is multi-homed (Wi-Fi + Ethernet + VPN) or reached via a custom DNS hostname (e.g. `shimokita.local:3000`). Set to `"<host-or-ip>:<port>"`. When unset, the server picks the same address it prints in the boot banner. When the auto-detection finds nothing (loopback only), the source page falls back to `window.location.host`. **Note:** the auto-detected IP is captured at server boot and does not refresh. If the host's network changes mid-session, restart the server, or set `KARAOKE_LAN_HOST` to a stable mDNS name. |

