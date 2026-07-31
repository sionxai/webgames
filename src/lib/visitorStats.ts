import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  get,
  getDatabase,
  ref,
  runTransaction,
  type Database
} from 'firebase/database';
import { firebaseConfig } from './portalAuth';
import { subscribePortalAuth, type PortalAuthState } from './portalAuth';

export interface VisitorStats {
  /** 지금까지 방문한 사람 수(중복 제외). */
  total: number;
  /** 오늘 방문한 사람 수(중복 제외). */
  today: number;
}

type Listener = (stats: VisitorStats | null) => void;

const VISIT_GUARD_KEY = 'hanpan_visit_day_v1';

let database: Database | null = null;
let currentStats: VisitorStats | null = null;
let started = false;
const listeners = new Set<Listener>();

/** 사용자의 로컬 날짜 기준 키. 방문 집계는 체감 기준이라 UTC를 쓰지 않는다. */
function localDayKey(date = new Date()): string {
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

function emit(): void {
  listeners.forEach(listener => listener(currentStats));
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/** 오늘 이미 셌는지 로컬에서 먼저 걸러 불필요한 네트워크 왕복을 줄인다. */
function alreadyCountedToday(day: string): boolean {
  try {
    return window.localStorage.getItem(VISIT_GUARD_KEY) === day;
  } catch {
    return false;
  }
}

function markCountedToday(day: string): void {
  try {
    window.localStorage.setItem(VISIT_GUARD_KEY, day);
  } catch {
    // 저장소를 못 써도 집계 자체는 서버 기록으로 중복이 걸러진다.
  }
}

async function readStats(day: string): Promise<VisitorStats | null> {
  try {
    const db = getDb();
    const [totalSnapshot, todaySnapshot] = await Promise.all([
      get(ref(db, 'portal/stats/total')),
      get(ref(db, `portal/stats/days/${day}`))
    ]);
    return {
      total: toCount(totalSnapshot.val()),
      today: toCount(todaySnapshot.val())
    };
  } catch {
    return null;
  }
}

/**
 * 이 방문자를 오늘 방문으로 한 번만 기록한다.
 * `portal/visitors/{uid}`에 마지막 방문일을 남겨 같은 사람의 재방문을 걸러낸다.
 */
async function recordVisit(uid: string, day: string): Promise<void> {
  const db = getDb();
  const visitorRef = ref(db, `portal/visitors/${uid}`);

  const previousDay = await get(visitorRef)
    .then(snapshot => (typeof snapshot.val() === 'string' ? (snapshot.val() as string) : null))
    .catch(() => null);

  if (previousDay === day) {
    markCountedToday(day);
    return;
  }

  // 마커를 먼저 남긴다. 카운터 증가가 실패해도 중복 집계는 막힌다.
  await runTransaction(visitorRef, () => day);

  const isNewVisitor = previousDay === null;
  const increments: Promise<unknown>[] = [
    runTransaction(ref(db, `portal/stats/days/${day}`), current => toCount(current) + 1)
  ];
  if (isNewVisitor) {
    increments.push(
      runTransaction(ref(db, 'portal/stats/total'), current => toCount(current) + 1)
    );
  }
  await Promise.all(increments);
  markCountedToday(day);
}

async function run(state: PortalAuthState): Promise<void> {
  if (state.status !== 'guest' && state.status !== 'google') return;

  const day = localDayKey();
  const uid = state.user.uid;

  try {
    if (!alreadyCountedToday(day)) {
      await recordVisit(uid, day);
    }
  } catch {
    // 집계 실패는 화면을 막지 않는다. 아래에서 현재 수치만 읽어 보여준다.
  }

  currentStats = await readStats(day);
  emit();
}

/**
 * 방문 집계를 시작하고 현재 수치를 구독한다.
 * 로그인 전이거나 실패하면 null이 전달되고, 화면은 통계를 숨긴다.
 */
export function subscribeVisitorStats(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentStats);

  if (!started) {
    started = true;
    let handled = false;
    subscribePortalAuth(state => {
      if (handled) return;
      if (state.status === 'guest' || state.status === 'google') {
        handled = true;
        void run(state);
      }
    });
  }

  return () => {
    listeners.delete(listener);
  };
}
