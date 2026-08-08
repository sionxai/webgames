import { MAX_ASCENSION } from '../content/ascension';
import {
  BONPURI_PROFILE_KEY,
  DEFAULT_STARTING_DECK,
  migrateProfile,
  validateStartingDeck,
  type BonpuriProfile,
  type StorageAdapter,
} from './profile';

/**
 * 클라우드 저장의 순수 데이터 경계.
 * 여기에는 네트워크도 인증도 없다 — 무엇을 신뢰할지, 누구 기록인지, 무엇을 버리기 전에 남길지만 정한다.
 * 부작용이 필요한 함수는 StorageAdapter 를 받고, 시각·기기값은 주입받아 결정적으로 검증 가능하게 한다.
 */

export const PROFILE_META_KEY = 'bonpuri_profile_meta_v1';
export const PROFILE_BACKUP_KEY = 'bonpuri_profile_backup_v1';
/** cloudSave.ts 의 상한과 같은 값. 그쪽이 export 하지 않아 여기서 계약으로 다시 못박는다. */
export const MAX_CLOUD_PAYLOAD_LENGTH = 200_000;
/** 본풀이 클라우드 envelope 는 3만 허용한다(WO-009 §6.2). */
export const CLOUD_ENVELOPE_SCHEMA = 3;

/**
 * 이 기기의 로컬 기록이 누구 것인지.
 * legacy-local: 소유자 정보가 없던 시절의 기록. 계정에 자동 귀속하지 않는다.
 * guest: 로그인 없이 플레이한 기록.
 * google: 특정 계정의 기록. uid 는 판정용이며 화면·로그에 내보내지 않는다.
 */
export type ProfileOwner =
  | { kind: 'legacy-local' }
  | { kind: 'guest' }
  | { kind: 'google'; uid: string };

