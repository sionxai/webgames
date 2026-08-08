import type { Rng } from '../core/rng';
import { rewardCards } from '../content/cards';
import { MAX_ASCENSION } from '../content/ascension';

export const BONPURI_PROFILE_KEY = 'bonpuri_profile_v1';
export const BASIC_CARD_IDS = ['sinkal', 'neokgarim', 'saseol'] as const;
export const DEFAULT_STARTING_DECK = [
  ...Array<string>(25).fill('sinkal'),
  ...Array<string>(20).fill('neokgarim'),
  ...Array<string>(5).fill('saseol'),
] as const;

export type BonpuriProfile = {
  schemaVersion: 3;
  collection: Record<string, number>;
  startingDeck: string[];
  runsCompleted: number;
  runsWon: number;
  rulesPanelOpen: boolean;
  /** 해금된 최고 승천 단계. 0이면 아직 승천이 열리지 않았다. */
  ascensionUnlocked: number;
  /** 다음 런에 적용할 단계. 0 이상 ascensionUnlocked 이하. */
  ascensionSelected: number;
};

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
/** migrated: 구 스키마(10장 덱)에서 자동 변환됐음을 뜻한다. 덱이 기본값으로 바뀌므로 사용자에게 알려야 한다. */
export type LoadProfileResult =
  | { ok: true; profile: BonpuriProfile | null; migrated?: boolean }
  | { ok: false; error: string };
