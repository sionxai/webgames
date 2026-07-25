import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/games/dadadak",
  trailingSlash: true,
  images: { unoptimized: true },
  // E2E가 dev 서버의 .next를 덮어쓰지 않도록 빌드 디렉토리 분리 허용
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
