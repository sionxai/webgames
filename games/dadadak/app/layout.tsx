import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "다다닥 — 10초 클릭 대결",
  description:
    "폰 터치와 키보드로 CPS를 측정하고 비공식 랭킹에 도전하세요.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  ),
  openGraph: {
    images: ["/games/dadadak/og-default.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1220",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // 연타 시 더블탭 줌 방지
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <div className="mx-auto min-h-dvh w-full max-w-[480px]">{children}</div>
      </body>
    </html>
  );
}
