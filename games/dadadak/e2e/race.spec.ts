import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page, nickname: string) {
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "시작하기" }).click();
}

async function clickLoop(page: Page, times: number, intervalMs: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(intervalMs);
  }
}

test("서든데스 레이스 방 대결", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto("/");
  await onboard(pageA, "레이서A");
  await pageA.getByRole("button", { name: "친구랑 대결 (방 만들기)" }).click();
  await pageA.getByRole("button", { name: "방 만들기", exact: true }).click();
  await pageA.waitForURL(/\/room\//, { timeout: 10_000 });
  const code = pageA.url().split("/room/")[1];

  await pageB.goto(`/room/${code}`);
  await onboard(pageB, "레이서B");

  await expect(pageA.getByText(/레이서B#/)).toBeVisible({ timeout: 10_000 });
  await pageA.getByRole("button", { name: "서든데스" }).click();
  await pageA.getByRole("button", { name: "50클릭", exact: true }).click();
  await pageA.getByRole("button", { name: /서든데스 50클릭 시작/ }).click();

  await pageA.waitForURL(/\/battle\//, { timeout: 10_000 });
  await pageB.waitForURL(/\/battle\//, { timeout: 10_000 });
  const matchId = pageA.url().split("/battle/")[1];
  expect(pageB.url()).toContain(matchId);

  await expect(pageA.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });
  await Promise.all([clickLoop(pageA, 70, 40), clickLoop(pageB, 10, 300)]);

  await expect(pageA.getByText("승리!")).toBeVisible({ timeout: 30_000 });
  await expect(pageB.getByText("패배...")).toBeVisible({ timeout: 30_000 });

  const res = await pageA.request.get(`/api/matches/${matchId}`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as {
    match: { status: string };
    players: { nickname: string; final_count: number; rank: number }[];
  };
  expect(data.match.status).toBe("finished");
  const a = data.players.find((p) => p.nickname === "레이서A")!;
  expect(a.rank).toBe(1);
  expect(a.final_count).toBe(50);

  await ctxA.close();
  await ctxB.close();
});
