"use client";

import { get, ref } from "firebase/database";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import {
  firestore,
  getAuthenticatedUser,
  realtimeDb,
} from "./firebase";

type RankingScope = "all" | "region" | "school";

interface DadadakUser {
  nickname: string;
  bestCps: number;
  totalTaps: number;
  region: string | null;
  schoolId: string | null;
  /** 연속으로 플레이한 날 수. 하루라도 건너뛰면 1부터 다시 센다. */
  streakDays: number;
  /** 마지막으로 플레이한 날(로컬 기준 YYYY-MM-DD). */
  lastPlayDay: string | null;
  updatedAt: number;
}

/** 사용자의 로컬 시간대 기준 날짜 키. 연속일은 체감 기준이라 UTC를 쓰지 않는다. */
function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** day 기준 하루 전 날짜 키. */
function previousDayKey(day: string): string {
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() - 1);
  return localDayKey(parsed);
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function fallbackNickname(uid: string): string {
  return `게스트-${uid.slice(0, 4)}`;
}

function validNickname(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function portalNickname(uid: string): Promise<string | null> {
  try {
    const snapshot = await get(ref(realtimeDb, `portal/users/${uid}/nickname`));
    const value: unknown = snapshot.val();
    const nickname =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && "nickname" in value
          ? (value as { nickname?: unknown }).nickname
          : null;
    return validNickname(nickname) ? nickname.trim().slice(0, 20) : null;
  } catch {
    return null;
  }
}

export async function ensureProfile(): Promise<{
  uid: string;
  nickname: string;
} | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  try {
    const userRef = doc(firestore, "dadadak_users", user.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      const nickname = validNickname(data.nickname)
        ? data.nickname.trim().slice(0, 20)
        : ((await portalNickname(user.uid)) ?? fallbackNickname(user.uid));
      const normalized: DadadakUser = {
        nickname,
        bestCps:
          typeof data.bestCps === "number" &&
          Number.isFinite(data.bestCps) &&
          data.bestCps >= 0 &&
          data.bestCps <= 30
            ? data.bestCps
            : 0,
        totalTaps:
          typeof data.totalTaps === "number" &&
          Number.isFinite(data.totalTaps) &&
          data.totalTaps >= 0
            ? data.totalTaps
            : 0,
        region: nullableString(data.region),
        schoolId: nullableString(data.schoolId),
        streakDays: safeCount(data.streakDays),
        lastPlayDay: nullableString(data.lastPlayDay),
        updatedAt:
          typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
            ? data.updatedAt
            : Date.now(),
      };
      const needsRepair =
        data.nickname !== normalized.nickname ||
        data.bestCps !== normalized.bestCps ||
        data.totalTaps !== normalized.totalTaps ||
        data.region !== normalized.region ||
        data.schoolId !== normalized.schoolId ||
        data.streakDays !== normalized.streakDays ||
        data.lastPlayDay !== normalized.lastPlayDay ||
        data.updatedAt !== normalized.updatedAt;
      if (needsRepair) {
        try {
          await setDoc(userRef, normalized, { merge: true });
        } catch {
          return null;
        }
      }
      return { uid: user.uid, nickname };
    }

    const nickname =
      (await portalNickname(user.uid)) ?? fallbackNickname(user.uid);
    const profile: DadadakUser = {
      nickname,
      bestCps: 0,
      totalTaps: 0,
      region: null,
      schoolId: null,
      streakDays: 0,
      lastPlayDay: null,
      updatedAt: Date.now(),
    };
    await setDoc(userRef, profile);
    return { uid: user.uid, nickname };
  } catch {
    return null;
  }
}

export async function submitRun(
  cps: number,
  taps: number
): Promise<"ok" | "skipped" | "error"> {
  if (
    !Number.isFinite(cps) ||
    !Number.isFinite(taps) ||
    cps < 0 ||
    cps > 30 ||
    taps < 0
  ) {
    return "error";
  }

  const authenticatedUser = await getAuthenticatedUser();
  if (!authenticatedUser) return "skipped";

  const profile = await ensureProfile();
  if (!profile) return "error";

  try {
    const userRef = doc(firestore, "dadadak_users", profile.uid);
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists()) {
        transaction.set(userRef, {
          nickname: profile.nickname,
          bestCps: cps,
          totalTaps: taps,
          region: null,
          schoolId: null,
          streakDays: 1,
          lastPlayDay: localDayKey(),
          updatedAt: Date.now(),
        } satisfies DadadakUser);
        return;
      }

      const data = snapshot.data();
      const previousBest =
        typeof data.bestCps === "number" && Number.isFinite(data.bestCps)
          ? data.bestCps
          : 0;
      if (cps <= previousBest) return;

      const previousTotal =
        typeof data.totalTaps === "number" && Number.isFinite(data.totalTaps)
          ? data.totalTaps
          : 0;
      transaction.set(
        userRef,
        {
          bestCps: cps,
          totalTaps: previousTotal + taps,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });
    return "ok";
  } catch {
    return "error";
  }
}

