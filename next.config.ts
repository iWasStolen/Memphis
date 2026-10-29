import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* type errors fail the build — src/ is verified clean, and silently
     shipping type regressions is worse than a red build */
  reactStrictMode: false,
  /* No global COOP/COEP headers: the Scramjet v2 transports run in the
     page (no SharedWorker → no SharedArrayBuffer requirement), and
     cross-origin isolation BLOCKS direct game embeds like
     classic.minecraft.net that don't send CORP/COEP. Proxied content
     manages its own headers inside the engine. */
};

export default nextConfig;
