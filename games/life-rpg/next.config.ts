import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/games/life-rpg",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
