import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  // 주의: 실행 중 data/e2e.db를 삭제하면 안 된다 — 서버의 소켓 프로세스가
  // 이미 열어둔 파일 핸들과 라우트 쪽 새 파일이 갈라진다.
  // 테스트는 실행마다 새 쿠키·고유 닉네임을 쓰므로 DB 초기화가 필요 없다.
  use: {
    baseURL: "http://localhost:3111",
  },
  webServer: {
    // dev 서버는 온디맨드 컴파일 때문에 병렬 테스트에서 타이밍이 흔들린다 → 프로덕션 빌드로 고정
    command: "npm run build && npm start",
    port: 3111,
    env: {
      PORT: "3111",
      DATABASE_PATH: "data/e2e.db", // 개발 DB와 분리
      NEXT_DIST_DIR: ".next-e2e", // dev 서버의 .next를 덮어쓰지 않도록 분리
      EVENT_INTERVAL_SEC: "20",
      MISSION_IDS: "cps-8,taps-300,battles-3",
      GOLDEN_WINDOWS_MS: "2000",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
