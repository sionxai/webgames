import { PRODUCT_VERSION, SCHEMA_VERSION, SOURCE_DATE, VIRTUAL_TABLE_VERSION } from "../balance";
import { TICKETS, ticketById } from "../data/tickets";
import { createPool, drawRank, printTicket, readPrintedRank, type Rng } from "../engine/draw";
import type { Balance, LotterySave, TicketPrice } from "../types";
import { creditPrize, isRunOver, levelFromXp } from "./economy";

const runId = () => `run-${Date.now()}-${crypto.randomUUID()}`;

export function newRun(balance: Balance, persistent?: LotterySave): LotterySave {
  return {
    schemaVersion: SCHEMA_VERSION, sourceDate: SOURCE_DATE, virtualTableVersion: VIRTUAL_TABLE_VERSION,
    masteryXp: persistent?.masteryXp ?? 0, level: persistent?.level ?? 1,
    skillPoints: persistent?.skillPoints ?? 0, upgrades: persistent?.upgrades ?? [0, 0, 0, 0],
    collection: persistent?.collection ?? [], stats: { ...(persistent?.stats ?? { bought: 0, spent: 0, grossWon: 0, repaid: 0, runs: 0 }), runs: (persistent?.stats.runs ?? 0) + 1 },
    runId: runId(), cash: balance.seedCash, debt: 0, startedAt: Date.now(), ledger: [],
    activeTicket: null,
    pools: Object.fromEntries(TICKETS.map((product) => [product.id, createPool(product)])) as LotterySave["pools"],
    runOver: false,
  };
}

export function buyTicket(state: LotterySave, productId: TicketPrice, balance: Balance, rng: Rng = Math.random): LotterySave {
  const product = ticketById(productId);
  if (!product) throw new Error("알 수 없는 복권입니다.");
  if (state.activeTicket && !state.activeTicket.claimed) throw new Error("진행 중인 복권을 먼저 완료하세요.");
  if (state.level < balance.unlockLevels[productId]) throw new Error("아직 잠긴 등급입니다.");
  if (state.cash < productId) throw new Error("현금이 부족합니다.");
  const pools = structuredClone(state.pools);
  const constrainedRank = drawRank(pools[productId], rng);
  const printedCells = printTicket(product, constrainedRank, balance.printFlattenExponent, balance.printRetryLimit, rng);
  const rank = readPrintedRank(product, printedCells);
  if (rank !== constrainedRank) throw new Error("인쇄 결과 검증에 실패했습니다.");
  const ticketId = `${state.runId}-${productId}-${state.stats.bought + 1}-${crypto.randomUUID()}`;
  return {
    ...state, cash: state.cash - productId, pools,
    activeTicket: {
      ticketId, productId, productVersion: PRODUCT_VERSION, rank, printedCells,
      revealed: 0, removedArea: 0, requiredArea: 1, complete: false, claimed: false, purchasedAt: Date.now(),
    },
    ledger: [...state.ledger, { at: Date.now(), type: "purchase", amount: -productId, ticketId }],
    stats: { ...state.stats, bought: state.stats.bought + 1, spent: state.stats.spent + productId },
  };
}

export function completeTicket(state: LotterySave, revealed: number, removedArea: number, requiredArea: number, balance: Balance): LotterySave {
  if (!state.activeTicket || state.activeTicket.complete) return state;
  const ratio = Math.min(1, Math.max(0, removedArea / Math.max(1, requiredArea)));
  const product = ticketById(state.activeTicket.productId);
  if (!product) return state;
  const multiplier = ratio >= balance.efficiencyGreatThreshold
    ? balance.efficiencyGreatMultiplier
    : ratio >= balance.efficiencyGoodThreshold ? balance.efficiencyGoodMultiplier : 1;
  const gained = Math.round(balance.masteryFactors[product.id] * ratio * multiplier);
  const previousLevel = state.level;
  const masteryXp = state.masteryXp + gained;
  const level = levelFromXp(masteryXp, balance);
  return {
    ...state, masteryXp, level, skillPoints: state.skillPoints + Math.max(0, level - previousLevel),
    activeTicket: { ...state.activeTicket, revealed, removedArea, requiredArea, complete: true },
  };
}

export function claimTicket(state: LotterySave, balance: Balance): LotterySave {
  if (!state.activeTicket?.complete || state.activeTicket.claimed) throw new Error("완주한 복권이 없습니다.");
  const product = ticketById(state.activeTicket.productId);
  if (!product) throw new Error("상품 정보를 찾을 수 없습니다.");
  const rank = readPrintedRank(product, state.activeTicket.printedCells);
  const gross = rank === null ? 0 : product.prizes[rank - 1].prize;
  let next = creditPrize(state, gross, balance);
  next = { ...next, activeTicket: { ...next.activeTicket!, claimed: true } };
  return { ...next, runOver: isRunOver(next, balance) };
}
