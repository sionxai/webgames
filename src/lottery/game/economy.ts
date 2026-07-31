import { MIN_TICKET_PRICE } from "../balance";
import type { Balance, LedgerEntry, LotterySave } from "../types";

export function investUpgrade(state: LotterySave, axis: number, balance: Balance): LotterySave {
  const definition = balance.upgrades[axis];
  if (!definition || definition.locked || axis === 3) throw new Error("아직 투자할 수 없는 강화입니다.");
  if (state.skillPoints < 1) throw new Error("숙련 포인트가 부족합니다.");
  const current = state.upgrades[axis];
  if (!Number.isInteger(current) || current < 0 || current >= definition.values.length) {
    throw new Error("저장된 강화 단계가 올바르지 않습니다.");
  }
  if (current >= definition.values.length - 1) throw new Error("이미 최고 단계입니다.");
  const upgrades: LotterySave["upgrades"] = [...state.upgrades];
  upgrades[axis] = current + 1;
  upgrades[3] = 0;
  return { ...state, skillPoints: state.skillPoints - 1, upgrades };
}

export function levelFromXp(xp: number, balance: Balance): number {
  let level = 1;
  while (level < balance.maxLevel && xp >= Math.round(balance.levelCurveBase * Math.pow(level + 1, balance.levelCurveExponent))) level += 1;
  return level;
}

export function loanLimit(state: LotterySave, balance: Balance): number {
  return state.level * balance.loanLimitPerLevel;
}

export function borrow(state: LotterySave, requested: number, balance: Balance): LotterySave {
  const amount = Math.floor(requested);
  if (amount <= 0 || state.debt + amount > loanLimit(state, balance)) throw new Error("대출 한도를 확인하세요.");
  const credit = Math.floor(amount * (1 - balance.loanUpfrontInterest));
  return {
    ...state, cash: state.cash + credit, debt: state.debt + amount,
    ledger: [...state.ledger, { at: Date.now(), type: "loan", amount }],
  };
}

export function creditPrize(state: LotterySave, gross: number, balance: Balance): LotterySave {
  const repayment = Math.min(state.debt, Math.floor(gross * balance.autoRepayRate));
  const entries: LedgerEntry[] = [
    { at: Date.now(), type: "prize", amount: gross, ticketId: state.activeTicket?.ticketId },
  ];
  if (repayment) entries.push({ at: Date.now(), type: "repayment", amount: repayment });
  return {
    ...state,
    cash: state.cash + gross - repayment,
    debt: state.debt - repayment,
    ledger: [...state.ledger, ...entries],
    stats: { ...state.stats, grossWon: state.stats.grossWon + gross, repaid: state.stats.repaid + repayment },
  };
}

export function isRunOver(state: LotterySave, balance: Balance): boolean {
  const remainingCredit = Math.max(0, loanLimit(state, balance) - state.debt);
  return state.cash < MIN_TICKET_PRICE
    && Math.floor(remainingCredit * (1 - balance.loanUpfrontInterest)) < MIN_TICKET_PRICE;
}
