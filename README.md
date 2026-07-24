# Karaoke

Local-LAN home karaoke web app.

## Requirements

- macOS with Homebrew
- Node.js ≥ 22
- `yt-dlp` (`brew install yt-dlp`) — tested with version range documented below
- `ffmpeg` (`brew install ffmpeg`) — **required, not optional.** YouTube only offers
  1080p as separate video and audio streams, and ffmpeg is what merges them. Without it
  yt-dlp still exits successfully but produces no merged file, so *every song fails to
  play*. The server logs `ffmpeg NOT found on PATH` at boot if it's missing.

## Tested yt-dlp versions

`2026.04.x` and newer. If extraction fails, run:

```bash
brew upgrade yt-dlp
npm run check-ytdlp
```

## Easy start (macOS)

After `git clone`, just **double-click `start.command`** in Finder. It installs
what's missing (dependencies, and `yt-dlp` if Homebrew is present), starts the
server, and opens the host page automatically. Leave the window open while
singing; close it to stop.

> First time only: if macOS blocks it, right-click `start.command` → **Open** → **Open**.
> Node.js still has to be installed first — grab the LTS from [nodejs.org](https://nodejs.org) if the launcher says it's missing.

Then scan the QR (printed in the window) with your phone, or open the LAN URL on any device on the same WiFi.

## Quickstart (manual)

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
| `KARAOKE_MAX_HEIGHT` | `1080` | Max video height to download. YouTube only offers H.264 up to 1080p (above that it's VP9/AV1, which Safari can't hardware-decode). Lower it on a slow connection to shorten downloads. |
| `KARAOKE_CACHE_DIR` | `$TMPDIR/karaoke-media` | Where downloaded songs are cached. Kept outside the repo so Next's dev file-watcher doesn't churn on 80 MB writes. |
| `KARAOKE_CACHE_MAX_BYTES` | `10737418240` (10 GB) | Cache size cap. Oldest songs are evicted past it, never one used in the last 20 minutes. |
| `KARAOKE_LAN_HOST` | (auto-detected from `os.networkInterfaces()`) | Override the host string the source-page QR encodes for phones to scan. Useful when the server is multi-homed (Wi-Fi + Ethernet + VPN) or reached via a custom DNS hostname (e.g. `shimokita.local:3000`). Set to `"<host-or-ip>:<port>"`. When unset, the server picks the same address it prints in the boot banner. When the auto-detection finds nothing (loopback only), the source page falls back to `window.location.host`. **Note:** the auto-detected IP is captured at server boot and does not refresh. If the host's network changes mid-session, restart the server, or set `KARAOKE_LAN_HOST` to a stable mDNS name. |

