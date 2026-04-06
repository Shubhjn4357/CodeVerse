import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  enablePrerenderSourceMaps: true,
  serverExternalPackages: ["dockerode", "ssh2", "tar-fs", "node-pty"],
};

export default nextConfig;
