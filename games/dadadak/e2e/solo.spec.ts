import { expect, test } from "@playwright/test";

// PRD 10.1 시나리오 1: 신규 방문 → 온보딩 → 솔로 10초 측정 → 결과 저장 → 홈 최고기록 반영
test("솔로 플로우", async ({ page }) => {
  await page.goto("/");

  // 온보딩 모달
  await page.getByLabel("닉네임").fill("솔로유저");
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(
    page.getByRole("button", { name: "딸깍 누적하기" })
  ).toBeVisible();
  await expect(page.getByText("첫 기록을 세워보세요")).toBeVisible();

  // 솔로 측정
  await page.getByRole("link", { name: "솔로 측정" }).click();
  await page.getByRole("button", { name: "탭해서 시작" }).click();

  // 3초 카운트다운 후 측정 시작
  await expect(page.getByRole("button", { name: "다다닥!" })).toBeVisible({
    timeout: 10_000,
  });

  // 키보드 입력으로 클릭 적립
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(120);
  }

  // 결과 패널 (10초 종료 + 서버 확정 대기)
  await expect(page.getByText("10초 측정 결과")).toBeVisible({ timeout: 15_000 });
  const totalText = await page.getByText(/총 \d+클릭/).innerText();
  const total = Number(totalText.match(/\d+/)?.[0]);
  expect(total).toBeGreaterThan(0);

  // 홈에 최고기록 반영 (BEST 메타 레일)
  await page.goto("/");
  await expect(page.getByText("BEST")).toBeVisible();
  await expect(page.getByText("첫 기록을 세워보세요")).toHaveCount(0);
  await expect(page.locator("main").getByText(/\d+(\.\d)? CPS/)).toBeVisible();
});