export interface PlayerStats {
  bestCps: number;
  streakDays: number;
}

/** 홈 화면 배지에 쓰는 내 기록. 로그인 전이거나 실패하면 null. */
export async function loadStats(): Promise<PlayerStats | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  try {
    const snapshot = await getDoc(doc(firestore, "dadadak_users", user.uid));
    if (!snapshot.exists()) return { bestCps: 0, streakDays: 0 };
    const data = snapshot.data();
    const bestCps =
      typeof data.bestCps === "number" &&
      Number.isFinite(data.bestCps) &&
      data.bestCps >= 0 &&
      data.bestCps <= 30
        ? data.bestCps
        : 0;
    return { bestCps, streakDays: safeCount(data.streakDays) };
  } catch {
    return null;
  }
}

/**
 * 오늘 플레이했음을 기록하고 갱신된 연속일을 돌려준다.
 * 어제 이어서면 +1, 하루라도 건너뛰었으면 1로 리셋, 오늘 이미 셌으면 그대로.
 */
export async function recordPlayDay(): Promise<number | null> {
  const profile = await ensureProfile();
  if (!profile) return null;

  const today = localDayKey();
  try {
    const userRef = doc(firestore, "dadadak_users", profile.uid);
    let resolved = 0;
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const lastDay = nullableString(data.lastPlayDay);
      const previous = safeCount(data.streakDays);

      if (lastDay === today) {
        resolved = Math.max(previous, 1);
        if (previous >= 1) return;
      } else if (lastDay && lastDay === previousDayKey(today)) {
        resolved = previous + 1;
      } else {
        resolved = 1;
      }

      transaction.set(
        userRef,
        { streakDays: resolved, lastPlayDay: today, updatedAt: Date.now() },
        { merge: true }
      );
    });
    return resolved;
  } catch {
    return null;
  }
}

export async function getRankings(
  scope: RankingScope,
  limit = 100
): Promise<Array<{ uid: string; nickname: string; bestCps: number }>> {
  try {
    let ownRegion: string | null = null;
    let ownSchoolId: string | null = null;
    if (scope !== "all") {
      const profile = await ensureProfile();
      if (!profile) return [];
      const ownSnapshot = await getDoc(
        doc(firestore, "dadadak_users", profile.uid)
      );
      const ownData = ownSnapshot.data();
      ownRegion = nullableString(ownData?.region);
      ownSchoolId = nullableString(ownData?.schoolId);
      if (scope === "region" && !ownRegion) return [];
      if (scope === "school" && !ownSchoolId) return [];
    }

    const snapshot = await getDocs(collection(firestore, "dadadak_users"));
    const rankings = snapshot.docs.flatMap((item) => {
      const data = item.data();
      if (scope === "region" && nullableString(data.region) !== ownRegion) return [];
      if (scope === "school" && nullableString(data.schoolId) !== ownSchoolId) {
        return [];
      }
      if (
        typeof data.bestCps !== "number" ||
        !Number.isFinite(data.bestCps) ||
        data.bestCps < 0 ||
        data.bestCps > 30
      ) {
        return [];
      }
      return [
        {
          uid: item.id,
          nickname: validNickname(data.nickname)
            ? data.nickname.trim().slice(0, 20)
            : fallbackNickname(item.id),
          bestCps: data.bestCps,
        },
      ];
    });

    const safeLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.floor(limit)))
      : 100;
    return rankings
      .sort((a, b) => b.bestCps - a.bestCps || a.uid.localeCompare(b.uid))
      .slice(0, safeLimit);
  } catch {
    return [];
  }
}

export async function setRegionSchool(
  region: string | null,
  schoolId: string | null
): Promise<void> {
  const profile = await ensureProfile();
  if (!profile) return;

  try {
    await setDoc(
      doc(firestore, "dadadak_users", profile.uid),
      {
        region: nullableString(region),
        schoolId: nullableString(schoolId),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch {
    // 설정 저장 실패가 게임 이용을 막지 않도록 조용히 로컬 상태를 유지한다.
  }
}
