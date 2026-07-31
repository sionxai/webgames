export type TicketPrice = 500 | 1000 | 2000 | 5000 | 10000;
export type TicketRule = "match3" | "lucky";

export interface PrizeTier {
  rank: number;
  prize: number;
  count: number;
}

export interface TicketProduct {
  id: TicketPrice;
  name: string;
  real: boolean;
  issued: number;
  rule: TicketRule;
  luckyCount: number;
  mineCount: number;
  cols: number;
  rows: number;
  needAll?: boolean;
  background: string;
  kind: string;
  ruleText: string;
  prizes: PrizeTier[];
}

export type PrintedCell =
  | { kind: "amount"; prizeIndex: number }
  | { kind: "lucky"; number: number }
  | { kind: "mine"; number: number; prizeIndex: number };

export interface PoolState {
  remainingTickets: number;
  remainingCount: number[];
}

export interface ActiveTicket {
  ticketId: string;
  productId: TicketPrice;
  productVersion: string;
  rank: number | null;
  printedCells: PrintedCell[];
  revealed: number;
  removedArea: number;
  requiredArea: number;
  complete: boolean;
  claimed: boolean;
  purchasedAt: number;
}

export interface LedgerEntry {
  at: number;
  type: "purchase" | "prize" | "repayment" | "loan";
  amount: number;
  ticketId?: string;
}

export interface GameStats {
  bought: number;
  spent: number;
  grossWon: number;
  repaid: number;
  runs: number;
}

export interface LotterySave {
  schemaVersion: number;
  sourceDate: string;
  virtualTableVersion: string;
  masteryXp: number;
  level: number;
  skillPoints: number;
  upgrades: [number, number, number, number];
  collection: string[];
  stats: GameStats;
  runId: string;
  cash: number;
  debt: number;
  startedAt: number;
  ledger: LedgerEntry[];
  activeTicket: ActiveTicket | null;
  pools: Record<TicketPrice, PoolState>;
  runOver: boolean;
}

export interface Balance {
  seedCash: number;
  masteryFactors: Record<TicketPrice, number>;
  levelCurveBase: number;
  levelCurveExponent: number;
  unlockLevels: Record<TicketPrice, number>;
  loanUpfrontInterest: number;
  loanLimitPerLevel: number;
  defaultLoanRequest: number;
  maxLevel: number;
  autoRepayRate: number;
  efficiencyGoodThreshold: number;
  efficiencyGreatThreshold: number;
  efficiencyGoodMultiplier: number;
  efficiencyGreatMultiplier: number;
  autoCompleteReveal: number;
  printFlattenExponent: number;
  printRetryLimit: number;
  progressSaveIntervalMs: number;
  ticketPrint: Record<TicketPrice, {
    safe: [number, number, number, number];
    /**
     * 본문(정보열 + 놀이영역)이 시작할 y — 카드 높이 대비 %.
     * 배경마다 상단 장식 밴드 두께가 다르다(2000~10000원은 부채꼴이 30%가량 차지).
     * 대칭 safe 인셋만으로는 헤더 아래가 장식과 겹친다.
     */
    bodyTop: number;
    theme: { ink: string; sub: string; panel: string; plate: string; line: string };
  }>;
  upgrades: [
    { key: "contact"; name: string; unit: string; values: number[]; locked?: boolean },
    { key: "cut"; name: string; unit: string; values: number[]; locked?: boolean },
    { key: "stability"; name: string; unit: string; values: number[]; locked?: boolean },
    { key: "workbench"; name: string; unit: string; values: number[]; locked: true },
  ];
  scratch: {
    overSpeedMultiplier: number;
    cutSlow: number;
    cutGood: number;
    cutOver: number;
    cutBad: number;
    slowDwellMs: number;
    watchdogMs: number;
    coverageCell: number;
    logicalWidth: number;
    logicalHeight: number;
    speedEma: number;
    minimumPointerDeltaMs: number;
    falloffExponent: number;
    gradientMiddleStop: number;
    gradientOuterStop: number;
    gradientMiddleAlpha: number;
    gradientOuterAlpha: number;
    minimumStampAlpha: number;
    passStampAlpha: number;
    stampStepDivisor: number;
    minimumStampStep: number;
    maxInterpolatedStamps: number;
    frameReportIntervalMs: number;
    watchdogIntervalDivisor: number;
    minimumWatchdogIntervalMs: number;
    gumRadiusMultiplier: number;
    gumDepositAlpha: number;
    gumCoverageCeiling: number;
    gumMaxMovement: number;
    tools: Array<{ name: string; radius: number; cut: number; vMin: number; vMax: number }>;
  };
}
