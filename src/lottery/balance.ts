import type { Balance } from "./types";

export const SAVE_KEY = "hanpan.lottery.save.v1";
export const TUNING_KEY = "hanpan.lottery.tuning.v1";
export const SCHEMA_VERSION = 1;
export const SOURCE_DATE = "2026-07-30";
export const VIRTUAL_TABLE_VERSION = "virtual-2026-07-30-v1";
export const PRODUCT_VERSION = "lottery-products-v1";
export const MIN_TICKET_PRICE = 500;

export const DEFAULT_BALANCE: Balance = {
  seedCash: 250000,
  masteryFactors: { 500: 76, 1000: 139, 2000: 275, 5000: 727, 10000: 1662 },
  levelCurveBase: 2500,
  levelCurveExponent: 1.6,
  // 레벨 게이팅 없음 — 돈만 있으면 어느 등급이든 산다(실제 복권처럼).
  // 상위 등급의 억제력은 '잠금'이 아니라 **낮은 환급률과 큰 분산**이 맡는다.
  // 필드는 남겨 둔다: 전부 1이면 게이팅 해제, 값을 올리면 다시 잠근다(튜닝 가능).
  unlockLevels: { 500: 1, 1000: 1, 2000: 1, 5000: 1, 10000: 1 },
  loanUpfrontInterest: 0.2,
  loanLimitPerLevel: 50000,
  defaultLoanRequest: 100000,
  maxLevel: 100,
  autoRepayRate: 0.3,
  efficiencyGoodThreshold: 0.85,
  efficiencyGreatThreshold: 0.95,
  efficiencyGoodMultiplier: 1.2,
  efficiencyGreatMultiplier: 1.4,
  autoCompleteReveal: 0.9,
  printFlattenExponent: 0.45,
  printRetryLimit: 500,
  progressSaveIntervalMs: 500,
  ticketPrint: {
    500: { safe: [5.5, 5.5, 5.5, 7], bodyTop: 26, theme: { ink: "#2b5b61", sub: "#5c7f83", panel: "rgba(255,255,255,0.52)", plate: "rgba(250,253,252,0.86)", line: "rgba(43,91,97,0.28)" } },
    1000: { safe: [7, 7, 7, 8], bodyTop: 37, theme: { ink: "#8a3a12", sub: "#a5794a", panel: "rgba(255,251,240,0.60)", plate: "rgba(255,252,244,0.88)", line: "rgba(138,58,18,0.24)" } },
    2000: { safe: [10, 8, 10, 9], bodyTop: 33, theme: { ink: "#f0d98a", sub: "#b9a463", panel: "rgba(9,20,46,0.50)", plate: "rgba(8,17,40,0.88)", line: "rgba(240,217,138,0.30)" } },
    5000: { safe: [10, 8.5, 10, 10], bodyTop: 36, theme: { ink: "#f7e7bb", sub: "#c3ac7e", panel: "rgba(44,22,66,0.46)", plate: "rgba(38,19,58,0.86)", line: "rgba(247,231,187,0.30)" } },
    10000: { safe: [10.5, 9, 10.5, 10], bodyTop: 36, theme: { ink: "#f2d98c", sub: "#b59d5c", panel: "rgba(0,0,0,0.48)", plate: "rgba(5,5,7,0.90)", line: "rgba(242,217,140,0.28)" } },
  },
  upgrades: [
    { key: "contact", name: "접촉면", unit: "px", values: [12, 16, 21, 27, 34, 44] },
    { key: "cut", name: "절삭력", unit: "", values: [0.42, 0.52, 0.62, 0.72, 0.85, 1] },
    { key: "stability", name: "안정성", unit: "px/s", values: [260, 355, 465, 595, 745, 940] },
    { key: "workbench", name: "작업대", unit: "장", values: [1, 2, 4], locked: true },
  ],
  scratch: {
    overSpeedMultiplier: 1.8,
    cutSlow: 0.2,
    cutGood: 1,
    cutOver: 0.7,
    cutBad: 0.35,
    slowDwellMs: 400,
    watchdogMs: 120,
    coverageCell: 6,
    logicalWidth: 640,
    logicalHeight: 360,
    speedEma: 0.35,
    minimumPointerDeltaMs: 8,
    falloffExponent: 2,
    gradientMiddleStop: 0.35,
    gradientOuterStop: 0.7,
    gradientMiddleAlpha: 0.88,
    gradientOuterAlpha: 0.51,
    minimumStampAlpha: 0.004,
    passStampAlpha: 0.02,
    stampStepDivisor: 3,
    minimumStampStep: 2,
    maxInterpolatedStamps: 28,
    frameReportIntervalMs: 45,
    watchdogIntervalDivisor: 3,
    minimumWatchdogIntervalMs: 20,
    gumRadiusMultiplier: 0.8,
    gumDepositAlpha: 0.055,
    gumCoverageCeiling: 0.5,
    gumMaxMovement: 4,
    tools: [
      { name: "10원", radius: 12, cut: 0.42, vMin: 120, vMax: 380 },
      { name: "100원", radius: 16, cut: 0.52, vMin: 105, vMax: 460 },
      { name: "500원", radius: 21, cut: 0.62, vMin: 95, vMax: 560 },
      { name: "기념주화", radius: 27, cut: 0.72, vMin: 85, vMax: 680 },
      { name: "황동 스크레이퍼", radius: 34, cut: 0.85, vMin: 75, vMax: 820 },
      { name: "정밀 롤러", radius: 44, cut: 1, vMin: 60, vMax: 1000 },
    ],
  },
};

export function mergeBalance(overrides?: Partial<Balance>): Balance {
  if (!overrides) return structuredClone(DEFAULT_BALANCE);
  return {
    ...structuredClone(DEFAULT_BALANCE),
    ...overrides,
    masteryFactors: { ...DEFAULT_BALANCE.masteryFactors, ...overrides.masteryFactors },
    unlockLevels: { ...DEFAULT_BALANCE.unlockLevels, ...overrides.unlockLevels },
    ticketPrint: { ...DEFAULT_BALANCE.ticketPrint, ...overrides.ticketPrint },
    upgrades: overrides.upgrades ?? DEFAULT_BALANCE.upgrades,
    scratch: {
      ...DEFAULT_BALANCE.scratch,
      ...overrides.scratch,
      tools: overrides.scratch?.tools ?? DEFAULT_BALANCE.scratch.tools,
    },
  };
}
