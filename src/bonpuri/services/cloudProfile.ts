import { MAX_ASCENSION } from '../content/ascension';
import { rewardCards } from '../content/cards';
import {
  BASIC_CARD_IDS,
  BONPURI_PROFILE_KEY,
  DEFAULT_STARTING_DECK,
  migrateProfile,
  validateStartingDeck,
  type BonpuriProfile,
  type StorageAdapter,
} from './profile';

/**
 * 클라우드 저장의 순수 데이터 경계.
 * 네트워크도 인증도 없다 — 무엇을 신뢰할지, 누구 기록인지, 여러 키를 걸친 쓰기가
 * 중간에 실패했을 때 어떻게 되돌아올지만 정한다.
 * 시각·기기값은 주입받아 결정적으로 검증 가능하게 한다.
 */

export const PROFILE_META_KEY = 'bonpuri_profile_meta_v1';
export const PROFILE_BACKUP_KEY = 'bonpuri_profile_backup_v1';
export const PROFILE_JOURNAL_KEY = 'bonpuri_profile_journal_v1';
/** cloudSave.ts 및 RTDB 규칙과 같은 상한. 이 길이 '이상'은 거부한다. */
export const MAX_CLOUD_PAYLOAD_LENGTH = 200_000;
export const CLOUD_ENVELOPE_SCHEMA = 3;

/** journal 정리에 삭제가 필요하다. 기존 프로필 저장 계약(StorageAdapter)은 넓히지 않는다. */
export type CloudStorageAdapter = StorageAdapter & { removeItem(key: string): void };

/**
 * 이 기기의 로컬 기록이 누구 것인지.
 * guest 도 Firebase 익명 UID 를 갖는다 — 익명으로 모은 기록이 Google 연결 뒤에도
 * 같은 사용자의 것인지 가리려면 그 UID 가 반드시 필요하다.
 * legacy-local 은 UID 자체가 없던 시절의 기록이라 어떤 계정에도 귀속하지 않는다.
 */
export type ProfileOwner =
  | { kind: 'legacy-local' }
  | { kind: 'guest'; uid: string }
  | { kind: 'google'; uid: string };

export const ownerUid = (owner: ProfileOwner): string | null =>
  owner.kind === 'legacy-local' ? null : owner.uid;

export type ProfileMeta = {
  schemaVersion: 1;
  owner: ProfileOwner;
  /** 로컬 최종 저장 시각 (epoch ms) */
  savedAt: number;
  /** 기기 식별용 비민감 임의 값 */
  device: string;
};

/** 인증이 확정되기 전에는 소유권을 판정하지 않는다. */
export type AuthSnapshot =
  | { kind: 'pending' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; uid: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isOwner(value: unknown): value is ProfileOwner {
  if (!isRecord(value)) return false;
  if (value.kind === 'legacy-local') return true;
  return (value.kind === 'guest' || value.kind === 'google') &&
    typeof value.uid === 'string' && value.uid.length > 0;
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
 * 로컬 기록과 현재 계정의 관계.
 * 익명 UID 를 Google 에 연결해 UID 가 유지되면 same-owner 다 — 소유자 kind 가
 * guest 에서 google 로 바뀌어도 UID 가 같으면 같은 사용자다.
 */
export type OwnerRelation =
  | { kind: 'unresolved' }
  | { kind: 'no-local-record' }
  | { kind: 'legacy-local' }
  | { kind: 'same-owner' }
  | { kind: 'account-changed' };

export function classifyOwner(
  meta: ProfileMeta | null,
  hasLocalProfile: boolean,
  auth: AuthSnapshot,
): OwnerRelation {
  // 인증이 확정되기 전에 소유권을 정하면 A 기록을 B 로 귀속시킬 수 있다.
  if (auth.kind === 'pending') return { kind: 'unresolved' };
  if (!hasLocalProfile) return { kind: 'no-local-record' };
  if (meta === null || meta.owner.kind === 'legacy-local') return { kind: 'legacy-local' };
  const localUid = ownerUid(meta.owner);
  if (auth.kind === 'signed-in' && localUid === auth.uid) return { kind: 'same-owner' };
  return { kind: 'account-changed' };
}

const defaultDeck = [...DEFAULT_STARTING_DECK];
const isDefaultDeck = (deck: readonly string[]): boolean =>
  deck.length === defaultDeck.length && deck.every((id, index) => id === defaultDeck[index]);

/** 덱뿐 아니라 collection 도 실재하는 카드만 담아야 한다. */
const knownCardIds: ReadonlySet<string> =
  new Set<string>([...BASIC_CARD_IDS, ...rewardCards.map((card) => card.id)]);

/**
 * 자동 업로드 여부를 가르는 기준이 아니다 — 자동 업로드는 어떤 경우에도 하지 않는다(§5.3).
 * "사용자에게 선택을 물어볼 가치가 있는 기록인가"를 가른다.
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
 * 클라우드에서 받은 payload 를 신뢰하지 않는다.
 * 하나라도 실패하면 호출자는 로컬 기록과 화면 상태를 그대로 두어야 한다.
 */
export function parseCloudPayload(raw: unknown): CloudPayloadResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: '클라우드 기록을 읽지 못했습니다.' };
  }
  // 규칙과 같은 경계: 상한 '이상'은 거부한다.
  if (raw.length >= MAX_CLOUD_PAYLOAD_LENGTH) {
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
  const unknownCard = Object.entries(profile.collection)
    .find(([id, count]) => count > 0 && !knownCardIds.has(id));
  if (unknownCard) return { ok: false, error: '클라우드 기록에 알 수 없는 카드가 있습니다.' };
  if (profile.ascensionUnlocked > MAX_ASCENSION || profile.ascensionSelected > profile.ascensionUnlocked) {
    return { ok: false, error: '클라우드 기록의 승천 정보가 올바르지 않습니다.' };
  }
  const deck = validateStartingDeck(profile.startingDeck, profile.collection);
  if (!deck.ok) return { ok: false, error: `클라우드 기록의 덱이 올바르지 않습니다. ${deck.error}` };
  return { ok: true, ...migrated };
}

