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

test("골든 클릭 방 대결", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto("/");
  await onboard(pageA, "골드왕");
  await pageA.getByRole("button", { name: "친구랑 대결 (방 만들기)" }).click();
  await pageA.getByRole("button", { name: "방 만들기", exact: true }).click();
  await pageA.waitForURL(/\/room\//, { timeout: 10_000 });
  const code = pageA.url().split("/room/")[1];

  await pageB.goto(`/room/${code}`);
  await onboard(pageB, "실버");

  await expect(pageA.getByText(/실버#/)).toBeVisible({ timeout: 10_000 });
  await pageA.getByRole("button", { name: "10초", exact: true }).click();
  await pageA.getByRole("button", { name: "골든 클릭" }).click();
  await pageA.getByRole("button", { name: /대결 시작/ }).click();

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

  const goldenCaption = pageA.getByText("골든 클릭 x2!");
  const goldenVisible = expect(goldenCaption).toBeVisible({ timeout: 6_000 });
  await Promise.all([clickLoop(pageA, 60, 120), clickLoop(pageB, 8, 400), goldenVisible]);
  await expect(goldenCaption).toBeHidden({ timeout: 6_000 });

  await expect(pageA.getByText("승리!")).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText("패배...")).toBeVisible({ timeout: 15_000 });

  const res = await pageA.request.get(`/api/matches/${matchId}`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as {
    match: { golden: 0 | 1; status: string };
    players: {
      nickname: string;
      final_count: number;
      score: number | null;
      cps: number;
      rank: number;
    }[];
  };
  expect(data.match.status).toBe("finished");
  expect(data.match.golden).toBe(1);
  expect(data.players).toHaveLength(2);

  const gold = data.players.find((p) => p.nickname === "골드왕")!;
  const silver = data.players.find((p) => p.nickname === "실버")!;
  expect(gold.score).not.toBeNull();
  expect(silver.score).not.toBeNull();
  expect(gold.score!).toBeGreaterThan(gold.final_count);
  expect(silver.score!).toBeGreaterThan(silver.final_count);

  const sorted = [...data.players].sort((a, b) => b.score! - a.score!);
  expect(sorted[0].rank).toBe(1);
  expect(sorted[1].rank).toBe(2);
  expect(Math.abs(gold.cps - gold.final_count / 10)).toBeLessThanOrEqual(0.01);

  await ctxA.close();
  await ctxB.close();
});