export type ProfileMeta = {
  schemaVersion: 1;
  owner: ProfileOwner;
  /** 로컬 최종 저장 시각 (epoch ms) */
  savedAt: number;
  /** 기기 식별용 비민감 임의 값 */
  device: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isOwner(value: unknown): value is ProfileOwner {
  if (!isRecord(value)) return false;
  if (value.kind === 'legacy-local' || value.kind === 'guest') return true;
  return value.kind === 'google' && typeof value.uid === 'string' && value.uid.length > 0;
}

export function isProfileMeta(value: unknown): value is ProfileMeta {
  return isRecord(value) && value.schemaVersion === 1 && isOwner(value.owner) &&
    Number.isFinite(value.savedAt) && (value.savedAt as number) >= 0 &&
    typeof value.device === 'string';
}

export function readMeta(storage: StorageAdapter): ProfileMeta | null {
  try {
    const raw = storage.getItem(PROFILE_META_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfileMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type WriteResult = { ok: true } | { ok: false; error: string };

export function writeMeta(storage: StorageAdapter, meta: ProfileMeta): WriteResult {
  if (!isProfileMeta(meta)) return { ok: false, error: '저장 소유자 정보가 올바르지 않습니다.' };
  try {
    storage.setItem(PROFILE_META_KEY, JSON.stringify(meta));
    return { ok: true };
  } catch {
    return { ok: false, error: '저장 소유자 정보를 기록하지 못했습니다.' };
  }
}

/**
 * 로컬 기록과 현재 로그인 계정의 관계.
 * 익명 UID 를 Google 에 연결해 UID 가 유지되면 same-owner 다(§5.4).
 * UID 가 바뀌면 account-changed 이며, 무엇도 자동으로 옮기지 않는다(§5.5).
 */
export type OwnerRelation =
  | { kind: 'no-local-record' }
  | { kind: 'legacy-local' }
  | { kind: 'guest-record' }
  | { kind: 'same-owner' }
  | { kind: 'account-changed' };

export function classifyOwner(
  meta: ProfileMeta | null,
  hasLocalProfile: boolean,
  uid: string | null,
): OwnerRelation {
  if (!hasLocalProfile) return { kind: 'no-local-record' };
  // 메타가 없으면 소유자 정보가 없던 시절의 기록이다. 계정에 자동 귀속하지 않는다.
  if (meta === null) return { kind: 'legacy-local' };
  if (meta.owner.kind === 'legacy-local') return { kind: 'legacy-local' };
  if (meta.owner.kind === 'guest') return { kind: 'guest-record' };
  if (uid !== null && meta.owner.uid === uid) return { kind: 'same-owner' };
  return { kind: 'account-changed' };
}

const defaultDeck = [...DEFAULT_STARTING_DECK];
const isDefaultDeck = (deck: readonly string[]): boolean =>
  deck.length === defaultDeck.length && deck.every((id, index) => id === defaultDeck[index]);

/**
 * 자동 업로드해도 되는지를 가르는 기준이 아니다 — 자동 업로드는 어떤 경우에도 하지 않는다(§5.3).
 * 이 판정은 "사용자에게 선택을 물어볼 가치가 있는 기록인가"를 가른다.
 * 빈 기록이면 굳이 선택 화면으로 방해하지 않는다.
 */
export function isMeaningfulProfile(profile: BonpuriProfile): boolean {
  return Object.values(profile.collection).some((count) => count > 0) ||
    profile.runsCompleted > 0 ||
    profile.runsWon > 0 ||
    profile.ascensionUnlocked > 0 ||
    !isDefaultDeck(profile.startingDeck);
}

export type CloudPayloadResult =
  | { ok: true; profile: BonpuriProfile; from: 1 | 2 | 3; deckReset: boolean }
  | { ok: false; error: string };

/**
 * 클라우드에서 받은 payload 를 신뢰하지 않는다(§6.4).
 * 파싱 → 지원 스키마 → 마이그레이션 → 덱·보유량·카드 ID·전적·승천 범위까지 전부 통과해야
 * 프로필로 인정한다. 하나라도 실패하면 호출자는 로컬 기록을 그대로 두어야 한다.
 */
export function parseCloudPayload(raw: unknown): CloudPayloadResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: '클라우드 기록을 읽지 못했습니다.' };
  }
  if (raw.length > MAX_CLOUD_PAYLOAD_LENGTH) {
    return { ok: false, error: '클라우드 기록이 너무 큽니다.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: '클라우드 기록의 형식이 올바르지 않습니다.' };
  }
  const migrated = migrateProfile(parsed);
  if (migrated === null) return { ok: false, error: '클라우드 기록의 형식이 올바르지 않습니다.' };
  const { profile } = migrated;
  // 전적·승천 범위는 isBonpuriProfile 이 이미 보지만, 마이그레이션 산출물도 같은 기준을 통과해야 한다.
  if (profile.ascensionUnlocked > MAX_ASCENSION || profile.ascensionSelected > profile.ascensionUnlocked) {
    return { ok: false, error: '클라우드 기록의 승천 정보가 올바르지 않습니다.' };
  }
  const deck = validateStartingDeck(profile.startingDeck, profile.collection);
  if (!deck.ok) return { ok: false, error: `클라우드 기록의 덱이 올바르지 않습니다. ${deck.error}` };
  return { ok: true, ...migrated };
}

/** envelope 검증은 payload 와 별개다 — 다른 schema 는 자동 변환하지 않고 오류로 끝낸다(§6.2). */
export function isSupportedEnvelope(schema: unknown): boolean {
  return schema === CLOUD_ENVELOPE_SCHEMA;
}

/**
 * 같은 기록인지 비교한다. 원시 문자열 비교는 키 순서에 흔들리므로 정규화한 뒤 본다.
 * rulesPanelOpen 같은 화면 설정도 포함한다 — 기기마다 다를 수 있지만 그것도 사용자의 기록이다.
 */
export function canonicalProfileJson(profile: BonpuriProfile): string {
  const collection = Object.keys(profile.collection).sort()
    .reduce<Record<string, number>>((acc, key) => {
      if (profile.collection[key] > 0) acc[key] = profile.collection[key];
      return acc;
    }, {});
  return JSON.stringify({
    schemaVersion: profile.schemaVersion,
    ascensionSelected: profile.ascensionSelected,
    ascensionUnlocked: profile.ascensionUnlocked,
    collection,
    rulesPanelOpen: profile.rulesPanelOpen,
    runsCompleted: profile.runsCompleted,
    runsWon: profile.runsWon,
    startingDeck: [...profile.startingDeck].sort(),
  });
}

export const sameProfile = (left: BonpuriProfile, right: BonpuriProfile): boolean =>
  canonicalProfileJson(left) === canonicalProfileJson(right);

/** 충돌 화면에 보여줄 요약. 원시 JSON·UID·Firebase 경로는 절대 담지 않는다(§5.7). */
export type ProfileSummary = {
  source: 'local' | 'cloud';
  cards: number;
  kinds: number;
  runsCompleted: number;
  runsWon: number;
  ascensionUnlocked: number;
  deckSize: number;
  savedAt: number | null;
};

export function summarizeProfile(
  profile: BonpuriProfile,
  source: 'local' | 'cloud',
  savedAt: number | null,
): ProfileSummary {
  const counts = Object.values(profile.collection).filter((count) => count > 0);
  return {
    source,
    cards: counts.reduce((sum, count) => sum + count, 0),
    kinds: counts.length,
    runsCompleted: profile.runsCompleted,
    runsWon: profile.runsWon,
    ascensionUnlocked: profile.ascensionUnlocked,
    deckSize: profile.startingDeck.length,
    savedAt,
  };
}

export type ProfileBackup = {
  schemaVersion: 1;
  /** 버려지는 기록의 원본 JSON */
  payload: string;
  source: 'local' | 'cloud';
  savedAt: number;
  owner: ProfileOwner;
  profileSchema: number;
};

export function isProfileBackup(value: unknown): value is ProfileBackup {
  return isRecord(value) && value.schemaVersion === 1 &&
    typeof value.payload === 'string' && value.payload.length > 0 &&
    (value.source === 'local' || value.source === 'cloud') &&
    Number.isFinite(value.savedAt) && isOwner(value.owner) &&
    Number.isFinite(value.profileSchema);
}

/**
 * 덮어쓰기 전에 버려질 기록을 남긴다(§5.8). 백업 슬롯은 하나이며 직전 것을 대체한다 —
 * 사용자가 되돌리고 싶은 것은 언제나 "방금 잃은 기록"이다.
 * 백업 저장에 실패하면 실패로 알린다. 호출자는 덮어쓰기를 진행해서는 안 된다.
 */
export function backupProfile(storage: StorageAdapter, backup: ProfileBackup): WriteResult {
  if (!isProfileBackup(backup)) return { ok: false, error: '백업할 기록이 올바르지 않습니다.' };
  try {
    storage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(backup));
    return { ok: true };
  } catch {
    return { ok: false, error: '이전 기록을 백업하지 못했습니다.' };
  }
}

export function readBackup(storage: StorageAdapter): ProfileBackup | null {
  try {
    const raw = storage.getItem(PROFILE_BACKUP_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfileBackup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type RestoreResult =
  | { ok: true; profile: BonpuriProfile }
  | { ok: false; error: string };

/**
 * 백업을 되살린다. 복원 역시 지금 기록을 먼저 백업한 뒤에 수행한다(§5.8) —
 * 복원이 또 다른 소실이 되면 안 된다. 클라우드 데이터는 건드리지 않는다.
 */
export function restoreBackup(
  storage: StorageAdapter,
  current: { profile: BonpuriProfile; owner: ProfileOwner } | null,
  now: number,
): RestoreResult {
  const backup = readBackup(storage);
  if (backup === null) return { ok: false, error: '복원할 이전 기록이 없습니다.' };
  const parsed = parseCloudPayload(backup.payload);
  if (!parsed.ok) return { ok: false, error: '이전 기록을 복원하지 못했습니다.' };
  if (current !== null) {
    const swap = backupProfile(storage, {
      schemaVersion: 1,
      payload: JSON.stringify(current.profile),
      source: 'local',
      savedAt: now,
      owner: current.owner,
      profileSchema: current.profile.schemaVersion,
    });
    if (!swap.ok) return { ok: false, error: swap.error };
  }
  try {
    storage.setItem(BONPURI_PROFILE_KEY, JSON.stringify(parsed.profile));
  } catch {
    return { ok: false, error: '복원한 기록을 저장하지 못했습니다.' };
  }
  return { ok: true, profile: parsed.profile };
}