export function isSupportedEnvelope(schema: unknown): boolean {
  return schema === CLOUD_ENVELOPE_SCHEMA;
}

/**
 * 같은 기록인지 비교한다.
 * rulesPanelOpen 은 규칙 패널을 폈는지 접었는지일 뿐인 **기기 로컬 설정**이라 제외한다 —
 * 이것 때문에 충돌 화면을 띄우면 사용자는 이유를 알 수 없다.
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
    runsCompleted: profile.runsCompleted,
    runsWon: profile.runsWon,
    startingDeck: [...profile.startingDeck].sort(),
  });
}

export const sameProfile = (left: BonpuriProfile, right: BonpuriProfile): boolean =>
  canonicalProfileJson(left) === canonicalProfileJson(right);

/**
 * 클라우드 프로필을 이 기기에 적용한다.
 * rulesPanelOpen 은 기기 설정이므로 클라우드 값으로 덮지 않고 현재 기기 값을 지킨다.
 * (호환 목적으로 payload 에 필드가 남아 있어도 사용하지 않는다.)
 */
export function applyCloudProfile(cloud: BonpuriProfile, local: BonpuriProfile | null): BonpuriProfile {
  return { ...cloud, rulesPanelOpen: local === null ? cloud.rulesPanelOpen : local.rulesPanelOpen };
}

/** 충돌 화면용 요약. 원시 JSON·UID·Firebase 경로는 담지 않는다. */
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

/** 백업은 기록만이 아니라 그 기록의 소유자·저장 시각·기기까지 함께 보관한다. */
export type ProfileBackup = {
  schemaVersion: 2;
  payload: string;
  source: 'local' | 'cloud';
  /** 이 백업이 만들어진 시각 */
  backedUpAt: number;
  /** 보관된 기록 자체의 메타 — 복원 시 이것도 함께 되살린다 */
  meta: ProfileMeta;
  profileSchema: number;
};

export function isProfileBackup(value: unknown): value is ProfileBackup {
  return isRecord(value) && value.schemaVersion === 2 &&
    typeof value.payload === 'string' && value.payload.length > 0 &&
    (value.source === 'local' || value.source === 'cloud') &&
    Number.isFinite(value.backedUpAt) && isProfileMeta(value.meta) &&
    Number.isFinite(value.profileSchema);
}

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

/** 프로필·메타를 한 덩어리로 다룬다. 둘 중 하나만 바뀐 상태는 존재해서는 안 된다. */
export type ProfileRecord = { payload: string; meta: ProfileMeta };

/**
 * 여러 키를 걸친 쓰기의 write-ahead journal.
 * target 을 적용하기 '전에' target 과 previous 를 함께 남긴다. 중간에 어디서 죽어도
 * 다음 로드에서 전진 복구(roll forward)로 일관된 상태에 도달할 수 있다.
 */
export type ProfileJournal = {
  schemaVersion: 1;
  operation: 'restore';
  startedAt: number;
  /** 적용하려는 기록 */
  target: ProfileRecord;
  /** 적용으로 밀려나는 현재 기록. 성공 후 새 backup 이 된다 */
  previous: ProfileRecord | null;
  previousSource: 'local' | 'cloud';
  previousProfileSchema: number;
};

export function isProfileJournal(value: unknown): value is ProfileJournal {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.operation !== 'restore') return false;
  if (!Number.isFinite(value.startedAt)) return false;
  const isRecordShape = (v: unknown): boolean =>
    isRecord(v) && typeof v.payload === 'string' && v.payload.length > 0 && isProfileMeta(v.meta);
  if (!isRecordShape(value.target)) return false;
  if (value.previous !== null && !isRecordShape(value.previous)) return false;
  return (value.previousSource === 'local' || value.previousSource === 'cloud') &&
    Number.isFinite(value.previousProfileSchema);
}

