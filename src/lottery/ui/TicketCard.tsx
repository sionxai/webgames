import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { createScratchEngine, type ScratchController, type ScratchProgress } from "../engine/scratch";
import { isSettled } from "../engine/draw";
import { ticketById } from "../data/tickets";
import type { ActiveTicket, Balance } from "../types";

type Props = {
  ticket: ActiveTicket;
  balance: Balance;
  toolIndex: number;
  onProgress(progress: ScratchProgress): void;
  onComplete(progress: ScratchProgress): void;
};

type PrintStyle = CSSProperties & Record<`--${string}`, string>;

/**
 * 금액 축약 표기.
 * 전체 숫자(`200,000,000원` = 207px)는 칸(136px)을 넘어 잘린다 — 실제 복권도 `2억원`으로 찍는다.
 * 당첨금 안내표에도 쓴다: 확률 열을 붙이려면 자리가 필요하다.
 */
function shortWon(value: number): string {
  const strip = (n: number) => String(Math.round(n * 10) / 10);
  if (value >= 1e8) return `${strip(value / 1e8)}억원`;
  if (value >= 1e7) return `${strip(value / 1e7)}천만원`;
  if (value >= 1e4) return `${strip(value / 1e4)}만원`;
  if (value >= 1e3) return `${strip(value / 1e3)}천원`;
  return `${value}원`;
}

/**
 * 등위별 당첨확률 — 이 게임에서 가장 중요한 숫자다.
 * 2억원 옆에 `1/400만`이 붙어야 그 금액이 무슨 뜻인지 보인다.
 */
function shortOdds(count: number, issued: number): string {
  if (count <= 0) return "—";
  const one = issued / count;
  const trim = (value: number, digits: number) => value.toFixed(digits).replace(/\.0+$/, "");
  if (one >= 1e8) return `1/${trim(one / 1e8, 1)}억`;
  // 100만 이상이면 소수점이 의미 없다 — 1/166.7만보다 1/167만이 읽힌다
  if (one >= 1e4) return `1/${trim(one / 1e4, one / 1e4 >= 100 ? 0 : 1)}만`;
  if (one >= 1e3) return `1/${Math.round(one).toLocaleString()}`;
  return `1/${trim(one, 1)}`;
}

