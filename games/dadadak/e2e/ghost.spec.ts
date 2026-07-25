import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import type { BattleEndPayload } from "../lib/shared/types";

/**
 * 고스트 대결(도장깨기): A가 기록 생성 → B가 도전 링크로 진입 →
 * 고스트 타임라인과 실시간 대결 → 결과에 고스트 원기록이 그대로 재생됐는지 검증.
 * A의 기록은 소켓으로 직접 생성한다 (UI 배틀 10초 × 2회 절약).
 */
test("고스트 대결", async ({ browser, baseURL }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  // A: 온보딩 후 소켓으로 10초 솔로 기록 생성 (500ms당 1클릭 → 총 ~20)
  await pageA.goto("/");
  await pageA.getByLabel("닉네임").fill("도장주인");
  await pageA.getByRole("button", { name: "시작하기" }).click();
  await expect(pageA.getByLabel("닉네임")).toBeHidden({ timeout: 10_000 });
  const cookieA = (await pageA.context().cookies()).find(
    (c) => c.name === "dadadak_session"
  )!;

  const socketA: Socket = io(baseURL!, {
    transports: ["websocket"],
    extraHeaders: { Cookie: `dadadak_session=${cookieA.value}` },
  });
  const recordEnd = await new Promise<BattleEndPayload>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("record timeout")), 30_000);
    socketA.on("connect", () => socketA.emit("solo:start", { duration: 10 }));
    socketA.on("app:error", (e: { message: string }) => reject(new Error(e.message)));
    socketA.on("battle:countdown", (p: { startAt: number; serverNow: number }) => {
      const localStart = Date.now() + (p.startAt - p.serverNow);
      const timer = setInterval(() => {
        const now = Date.now();
        if (now > localStart + 10_300) {
          clearInterval(timer);
          return;
        }
        if (now >= localStart) socketA.emit("battle:tick", { delta: 1 });
      }, 500);
    });
    socketA.on("battle:end", (p: BattleEndPayload) => {
      clearTimeout(timeout);
      resolve(p);
    });
  });
  socketA.disconnect();
  const ghostRecord = recordEnd.results[0];
  expect(ghostRecord.flagged).toBe(false);
  expect(ghostRecord.finalCount).toBeGreaterThan(0);

  // B: 도전 링크 진입 → 온보딩 → 고스트 대결
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto(`/challenge/${recordEnd.matchId}?p=${ghostRecord.userId}`);
  await pageB.getByLabel("닉네임").fill("도전자");
  await pageB.getByRole("button", { name: "시작하기" }).click();
  await expect(pageB.getByText(/도장주인#/)).toBeVisible();
  await expect(
    pageB.getByText(`총 ${ghostRecord.finalCount}클릭`, { exact: false })
  ).toBeVisible();

  await pageB.getByRole("button", { name: "도전 시작" }).click();
  await pageB.waitForURL(/\/battle\//, { timeout: 10_000 });

  // 배틀 화면에 고스트 표시
  await expect(pageB.getByText("도장주인 (고스트)")).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });

  // 도전자 클릭 (고스트 ~20클릭을 이기도록 30회)
  for (let i = 0; i < 30; i++) {
    await pageB.keyboard.press("a");
    await pageB.waitForTimeout(100);
  }

  // 종료: 도장깨기 판정 + 고스트 원기록 재생 검증
  await expect(pageB.getByText(/도장깨기 (성공!|실패\.\.\.)|무승부!/)).toBeVisible(
    { timeout: 15_000 }
  );
  await expect(
    pageB.locator("li").filter({ hasText: "고스트" })
  ).toContainText(String(ghostRecord.finalCount));
  await expect(pageB.getByRole("link", { name: "다시 도전" })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
