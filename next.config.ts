import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["dockerode", "ssh2"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Example Dynamic Docker proxy route for code-server wrappers
      {
        source: "/workspace/:id/:path*",
        destination: "http://localhost:8080/:path*" // Eventually maps dynamically via custom server or reverse proxy mapper
      }
    ];
  }
};

export default nextConfig;
