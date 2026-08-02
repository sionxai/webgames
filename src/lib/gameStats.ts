import { getApp, getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref, runTransaction, type Database } from 'firebase/database';
import { firebaseConfig, initPortalAuth, subscribePortalAuth } from './portalAuth';

export interface GameVisitCounts {
  total: number;
  today: number;
}

let database: Database | null = null;

/** 사용자의 로컬 날짜 기준 키. 방문자 통계와 같은 기준을 쓴다. */
export function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDb(): Database {
  if (!database) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    database = getDatabase(app);
  }
  return database;
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/** 게임 id는 경로 조각으로 쓰이므로 안전한 문자만 허용한다. */
function isSafeGameId(gameId: string): boolean {
  return /^[a-z0-9-]{1,32}$/.test(gameId);
}

/**
 * 게임 진입을 1회 기록한다.
 * 홈에서 카드를 누르는 시점에 호출하므로 게임 코드는 손대지 않는다.
 * 실패해도 조용히 넘어가고 이동을 막지 않는다.
 */
export async function recordGameVisit(gameId: string): Promise<void> {
  if (!isSafeGameId(gameId)) return;

  const day = localDayKey();
  try {
    const db = getDb();
    await Promise.all([
      runTransaction(ref(db, `portal/stats/games/${gameId}/total`), c => toCount(c) + 1),
      runTransaction(ref(db, `portal/stats/games/${gameId}/days/${day}`), c => toCount(c) + 1)
    ]);
  } catch {
    // 집계 실패가 게임 진입을 막아서는 안 된다.
  }
}

/** 관리자 화면용: 게임별 누적·오늘 방문 수를 한 번에 읽는다. */
export async function readGameStats(
  gameIds: readonly string[]
): Promise<Record<string, GameVisitCounts>> {
  const db = getDb();
  const day = localDayKey();
  const entries = await Promise.all(
    gameIds.filter(isSafeGameId).map(async id => {
      const [totalSnapshot, todaySnapshot] = await Promise.all([
        get(ref(db, `portal/stats/games/${id}/total`)),
        get(ref(db, `portal/stats/games/${id}/days/${day}`))
      ]);
      return [
        id,
        { total: toCount(totalSnapshot.val()), today: toCount(todaySnapshot.val()) }
      ] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** 포털 전체 방문 수(홈 배지와 같은 값). */
export async function readPortalTotals(): Promise<GameVisitCounts> {
  const db = getDb();
  const day = localDayKey();
  const [totalSnapshot, todaySnapshot] = await Promise.all([
    get(ref(db, 'portal/stats/total')),
    get(ref(db, `portal/stats/days/${day}`))
  ]);
  return { total: toCount(totalSnapshot.val()), today: toCount(todaySnapshot.val()) };
}

export interface AdminSession {
  uid: string;
  isAdmin: boolean;
}

/** 로그인된 uid를 얻고, 그 uid가 관리자로 등록돼 있는지 확인한다. */
export function resolveAdminSession(): Promise<AdminSession | null> {
  return new Promise(resolve => {
    // 관리자 페이지에는 로그인 위젯이 없으므로 인증을 직접 시작한다.
    initPortalAuth();

    let settled = false;
    const unsubscribe = subscribePortalAuth(state => {
      if (settled) return;
      if (state.status !== 'guest' && state.status !== 'google') return;
      settled = true;
      unsubscribe();

      const uid = state.user.uid;
      get(ref(getDb(), `portal/admins/${uid}`))
        .then(snapshot => resolve({ uid, isAdmin: snapshot.val() === true }))
        .catch(() => resolve({ uid, isAdmin: false }));
    });

    // 인증이 아예 오지 않는 환경에서도 화면이 멈추지 않게 한다.
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(null);
    }, 8000);
  });
}