export function readJournal(storage: StorageAdapter): ProfileJournal | null {
  try {
    const raw = storage.getItem(PROFILE_JOURNAL_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfileJournal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** journal 이 남긴 target 을 끝까지 밀어붙여 일관된 상태로 만든다. */
function commitJournal(storage: CloudStorageAdapter, journal: ProfileJournal): WriteResult {
  try {
    storage.setItem(BONPURI_PROFILE_KEY, journal.target.payload);
  } catch {
    return { ok: false, error: '복원한 기록을 저장하지 못했습니다.' };
  }
  const meta = writeMeta(storage, journal.target.meta);
  if (!meta.ok) return meta;
  if (journal.previous !== null) {
    const saved = backupProfile(storage, {
      schemaVersion: 2,
      payload: journal.previous.payload,
      source: journal.previousSource,
      backedUpAt: journal.startedAt,
      meta: journal.previous.meta,
      profileSchema: journal.previousProfileSchema,
    });
    if (!saved.ok) return saved;
  }
  try {
    storage.removeItem(PROFILE_JOURNAL_KEY);
  } catch {
    // journal 이 남아도 상태는 이미 일관적이다. 다음 로드에서 다시 정리된다.
  }
  return { ok: true };
}

export type RecoverResult =
  | { kind: 'nothing' }
  | { kind: 'recovered'; profile: BonpuriProfile }
  | { kind: 'failed'; error: string };

/**
 * 로드 시점에 미완료 journal 을 감지해 복구한다.
 * target 은 journal 을 쓰기 전에 이미 검증된 기록이므로 전진 복구가 안전하다.
 * 손상된 journal 은 현재 기록을 건드리지 않고 지운다 — 무엇을 하려던 건지 알 수 없으면 아무것도 하지 않는다.
 */
export function recoverFromJournal(storage: CloudStorageAdapter): RecoverResult {
  const raw = storage.getItem(PROFILE_JOURNAL_KEY);
  if (raw === null) return { kind: 'nothing' };
  const journal = readJournal(storage);
  if (journal === null) {
    try { storage.removeItem(PROFILE_JOURNAL_KEY); } catch { /* 지우지 못해도 기록은 무변경 */ }
    return { kind: 'nothing' };
  }
  const parsed = parseCloudPayload(journal.target.payload);
  if (!parsed.ok) {
    try { storage.removeItem(PROFILE_JOURNAL_KEY); } catch { /* 무변경 */ }
    return { kind: 'failed', error: parsed.error };
  }
  const committed = commitJournal(storage, journal);
  if (!committed.ok) return { kind: 'failed', error: committed.error };
  return { kind: 'recovered', profile: parsed.profile };
}

export type RestoreResult =
  | { ok: true; profile: BonpuriProfile; meta: ProfileMeta }
  | { ok: false; error: string };

/**
 * 백업을 되살린다. 순서가 계약이다 —
 * ① 대상 검증 → ② journal 에 대상과 현재 기록을 함께 기록 → ③ 프로필 적용 →
 * ④ 메타 적용 → ⑤ 밀려난 기록을 새 backup 으로 확정 → ⑥ journal 정리.
 * 원본 backup 을 먼저 덮지 않는다. 어디서 실패해도 대상과 현재 기록 둘 다 journal 에 남아 있다.
 * 클라우드 데이터는 건드리지 않는다.
 */
export function restoreBackup(
  storage: CloudStorageAdapter,
  current: { profile: BonpuriProfile; meta: ProfileMeta } | null,
  now: number,
): RestoreResult {
  const backup = readBackup(storage);
  if (backup === null) return { ok: false, error: '복원할 이전 기록이 없습니다.' };
  const parsed = parseCloudPayload(backup.payload);
  if (!parsed.ok) return { ok: false, error: '이전 기록을 복원하지 못했습니다.' };

  const journal: ProfileJournal = {
    schemaVersion: 1,
    operation: 'restore',
    startedAt: now,
    // 백업에 담긴 소유자·기기를 그대로 되살린다. A 기록을 B 상태에서 복원해도 소유자는 A 다.
    target: { payload: backup.payload, meta: backup.meta },
    previous: current === null ? null : { payload: JSON.stringify(current.profile), meta: current.meta },
    previousSource: 'local',
    previousProfileSchema: current === null ? parsed.profile.schemaVersion : current.profile.schemaVersion,
  };
  try {
    storage.setItem(PROFILE_JOURNAL_KEY, JSON.stringify(journal));
  } catch {
    // journal 을 남기지 못하면 시작하지 않는다. 아무것도 바뀌지 않았다.
    return { ok: false, error: '복원을 시작하지 못했습니다. 이전 기록은 그대로입니다.' };
  }
  const committed = commitJournal(storage, journal);
  if (!committed.ok) return { ok: false, error: committed.error };
  return { ok: true, profile: parsed.profile, meta: backup.meta };
}
