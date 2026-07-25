import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import type { BattleEndPayload } from "../lib/shared/types";

test("일일 미션 완료와 수령", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByLabel("닉네임").fill("미션러");
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

  const me = end.results[0];
  expect(me.flagged).toBe(false);
  expect(me.cps).toBeGreaterThanOrEqual(8);

  const missionsRes = await page.request.get("/api/users/me/missions");
  expect(missionsRes.ok()).toBeTruthy();
  const missionsData = (await missionsRes.json()) as {
    missions: {
      id: string;
      progress: number;
      completed: boolean;
    }[];
  };
  const cpsMission = missionsData.missions.find((m) => m.id === "cps-8");
  const battlesMission = missionsData.missions.find((m) => m.id === "battles-3");
  expect(cpsMission?.completed).toBe(true);
  expect(battlesMission?.progress).toBe(1);

  const claimRes = await page.request.post("/api/users/me/missions/claim", {
    data: { missionId: "cps-8" },
  });
  expect(claimRes.ok()).toBeTruthy();
  const claimData = (await claimRes.json()) as {
    user: { total_clicks: number };
    reward: number;
  };
  expect(claimData.reward).toBe(200);
  expect(claimData.user.total_clicks).toBeGreaterThanOrEqual(
    me.finalCount + 200
  );

  const duplicateRes = await page.request.post("/api/users/me/missions/claim", {
    data: { missionId: "cps-8" },
  });
  expect(duplicateRes.status()).toBe(409);
});
