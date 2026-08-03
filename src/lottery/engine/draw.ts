import type { PoolState, PrintedCell, TicketProduct } from "../types";

export type Rng = () => number;

export function createPool(product: TicketProduct): PoolState {
  return { remainingTickets: product.issued, remainingCount: product.prizes.map((tier) => tier.count) };
}

export function drawRank(pool: PoolState, rng: Rng = Math.random): number | null {
  if (pool.remainingTickets <= 0) throw new Error("발행 풀이 소진되었습니다.");
  let cursor = Math.floor(rng() * pool.remainingTickets);
  let selected: number | null = null;
  for (let index = 0; index < pool.remainingCount.length; index += 1) {
    if (cursor < pool.remainingCount[index]) {
      selected = index;
      break;
    }
    cursor -= pool.remainingCount[index];
  }
  pool.remainingTickets -= 1;
  if (selected !== null) pool.remainingCount[selected] -= 1;
  return selected === null ? null : selected + 1;
}

const shuffled = <T,>(values: T[], rng: Rng): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

function pickPrintedPrize(product: TicketProduct, exponent: number, rng: Rng): number {
  const weights = product.prizes.map((tier) => Math.pow(tier.count, exponent));
  let cursor = rng() * weights.reduce((sum, value) => sum + value, 0);
  const index = weights.findIndex((weight) => ((cursor -= weight) <= 0));
  return index < 0 ? weights.length - 1 : index;
}

export function readPrintedRank(product: TicketProduct, cells: PrintedCell[]): number | null {
  if (product.rule === "match3") {
    const counts = new Map<number, number>();
    cells.forEach((cell) => {
      if (cell.kind === "amount") counts.set(cell.prizeIndex, (counts.get(cell.prizeIndex) ?? 0) + 1);
    });
    const matches = [...counts.entries()].filter(([, count]) => count >= 3).map(([index]) => index);
    return matches.length ? Math.min(...matches) + 1 : null;
  }
  const lucky = cells.filter((cell) => cell.kind === "lucky").map((cell) => cell.number);
  const mine = cells.filter((cell): cell is Extract<PrintedCell, { kind: "mine" }> => cell.kind === "mine");
  const hits = mine.filter((cell) => lucky.includes(cell.number));
  if (product.needAll && !lucky.every((number) => mine.some((cell) => cell.number === number))) return null;
  if (!hits.length) return null;
  return Math.min(...hits.map((cell) => cell.prizeIndex)) + 1;
}

/**
 * 공개된 칸만으로 지급 등위가 확정됐는가.
 *
 * 등위는 언제나 **최상위 매치**로 정해지므로(readPrintedRank의 Math.min), 칸이 더 열리면
 * 결과는 좋아질 수만 있고 나빠지지 않는다. 따라서 "미공개 칸이 무엇이든 등위가 그대로일 때"가
 * 확정이고, 그 순간부터 더 긁는 건 정보 없는 노동이다.
 *
 * 판정은 실제 인쇄값을 훔쳐보지 않는다 — 미공개 칸에 **어떤 값이 와도** 같은 결론이 나오는지만 본다.
 */
