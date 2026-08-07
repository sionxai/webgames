import { useEffect, useRef, useState } from 'react';
import { battleBackground, cardArt, enemyArt } from '../content/presentation';
import type { CardArt } from '../content/presentation';
import type { BattleCard, BattleState, Intent } from '../core/types';
import { previewHpDamage } from '../core/battle';
import { CardView, passiveText } from './CardView';
import { RulesPanel } from './RulesPanel';
import { Tooltip } from './Tooltip';

const statusHelp: Record<string, string> = {
  액: '받는 피해 +50%',
  넋나감: '주는 피해 −25%',
  부정: '턴 종료 시 피해(넋 무시)',
  정성: '주는 피해 +N, 전투 내내 유지',
  신명: '다음 턴 장단 +N',
};
const typeHelp: Record<string, string> = {
  신: '제약 없음',
  무구: '장착해 전투 내내 지속',
  굿: '턴당 1장',
  좌정: '동시 1개, 새로 내면 교체',
};

const ENEMY_HIT_VISIBLE_MS = 700;
const CARD_PLAY_VISIBLE_MS = 650;

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

function hpPercent(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, hp / maxHp * 100));
}

function HealthBar({ hp, maxHp, owner }: { hp: number; maxHp: number; owner: 'enemy' | 'player' }) {
  return <div className={`health-bar health-bar-${owner}`} aria-hidden="true">
    <span style={{ width: `${hpPercent(hp, maxHp)}%` }} />
  </div>;
}

function intentText(intent: Intent | undefined, battle: BattleState): string {
  if (!intent) return '행동 없음';
  if (intent.kind === 'attack') {
    return `공격 ${intent.amount} · 예상 명 -${previewHpDamage(battle.enemies[0], battle.player, intent.amount)}`;
  }
  if (intent.kind === 'block') return `넋 ${intent.amount}`;
  return `${intent.status} +${intent.amount}`;
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
  const [hit, setHit] = useState<EnemyHit | null>(null);
  const [playedCard, setPlayedCard] = useState<PlayedCard | null>(null);
  const enemyHp = useRef<EnemyHpSnapshot>({ enemyId: enemy.id, battleNumber, hp: enemy.hp });
  const hitKey = useRef(0);
  const playKey = useRef(0);
  const hitTimer = useRef<number | undefined>();
  const playTimer = useRef<number | undefined>();
  const portrait = enemyArt(enemy.id);
  const background = battleBackground(enemy.id);
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
  }, []);

  const play = (card: BattleCard, index: number) => {
    const snapshot = {
      name: card.name,
      cardType: card.cardType ?? '신',
      cost: Math.max(0, card.cost - battle.costReduction),
      art: cardArt(card.id),
    };
    onPlay(index);
    const key = ++playKey.current;
    if (playTimer.current !== undefined) window.clearTimeout(playTimer.current);
    setPlayedCard({ key, ...snapshot });
    playTimer.current = window.setTimeout(() => {
      setPlayedCard((value) => value?.key === key ? null : value);
    }, CARD_PLAY_VISIBLE_MS);
  };

  const statuses = (values: BattleState['player']['statuses']) =>
    <div className="statuses">{Object.entries(values).filter(([, value]) => value > 0).map(([name, value]) =>
      <button key={name} onClick={() => setTip({ title: name, text: statusHelp[name] })}>{name} {value}</button>)}</div>;
  return (
    <main className={`battle-main ${rulesPanelOpen ? 'rules-open' : ''}`}>
      <header><span>본풀이 · 다섯 굿</span><b>{battleNumber} / 5 전투</b></header>
      <section className={`enemy panel${background ? ' has-background' : ''}`}>
        {background && <img className="enemy-background" src={background} alt="" aria-hidden="true" />}
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
            <button className="intent" onClick={() => setTip({ title: '적 의도', text: '다음 턴에 적이 할 행동. 공격은 현재 넋·상태를 반영한 예상 피해' })}>
              다음 의도 <strong>{intentText(enemy.intents[enemy.intentIndex], battle)}</strong></button>
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
        <div><small>심방 · {battle.turn}번째 장단</small><h2>명 {battle.player.hp} / {battle.player.maxHp}</h2>
          <HealthBar hp={battle.player.hp} maxHp={battle.player.maxHp} owner="player" /></div>
        <div className="resources"><b>장단 {battle.energy} / {battle.maxEnergy}</b><span>넋 {battle.player.block}</span></div>
        {statuses(battle.player.statuses)}
      </section>
      <div className="piles"><span>덱 {battle.drawPile.length}</span><span>버림 {battle.discardPile.length}</span><span>소멸 {battle.exhaustPile.length}</span></div>
      <section className="hand" aria-label="손패">
        {battle.hand.map((card, index) => (
          <CardView key={card.id} card={card} stacks={card.bondGroup ? battle.playedMyths[card.bondGroup] ?? 0 : 0}
            displayedCost={Math.max(0, card.cost - battle.costReduction)}
            replacingInstalled={card.cardType === '좌정' && battle.installed !== null}
            disabled={Math.max(0, card.cost - battle.costReduction) > battle.energy ||
              battle.phase !== 'playerTurn' || (card.cardType === '굿' && battle.gutPlayedThisTurn)}
            onClick={() => play(card, index)}
            onTooltip={() => setTip({ title: card.name, text: `${typeHelp[card.cardType ?? '신']}${card.bondGroup ? ` · 연계: 같은 본풀이·계열 카드를 이미 낸 만큼 효과가 커집니다. 첫 장은 보너스 없음` : ''}` })} />
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
    </main>
  );
}
