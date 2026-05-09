import type { NextConfig } from "next";
import os from "node:os";

// Karaoke is a LAN-only dev tool — phones connect via the MacBook's LAN IP,
// which Next dev HMR otherwise rejects ("ERR_INVALID_HTTP_RESPONSE" on the
// HMR WebSocket → React never hydrates → tap "Sign in" does nothing).
// Whitelist every non-internal IPv4 the host has so HMR works from any phone.
const lanOrigins = (() => {
  const ifs = os.networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] ?? []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
})();

const nextConfig: NextConfig = {
  // Origins permitted to use Next dev features (HMR upgrade, etc.). Localhost
  // is implicitly allowed; we add every detected LAN IP so phones can connect.
  allowedDevOrigins: lanOrigins,
};

export default nextConfig;
