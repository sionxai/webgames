import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCHEMA_VERSION, SOURCE_DATE, mergeBalance, shortOdds } from "./balance";
import { TICKETS, ticketById } from "./data/tickets";
import { borrow, investUpgrade, isRunOver, loanLimit } from "./game/economy";
import { buyTicket, claimTicket, completeTicket, newRun } from "./game/run";
import { loadSave, loadTuning, persistSave, persistTuning } from "./game/save";
import type { Balance, LotterySave, TicketPrice } from "./types";
import type { ScratchProgress } from "./engine/scratch";
import TicketCard from "./ui/TicketCard";
import ToolShop from "./ui/ToolShop";
import TuningPanel from "./ui/TuningPanel";

const money = (value: number) => `${Math.floor(value).toLocaleString()}원`;
const cheapestTicketPrice = Math.min(...TICKETS.map((ticket) => ticket.id));
const normalizedUpgrades = (upgrades: LotterySave["upgrades"], balance: Balance): LotterySave["upgrades"] =>
  balance.upgrades.map((definition, axis) => axis === 3 ? 0 : Math.min(
    definition.values.length - 1,
    Math.max(0, Number.isInteger(upgrades[axis]) ? upgrades[axis] : 0),
  )) as LotterySave["upgrades"];
const withStatsDefaults = (save: LotterySave): LotterySave => ({
  ...save,
  stats: { ...save.stats, bestPrize: save.stats.bestPrize ?? 0 },
});