export default function TicketCard({ ticket, balance, toolIndex, onProgress, onComplete }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const foilRef = useRef<HTMLCanvasElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ScratchController | null>(null);
  const product = ticketById(ticket.productId)!;
  const print = balance.ticketPrint[product.id];
  const [left, top, right, bottom] = print.safe;
  // 헤더 밴드 높이 = (bodyTop - safe.top)를 **콘텐츠 박스 높이** 기준 %로 환산.
  // grid-template-rows의 %는 세로 padding을 뺀 높이에 걸리므로 카드 기준 %를 그대로 쓰면 어긋난다.
  const contentHeight = Math.max(1, 100 - top - bottom);
  const headBand = Math.max(0, Math.min(70, (print.bodyTop - top) / contentHeight * 100));
  const style: PrintStyle = {
    "--pl": `${left}%`, "--pt": `${top * 360 / 640}%`,
    "--pr": `${right}%`, "--pb": `${bottom * 360 / 640}%`,
    "--head-h": `${headBand}%`,
    "--ink": print.theme.ink, "--sub": print.theme.sub, "--panel": print.theme.panel,
    "--plate": print.theme.plate, "--line": print.theme.line,
  };

  const lucky = ticket.printedCells.filter((cell) => cell.kind === "lucky");
  const mine = ticket.printedCells.filter((cell) => cell.kind !== "lucky");
  /**
   * 엔진의 칸 인덱스는 DOM 순서(.scratch-cell)를 따른다 — printedCells 순서가 아니다.
   * 확정 판정도 같은 배열을 봐야 하므로 렌더와 판정이 이 하나를 공유한다.
   */
  const displayCells = useMemo(() => [...lucky, ...mine], [ticket.ticketId]); // eslint-disable-line react-hooks/exhaustive-deps
  const settled = useCallback(
    (revealed: boolean[]) => isSettled(product, displayCells, revealed),
    [product, displayCells],
  );

  useLayoutEffect(() => {
    const box = prizeRef.current;
    if (!box) return;
    const fit = () => {
      let size = 1.36;
      box.style.setProperty("--fs-prize", `${size}cqw`);
      for (let attempt = 0; attempt < 10 && box.scrollHeight > box.clientHeight + 1 && size > 1; attempt += 1) {
        size = Math.round((size - .06) * 100) / 100;
        box.style.setProperty("--fs-prize", `${size}cqw`);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [product.id]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cells = [...host.querySelectorAll<HTMLElement>(".scratch-cell")];
    const sizeCells = () => cells.forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      cell.style.setProperty("--cs", `${Math.min(rect.width, rect.height)}px`);
    });
    sizeCells();
    const observer = new ResizeObserver(sizeCells);
    cells.forEach((cell) => observer.observe(cell));
    return () => observer.disconnect();
  }, [product.id, ticket.ticketId]);

  useEffect(() => {
    const host = hostRef.current;
    const foil = foilRef.current;
    if (!host || !foil || ticket.complete) return;
    const engine = createScratchEngine({
      host, foil, cells: [...host.querySelectorAll<HTMLElement>(".scratch-cell")],
      balance, toolIndex, initialReveal: ticket.revealed,
      initialRemovedArea: ticket.removedArea, initialRequiredArea: ticket.requiredArea,
      isSettled: settled, onProgress, onComplete,
    });
    engineRef.current = engine;
    window.__lotteryScratch = engine;
    return () => {
      engine.destroy();
      if (window.__lotteryScratch === engine) delete window.__lotteryScratch;
    };
  }, [
    ticket.ticketId, ticket.complete, ticket.revealed, ticket.removedArea, ticket.requiredArea,
    balance, toolIndex, onComplete, onProgress, settled,
  ]);

  return (
    <div ref={hostRef} className="ticket-card" style={{ backgroundImage: `url(${product.background})` }}>
      <div className="ticket-print" style={style}>
        <header className="pr-head">
          <div className="ticket-brand">긁는순간<small>THE SCRATCHING MOMENT</small></div>
          <div className="head-r"><span className="round">제 {100 + product.id / 500} 회</span><b className="price">{product.id.toLocaleString()}원</b></div>
        </header>
        <aside className="pr-info">
          <div className="howto"><b>{product.kind}</b><span>{product.ruleText}</span></div>
          <div className="prizebox" ref={prizeRef}>
            <div className="prize-title">당첨금 안내</div>
            {product.prizes.map((tier) => (
              <div className="prize-row" key={tier.rank}>
                <span>{tier.rank}등</span>
                <b>{shortWon(tier.prize)}</b>
                <i>{shortOdds(tier.count, product.issued)}</i>
              </div>
            ))}
          </div>
        </aside>
        <section className={`pr-play ${product.rule}`}>
          <span className="play-tab tab-l">{product.rule === "match3" ? "같은 금액 3개" : "숫자 대조"}</span>
          <span className="play-tab tab-r">GAME 01</span>
          <div className="play-columns">
            {product.rule === "lucky" && (
              <section className="play-column lucky-column">
                <strong className="column-label">행운숫자</strong>
                <div className="cell-grid lucky-cells">
                  {lucky.map((cell, index) => <div className="scratch-cell" key={`l-${index}`}><b className="luckynum">{cell.kind === "lucky" ? cell.number : ""}</b></div>)}
                </div>
              </section>
            )}
            <section className="play-column mine-column">
              <strong className="column-label">{product.rule === "match3" ? "금액 칸" : "나의 숫자"}</strong>
              <div className="cell-grid mine-cells" style={{ gridTemplateColumns: `repeat(${product.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${product.rows}, minmax(0, 1fr))` }}>
                {mine.map((cell, index) => (
                  <div className="scratch-cell" key={`m-${index}`}>
                    {cell.kind === "amount" ? <b className="cell-amount triple">{shortWon(product.prizes[cell.prizeIndex].prize)}</b>
                      : cell.kind === "mine" ? <><b className="mynum">{cell.number}</b><span className="cell-amount">{shortWon(product.prizes[cell.prizeIndex].prize)}</span></> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
        <footer className="pr-foot">
          <span>지급기한: 판매종료일로부터 1년 · {product.real ? "공시 확률표 기준 시뮬레이션" : "가상 등급"}</span>
          <span>NO. {product.id}-{ticket.ticketId.slice(-8).toUpperCase()}</span>
        </footer>
      </div>
      {!ticket.complete && <canvas ref={foilRef} className="foil-canvas" aria-label="긁기 영역" />}
    </div>
  );
}

declare global {
  interface Window {
    __lotteryScratch?: ScratchController;
  }
}
