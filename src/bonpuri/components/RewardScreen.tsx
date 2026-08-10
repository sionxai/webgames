import { useState } from 'react';
import type { BattleCard } from '../core/types';
import type { RewardOffer, RemovalSummary } from '../run/miniRun';
import { CardDetailModal } from './CardDetailModal';
import { CardView } from './CardView';

export function RewardScreen({ rewards, hp, onChoose, onSkip }: {
  rewards: RewardOffer[];
  hp: number;
  onChoose: (index: number) => void;
  onSkip: () => void;
}) {
  const [tip, setTip] = useState<BattleCard | null>(null);
  const preview = rewards[0]?.rewardPreview;
  const formatCardRemovals = (removals: readonly RemovalSummary[]) => removals.length === 0
    ? '기본 카드 없음 · 덱 유지'
    : `${removals.map((item) => `${item.name} ${item.count}`).join(' · ')}이 빠집니다`;
  const formatCleanseRemovals = (removals: readonly RemovalSummary[]) => removals.length === 0
    ? '기본 카드 없음 · 덱 유지'
    : `${removals.map((item) => `${item.name} ${item.count}장`).join(' · ')} 제거`;
  return <main className="centered reward-screen">
    <header><span>굿을 마쳤다</span><b>명 {hp} / 70</b></header>
    <h1>새 신격을 모실까요?</h1>
    <p>카드 3장을 교체하거나, 정화하며 덱을 압축하세요.</p>
    <p className="panel">현재 덱 {preview?.deckSize ?? '—'}장 · 카드 선택 후 {preview?.deckSize ?? '—'}장 유지<br />
      {rewards.length > 0 ? `${rewards[0].name} 3장이 들어오고, ${formatCardRemovals(preview?.cardRemovals ?? [])}` : '보상 없음'}</p>
    <section className="rewards">{rewards.map((card, index) =>
      <div key={card.id}>
        <CardView card={card} onClick={() => onChoose(index)} onTooltip={() => setTip(card)} />
        <p>{card.name} 3장 교체 · {formatCardRemovals(card.rewardPreview?.cardRemovals ?? [])}</p>
      </div>)}</section>
    <button className="skip" onClick={onSkip}>건너뛰고 정화하기 — 명 8 회복 · {formatCleanseRemovals(preview?.cleanseRemovals ?? [])}</button>
    {tip && <CardDetailModal card={tip} onClose={() => setTip(null)} />}
  </main>;
}
