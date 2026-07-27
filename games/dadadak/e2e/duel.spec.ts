import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page, nickname: string) {
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "시작하기" }).click();
}

async function clickLoop(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(150);
  }
}

// PRD 10.1 시나리오 2: 컨텍스트 2개 → 방 생성/입장 → 동시 배틀 → 서버 확정 결과 일치
test("1:1 방 대결", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // A: 온보딩 + 방 생성 (모달에서 인원 확인 후 생성)
  await pageA.goto("/");
  await onboard(pageA, "에이스");
  await pageA.getByRole("button", { name: "친구랑 대결 (방 만들기)" }).click();
  await pageA.getByRole("button", { name: "방 만들기", exact: true }).click();
  await pageA.waitForURL(/\/room\//, { timeout: 10_000 });
  const code = pageA.url().split("/room/")[1];

  // B: 초대 링크로 입장 + 온보딩
  await pageB.goto(`/room/${code}`);
  await onboard(pageB, "비스트");

  // 호스트 화면에 참가자 실시간 표시 (F4)
  await expect(pageA.getByText(/비스트#/)).toBeVisible({ timeout: 10_000 });

  // A: 시작
  await pageA.getByRole("button", { name: /대결 시작/ }).click();
  await pageA.waitForURL(/\/battle\//, { timeout: 10_000 });
  await pageB.waitForURL(/\/battle\//, { timeout: 10_000 });
  const matchId = pageA.url().split("/battle/")[1];
  expect(pageB.url()).toContain(matchId);

  // 동시 배틀
  await expect(pageA.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });
  await Promise.all([clickLoop(pageA, 20), clickLoop(pageB, 8)]);

  // 종료 판정: A 승리, B 패배
  await expect(pageA.getByText("승리!")).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText("패배...")).toBeVisible({ timeout: 15_000 });

  // 서버 확정 결과 검증
  const res = await pageA.request.get(`/api/matches/${matchId}`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as {
    match: { status: string };
    players: { nickname: string; final_count: number; rank: number }[];
  };
  expect(data.match.status).toBe("finished");
  expect(data.players).toHaveLength(2);
  const a = data.players.find((p) => p.nickname === "에이스")!;
  const b = data.players.find((p) => p.nickname === "비스트")!;
  expect(a.final_count).toBeGreaterThan(b.final_count);
  expect(a.rank).toBe(1);
  expect(b.rank).toBe(2);

  // 양쪽 화면에 서버 확정 카운트가 동일하게 표시
  for (const page of [pageA, pageB]) {
    await expect(
      page.locator("li").filter({ hasText: "에이스#" })
    ).toContainText(String(a.final_count));
    await expect(
      page.locator("li").filter({ hasText: "비스트#" })
    ).toContainText(String(b.final_count));
  }

  await ctxA.close();
  await ctxB.close();
});
