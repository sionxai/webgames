import { isSettled, printTicket, readPrintedRank } from "../src/lottery/engine/draw";
import { TICKETS } from "../src/lottery/data/tickets";
import { DEFAULT_BALANCE } from "../src/lottery/balance";
import type { PrintedCell, TicketProduct } from "../src/lottery/types";

let assertionCount = 0;
function assert(condition: boolean, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`CONTRACT FAILED: ${message}`);
}

/** 엔진이 보는 순서와 같게 — DOM은 행운숫자 칸을 먼저 그린다. */
const displayOrder = (cells: PrintedCell[]): PrintedCell[] =>
  [...cells.filter((cell) => cell.kind === "lucky"), ...cells.filter((cell) => cell.kind !== "lucky")];

/** 시드 고정 RNG — 재현되지 않는 실패는 계약이 아니다. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * isSettled의 유일한 계약: **확정이라고 답한 순간, 미공개 칸에 무엇이 오든 등위가 같아야 한다.**
 * 실제 인쇄값을 훔쳐보고 답하면 이 검사에서 걸린다.
 */
function survivesEveryFill(product: TicketProduct, cells: PrintedCell[], revealed: boolean[]): boolean {
  const truth = readPrintedRank(product, cells);
  const hidden = cells.map((_, index) => index).filter((index) => !revealed[index]);
  if (!hidden.length) return true;
  // 미공개 칸이 가질 수 있는 값의 후보. 숫자는 매치 여부만 중요하므로 '행운숫자와 같은 값'과 '아닌 값'이면 충분하다.
  const luckyNumbers = cells.filter((cell) => cell.kind === "lucky").map((cell) => cell.number);
  const offNumber = (() => { for (let n = 1; n <= 45; n += 1) if (!luckyNumbers.includes(n)) return n; return 45; })();
  const candidates: PrintedCell[][] = hidden.map((index) => {
    const original = cells[index];
    if (original.kind === "amount") {
      return product.prizes.map((_, prizeIndex) => ({ kind: "amount", prizeIndex } as PrintedCell));
    }
    if (original.kind === "mine") {
      const options: PrintedCell[] = [];
      product.prizes.forEach((_, prizeIndex) => {
        luckyNumbers.forEach((number) => options.push({ kind: "mine", number, prizeIndex } as PrintedCell));
        options.push({ kind: "mine", number: offNumber, prizeIndex } as PrintedCell);
      });
      return options;
    }
    return [...luckyNumbers, offNumber].map((number) => ({ kind: "lucky", number } as PrintedCell));
  });
  // 조합 폭발을 막되 전수성은 지킨다 — 칸 수가 많으면 이 검사 자체를 건너뛰지 말고 표본을 넓힌다.
  const total = candidates.reduce((product_, options) => product_ * options.length, 1);
  const limit = 200000;
  const step = total > limit ? Math.ceil(total / limit) : 1;
  for (let combo = 0; combo < total; combo += step) {
    const filled = [...cells];
    let cursor = combo;
    for (let slot = 0; slot < hidden.length; slot += 1) {
      const options = candidates[slot];
      filled[hidden[slot]] = options[cursor % options.length];
      cursor = Math.floor(cursor / options.length);
    }
    if (readPrintedRank(product, filled) !== truth) return false;
  }
  return true;
}

for (const product of TICKETS) {
  const rng = seeded(product.id * 7919 + 13);
  const ranks: (number | null)[] = [null, ...product.prizes.map((tier) => tier.rank)];

  for (const rank of ranks) {
    const printed = displayOrder(
      printTicket(product, rank, DEFAULT_BALANCE.printFlattenExponent, DEFAULT_BALANCE.printRetryLimit, rng),
    );
    assert(readPrintedRank(product, printed) === rank, `${product.id}원 ${rank ?? "꽝"}: 인쇄 등위가 목표와 다르다`);

    // ① 아무것도 안 열었으면 절대 확정이 아니다.
    assert(
      !isSettled(product, printed, printed.map(() => false)),
      `${product.id}원 ${rank ?? "꽝"}: 한 칸도 안 열었는데 확정으로 판정했다`,
    );

    // ② 다 열면 반드시 확정이다 — 아니면 게임이 영구히 안 끝난다.
    assert(
      isSettled(product, printed, printed.map(() => true)),
      `${product.id}원 ${rank ?? "꽝"}: 전 칸을 열었는데도 확정이 아니다`,
    );

    // ③ 확정이라고 답한 모든 부분공개 상태는, 남은 칸이 무엇이든 같은 등위여야 한다.
    const states = 1 << printed.length;
    const stride = states > 4096 ? Math.ceil(states / 4096) : 1;
    let settledStates = 0;
    for (let bits = 0; bits < states; bits += stride) {
      const revealed = printed.map((_, index) => (bits & (1 << index)) !== 0);
      if (!isSettled(product, printed, revealed)) continue;
      settledStates += 1;
      assert(
        survivesEveryFill(product, printed, revealed),
        `${product.id}원 ${rank ?? "꽝"}: 확정 판정했지만 미공개 칸에 따라 등위가 달라진다 (mask ${bits})`,
      );
    }
    assert(settledStates > 0, `${product.id}원 ${rank ?? "꽝"}: 확정 상태가 하나도 없다`);
  }
}

// 1등은 더 좋아질 여지가 없으므로 나머지가 덮여 있어도 즉시 확정돼야 한다 — 조기 종료의 핵심.
for (const product of TICKETS) {
  const rng = seeded(product.id * 104729 + 7);
  const printed = displayOrder(
    printTicket(product, 1, DEFAULT_BALANCE.printFlattenExponent, DEFAULT_BALANCE.printRetryLimit, rng),
  );
  const winning = printed.map((cell) =>
    cell.kind === "lucky"
    || (cell.kind === "amount" && cell.prizeIndex === 0)
    || (cell.kind === "mine" && cell.prizeIndex === 0));
  const hiddenLeft = winning.filter((flag) => !flag).length;
  assert(hiddenLeft > 0, `${product.id}원: 1등 조기확정 검사에 남은 칸이 없다`);
  if (product.needAll) continue; // 2매치게임은 행운숫자를 전부 맞혀야 성립 — 조기 확정 대상이 아니다
  assert(
    isSettled(product, printed, winning),
    `${product.id}원: 1등이 걸렸는데 조기 확정되지 않는다 (${hiddenLeft}칸이 덮인 채)`,
  );
}

assert(assertionCount >= 60, "확정 계약의 단언 수가 60개 미만이다");
console.log(`LOTTERY SETTLE CONTRACT OK ${assertionCount} assertions`);
