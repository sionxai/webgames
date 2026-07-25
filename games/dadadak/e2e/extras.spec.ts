import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page, nickname: string) {
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByLabel("닉네임")).toBeHidden({ timeout: 10_000 });
}

test("QR 초대", async ({ page }) => {
  await page.goto("/");
  await onboard(page, "큐알러");
  await page.getByRole("button", { name: "친구랑 대결 (방 만들기)" }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await page.waitForURL(/\/room\//, { timeout: 10_000 });

  await page.getByRole("button", { name: "QR로 초대" }).click();
  const qr = page.locator('img[alt="방 초대 QR"]');
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image/);
  await page.getByRole("button", { name: "닫기" }).last().click();
  await expect(qr).toBeHidden();
});

test("스트릭 표시", async ({ page }) => {
  await page.goto("/");
  await onboard(page, "출석왕");
  await page.goto("/");
  await expect(page.getByText("1일 연속")).toBeVisible();
});
