import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page, nickname: string) {
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByLabel("닉네임")).toBeHidden();
}

async function clickLoop(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(100);
  }
}

test("글로벌 이벤트 매치", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto("/");
  await onboard(pageA, "이벤터일");
  await pageB.goto("/");
  await onboard(pageB, "이벤터이");

  await pageA.goto("/event");
  await pageB.goto("/event");
  await pageA.getByRole("button", { name: "참전 대기" }).click();
  await pageB.getByRole("button", { name: "참전 대기" }).click();

  await pageA.waitForURL(/\/battle\//, { timeout: 30_000 });
  await pageB.waitForURL(/\/battle\//, { timeout: 30_000 });
  const matchId = pageA.url().split("/battle/")[1];
  expect(pageB.url()).toContain(matchId);

  await expect(pageA.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });

  await Promise.all([clickLoop(pageA, 20), clickLoop(pageB, 20)]);

  await expect(pageA.getByText(/우승!|\d+위/)).toBeVisible({ timeout: 40_000 });
  await expect(pageB.getByText(/우승!|\d+위/)).toBeVisible({ timeout: 40_000 });

  const res = await pageA.request.get(`/api/matches/${matchId}`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as {
    match: { mode: string; status: string };
    players: { nickname: string }[];
  };
  expect(data.match.mode).toBe("event");
  expect(data.match.status).toBe("finished");
  expect(data.players).toHaveLength(2);

  await ctxA.close();
  await ctxB.close();
});
