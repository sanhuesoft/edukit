import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/horarios",
  reactCompiler: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
