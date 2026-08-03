import type { Balance, LotterySave } from "../types";

type Props = {
  balance: Balance;
  state: LotterySave;
  onInvest(axis: number): void;
};

const effect = (axis: number, value: number, unit: string) => {
  if (axis === 1) return `제거율 ${value.toFixed(2)}`;
  if (axis === 2) return `적정 구간 폭 ${value}${unit}`;
  if (axis === 3) return `동시 ${value}${unit}`;
  return `반지름 ${value}${unit}`;
};

export default function ToolShop({ balance, state, onInvest }: Props) {
  const toolName = balance.scratch.tools[Math.min(state.upgrades[0], balance.scratch.tools.length - 1)].name;
  // 쓸 포인트가 없으면 접는다 — 490px짜리 패널이 늘 펼쳐져 있으면 판매대가 화면 밖으로 밀린다.
  const collapsed = state.skillPoints < 1;
  if (collapsed) {
    return (
      <section className="panel tool-shop collapsed">
        <div className="tool-shop-head">
          <h2>동전 · <strong>{toolName}</strong></h2>
          <b className="muted">레벨업 시 포인트 지급</b>
        </div>
      </section>
    );
  }
  return (
    <section className="panel tool-shop">
      <div className="tool-shop-head"><h2>동전 업그레이드</h2><b>{state.skillPoints} 포인트</b></div>
      <p className="equipped-tool">현재 장착 · <strong>{toolName}</strong></p>
      <div className="upgrade-list">
        {balance.upgrades.map((upgrade, axis) => {
          if (upgrade.locked) return null;
          const savedStage = state.upgrades[axis];
          const stage = Math.min(
            upgrade.values.length - 1,
            Math.max(0, Number.isInteger(savedStage) ? savedStage : 0),
          );
          const maxed = stage >= upgrade.values.length - 1;
          const next = upgrade.values[Math.min(stage + 1, upgrade.values.length - 1)];
          return (
            <article className="upgrade-card" key={upgrade.key}>
              <div><strong>{upgrade.name}</strong><span>{stage + 1} / {upgrade.values.length}단계</span></div>
              <p>현재 {effect(axis, upgrade.values[stage], upgrade.unit)}</p>
              <small>{maxed ? "최고 단계" : `다음 ${effect(axis, next, upgrade.unit)}`}</small>
              <button disabled={maxed || state.skillPoints < 1} onClick={() => onInvest(axis)}>
                {maxed ? "완료" : "1 포인트 투자"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
