import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { io } from "socket.io-client";
import { TAUNTS } from "../lib/shared/taunts";
import type { BattleEndPayload } from "../lib/shared/types";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let matchId = "";
let userId = "";

function kstWeekStartDate(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  kst.setUTCHours(0, 0, 0, 0);
  const day = kst.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  kst.setUTCDate(kst.getUTCDate() - diff);
  return kst.toISOString().slice(0, 10);
}

async function finishSoloWithSocket(baseURL: string, sessionCookie: string) {
  const socket = io(baseURL, {
    transports: ["websocket"],
    extraHeaders: { Cookie: `dadadak_session=${sessionCookie}` },
  });

  try {
    return await new Promise<BattleEndPayload>((resolve, reject) => {
      const pattern = [1, 3, 2, 4, 1, 2, 3];
      let index = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      const timeout = setTimeout(
        () => reject(new Error("battle:end timeout")),
        30_000
      );

      socket.on("connect", () => socket.emit("solo:start", { duration: 10 }));
      socket.on("app:error", (e: { message: string }) =>
        reject(new Error(e.message))
      );
      socket.on(
        "battle:countdown",
        (p: { startAt: number; serverNow: number }) => {
          const localStart = Date.now() + (p.startAt - p.serverNow);
          const sendTick = () => {
            const now = Date.now();
            if (now > localStart + 10_300) {
              if (timer) clearInterval(timer);
              return;
            }
            if (now >= localStart) {
              socket.emit("battle:tick", { delta: pattern[index % pattern.length] });
              index += 1;
            }
          };
          setTimeout(() => {
            sendTick();
            timer = setInterval(sendTick, 250);
          }, Math.max(0, localStart - Date.now()) + 5);
        }
      );
      socket.on("battle:end", (p: BattleEndPayload) => {
        clearTimeout(timeout);
        if (timer) clearInterval(timer);
        resolve(p);
      });
    });
  } finally {
    socket.disconnect();
  }
}

test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext({ baseURL });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("도발 프리셋", async ({ baseURL }) => {
  await page.goto("/");
  await page.getByLabel("닉네임").fill("도발러");
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByLabel("닉네임")).toBeHidden({ timeout: 10_000 });

  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "dadadak_session"
  );
  expect(cookie).toBeTruthy();

  const end = await finishSoloWithSocket(baseURL!, cookie!.value);
  const result = end.results[0];
  expect(result.flagged).toBe(false);
  matchId = end.matchId;
  userId = result.userId;

  await page.goto(`/result/${matchId}?p=${userId}&t=1`);
  await expect(page.getByText(TAUNTS[1])).toBeVisible();
  await expect(page.getByRole("link", { name: /이 기록에 도전하기/ })).toHaveAttribute(
    "href",
    new RegExp(`/challenge/${matchId}\\?p=${userId}&t=1`)
  );

  await page.goto(`/challenge/${matchId}?p=${userId}&t=1`);
  await expect(page.getByText(TAUNTS[1])).toBeVisible();
  await expect(page.getByText("도전장이 도착했어요")).toBeVisible();
});

test("주간 리포트", async () => {
  const week = kstWeekStartDate();

  await page.goto("/report");
  await page.waitForURL(new RegExp(`/report/${userId}/${week}$`));
  await expect(page.getByText("주간 딸깍 리포트")).toBeVisible();

  const battleLabel = page.getByText("배틀", { exact: true });
  await expect(battleLabel).toBeVisible();
  await expect(
    battleLabel.locator("xpath=following-sibling::*[contains(@class, 'tabular')]")
  ).toHaveText(/[1-9]\d*/);

  const og = await page.request.get(`/api/og/report/${userId}?w=${week}`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image");
});
