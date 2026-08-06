import type { Rng } from '../core/rng';
import { rewardCards } from '../content/cards';

export const BONPURI_PROFILE_KEY = 'bonpuri_profile_v1';
export const BASIC_CARD_IDS = ['sinkal', 'neokgarim', 'saseol'] as const;
export const DEFAULT_STARTING_DECK = [
  ...Array<string>(25).fill('sinkal'),
  ...Array<string>(20).fill('neokgarim'),
  ...Array<string>(5).fill('saseol'),
] as const;

export type BonpuriProfile = {
  schemaVersion: 2;
  collection: Record<string, number>;
  startingDeck: string[];
  runsCompleted: number;
  runsWon: number;
  rulesPanelOpen: boolean;
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
type LegacyBonpuriProfile = Omit<BonpuriProfile, 'schemaVersion'> & { schemaVersion: 1 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isBonpuriProfile(value: unknown): value is BonpuriProfile {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.collection) ||
    !Array.isArray(value.startingDeck) || value.startingDeck.length !== 50 ||
    !value.startingDeck.every((id) => typeof id === 'string') ||
    !Number.isInteger(value.runsCompleted) || (value.runsCompleted as number) < 0 ||
    !Number.isInteger(value.runsWon) || (value.runsWon as number) < 0 ||
    typeof value.rulesPanelOpen !== 'boolean') return false;
  return Object.values(value.collection).every((count) => Number.isInteger(count) && (count as number) >= 0);
}

function isLegacyBonpuriProfile(value: unknown): value is LegacyBonpuriProfile {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.collection) ||
    !Array.isArray(value.startingDeck) || value.startingDeck.length !== 10 ||
    !value.startingDeck.every((id) => typeof id === 'string') ||
    !Number.isInteger(value.runsCompleted) || (value.runsCompleted as number) < 0 ||
    !Number.isInteger(value.runsWon) || (value.runsWon as number) < 0 ||
    typeof value.rulesPanelOpen !== 'boolean') return false;
  return Object.values(value.collection).every((count) => Number.isInteger(count) && (count as number) >= 0);
}

export const createDefaultProfile = (): BonpuriProfile => ({
  schemaVersion: 2,
  collection: {},
  startingDeck: [...DEFAULT_STARTING_DECK],
  runsCompleted: 0,
  runsWon: 0,
  rulesPanelOpen: true,
});

export function loadProfile(storage: StorageAdapter): LoadProfileResult {
  try {
    const raw = storage.getItem(BONPURI_PROFILE_KEY);
    if (raw === null) return { ok: true, profile: null };
    const profile: unknown = JSON.parse(raw);
    if (isBonpuriProfile(profile)) return { ok: true, profile };
    if (isLegacyBonpuriProfile(profile)) {
      const migrated: BonpuriProfile = {
        ...profile,
        schemaVersion: 2,
        collection: { ...profile.collection },
        startingDeck: [...DEFAULT_STARTING_DECK],
      };
      const saved = saveProfile(storage, migrated);
      return saved.ok ? { ok: true, profile: migrated, migrated: true } : saved;
    }
    return { ok: false, error: '저장된 본풀이 기록의 형식이 올바르지 않습니다.' };
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

export function calculateCompletedProfile(
  profile: BonpuriProfile,
  acquiredCardIds: readonly string[],
  won: boolean,
  rng: Rng,
): { profile: BonpuriProfile; pack: string[] } {
  const pack = won ? drawBonpuriPack(rng) : [];
  const collection = { ...profile.collection };
  for (const id of [...acquiredCardIds, ...pack]) collection[id] = (collection[id] ?? 0) + 1;
  return {
    profile: {
      ...profile,
      collection,
      runsCompleted: profile.runsCompleted + 1,
      runsWon: profile.runsWon + (won ? 1 : 0),
    },
    pack,
  };
}

export function completeRunFailClosed(
  storage: StorageAdapter,
  profile: BonpuriProfile,
  acquiredCardIds: readonly string[],
  won: boolean,
  rng: Rng,
): { ok: true; profile: BonpuriProfile; pack: string[] } | { ok: false; error: string } {
  const candidate = calculateCompletedProfile(profile, acquiredCardIds, won, rng);
  const saved = saveProfile(storage, candidate.profile);
  return saved.ok ? { ok: true, ...candidate } : saved;
}
