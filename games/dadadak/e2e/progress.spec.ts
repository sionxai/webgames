import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import type { BattleEndPayload } from "../lib/shared/types";

test("업적과 스킨", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByLabel("닉네임").fill("도감러");
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByLabel("닉네임")).toBeHidden({ timeout: 10_000 });

  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "dadadak_session"
  );
  expect(cookie).toBeTruthy();

  const socket = io(baseURL!, {
    transports: ["websocket"],
    extraHeaders: { Cookie: `dadadak_session=${cookie!.value}` },
  });

  const end = await new Promise<BattleEndPayload>((resolve, reject) => {
    const pattern = [1, 3, 2, 3, 1, 2];
    let index = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => reject(new Error("battle:end timeout")), 30_000);

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
  socket.disconnect();

  expect(end.results[0].flagged).toBe(false);

  const achievementsRes = await page.request.get("/api/users/me/achievements");
  expect(achievementsRes.ok()).toBeTruthy();
  const achievementsData = (await achievementsRes.json()) as {
    achievements: { id: string; unlocked: boolean }[];
    newly: string[];
  };
  const firstRecord = achievementsData.achievements.find(
    (achievement) => achievement.id === "first-record"
  );
  expect(firstRecord?.unlocked).toBe(true);
  expect(achievementsData.newly).toContain("first-record");

  await page.goto("/achievements");
  await expect(page.getByText("첫 딸깍 기록")).toBeVisible();
  await expect(page.getByText(/\/ 14/)).toBeVisible();

  const lockedSkinRes = await page.request.patch("/api/users/me", {
    data: { skin_id: "blue-clicky" },
  });
  expect(lockedSkinRes.status()).toBe(400);

  const classicSkinRes = await page.request.patch("/api/users/me", {
    data: { skin_id: "classic" },
  });
  expect(classicSkinRes.ok()).toBeTruthy();
});
