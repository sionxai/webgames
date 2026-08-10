import { useState } from 'react';
import { cardDetail } from '../content/cardDetails';
import { cardArt } from '../content/presentation';
import type { BattleCard } from '../core/types';
import { effectText, passiveText, previewEffects } from './CardView';
import { Tooltip } from './Tooltip';

const typeRule = {
  신: '제약 없이 사용',
  무구: '장착하면 전투 내내 지속',
  굿: '한 턴에 1장만 사용',
  좌정: '동시에 1개만 유지',
} as const;

export function CardDetailModal({ card, onClose, stacks = 0, displayedCost = card.cost }: {
  card: BattleCard;
  onClose: () => void;
  stacks?: number;
  displayedCost?: number;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const detail = cardDetail(card.id);
  const art = cardArt(card.id);
  const summary = card.passive ? passiveText(card) : previewEffects(card, stacks).map(effectText).join(' · ');
  const type = card.cardType ?? '신';
  const bonus = card.bond ? card.bond.perStack * Math.min(stacks, 3) : 0;
  const connection = card.bondGroup
    ? `${card.bondGroup} · 먼저 낸 같은 계열 카드 수에 따라 ${card.bond?.applyTo === 'block' ? '넋' : '피해'} +${card.bond?.perStack ?? 0}${bonus > 0 ? ` (현재 +${bonus})` : ''}`
    : '연계 없음';

  if (!detail) {
    return <Tooltip title={card.name} onClose={onClose}>
      <p>{type} · 비용 {displayedCost}</p><p>{summary}</p>
    </Tooltip>;
  }

  return <Tooltip title={card.name} onClose={onClose}
    className={`card-detail-modal card-detail-theme-${detail.theme}`}>
    <div className="card-detail-layout">
      <section className="card-detail-previews" aria-label={`${card.name} 카드 ${side === 'front' ? '앞면' : '뒷면'}`}>
        <div className={`card-detail-face is-${side}`}>
          {side === 'front' ? art
            ? <img src={art.src} alt={`${card.name} 카드 그림`}
              style={art.objectPosition ? { objectPosition: art.objectPosition } : undefined} />
            : <div className="card-detail-art-missing">{card.name}</div>
            : <img src="/assets/bonpuri/cards/card-back.webp" alt="본풀이 카드 공통 뒷면" />}
        </div>
        <div className="card-detail-side-toggle" aria-label="카드 면 선택">
          <button type="button" aria-pressed={side === 'front'} onClick={() => setSide('front')}>앞면</button>
          <button type="button" aria-pressed={side === 'back'} onClick={() => setSide('back')}>뒷면</button>
        </div>
      </section>
      <div className="card-detail-copy">
        <div className="card-detail-facts">
          <span>{type}</span><span>비용 {displayedCost}</span><span>{typeRule[type]}</span>
        </div>
        <section><h2>실제 효과</h2><p>{summary}</p><small>{connection}</small></section>
        <section><h2>짧은 이야기</h2><p>{detail.story}</p></section>
        <section><h2>배경</h2><p>{detail.background}</p></section>
        <section className="card-detail-tip"><h2>운용 팁</h2><p>{detail.tip}</p></section>
        <section className="card-detail-motif"><h2>그림 모티프</h2><p>{detail.motif}</p></section>
      </div>
    </div>
  </Tooltip>;
}
