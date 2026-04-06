import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  enablePrerenderSourceMaps: true,
  serverExternalPackages: ["dockerode", "ssh2", "tar-fs", "node-pty"],
};

export default nextConfig;
