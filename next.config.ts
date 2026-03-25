import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["dockerode", "ssh2"],
  async rewrites() {
    return [
      {
        source: "/workspace/:id/:path*",
        destination: "http://localhost:8080/:path*"
      }
    ];
  }
};

export default nextConfig;
