import { useEffect, useRef, useState } from 'react';
import { battleBackground, cardArt, enemyArt } from '../content/presentation';
import type { CardArt } from '../content/presentation';
import type { BattleCard, BattleState, Effect, Intent } from '../core/types';
import { currentIntent, forecastTurnEnd, type TurnEndForecast } from '../core/battle';
import { CardDetailModal } from './CardDetailModal';
import { CardView, passiveText, previewEffects } from './CardView';
import { RulesPanel } from './RulesPanel';
import { Tooltip } from './Tooltip';

const statusHelp: Record<string, string> = {
  액: '받는 피해 +50%',
  넋나감: '주는 피해 −25%',
  부정: '턴 종료 시 피해(넋 무시)',
  정성: '주는 피해 +N, 전투 내내 유지',
  신명: '다음 턴 장단 +N',
};
const ENEMY_HIT_VISIBLE_MS = 700;
const CARD_PLAY_VISIBLE_MS = 650;

type FxKind = 'attack' | 'block' | 'special';

const FX_VISIBLE_MS: Record<FxKind, number> = {
  attack: 500,
  block: 600,
  special: 700,
};

type EnemyHpSnapshot = {
  enemyId: string;
  battleNumber: number;
  hp: number;
};

type EnemyHit = {
  key: number;
  amount: number;
  enemyId: string;
  battleNumber: number;
};

type PlayedCard = {
  key: number;
  name: string;
  cardType: string;
  cost: number;
  art: CardArt | undefined;
};

type DetailCard = {
  card: BattleCard;
  stacks: number;
  displayedCost: number;
};

function hpPercent(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, hp / maxHp * 100));
}

function fxKindOf(effects: readonly Effect[]): FxKind | null {
  if (effects.some((effect) => effect.kind === 'damage' || effect.kind === 'execute')) return 'attack';
  if (effects.some((effect) => effect.kind === 'block')) return 'block';
  if (effects.some((effect) => effect.kind === 'draw')) return 'special';
  return null;
}

function fxAmountOf(effects: readonly Effect[], kind: FxKind | null): number {
  if (kind === 'block') {
    for (const effect of effects) {
      if (effect.kind === 'block') return effect.amount;
    }
  }
  if (kind === 'special') {
    for (const effect of effects) {
      if (effect.kind === 'draw') return effect.amount;
    }
  }
  return 0;
}

function HealthBar({ hp, maxHp, owner }: { hp: number; maxHp: number; owner: 'enemy' | 'player' }) {
  return <div className={`health-bar health-bar-${owner}`} aria-hidden="true">
    <span style={{ width: `${hpPercent(hp, maxHp)}%` }} />
  </div>;
}

function intentLabel(intent: Intent | undefined): string {
  if (!intent) return '행동 없음';
  if (intent.kind === 'attack') return `공격 ${intent.amount}`;
  if (intent.kind === 'block') return `넋 ${intent.amount}`;
  return `${intent.status} +${intent.amount}`;
}

/** 예상값은 코어의 forecastTurnEnd 하나만 쓴다. 화면이 전투 공식을 다시 구현하지 않는다. */
function intentText(intent: Intent | undefined, forecast: TurnEndForecast): string {
  const label = intentLabel(intent);
  if (forecast.total <= 0) return label;
  // 공격 의도면 '예상 명', 그 외(넋·상태부여)에서 명이 줄면 원인이 턴 종료 부정이므로 그렇게 밝힌다.
  const prefix = intent?.kind === 'attack' ? '예상 명' : '턴 종료 예상 명';
  return `${label} · ${prefix} -${forecast.total}`;
}

/** 명이 줄어드는 원인이 둘 이상이거나 공격이 아닐 때만 내역을 덧붙인다. */
function intentBreakdown(forecast: TurnEndForecast): string | null {
  if (forecast.corruption <= 0) return null;
  const parts = [`부정 ${forecast.corruption}`];
  if (forecast.attack > 0) parts.push(`공격 ${forecast.attack}`);
  return parts.join(' + ');
}