export default function App() {
  const devMode = useMemo(() => new URLSearchParams(location.search).get("dev") === "1", []);
  const [balance, setBalance] = useState<Balance>(() => mergeBalance(loadTuning()));
  const persistNormalizedLoad = useRef(false);
  const [state, setState] = useState<LotterySave>(() => {
    const loaded = loadSave();
    if (loaded?.schemaVersion !== SCHEMA_VERSION) return withStatsDefaults(newRun(mergeBalance(loadTuning())));
    const upgrades = normalizedUpgrades(loaded.upgrades, balance);
    const stats = { ...loaded.stats, bestPrize: loaded.stats.bestPrize ?? 0 };
    persistNormalizedLoad.current = upgrades.some((stage, axis) => stage !== loaded.upgrades[axis])
      || stats.bestPrize !== loaded.stats.bestPrize;
    return persistNormalizedLoad.current ? { ...loaded, upgrades, stats } : loaded;
  });
  const [progress, setProgress] = useState<ScratchProgress>({
    revealed: state.activeTicket?.revealed ?? 0, removedArea: state.activeTicket?.removedArea ?? 0,
    requiredArea: state.activeTicket?.requiredArea ?? 1, speed: 0, verdict: "대기",
  });
  const [loanAmount, setLoanAmount] = useState(balance.defaultLoanRequest);
  const [loanPanelOpen, setLoanPanelOpen] = useState(false);
  const [loanConfirmOpen, setLoanConfirmOpen] = useState(false);
  const [message, setMessage] = useState("복권을 골라 첫 장을 구매하세요.");
  const stateRef = useRef(state);
  const balanceRef = useRef(balance);
  const lastProgressSaveAt = useRef(0);
  const effectiveTool = useMemo(() => {
    const contact = balance.scratch.tools[Math.min(state.upgrades[0], balance.scratch.tools.length - 1)];
    const cutting = balance.scratch.tools[Math.min(state.upgrades[1], balance.scratch.tools.length - 1)];
    const stability = balance.scratch.tools[Math.min(state.upgrades[2], balance.scratch.tools.length - 1)];
    return { ...contact, cut: cutting.cut, vMin: stability.vMin, vMax: stability.vMax };
  }, [balance.scratch.tools, state.upgrades]);
  const scratchBalance = useMemo(
    () => ({ ...balance, scratch: { ...balance.scratch, tools: [effectiveTool] } }),
    [balance, effectiveTool],
  );

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!persistNormalizedLoad.current) return;
    persistNormalizedLoad.current = false;
    try {
      persistSave(stateRef.current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "강화 단계 정규화를 저장하지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      coordinateSystem: "ticket canvas: origin top-left, x right, y down",
      mode: state.runOver ? "run-over" : state.activeTicket?.complete ? "result" : state.activeTicket ? "scratching" : "shop",
      cash: state.cash, debt: state.debt, level: state.level, masteryXp: state.masteryXp,
      stats: {
        bought: state.stats.bought, spent: state.stats.spent, grossWon: state.stats.grossWon,
        bestPrize: state.stats.bestPrize ?? 0,
      },
      activeTicket: state.activeTicket && {
        ticketId: state.activeTicket.ticketId, productId: state.activeTicket.productId,
        revealed: state.activeTicket.complete ? 1 : progress.revealed, complete: state.activeTicket.complete,
        claimed: state.activeTicket.claimed, rank: state.activeTicket.rank,
      },
      loanLimit: loanLimit(state, balance), runOver: state.runOver,
    });
    window.advanceTime = (milliseconds: number) => window.__lotteryScratch?.advance(milliseconds);
    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [state, balance, progress.revealed]);

  const purchase = (price: TicketPrice) => {
    try {
      const next = buyTicket(state, price, balance);
      persistSave(next);
      stateRef.current = next;
      setState(next);
      setProgress({ revealed: 0, removedArea: 0, requiredArea: 1, speed: 0, verdict: "대기" });
      setMessage("복권이 발행되었습니다. 긁어서 결과를 확인하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "구매하지 못했습니다.");
    }
  };

  const updateProgress = useCallback((next: ScratchProgress) => {
    setProgress(next);
    const current = stateRef.current;
    const now = performance.now();
    if (current.activeTicket && !current.activeTicket.complete
      && now - lastProgressSaveAt.current >= balanceRef.current.progressSaveIntervalMs) {
      const snapshot: LotterySave = {
        ...current,
        activeTicket: {
          ...current.activeTicket,
          revealed: next.revealed,
          removedArea: next.removedArea,
          requiredArea: next.requiredArea,
        },
      };
      try {
        persistSave(snapshot);
        lastProgressSaveAt.current = now;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "긁기 진행 상태를 저장하지 못했습니다.");
      }
    }
  }, []);

  const finishScratch = useCallback((next: ScratchProgress) => {
    try {
      const snapshot = completeTicket(stateRef.current, next.revealed, next.removedArea, next.requiredArea, balanceRef.current);
      persistSave(snapshot);
      stateRef.current = snapshot;
      setProgress(next);
      setState(snapshot);
      setMessage("긁기 완주! 인쇄 결과를 확인하고 당첨금을 수령하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "완주 상태를 저장하지 못했습니다.");
    }
  }, []);

  const claim = () => {
    try {
      const before = state;
      const next = claimTicket(state, balance);
      const gross = next.stats.grossWon - before.stats.grossWon;
      const repaid = next.stats.repaid - before.stats.repaid;
      persistSave(next);
      stateRef.current = next;
      setState(next);
      setMessage(gross ? `${money(gross)} 당첨 · ${money(repaid)} 자동 상환` : "아쉽지만 꽝입니다. 노동의 숙련도는 남았습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수령하지 못했습니다.");
    }
  };

  const takeLoan = () => {
    try {
      const next = borrow(state, effectiveLoan, balance);
      const snapshot = { ...next, runOver: isRunOver(next, balance) };
      persistSave(snapshot);
      stateRef.current = snapshot;
      setState(snapshot);
      setLoanConfirmOpen(false);
      setLoanPanelOpen(false);
      setMessage(`${money(effectiveLoan)} 신청 · ${money(Math.floor(effectiveLoan * (1 - balance.loanUpfrontInterest)))} 입금`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "대출하지 못했습니다.");
    }
  };

  const requestLoan = () => {
    if (remainingCredit <= 0) return;
    setLoanPanelOpen(true);
    setLoanConfirmOpen(true);
    document.getElementById("loan-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const restart = () => {
    try {
      const next = withStatsDefaults(newRun(balance, state));
      persistSave(next);
      stateRef.current = next;
      setState(next);
      setMessage("새 런을 시작했습니다. 유한 풀이 모두 초기화되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "새 런을 저장하지 못했습니다.");
    }
  };

  const invest = (axis: number) => {
    try {
      const next = investUpgrade(state, axis, balance);
      persistSave(next);
      stateRef.current = next;
      setState(next);
      setMessage(`${balance.upgrades[axis].name} 강화 완료. 다음 긁기부터 적용됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "강화하지 못했습니다.");
    }
  };

  const updateBalance = (next: Balance) => {
    try {
      persistTuning(next);
      if (state.ledger.length === 0 && !state.activeTicket && state.cash === balance.seedCash && next.seedCash !== balance.seedCash) {
        const snapshot = { ...state, cash: next.seedCash };
        persistSave(snapshot);
        stateRef.current = snapshot;
        setState(snapshot);
      }
      balanceRef.current = next;
      setBalance(next);
    } catch (error) {
      try { persistTuning(balance); } catch { /* 기존 튜닝도 저장 불가능한 상태 */ }
      setMessage(error instanceof Error ? error.message : "튜닝 값을 저장하지 못했습니다.");
    }
  };

  const activeProduct = state.activeTicket ? ticketById(state.activeTicket.productId) : undefined;
  const activeRank = state.activeTicket?.complete ? state.activeTicket.rank : undefined;
  const nextLevelXp = Math.round(balance.levelCurveBase * Math.pow(state.level + 1, balance.levelCurveExponent));
  const remainingCredit = Math.max(0, loanLimit(state, balance) - state.debt);
  const effectiveLoan = Math.max(0, Math.min(loanAmount, remainingCredit));
  const totalRefundRate = state.stats.spent > 0 ? state.stats.grossWon / state.stats.spent : 0;
  const netProfit = state.stats.grossWon - state.stats.spent;

  return (
    <main className="lottery-app">
      {/* 헤더 + 상태를 한 줄로 — 4칸 카드(110px)가 놀이영역을 아래로 밀어냈다 */}
      <header className="topbar">
        <h1>긁는순간</h1>
        <div className="stat-line">
          <span>게임머니 <strong id="cash">{money(state.cash)}</strong></span>
          <span>빚 <strong id="debt">{money(state.debt)}</strong></span>
          <span>숙련도 <strong id="mastery">{state.masteryXp.toLocaleString()}</strong> <em>/ {nextLevelXp.toLocaleString()}</em></span>
          <span>레벨 <strong id="level">Lv.{state.level}</strong>{state.skillPoints > 0 && <em className="point-badge">포인트 {state.skillPoints}</em>}</span>
        </div>
        <a href="/">한판 홈</a>
      </header>

      <p className="notice" role="status">{message}</p>

      <div className="game-layout">
        <section className="panel play-panel">
          {state.runOver ? (
            <div className="run-over" data-testid="run-over">
              <h2>런 종료 — 결과 요약</h2>
              <dl className="summary-grid">
                <div><dt>총 구매 장수</dt><dd>{state.stats.bought.toLocaleString()}장</dd></div>
                <div><dt>총 구매액</dt><dd>{money(state.stats.spent)}</dd></div>
                <div><dt>총 당첨금</dt><dd>{money(state.stats.grossWon)}</dd></div>
                <div><dt>순손익</dt><dd className={netProfit >= 0 ? "positive" : "negative"}>{money(netProfit)}</dd></div>
                <div><dt>실환급률</dt><dd>{(totalRefundRate * 100).toFixed(1)}%</dd></div>
                <div><dt>최고 당첨금</dt><dd>{money(state.stats.bestPrize ?? 0)}</dd></div>
              </dl>
              <p className="run-over-note">숙련도와 레벨은 계승됩니다.</p>
              <div className="run-over-actions">
                <button id="restart-run" onClick={restart}>다시 시작</button>
                <button id="continue-with-loan" disabled={remainingCredit <= 0} onClick={requestLoan}>대출로 이어가기</button>
              </div>
            </div>
          ) : state.activeTicket ? (
            <>
              <TicketCard ticket={state.activeTicket} balance={scratchBalance}
                toolIndex={0}
                onProgress={updateProgress} onComplete={finishScratch} />
              <div className="scratch-hud">
                <span className="tool-readout">
                  <i style={{ width: effectiveTool.radius, height: effectiveTool.radius }} />
                  {effectiveTool.name}<em className="hud-detail"> · 반지름 {effectiveTool.radius}px</em>
                </span>
                <span>공개율 {Math.round((state.activeTicket.complete ? 1 : progress.revealed) * 100)}%</span>
                <span>{Math.round(progress.speed)} px/s · {progress.verdict}</span>
              </div>
              <div className="speed-meter" aria-label={`적정 속도 ${effectiveTool.vMin}에서 ${effectiveTool.vMax} px/s`}>
                <span className="speed-good-zone" style={{
                  left: `${effectiveTool.vMin / (effectiveTool.vMax * balance.scratch.overSpeedMultiplier) * 100}%`,
                  width: `${(effectiveTool.vMax - effectiveTool.vMin) / (effectiveTool.vMax * balance.scratch.overSpeedMultiplier) * 100}%`,
                }} />
                <i style={{ left: `${Math.min(100, progress.speed / (effectiveTool.vMax * balance.scratch.overSpeedMultiplier) * 100)}%` }} />
              </div>
              {state.activeTicket.complete && !state.activeTicket.claimed && (
                <div className="result">
                  <strong>{activeRank ? `${activeRank}등 · ${money(activeProduct!.prizes[activeRank - 1].prize)}` : "꽝"}</strong>
                  <button id="claim-prize" onClick={claim}>당첨금 수령</button>
                </div>
              )}
              {state.activeTicket.claimed && <p className="done-ticket">정산 완료 — 아래에서 다음 복권을 구매하세요.</p>}
              {devMode && !state.activeTicket.complete && <button id="dev-complete" onClick={() => window.__lotteryScratch?.completeForTesting()}>개발용 즉시 완주</button>}
            </>
          ) : <div className="empty-card"><h2>복권을 구매하세요</h2><p>발행된 결과는 새로고침 후에도 유지됩니다.</p></div>}
        </section>

        {/* 가장 자주 쓰는 순서로 둔다: 사기 → (포인트 있을 때) 업그레이드 → (돈 마를 때) 대출 */}
        <aside className="side-column">
          <section className="panel shop">
            <h2>복권 사기</h2>
            <p className="shop-subtitle">실제 결제가 없는 가상 머니입니다</p>
            {TICKETS.map((ticket) => {
              const unlocked = state.level >= balance.unlockLevels[ticket.id];
              const noCash = state.cash < ticket.id;
              const totalWinCount = ticket.prizes.reduce((sum, prize) => sum + prize.count, 0);
              return (
                <button data-testid={`buy-${ticket.id}`} id={`buy-${ticket.id}`} key={ticket.id}
                  disabled={!unlocked || noCash || Boolean(state.activeTicket && !state.activeTicket.claimed)}
                  onClick={() => purchase(ticket.id)}>
                  <span className="shop-ticket-name">{ticket.name}{!ticket.real && <em> 가상</em>}</span>
                  {/* 잠금이 없으므로 막히는 이유는 '돈 부족'뿐이다 — 그걸 그대로 보여준다 */}
                  <span className="shop-ticket-meta">
                    <small>전체 당첨 {shortOdds(totalWinCount, ticket.issued)}</small>
                    <b>{!unlocked ? `Lv.${balance.unlockLevels[ticket.id]} 해금` : noCash ? <em className="short">잔액 부족</em> : money(ticket.id)}</b>
                  </span>
                </button>
              );
            })}
          </section>

          <ToolShop balance={balance} state={state} onInvest={invest} />

          {(loanPanelOpen || (!state.runOver && (state.cash < cheapestTicketPrice || state.debt > 0))) && (
          <section className="panel loan" id="loan-panel">
            <h2>선이자 대출</h2>
            <p>한도 {money(loanLimit(state, balance))} · 남은 한도 {money(remainingCredit)}</p>
            {/* 기본 신청액(10만)이 Lv.1 한도(5만)를 넘어 버튼이 늘 비활성이었다 — 남은 한도로 clamp한다. */}
            <label>신청액 <input id="loan-amount" type="number" min="1" max={remainingCredit} step="10000"
              value={effectiveLoan} onChange={(event) => setLoanAmount(Number(event.target.value))} /></label>
            <p>{money(effectiveLoan)} 신청 → {money(Math.floor(effectiveLoan * (1 - balance.loanUpfrontInterest)))} 수령 · 빚 {money(effectiveLoan)}</p>
            {!loanConfirmOpen ? (
              <button id="take-loan" disabled={effectiveLoan <= 0} onClick={requestLoan}>대출 조건 확인</button>
            ) : (
              <div className="loan-confirmation" role="dialog" aria-labelledby="loan-confirm-title">
                <h3 id="loan-confirm-title">대출 실행 전 확인</h3>
                <div className="loan-confirm-flow">
                  <strong>{money(effectiveLoan)} 대출</strong>
                  <span>→</span>
                  <strong>{money(Math.floor(effectiveLoan * (1 - balance.loanUpfrontInterest)))} 수령</strong>
                  <span>→</span>
                  <strong>{money(effectiveLoan)} 상환</strong>
                </div>
                <div className="loan-confirm-actions">
                  <button id="confirm-loan" disabled={effectiveLoan <= 0} onClick={takeLoan}>확인하고 대출 실행</button>
                  <button type="button" onClick={() => setLoanConfirmOpen(false)}>취소</button>
                </div>
              </div>
            )}
            <small>당첨금의 {Math.round(balance.autoRepayRate * 100)}%는 빚 범위 안에서 자동 상환됩니다.</small>
          </section>
          )}
        </aside>
      </div>

      {devMode && <TuningPanel balance={balance} onChange={updateBalance} />}
      <footer className="source">확률표 출처 기준일 {SOURCE_DATE} · 실제 금전이 오가지 않는 시뮬레이션</footer>
    </main>
  );
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}
