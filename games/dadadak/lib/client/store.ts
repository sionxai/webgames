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
  updatedAt: number;
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
