import { useRef } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { cardArt } from '../content/presentation';
import { BOND_STACK_CAP } from '../core/battle';
import type { BattleCard, CardType, Effect } from '../core/types';

const frameColors: Record<CardType, string> = {
  신: '#397bb1',
  무구: '#b94438',
  굿: '#d0a92e',
  좌정: '#e7e0d5',
};

const statusName = (effect: Extract<Effect, { kind: 'applyStatus' }>) =>
  `${effect.status} +${effect.amount}${effect.target === 'self' ? ' (나)' : effect.target === 'allEnemies' ? ' (전체)' : ''}`;

export function effectText(effect: Effect): string {
  if (effect.kind === 'damage') return `피해 ${effect.amount}${effect.target === 'allEnemies' ? ' (전체)' : ''}`;
  if (effect.kind === 'execute') return `명 ${effect.thresholdHp} 이하 처형 · 실패 시 피해 ${effect.amount}`;
  if (effect.kind === 'block') return `넋 ${effect.amount}`;
  if (effect.kind === 'draw') return `${effect.amount}장 뽑기`;
  if (effect.kind === 'gainEnergy') return `장단 +${effect.amount}`;
  if (effect.kind === 'heal') return `명 ${effect.amount} 회복`;
  if (effect.kind === 'applyStatus') return statusName(effect);
  if (effect.kind === 'tutor') return `${effect.cardType ?? effect.bondGroup ?? '카드'} 찾기`;
  if (effect.kind === 'recover') return `최근 버림 ${effect.amount}장 회수`;
  if (effect.kind === 'costReduction') return `이번 턴 비용 -${effect.amount}`;
  if (effect.kind === 'transferStatus') return `${effect.status} 전이`;
  if (effect.kind === 'cleanse') return `${effect.statuses.join('·')} 정화`;
  if (effect.kind === 'blockToDamage') return `넋의 ${effect.percent}% 피해`;
  if (effect.kind === 'cancelIntent') return '다음 의도 취소';
  return '다음 카드 복제';
}

export function passiveText(card: BattleCard): string {
  const value = card.passive;
  if (!value) return '';
  if (value.kind === 'turnStart') return `턴 시작: ${value.effects.map(effectText).join(' · ')}`;
  if (value.kind === 'drawBonus') return `매 턴 뽑기 +${value.amount}`;
  if (value.kind === 'energyBonus') return `매 턴 장단 +${value.amount}`;
  if (value.kind === 'flatDamageBonus') return `주는 피해 +${value.amount}`;
  return `${value.status} 대상 피해 +${value.percent}%`;
}

export function previewEffects(card: BattleCard, stacks: number): Effect[] {
  const bonus = (card.bond?.perStack ?? 0) * Math.min(stacks, BOND_STACK_CAP);
  let applied = false;
  return card.effects.map((effect) => {
    const matches = card.bond?.applyTo === 'block'
      ? effect.kind === 'block'
      : card.bond?.applyTo === 'damage' && (effect.kind === 'damage' || effect.kind === 'execute');
    if (!matches || applied) return effect;
    applied = true;
    if (effect.kind === 'block' || effect.kind === 'damage' || effect.kind === 'execute') {
      return { ...effect, amount: effect.amount + bonus };
    }
    return effect;
  });
}

type Props = {
  card: BattleCard;
  stacks?: number;
  disabled?: boolean;
  displayedCost?: number;
  replacingInstalled?: boolean;
  onClick?: () => void;
  onTooltip?: () => void;
};

export function CardView({ card, stacks = 0, disabled = false, displayedCost = card.cost, replacingInstalled = false, onClick, onTooltip }: Props) {
  const bonus = (card.bond?.perStack ?? 0) * Math.min(stacks, BOND_STACK_CAP);
  const art = cardArt(card.id);
  const frameStyle = { '--frame': frameColors[card.cardType ?? '신'] } as CSSProperties;
  const timer = useRef<number | undefined>();
  const longPressed = useRef(false);
  const stopTimer = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!onTooltip) return;
    longPressed.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    timer.current = window.setTimeout(() => { longPressed.current = true; onTooltip(); }, 400);
  };
  const click = () => { if (!longPressed.current && !disabled) onClick?.(); longPressed.current = false; };
  const summary = card.passive ? passiveText(card) : previewEffects(card, stacks).map(effectText).join(' · ');
  return (
    <button className={`card card-${card.cardType ?? '신'} card-${card.id.length % 5}${art ? ' has-art' : ''}`} style={frameStyle} aria-disabled={disabled}
      aria-label={`${card.name}, ${card.cardType ?? '신'}, 비용 ${displayedCost}, ${summary}`}
      onPointerDown={pointerDown} onPointerUp={stopTimer} onPointerCancel={stopTimer} onClick={click}>
      {art && <img className="card-art" src={art.src} alt="" aria-hidden="true" loading="lazy"
        style={art.objectPosition ? { objectPosition: art.objectPosition } : undefined} />}
      <span className="card-cost">{displayedCost}</span>
      <span className="card-type" role={onTooltip ? 'button' : undefined} tabIndex={onTooltip ? 0 : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { if (onTooltip) { event.stopPropagation(); onTooltip(); } }}
        onKeyDown={(event) => { if (onTooltip && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onTooltip(); } }}>
        {card.cardType ?? '신'}
      </span>
      <strong>{card.name}</strong>
      {card.bondGroup && <small>{card.bondGroup}</small>}
      <span className="card-effects">{summary}</span>
      {replacingInstalled && <em>기존 좌정 교체</em>}
      {card.bond && <em>연계 {card.bond.applyTo === 'damage' ? '피해' : '넋'} +{card.bond.perStack}{bonus > 0 ? ` → 이번 +${bonus}` : ''}</em>}
    </button>
  );
}
