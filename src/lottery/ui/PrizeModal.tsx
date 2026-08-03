import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { shortOdds } from "../balance";
import type { TicketProduct } from "../types";

type Props = {
  product: TicketProduct;
  /** 당첨 등위(1부터). 꽝이면 null. */
  rank: number | null;
  /** 이번 수령에서 빚으로 자동 상환될 금액 */
  autoRepay: number;
  onClaim(): void;
};

const money = (value: number) => `${Math.floor(value).toLocaleString()}원`;

/**
 * 당첨 결과 팝업.
 *
 * 스펙 §6.2 — **가짜 기대 연출은 넣지 않는다.** 지연 공개도, 드럼롤도, "아깝다!"도 없다.
 * 완주하는 즉시 사실을 그대로 띄운다. 화려함은 **실제 당첨 크기에만** 비례한다.
 */
export default function PrizeModal({ product, rank, autoRepay, onClaim }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tier = rank ? product.prizes[rank - 1] : null;
  const prize = tier?.prize ?? 0;
  // 등위가 높을수록(=희귀할수록) 연출이 커진다. 최하위 등위는 조용하다.
  const grade = !tier ? "none" : rank! <= 2 ? "jackpot" : rank! <= product.prizes.length - 2 ? "big" : "small";

  useEffect(() => { buttonRef.current?.focus(); }, []);

  useEffect(() => {
    if (grade === "none" || grade === "small") return;
    const burst = (particles: number, spread: number, y: number) =>
      confetti({ particleCount: particles, spread, origin: { y }, disableForReducedMotion: true });
    burst(grade === "jackpot" ? 140 : 60, grade === "jackpot" ? 90 : 60, 0.55);
    if (grade !== "jackpot") return;
    const again = window.setTimeout(() => burst(90, 120, 0.6), 260);
    return () => window.clearTimeout(again);
  }, [grade]);

  return (
    <div className="prize-modal" role="dialog" aria-modal="true" aria-labelledby="prize-headline">
      <div className={`prize-sheet ${grade}`} data-testid="prize-modal">
        <p className="prize-eyebrow">{product.name} · {product.kind}</p>
        {tier ? (
          <>
            <p className="prize-rank">{rank}등 당첨</p>
            <strong className="prize-amount" id="prize-headline">{money(prize)}</strong>
            {/* 티켓 당첨금 안내와 같은 포맷을 써야 한다 — 반올림하면 1/3.3이 1/3으로 보인다 */}
            <p className="prize-odds">이 등위 확률 {shortOdds(tier.count, product.issued)}</p>
            {autoRepay > 0 && (
              <p className="prize-repay">빚 자동 상환 {money(autoRepay)} · 실수령 {money(prize - autoRepay)}</p>
            )}
          </>
        ) : (
          <>
            <strong className="prize-amount lose" id="prize-headline">꽝</strong>
            <p className="prize-odds">노동의 숙련도는 남았습니다.</p>
          </>
        )}
        <button ref={buttonRef} id="claim-prize" className="prize-claim" onClick={onClaim}>
          {tier ? "당첨금 수령" : "확인"}
        </button>
      </div>
    </div>
  );
}