export function BattleScreen({ battle, battleNumber, onPlay, onEndTurn, rulesPanelOpen, onToggleRules }: {
  battle: BattleState;
  battleNumber: number;
  onPlay: (index: number) => void;
  onEndTurn: () => void;
  rulesPanelOpen: boolean;
  onToggleRules: () => void;
}) {
  const enemy = battle.enemies[0];
  const [tip, setTip] = useState<{ title: string; text: string } | null>(null);
  const [detailCard, setDetailCard] = useState<DetailCard | null>(null);
  const [hit, setHit] = useState<EnemyHit | null>(null);
  const [playedCard, setPlayedCard] = useState<PlayedCard | null>(null);
  const [fx, setFx] = useState<{ key: number; kind: FxKind; amount: number } | null>(null);
  const enemyHp = useRef<EnemyHpSnapshot>({ enemyId: enemy.id, battleNumber, hp: enemy.hp });
  const hitKey = useRef(0);
  const playKey = useRef(0);
  const fxKey = useRef(0);
  const hitTimer = useRef<number | undefined>();
  const playTimer = useRef<number | undefined>();
  const fxTimer = useRef<number | undefined>();
  const portrait = enemyArt(enemy.id);
  const background = battleBackground(enemy.id);
  // 표시할 의도와 예상값은 전부 코어에서 받는다 — 화면이 인덱스나 피해 공식을 따로 계산하지 않는다.
  const intent = currentIntent(enemy);
  const forecast = forecastTurnEnd(battle);
  const breakdown = intentBreakdown(forecast);
  const activeHit = hit?.enemyId === enemy.id && hit.battleNumber === battleNumber ? hit : null;
  const hitClass = activeHit ? activeHit.key % 2 === 0 ? ' is-hit-b' : ' is-hit-a' : '';

  useEffect(() => {
    const previous = enemyHp.current;
    const current = { enemyId: enemy.id, battleNumber, hp: enemy.hp };
    enemyHp.current = current;
    if (previous.enemyId !== current.enemyId || previous.battleNumber !== current.battleNumber) {
      if (hitTimer.current !== undefined) window.clearTimeout(hitTimer.current);
      hitTimer.current = undefined;
      setHit(null);
      return;
    }
    if (previous.hp <= current.hp) return;
    const key = ++hitKey.current;
    if (hitTimer.current !== undefined) window.clearTimeout(hitTimer.current);
    setHit({ key, amount: previous.hp - current.hp, enemyId: current.enemyId, battleNumber: current.battleNumber });
    hitTimer.current = window.setTimeout(() => {
      setHit((value) => value?.key === key ? null : value);
    }, ENEMY_HIT_VISIBLE_MS);
  }, [battleNumber, enemy.hp, enemy.id]);

  useEffect(() => () => {
    if (hitTimer.current !== undefined) window.clearTimeout(hitTimer.current);
    if (playTimer.current !== undefined) window.clearTimeout(playTimer.current);
    if (fxTimer.current !== undefined) window.clearTimeout(fxTimer.current);
  }, []);

  const play = (card: BattleCard, index: number) => {
    const snapshot = {
      name: card.name,
      cardType: card.cardType ?? '신',
      cost: Math.max(0, card.cost - battle.costReduction),
      art: cardArt(card.id),
    };
    const stacks = card.bondGroup ? battle.playedMyths[card.bondGroup] ?? 0 : 0;
    const preview = previewEffects(card, stacks);
    const kind = fxKindOf(card.effects);
    const amount = fxAmountOf(preview, kind);
    onPlay(index);
    const playedKey = ++playKey.current;
    if (playTimer.current !== undefined) window.clearTimeout(playTimer.current);
    setPlayedCard({ key: playedKey, ...snapshot });
    playTimer.current = window.setTimeout(() => {
      setPlayedCard((value) => value?.key === playedKey ? null : value);
    }, CARD_PLAY_VISIBLE_MS);
    if (kind !== null) {
      const key = ++fxKey.current;
      if (fxTimer.current !== undefined) window.clearTimeout(fxTimer.current);
      setFx({ key, kind, amount });
      fxTimer.current = window.setTimeout(() => {
        setFx((value) => value?.key === key ? null : value);
      }, FX_VISIBLE_MS[kind]);
    }
  };

  const statuses = (values: BattleState['player']['statuses']) =>
    <div className="statuses">{Object.entries(values).filter(([, value]) => value > 0).map(([name, value]) =>
      <button key={name} onClick={() => setTip({ title: name, text: statusHelp[name] })}>{name} {value}</button>)}</div>;
  return (
    <main className={`battle-main ${rulesPanelOpen ? 'rules-open' : ''}`}>
      <header><span>본풀이 · 다섯 굿</span><b>{battleNumber} / 5 전투</b></header>
      <section className={`enemy panel${background ? ' has-background' : ''}`}>
        {background && <img className="enemy-background" src={background} alt="" aria-hidden="true" />}
        {fx?.kind === 'attack' && <div key={fx.key} className="battle-fx battle-fx-attack" data-fx="attack" aria-hidden="true" />}
        <div className={`enemy-layout${portrait ? ' has-portrait' : ''}${hitClass}`}>
          {portrait && <div className="enemy-portrait-slot">
            <div className="enemy-portrait-frame">
              <img src={portrait} alt="" aria-hidden="true" />
            </div>
            {activeHit && <span key={activeHit.key} className="enemy-damage" aria-hidden="true">-{activeHit.amount}</span>}
          </div>}
          <div className="enemy-details">
            <div><small>맞서는 신</small><h1>{enemy.name}</h1></div>
            <div className="vitals"><b>명 {enemy.hp} / {enemy.maxHp}</b><span>넋 {enemy.block}</span></div>
            <HealthBar hp={enemy.hp} maxHp={enemy.maxHp} owner="enemy" />
            {statuses(enemy.statuses)}
            <button className="intent" onClick={() => setTip({ title: '적 의도', text: '다음 턴에 적이 할 행동. 예상 명은 지금 턴을 끝냈을 때 실제로 줄어드는 명이며, 턴 종료 시 부정 피해와 넋 흡수까지 반영한 값입니다' })}>
              다음 의도 <strong>{intentText(intent, forecast)}</strong>
              {breakdown && <small className="intent-breakdown">{breakdown}</small>}</button>
            {!portrait && activeHit && <>
              <span key={activeHit.key} className="enemy-damage enemy-damage-fallback" aria-hidden="true">-{activeHit.amount}</span>
            </>}
          </div>
        </div>
      </section>
      <section className="piles" aria-label="지속 카드">
        <span>무구 {battle.equipped.length > 0 ? battle.equipped.map((card) => `${card.name} (${passiveText(card)})`).join(', ') : '없음'}</span>
        <span>좌정 {battle.installed ? `${battle.installed.name} (${passiveText(battle.installed)})` : '없음'}</span>
      </section>
      <section className="player panel">
        {fx?.kind === 'block' && <div key={fx.key} className="battle-fx battle-fx-block" data-fx="block" aria-hidden="true">넋 +{fx.amount}</div>}
        <div><small>심방 · {battle.turn}번째 장단</small><h2>명 {battle.player.hp} / {battle.player.maxHp}</h2>
          <HealthBar hp={battle.player.hp} maxHp={battle.player.maxHp} owner="player" /></div>
        <div className="resources"><b>장단 {battle.energy} / {battle.maxEnergy}</b><span>넋 {battle.player.block}</span></div>
        {statuses(battle.player.statuses)}
      </section>
      <div className="piles"><span>덱 {battle.drawPile.length}</span><span>버림 {battle.discardPile.length}</span><span>소멸 {battle.exhaustPile.length}</span></div>
      <section className="hand" aria-label="손패">
        {fx?.kind === 'special' && <div key={fx.key} className="battle-fx battle-fx-special" data-fx="special" aria-hidden="true">+{fx.amount} 뽑기</div>}
        {battle.hand.map((card, index) => (
          <CardView key={card.id} card={card} stacks={card.bondGroup ? battle.playedMyths[card.bondGroup] ?? 0 : 0}
            displayedCost={Math.max(0, card.cost - battle.costReduction)}
            replacingInstalled={card.cardType === '좌정' && battle.installed !== null}
            disabled={Math.max(0, card.cost - battle.costReduction) > battle.energy ||
              battle.phase !== 'playerTurn' || (card.cardType === '굿' && battle.gutPlayedThisTurn)}
            onClick={() => play(card, index)}
            onTooltip={() => setDetailCard({
              card,
              stacks: card.bondGroup ? battle.playedMyths[card.bondGroup] ?? 0 : 0,
              displayedCost: Math.max(0, card.cost - battle.costReduction),
            })} />
        ))}
      </section>
      <button className="end-turn" onClick={onEndTurn}>턴 종료</button>
      {playedCard && <div key={playedCard.key} className="card-play-overlay" aria-hidden="true">
        <div className={`played-card${playedCard.art ? ' has-art' : ''}`}>
          {playedCard.art && <img src={playedCard.art.src} alt="" aria-hidden="true" loading="lazy"
            style={playedCard.art.objectPosition ? { objectPosition: playedCard.art.objectPosition } : undefined} />}
          <span>{playedCard.cost}</span><small>{playedCard.cardType}</small><strong>{playedCard.name}</strong>
        </div>
      </div>}
      <RulesPanel open={rulesPanelOpen} onToggle={onToggleRules} />
      {tip && <Tooltip title={tip.title} onClose={() => setTip(null)}><p>{tip.text}</p></Tooltip>}
      {detailCard && <CardDetailModal card={detailCard.card} stacks={detailCard.stacks}
        displayedCost={detailCard.displayedCost} onClose={() => setDetailCard(null)} />}
    </main>
  );
}
