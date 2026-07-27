export const TAUNTS: string[] = [
  "이거 못 깨면 인정 못 함",
  "우리 반 1등 기록임",
  "딸깍 좀 친다며?",
  "손가락 풀고 와",
  "3초면 파악 가능",
  "고스트한테 지면 어떡해",
  "신기록 세우고 자랑하기 없기",
  "형이 기다린다",
];

export function tauntByIndex(t: string | null | undefined): string | null {
  if (t == null) return null;
  const normalized = t.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const index = Number(normalized);
  if (!Number.isSafeInteger(index) || index < 0 || index >= TAUNTS.length) {
    return null;
  }
  return TAUNTS[index];
}
