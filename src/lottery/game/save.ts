import { SAVE_KEY, SCHEMA_VERSION, TUNING_KEY } from "../balance";
import { TICKETS, ticketById } from "../data/tickets";
import { readPrintedRank } from "../engine/draw";
import type { Balance, LotterySave, PrintedCell } from "../types";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const safeInteger = (value: unknown, minimum = 0): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
const finite = (value: unknown, minimum = 0, maximum = Number.MAX_VALUE): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

function validTicket(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value) || typeof value.ticketId !== "string" || typeof value.productVersion !== "string") return false;
  const product = ticketById(Number(value.productId));
  if (!product || !Array.isArray(value.printedCells) || value.printedCells.length !== product.luckyCount + product.mineCount) return false;
  if (!(value.rank === null || (safeInteger(value.rank, 1) && value.rank <= product.prizes.length))) return false;
  if (!finite(value.revealed, 0, 1) || !finite(value.removedArea) || !finite(value.requiredArea) || value.requiredArea <= 0) return false;
  if (typeof value.complete !== "boolean" || typeof value.claimed !== "boolean" || !safeInteger(value.purchasedAt)) return false;
  const validCells = value.printedCells.every((cell) => {
    if (!record(cell) || typeof cell.kind !== "string") return false;
    if (cell.kind === "lucky") return safeInteger(cell.number, 1) && cell.number <= 45;
    if (cell.kind === "mine") {
      return safeInteger(cell.number, 1) && cell.number <= 45
        && safeInteger(cell.prizeIndex) && cell.prizeIndex < product.prizes.length;
    }
    return cell.kind === "amount" && safeInteger(cell.prizeIndex) && cell.prizeIndex < product.prizes.length;
  });
  if (!validCells) return false;
  const luckyCells = value.printedCells.filter((cell) => record(cell) && cell.kind === "lucky").length;
  const mineCells = value.printedCells.filter((cell) => record(cell) && cell.kind === "mine").length;
  const amountCells = value.printedCells.filter((cell) => record(cell) && cell.kind === "amount").length;
  if (product.rule === "match3" ? amountCells !== product.mineCount : luckyCells !== product.luckyCount || mineCells !== product.mineCount) return false;
  return readPrintedRank(product, value.printedCells as PrintedCell[]) === value.rank;
}

function validSave(value: unknown): value is LotterySave {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.sourceDate !== "string" || typeof value.virtualTableVersion !== "string") return false;
  if (!safeInteger(value.cash) || !safeInteger(value.debt) || !safeInteger(value.masteryXp) || !safeInteger(value.level, 1)) return false;
  if (!safeInteger(value.skillPoints) || !safeInteger(value.startedAt) || typeof value.runId !== "string") return false;
  if (!Array.isArray(value.upgrades) || value.upgrades.length !== 4 || !value.upgrades.every((item) => safeInteger(item))) return false;
  if (!Array.isArray(value.collection) || !value.collection.every((item) => typeof item === "string")) return false;
  if (!Array.isArray(value.ledger) || !record(value.stats) || !record(value.pools) || typeof value.runOver !== "boolean") return false;
  const stats = value.stats;
  const pools = value.pools;
  if (!["bought", "spent", "grossWon", "repaid", "runs"].every((key) => safeInteger(stats[key]))) return false;
  if (!value.ledger.every((entry) =>
    record(entry)
    && safeInteger(entry.at)
    && typeof entry.amount === "number"
    && safeInteger(Math.abs(entry.amount))
    && ["purchase", "prize", "repayment", "loan"].includes(String(entry.type)),
  )) return false;
  if (!validTicket(value.activeTicket)) return false;
  return TICKETS.every((product) => {
    const pool = pools[String(product.id)];
    if (!record(pool)) return false;
    // 타입 좁힘은 이 문장 안에서만 유지된다 — 아래 콜백까지 가져가려면 지역 상수로 캡처해야 한다.
    const remainingTickets = pool.remainingTickets;
    if (!safeInteger(remainingTickets) || remainingTickets > product.issued) return false;
    if (!Array.isArray(pool.remainingCount) || pool.remainingCount.length !== product.prizes.length) return false;
    return pool.remainingCount.every((count, index) =>
      safeInteger(count) && count <= product.prizes[index].count && count <= remainingTickets,
    );
  });
}

export function loadSave(): LotterySave | null {
  try {
    const value = localStorage.getItem(SAVE_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return validSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistSave(state: LotterySave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadTuning(): Partial<Balance> | undefined {
  try {
    const value = localStorage.getItem(TUNING_KEY);
    if (!value) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (!record(parsed)) return undefined;
    const result: Partial<Balance> = {};
    if (finite(parsed.seedCash, 0, Number.MAX_SAFE_INTEGER)) result.seedCash = Math.floor(parsed.seedCash);
    if (finite(parsed.loanUpfrontInterest, 0, 0.99)) result.loanUpfrontInterest = parsed.loanUpfrontInterest;
    if (finite(parsed.autoRepayRate, 0, 1)) result.autoRepayRate = parsed.autoRepayRate;
    if (record(parsed.masteryFactors)) {
      const factorRecord = parsed.masteryFactors;
      const factors: Partial<Balance["masteryFactors"]> = {};
      TICKETS.forEach((product) => {
        const candidate = factorRecord[String(product.id)];
        if (finite(candidate, 0, Number.MAX_SAFE_INTEGER)) factors[product.id] = candidate;
      });
      result.masteryFactors = factors as Balance["masteryFactors"];
    }
    return result;
  } catch {
    return undefined;
  }
}

/**
 * 튜닝 패널이 **실제로 편집하는 값만** 저장한다.
 * 밸런스 객체 전체를 저장하면, 패널을 한 번만 만져도 그 스냅샷이 영구히 기본값을 덮어써서
 * 코드로 고친 레이아웃(safe/bodyTop/theme)이나 확률표가 반영되지 않는다.
 */
export function persistTuning(balance: Balance): void {
  const tunable = {
    seedCash: balance.seedCash,
    loanUpfrontInterest: balance.loanUpfrontInterest,
    autoRepayRate: balance.autoRepayRate,
    masteryFactors: balance.masteryFactors,
  };
  localStorage.setItem(TUNING_KEY, JSON.stringify(tunable));
}
