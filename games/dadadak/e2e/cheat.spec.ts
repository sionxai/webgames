import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import type { BattleEndPayload } from "../lib/shared/types";

// PRD 10.1 시나리오 3: 40CPS 입력 → flagged=1 → 랭킹 미반영.
// 클라이언트에는 isTrusted 필터(안티매크로 1차)가 있어 합성 이벤트가 막히므로,
// 여기서는 소켓을 직접 공격해 "서버 권위" 방어선 자체를 검증한다.
test("치트 플래그", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByLabel("닉네임").fill("치터");
  await page.getByRole("button", { name: "시작하기" }).click();
  // 온보딩 완료(모달 닫힘 = 세션 쿠키 발급) 대기
  await expect(page.getByLabel("닉네임")).toBeHidden({ timeout: 10_000 });

  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "dadadak_session"
  );
  expect(cookie).toBeTruthy();

  const socket = io(baseURL!, {
    transports: ["websocket"],
    extraHeaders: { Cookie: `dadadak_session=${cookie!.value}` },
  });

  // 250ms마다 delta 10 → 40CPS 시도 (서버가 윈도우당 8로 절삭 → 32CPS 기록 → 임계 20 초과)
  const end = await new Promise<BattleEndPayload>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("battle:end timeout")), 30_000);
    socket.on("connect", () => socket.emit("solo:start", { duration: 10 }));
    socket.on("app:error", (e: { message: string }) =>
      reject(new Error(e.message))
    );
    socket.on(
      "battle:countdown",
      (p: { startAt: number; serverNow: number }) => {
        const localStart = Date.now() + (p.startAt - p.serverNow);
        const timer = setInterval(() => {
          const now = Date.now();
          if (now > localStart + 10_500) {
            clearInterval(timer);
            return;
          }
          if (now >= localStart) socket.emit("battle:tick", { delta: 10 });
        }, 250);
      }
    );
    socket.on("battle:end", (p: BattleEndPayload) => {
      clearTimeout(timeout);
      resolve(p);
    });
  });
  socket.disconnect();

  const me = end.results[0];
  expect(me.flagged).toBe(true);
  expect(me.cps).toBeGreaterThan(20);

  // 랭킹 미반영 확인
  const res = await page.request.get("/api/rankings?scope=national&period=daily");
  const data = (await res.json()) as { rankings: { nickname: string }[] };
  expect(data.rankings.find((r) => r.nickname === "치터")).toBeUndefined();

  // 최고기록도 갱신되지 않음
  await page.goto("/");
  await expect(page.getByText("첫 기록을 세워보세요")).toBeVisible();
});
