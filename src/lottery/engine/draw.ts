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