export function isSettled(product: TicketProduct, cells: PrintedCell[], revealed: readonly boolean[]): boolean {
  const hiddenCount = cells.reduce((sum, _, index) => sum + (revealed[index] ? 0 : 1), 0);
  if (hiddenCount === 0) return true;
  const shown = cells.filter((_, index) => revealed[index]);

  if (product.rule === "match3") {
    const counts = new Map<number, number>();
    shown.forEach((cell) => {
      if (cell.kind === "amount") counts.set(cell.prizeIndex, (counts.get(cell.prizeIndex) ?? 0) + 1);
    });
    const locked = [...counts.entries()].filter(([, count]) => count >= 3).map(([index]) => index);
    // 아직 3매치가 없으면 '꽝'이 잠정 결론이다 — 모든 등위가 역전 후보가 된다.
    const best = locked.length ? Math.min(...locked) : product.prizes.length;
    for (let index = 0; index < best; index += 1) {
      if ((counts.get(index) ?? 0) + hiddenCount >= 3) return false;
    }
    return true;
  }

  // 행운숫자가 하나라도 덮여 있으면 매치 관계 자체가 통째로 뒤집힌다.
  const luckyHidden = cells.some((cell, index) => cell.kind === "lucky" && !revealed[index]);
  const luckyNumbers = shown.filter((cell) => cell.kind === "lucky").map((cell) => cell.number);
  const mineShown = shown.filter((cell): cell is Extract<PrintedCell, { kind: "mine" }> => cell.kind === "mine");
  // needAll(2매치게임)은 행운숫자를 전부 맞혀야 당첨 — 덮인 칸이 조건을 완성시킬 수 있다.
  const payable = !product.needAll
    || (!luckyHidden && luckyNumbers.every((number) => mineShown.some((cell) => cell.number === number)));
  // 남은 건 최상위 등위 조기 확정뿐이다. 1등이 걸렸으면 더 좋아질 여지가 없다.
  return payable && !luckyHidden && mineShown.some((cell) => luckyNumbers.includes(cell.number) && cell.prizeIndex === 0);
}

export function printTicket(
  product: TicketProduct,
  constraintRank: number | null,
  exponent: number,
  retryLimit: number,
  rng: Rng = Math.random,
): PrintedCell[] {
  if (product.rule === "match3") {
    const target = constraintRank === null ? null : constraintRank - 1;
    for (let attempt = 0; attempt < retryLimit; attempt += 1) {
      const values = Array.from({ length: product.mineCount }, () => pickPrintedPrize(product, exponent, rng));
      if (target !== null) shuffled([...values.keys()], rng).slice(0, 3).forEach((index) => { values[index] = target; });

      // 의도하지 않은 3매치는 **재시도가 아니라 수리**로 없앤다.
      // 인쇄 분포가 최하위 등위에 강하게 쏠려 있어(500원권 79%) 순수 재시도는 수렴하지 않는다 —
      // 6칸에서 어떤 등위도 3개 미만일 확률이 약 2%뿐이라 꽝 티켓이 거의 생성되지 않는다.
      for (let guard = 0; guard < 200; guard += 1) {
        const counts = new Map<number, number>();
        values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
        let bad = -1;
        counts.forEach((count, index) => { if (bad < 0 && count >= 3 && index !== target) bad = index; });
        if (bad < 0) break;
        const slot = values.lastIndexOf(bad);
        const candidates = product.prizes
          .map((_, index) => index)
          .filter((index) => index !== bad && index !== target && (counts.get(index) ?? 0) < 2);
        if (!candidates.length) break;
        values[slot] = candidates[Math.floor(rng() * candidates.length)];
      }

      const cells: PrintedCell[] = values.map((prizeIndex) => ({ kind: "amount", prizeIndex }));
      if (readPrintedRank(product, cells) === constraintRank) return cells;
    }
    throw new Error("인쇄 결과가 목표 등위와 일치하지 않습니다.");
  }

  const numbers = shuffled(Array.from({ length: 45 }, (_, index) => index + 1), rng);
  const lucky = numbers.slice(0, product.luckyCount);
  const mine = numbers.slice(product.luckyCount, product.luckyCount + product.mineCount);
  const target = constraintRank === null ? null : constraintRank - 1;
  if (target !== null) {
    const slots = shuffled(Array.from({ length: product.mineCount }, (_, index) => index), rng);
    const hitCount = product.needAll ? product.luckyCount : 1;
    for (let index = 0; index < hitCount; index += 1) mine[slots[index]] = lucky[index];
  }
  const amounts = mine.map(() => pickPrintedPrize(product, exponent, rng));
  if (target !== null) {
    mine.forEach((number, index) => {
      if (lucky.includes(number)) amounts[index] = target;
    });
  }
  const cells: PrintedCell[] = [
    ...lucky.map((number): PrintedCell => ({ kind: "lucky", number })),
    ...mine.map((number, index): PrintedCell => ({ kind: "mine", number, prizeIndex: amounts[index] })),
  ];
  if (readPrintedRank(product, cells) !== constraintRank) throw new Error("인쇄 결과가 목표 등위와 일치하지 않습니다.");
  return cells;
}
