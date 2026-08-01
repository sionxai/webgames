import type { Balance, TicketPrice } from "../types";

type Props = { balance: Balance; onChange(next: Balance): void };
const prices: TicketPrice[] = [500, 1000, 2000, 5000, 10000];

export default function TuningPanel({ balance, onChange }: Props) {
  const set = (key: "seedCash" | "loanUpfrontInterest" | "autoRepayRate", value: number) => onChange({ ...balance, [key]: value });
  return (
    <aside className="panel tuning" data-testid="tuning-panel">
      <h2>실시간 튜닝</h2>
      <label>시드 <input id="tune-seed" type="number" value={balance.seedCash} onChange={(event) => set("seedCash", Number(event.target.value))} /></label>
      <label>선이자 <input id="tune-interest" type="number" min="0" max="0.9" step="0.01" value={balance.loanUpfrontInterest} onChange={(event) => set("loanUpfrontInterest", Number(event.target.value))} /></label>
      <label>자동 상환 <input type="number" min="0" max="1" step="0.01" value={balance.autoRepayRate} onChange={(event) => set("autoRepayRate", Number(event.target.value))} /></label>
      {prices.map((price) => (
        <label key={price}>{price.toLocaleString()}원 XP 계수
          <input id={`tune-factor-${price}`} type="number" value={balance.masteryFactors[price]}
            onChange={(event) => onChange({ ...balance, masteryFactors: { ...balance.masteryFactors, [price]: Number(event.target.value) } })} />
        </label>
      ))}
    </aside>
  );
}