export type SaveProfileResult = { ok: true } | { ok: false; error: string };
/** v1: 10장 덱 시절. v2: 50장 덱, 승천 필드 없음. 둘 다 최신 스키마로 변환해 받아들인다. */
type ProfileV1 = { schemaVersion: 1; collection: Record<string, number>; startingDeck: string[]; runsCompleted: number; runsWon: number; rulesPanelOpen: boolean };
type ProfileV2 = Omit<ProfileV1, 'schemaVersion'> & { schemaVersion: 2 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 스키마와 무관하게 공통인 부분 — 덱 길이만 버전마다 다르다. */
function hasCommonProfileShape(value: unknown, deckLength: number): boolean {
  if (!isRecord(value) || !isRecord(value.collection) ||
    !Array.isArray(value.startingDeck) || value.startingDeck.length !== deckLength ||
    !value.startingDeck.every((id) => typeof id === 'string') ||
    !Number.isInteger(value.runsCompleted) || (value.runsCompleted as number) < 0 ||
    !Number.isInteger(value.runsWon) || (value.runsWon as number) < 0 ||
    typeof value.rulesPanelOpen !== 'boolean') return false;
  return Object.values(value.collection).every((count) => Number.isInteger(count) && (count as number) >= 0);
}

export function isBonpuriProfile(value: unknown): value is BonpuriProfile {
  if (!isRecord(value) || value.schemaVersion !== 3 || !hasCommonProfileShape(value, 50)) return false;
  const unlocked = value.ascensionUnlocked;
  const selected = value.ascensionSelected;
  if (!Number.isInteger(unlocked) || (unlocked as number) < 0 || (unlocked as number) > MAX_ASCENSION) return false;
  return Number.isInteger(selected) && (selected as number) >= 0 && (selected as number) <= (unlocked as number);
}

const isProfileV1 = (value: unknown): value is ProfileV1 =>
  isRecord(value) && value.schemaVersion === 1 && hasCommonProfileShape(value, 10);
const isProfileV2 = (value: unknown): value is ProfileV2 =>
  isRecord(value) && value.schemaVersion === 2 && hasCommonProfileShape(value, 50);

/** 이미 다섯 굿을 마친 기록이 있으면 승천 1을 열어 준다. 없으면 승천 0만 가능하다. */
const unlockedFromHistory = (runsWon: number): number => (runsWon >= 1 ? 1 : 0);

export const createDefaultProfile = (): BonpuriProfile => ({
  schemaVersion: 3,
  collection: {},
  startingDeck: [...DEFAULT_STARTING_DECK],
  runsCompleted: 0,
  runsWon: 0,
  rulesPanelOpen: true,
  ascensionUnlocked: 0,
  ascensionSelected: 0,
});

/**
 * 어떤 스키마의 프로필이든 최신(v3)으로 올린다. **저장 부작용이 없는 순수 함수**다 —
 * 클라우드에서 받은 payload 도 같은 경로로 검증·변환해야 하므로 저장과 분리해 둔다.
 * deckReset: v1 은 10장 덱이라 기본 50장으로 되돌아간다. 사용자에게 알려야 하는 유일한 손실이다.
 */
export function migrateProfile(value: unknown): { profile: BonpuriProfile; from: 1 | 2 | 3; deckReset: boolean } | null {
  if (isBonpuriProfile(value)) return { profile: value, from: 3, deckReset: false };
  if (isProfileV1(value) || isProfileV2(value)) {
    const deckReset = isProfileV1(value);
    return {
      profile: {
        ...value,
        schemaVersion: 3,
        collection: { ...value.collection },
        startingDeck: deckReset ? [...DEFAULT_STARTING_DECK] : [...value.startingDeck],
        ascensionUnlocked: unlockedFromHistory(value.runsWon),
        ascensionSelected: 0,
      },
      from: deckReset ? 1 : 2,
      deckReset,
    };
  }
  return null;
}

export function loadProfile(storage: StorageAdapter): LoadProfileResult {
  try {
    const raw = storage.getItem(BONPURI_PROFILE_KEY);
    if (raw === null) return { ok: true, profile: null };
    const migrated = migrateProfile(JSON.parse(raw));
    if (migrated === null) return { ok: false, error: '저장된 본풀이 기록의 형식이 올바르지 않습니다.' };
    if (migrated.from === 3) return { ok: true, profile: migrated.profile };
    const saved = saveProfile(storage, migrated.profile);
    return saved.ok
      ? { ok: true, profile: migrated.profile, migrated: migrated.deckReset ? true : undefined }
      : saved;
  } catch {
    return { ok: false, error: '저장된 본풀이 기록을 읽지 못했습니다.' };
  }
}

export function saveProfile(storage: StorageAdapter, profile: BonpuriProfile): SaveProfileResult {
  if (!isBonpuriProfile(profile)) return { ok: false, error: '저장할 본풀이 기록의 형식이 올바르지 않습니다.' };
  try {
    storage.setItem(BONPURI_PROFILE_KEY, JSON.stringify(profile));
    return { ok: true };
  } catch {
    return { ok: false, error: '본풀이 기록을 저장하지 못했습니다.' };
  }
}

export type DeckValidation = { ok: true } | { ok: false; error: string };

export function validateStartingDeck(deck: readonly string[], collection: Readonly<Record<string, number>>): DeckValidation {
  if (deck.length !== 50) return { ok: false, error: '시작 덱은 정확히 50장이어야 합니다.' };
  const rewardIds = new Set(rewardCards.map((card) => card.id));
  const counts: Record<string, number> = {};
  for (const id of deck) {
    if (!(BASIC_CARD_IDS as readonly string[]).includes(id) && !rewardIds.has(id)) {
      return { ok: false, error: '알 수 없는 카드는 덱에 넣을 수 없습니다.' };
    }
    counts[id] = (counts[id] ?? 0) + 1;
    if (!(BASIC_CARD_IDS as readonly string[]).includes(id) && counts[id] > 4) {
      return { ok: false, error: '보상 카드는 같은 카드를 최대 4장까지 넣을 수 있습니다.' };
    }
    if (!(BASIC_CARD_IDS as readonly string[]).includes(id) && counts[id] > (collection[id] ?? 0)) {
      return { ok: false, error: '보유 수량을 초과해 넣을 수 없습니다.' };
    }
  }
  return { ok: true };
}

export function drawBonpuriPack(rng: Rng): string[] {
  return Array.from({ length: 3 }, () => rewardCards[Math.floor(rng() * rewardCards.length)].id);
}

/**
 * 해금은 '지금 해금된 최고 단계를 이겼을 때'만 한 칸 오른다.
 * 낮은 단계를 다시 이겨도 건너뛰지 않고, 패배하면 오르지 않으며, MAX_ASCENSION 에서 멈춘다.
 */
export function nextAscensionUnlocked(profile: BonpuriProfile, ranAscension: number, won: boolean): number {
  if (!won || ranAscension !== profile.ascensionUnlocked) return profile.ascensionUnlocked;
  return Math.min(profile.ascensionUnlocked + 1, MAX_ASCENSION);
}

export function calculateCompletedProfile(
  profile: BonpuriProfile,
  acquiredCardIds: readonly string[],
  won: boolean,
  rng: Rng,
  ranAscension = 0,
): { profile: BonpuriProfile; pack: string[]; ascensionUnlockedNow: boolean } {
  const pack = won ? drawBonpuriPack(rng) : [];
  const collection = { ...profile.collection };
  for (const id of [...acquiredCardIds, ...pack]) collection[id] = (collection[id] ?? 0) + 1;
  const ascensionUnlocked = nextAscensionUnlocked(profile, ranAscension, won);
  return {
    profile: {
      ...profile,
      collection,
      runsCompleted: profile.runsCompleted + 1,
      runsWon: profile.runsWon + (won ? 1 : 0),
      ascensionUnlocked,
      // 선택 단계는 사용자가 고른 값을 유지하되 해금 범위를 벗어나지 않게 묶는다.
      ascensionSelected: Math.min(profile.ascensionSelected, ascensionUnlocked),
    },
    pack,
    ascensionUnlockedNow: ascensionUnlocked > profile.ascensionUnlocked,
  };
}

export function completeRunFailClosed(
  storage: StorageAdapter,
  profile: BonpuriProfile,
  acquiredCardIds: readonly string[],
  won: boolean,
  rng: Rng,
  ranAscension = 0,
): { ok: true; profile: BonpuriProfile; pack: string[]; ascensionUnlockedNow: boolean } | { ok: false; error: string } {
  const candidate = calculateCompletedProfile(profile, acquiredCardIds, won, rng, ranAscension);
  const saved = saveProfile(storage, candidate.profile);
  // 저장에 실패하면 해금도 없던 일이다 — 화면에 거짓 해금을 띄우지 않는다.
  return saved.ok ? { ok: true, ...candidate } : saved;
}
