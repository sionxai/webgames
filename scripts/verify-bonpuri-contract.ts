import { applyDamage, currentIntent, drawCards, endTurn, forecastTurnEnd, playCard, previewHpDamage, runEnemyTurn, startBattle, startPlayerTurn } from '../src/bonpuri/core/battle';
import { createStartingDeck } from '../src/bonpuri/core/cards';
import { createTestEnemy, emptyStatuses } from '../src/bonpuri/core/enemies';
import { shuffle, type Rng } from '../src/bonpuri/core/rng';
import type { BattleCard, BattleState, Combatant, Enemy } from '../src/bonpuri/core/types';
import { rewardCards } from '../src/bonpuri/content/cards';
import { getAscensionModifier, MAX_ASCENSION } from '../src/bonpuri/content/ascension';
import { chooseReward, offerRewards, skipReward, startMiniRun, type MiniRunState } from '../src/bonpuri/run/miniRun';
import { miniRunEnemies } from '../src/bonpuri/content/enemies';
import {
  calculateCompletedProfile,
  completeRunFailClosed,
  createDefaultProfile,
  drawBonpuriPack,
  isBonpuriProfile,
  loadProfile,
  nextAscensionUnlocked,
  saveProfile,
  validateStartingDeck,
  type BonpuriProfile,
  type StorageAdapter,
} from '../src/bonpuri/services/profile';
import {
  backupProfile, canonicalProfileJson, classifyOwner, isMeaningfulProfile, isSupportedEnvelope,
  MAX_CLOUD_PAYLOAD_LENGTH, parseCloudPayload, PROFILE_BACKUP_KEY, PROFILE_META_KEY,
  readBackup, readMeta, restoreBackup, sameProfile, summarizeProfile, writeMeta,
  type ProfileMeta, type ProfileOwner,
} from '../src/bonpuri/services/cloudProfile';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}

function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const fixedRng: Rng = () => 0.5;

function baseState(): BattleState {
  return startBattle([createTestEnemy()], fixedRng);
}

function withCard(state: BattleState, card: BattleCard, energy = 3): BattleState {
  return { ...state, hand: [card], drawPile: [], discardPile: [], energy };
}

const attackCard: BattleCard = {
  id: 'test-attack',
  name: '시험 공격',
  cost: 1,
  effects: [{ kind: 'damage', amount: 6, target: 'enemy' }],
  exhaust: false,
};

const tests: Array<[string, () => void]> = [
  ['1 시작 덱 구성', () => {
    const counts = createStartingDeck().reduce<Record<string, number>>((result, card) => {
      result[card.name] = (result[card.name] ?? 0) + 1;
      return result;
    }, {});
    equal(counts, { 신칼: 25, 넋가림: 20, '사설 풀기': 5 }, '매수');
    assert(createStartingDeck().length === 50, '총 50장');
  }],
  ['2 전투 시작 상태', () => {
    const state = baseState();
    equal([state.hand.length, state.drawPile.length, state.energy, state.player.hp, state.player.block], [7, 43, 3, 70, 0], '시작 상태');
  }],
  ['3 턴 시작 넋 소멸', () => {
    const state = { ...baseState(), player: { ...baseState().player, block: 20 }, hand: [] };
    assert(startPlayerTurn(state, fixedRng).player.block === 0, '넋이 0이어야 함');
  }],
  ['4 신명 소비', () => {
    const state = baseState();
    state.player.statuses.신명 = 2;
    const next = startPlayerTurn(state, fixedRng);
    equal([next.energy, next.player.statuses.신명], [5, 0], '신명');
  }],
  ['5 장단 부족 완전 무변경', () => {
    const state = withCard(baseState(), { ...attackCard, cost: 4 }, 3);
    const before = JSON.stringify(state);
    const next = playCard(state, 0, 'test-enemy', fixedRng);
    assert(JSON.stringify(next) === before && JSON.stringify(state) === before, '깊은 동등 실패');
  }],
  ['6 피해 계산 내림 순서', () => {
    const state = withCard(baseState(), attackCard);
    state.player.statuses.정성 = 3;
    state.player.statuses.넋나감 = 1;
    state.enemies[0].statuses.액 = 1;
    const next = playCard(state, 0, 'test-enemy', fixedRng);
    assert(next.enemies[0].hp === state.enemies[0].hp - 9, '피해 9가 아님');
  }],
  ['7 넋 흡수', () => {
    const state = withCard(baseState(), attackCard);
    state.enemies[0].block = 4;
    const next = playCard(state, 0, 'test-enemy', fixedRng);
    equal([next.enemies[0].block, next.enemies[0].hp], [0, state.enemies[0].hp - 2], '넋 흡수');
  }],
  ['8 부정 직접 피해', () => {
    const state = baseState();
    state.player.block = 10;
    state.player.statuses.부정 = 3;
    state.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    const next = endTurn(state, fixedRng);
    equal([next.player.hp, next.player.block, next.player.statuses.부정], [67, 0, 2], '부정');
  }],
  ['9 감소 상태 정확히 1', () => {
    const state = baseState();
    state.player.statuses = { ...emptyStatuses(), 액: 1, 넋나감: 2, 부정: 1 };
    state.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    const next = endTurn(state, fixedRng);
    equal([next.player.statuses.액, next.player.statuses.넋나감, next.player.statuses.부정], [0, 1, 0], '감소');
  }],
  ['10 정성 유지', () => {
    const state = baseState();
    state.player.statuses.정성 = 4;
    state.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    assert(endTurn(state, fixedRng).player.statuses.정성 === 4, '정성 감소');
  }],
  ['11 소멸 더미', () => {
    const card = createStartingDeck().find((candidate) => candidate.name === '사설 풀기')!;
    const next = playCard(withCard(baseState(), card), 0, undefined, fixedRng);
    assert(next.exhaustPile.some((candidate) => candidate.id === card.id), '소멸 더미에 없음');
    assert(!next.discardPile.some((candidate) => candidate.id === card.id), '버림 더미에 있음');
  }],
  ['12 버림 셔플 보충과 드로우 중단', () => {
    const cards = createStartingDeck().slice(0, 2);
    const state = { ...baseState(), hand: [], drawPile: [], discardPile: cards };
    const next = drawCards(state, 5, fixedRng);
    equal([next.hand.length, next.drawPile.length, next.discardPile.length], [2, 0, 0], '드로우');
  }],
  ['13 Fisher–Yates 호출 수', () => {
    let calls = 0;
    const result = shuffle([1, 2, 3, 4, 5], () => { calls += 1; return 0.5; });
    equal([calls, result.rngCalls], [4, 4], 'RNG 호출');
    assert(shuffle([1], fixedRng).rngCalls === 0, '길이 1 호출');
  }],
  ['14 같은 시드 결정성', () => {
    const first = endTurn(startBattle([createTestEnemy()], seeded(7)), seeded(11));
    const second = endTurn(startBattle([createTestEnemy()], seeded(7)), seeded(11));
    assert(JSON.stringify(first) === JSON.stringify(second), '상태 불일치');
  }],
  ['15 엔진 함수 입력 불변', () => {
    const attacker: Combatant = { id: 'a', name: 'a', hp: 10, maxHp: 10, block: 0, statuses: emptyStatuses() };
    const target: Combatant = { id: 't', name: 't', hp: 10, maxHp: 10, block: 2, statuses: emptyStatuses() };
    const targetBefore = JSON.stringify(target);
    applyDamage(attacker, target, 4);
    assert(JSON.stringify(target) === targetBefore, 'Combatant 입력 변형');
    const drawState = baseState();
    const drawBefore = JSON.stringify(drawState);
    drawCards(drawState, 2, fixedRng);
    assert(JSON.stringify(drawState) === drawBefore, 'drawCards 입력 변형');
    const functions: Array<(state: BattleState) => unknown> = [
      (state) => startPlayerTurn(state, fixedRng),
      (state) => playCard(withCard(state, attackCard), 0, 'test-enemy', fixedRng),
      (state) => runEnemyTurn({ ...state, phase: 'enemyTurn' }),
      (state) => endTurn(state, fixedRng),
    ];
    for (const fn of functions) {
      const state = baseState();
      const before = JSON.stringify(state);
      fn(state);
      assert(JSON.stringify(state) === before, 'BattleState 입력 변형');
    }
    const enemies: Enemy[] = [createTestEnemy()];
    const before = JSON.stringify(enemies);
    startBattle(enemies, fixedRng);
    assert(JSON.stringify(enemies) === before, '적 입력 변형');
  }],
  ['16 즉시 승패', () => {
    const winning = withCard(baseState(), { ...attackCard, effects: [{ kind: 'damage', amount: 99, target: 'enemy' }] });
    assert(playCard(winning, 0, 'test-enemy', fixedRng).phase === 'won', '승리 아님');
    const losing = baseState();
    losing.player.hp = 1;
    losing.enemies[0].block = 8;
    const attackLoss = runEnemyTurn({ ...losing, phase: 'enemyTurn' });
    assert(attackLoss.phase === 'lost', '패배 아님');
    assert(attackLoss.enemies[0].block === 0, '치명 공격 전 적 넋 초기화 미반영');
    const playerCorruption = baseState();
    playerCorruption.player.hp = 1;
    playerCorruption.player.statuses.부정 = 2;
    const corruptionLoss = endTurn(playerCorruption, fixedRng);
    assert(corruptionLoss.phase === 'lost', '플레이어 부정 패배 아님');
    assert(corruptionLoss.player.statuses.부정 === 2, '플레이어 부정 후속 감소');
    const enemyCorruption = baseState();
    enemyCorruption.enemies[0].hp = 1;
    enemyCorruption.enemies[0].statuses.부정 = 2;
    enemyCorruption.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    const corruptionWin = runEnemyTurn({ ...enemyCorruption, phase: 'enemyTurn' });
    assert(corruptionWin.phase === 'won', '적 부정 승리 아님');
    assert(corruptionWin.enemies[0].statuses.부정 === 2, '적 부정 후속 감소');
  }],
  ['17 수치 음수 방지', () => {
    const state = withCard(baseState(), {
      id: 'negative', name: '음수 방지', cost: 3, exhaust: false,
      effects: [
        { kind: 'gainEnergy', amount: -99 },
        { kind: 'block', amount: -99 },
        { kind: 'heal', amount: -99 },
        { kind: 'applyStatus', status: '액', amount: -99, target: 'self' },
      ],
    });
    const next = playCard(state, 0, undefined, fixedRng);
    assert(next.energy >= 0 && next.player.hp >= 0 && next.player.block >= 0, '기본 수치 음수');
    assert(Object.values(next.player.statuses).every((value) => value >= 0), '상태 음수');
  }],
  ['18 유효 대상 없으면 완전 거부', () => {
    const state = withCard(baseState(), {
      id: 'targeted', name: '대상 필요', cost: 1, exhaust: false,
      effects: [{ kind: 'damage', amount: 6, target: 'enemy' }],
    });
    const snapshot = JSON.stringify(state);
    // 대상 미지정 → 장단만 날아가지 않고 완전 거부
    assert(JSON.stringify(playCard(state, 0, undefined, fixedRng)) === snapshot, '대상 미지정인데 상태 변함');
    // 이미 죽은 적을 지정 → 마찬가지로 완전 거부
    const deadState = { ...state, enemies: state.enemies.map((enemy) => ({ ...enemy, hp: 0 })) };
    const deadSnapshot = JSON.stringify(deadState);
    assert(
      JSON.stringify(playCard(deadState, 0, state.enemies[0].id, fixedRng)) === deadSnapshot,
      '죽은 대상 지정인데 상태 변함',
    );
    // 살아있는 적을 정상 지정하면 당연히 적용된다 (거부가 과잉이 아님을 확인)
    const hit = playCard(state, 0, state.enemies[0].id, fixedRng);
    assert(hit.enemies[0].hp < state.enemies[0].hp, '정상 대상인데 피해 없음');
  }],
  ['19 연계 누적 순서', () => {
    const bonded: BattleCard = {
      id: 'bonded', name: '연계 시험', cost: 0, exhaust: false, bondGroup: '시험본풀이',
      bond: { applyTo: 'damage', perStack: 3 },
      effects: [{ kind: 'damage', amount: 5, target: 'enemy' }],
    };
    let state = baseState();
    state.enemies[0].hp = 100;
    state.enemies[0].maxHp = 100;
    state.hand = [bonded, { ...bonded, id: 'bonded-2' }, { ...bonded, id: 'bonded-3' }];
    const hp = state.enemies[0].hp;
    state = playCard(state, 0, 'test-enemy', fixedRng);
    equal([hp - state.enemies[0].hp, state.playedMyths.시험본풀이], [5, 1], '첫 장');
    const afterFirst = state.enemies[0].hp;
    state = playCard(state, 0, 'test-enemy', fixedRng);
    equal([afterFirst - state.enemies[0].hp, state.playedMyths.시험본풀이], [8, 2], '두 번째');
    const afterSecond = state.enemies[0].hp;
    state = playCard(state, 0, 'test-enemy', fixedRng);
    equal([afterSecond - state.enemies[0].hp, state.playedMyths.시험본풀이], [11, 3], '세 번째');
  }],
  ['20 해당 효과 없는 연계', () => {
    const state = withCard(baseState(), {
      id: 'unused-bond', name: '빈 연계', cost: 0, exhaust: false, bondGroup: '빈본풀이',
      bond: { applyTo: 'damage', perStack: 99 }, effects: [{ kind: 'block', amount: 4 }],
    });
    state.playedMyths.빈본풀이 = 2;
    const next = playCard(state, 0, undefined, fixedRng);
    equal([next.player.block, next.playedMyths.빈본풀이], [4, 3], '보너스 폐기');
  }],
  ['21 처형 성공과 실패', () => {
    const execute: BattleCard = {
      id: 'execute', name: '처형', cost: 0, exhaust: false,
      effects: [{ kind: 'execute', thresholdHp: 10, amount: 15, target: 'enemy' }],
    };
    const success = withCard(baseState(), execute);
    success.enemies[0].hp = 9;
    success.enemies[0].maxHp = 30;
    success.enemies[0].block = 99;
    const killed = playCard(success, 0, 'test-enemy', fixedRng);
    equal([killed.enemies[0].hp, killed.enemies[0].block, killed.phase], [0, 99, 'won'], '즉사');
    const failure = withCard(baseState(), execute);
    failure.enemies[0].hp = 30;
    failure.enemies[0].maxHp = 30;
    failure.enemies[0].block = 4;
    failure.player.statuses.정성 = 1;
    const damaged = playCard(failure, 0, 'test-enemy', fixedRng);
    equal([damaged.enemies[0].hp, damaged.enemies[0].block], [18, 0], '실패 피해 공식');
  }],
  ['21-1 처형 연계는 실패 피해에만 적용', () => {
    const execute: BattleCard = {
      id: 'bond-execute', name: '강림차사 시험', cost: 0, exhaust: false, bondGroup: '차사본풀이',
      bond: { applyTo: 'damage', perStack: 5 },
      effects: [{ kind: 'execute', thresholdHp: 10, amount: 15, target: 'enemy' }],
    };
    const state = withCard(baseState(), execute);
    state.playedMyths.차사본풀이 = 2;
    state.enemies[0].hp = 31;
    state.enemies[0].maxHp = 100;
    const next = playCard(state, 0, 'test-enemy', fixedRng);
    equal([next.enemies[0].hp, next.playedMyths.차사본풀이], [6, 3], 'amount +10');
    assert(execute.effects[0].kind === 'execute' && execute.effects[0].thresholdHp === 10, 'thresholdHp 변형');
  }],
  ['22 전투 시작 연계 초기화', () => {
    equal(startBattle([createTestEnemy()], fixedRng).playedMyths, {}, 'playedMyths');
  }],
  ['23 예시 카드와 적 표 일치', () => {
    assert(rewardCards.length === 42, 'B2.5 보상 카드 42종');
    equal(miniRunEnemies.map(({ id: _id, block: _block, statuses: _statuses, intentIndex: _index, ...enemy }) => enemy), [
      { name: '잡귀', hp: 22, maxHp: 22, intents: [{ kind: 'attack', amount: 7 }, { kind: 'block', amount: 5 }] },
      { name: '물귀신', hp: 28, maxHp: 28, intents: [{ kind: 'attack', amount: 5 }, { kind: 'applyStatus', status: '넋나감', amount: 1 }, { kind: 'attack', amount: 9 }] },
      { name: '제주 영감신', hp: 34, maxHp: 34, intents: [{ kind: 'attack', amount: 11 }, { kind: 'applyStatus', status: '부정', amount: 2 }] },
      { name: '굴뱀', hp: 45, maxHp: 45, intents: [{ kind: 'attack', amount: 6 }, { kind: 'applyStatus', status: '액', amount: 2 }, { kind: 'attack', amount: 14 }] },
      { name: '제주 구삼승할망', hp: 70, maxHp: 70, intents: [{ kind: 'applyStatus', status: '부정', amount: 3 }, { kind: 'attack', amount: 12 }, { kind: 'block', amount: 10 }, { kind: 'attack', amount: 18 }] },
    ], '적 5종');
  }],
  ['24 턴 장단 최대치와 공격 예상 피해', () => {
    const state = baseState();
    state.player.statuses.신명 = 2;
    const inspired = startPlayerTurn(state, fixedRng);
    equal([inspired.energy, inspired.maxEnergy, inspired.player.statuses.신명], [5, 5, 0], '신명 장단 최대');
    const attacker: Combatant = {
      id: 'attacker', name: '공격자', hp: 20, maxHp: 20, block: 0,
      statuses: { ...emptyStatuses(), 정성: 3, 넋나감: 1 },
    };
    const target: Combatant = {
      id: 'target', name: '대상', hp: 20, maxHp: 20, block: 4,
      statuses: { ...emptyStatuses(), 액: 1 },
    };
    assert(previewHpDamage(attacker, target, 6) === 5, '예상 피해 순서/넋 흡수 오류');
    equal(target, {
      id: 'target', name: '대상', hp: 20, maxHp: 20, block: 4,
      statuses: { ...emptyStatuses(), 액: 1 },
    }, '예상 피해 입력 불변');
  }],
  ['25 카드 42종 계약', () => {
    const normalized = rewardCards.map(({ name, cardType, cost, effects, passive, bondGroup, bond }) =>
      ({ name, cardType, cost, effects, passive, bondGroup, bond }));
    equal(normalized, [
      { name:'자청비',cardType:'신',cost:2,effects:[{kind:'damage',amount:14,target:'enemy'}],passive:undefined,bondGroup:'세경본풀이',bond:{applyTo:'damage',perStack:3} },
      { name:'문도령',cardType:'신',cost:1,effects:[{kind:'block',amount:6},{kind:'applyStatus',status:'정성',amount:1,target:'self'}],passive:undefined,bondGroup:'세경본풀이',bond:{applyTo:'block',perStack:2} },
      { name:'정수남',cardType:'신',cost:1,effects:[{kind:'damage',amount:7,target:'enemy'}],passive:undefined,bondGroup:'세경본풀이',bond:{applyTo:'damage',perStack:3} },
      { name:'강림차사',cardType:'신',cost:3,effects:[{kind:'execute',thresholdHp:16,amount:21,target:'enemy'}],passive:undefined,bondGroup:'저승차사',bond:{applyTo:'damage',perStack:5} },
      { name:'일직차사',cardType:'신',cost:1,effects:[{kind:'damage',amount:7,target:'enemy'}],passive:undefined,bondGroup:'저승차사',bond:{applyTo:'damage',perStack:2} },
      { name:'월직차사',cardType:'신',cost:1,effects:[{kind:'damage',amount:4,target:'enemy'},{kind:'applyStatus',status:'액',amount:1,target:'enemy'}],passive:undefined,bondGroup:'저승차사',bond:{applyTo:'damage',perStack:2} },
      { name:'저승사자',cardType:'신',cost:2,effects:[{kind:'execute',thresholdHp:10,amount:12,target:'enemy'}],passive:undefined,bondGroup:'저승차사',bond:{applyTo:'damage',perStack:3} },
      { name:'천지왕',cardType:'신',cost:3,effects:[{kind:'damage',amount:18,target:'allEnemies'},{kind:'applyStatus',status:'신명',amount:1,target:'self'}],passive:undefined,bondGroup:'천지왕본풀이',bond:{applyTo:'damage',perStack:2} },
      { name:'대별왕',cardType:'신',cost:3,effects:[{kind:'damage',amount:21,target:'allEnemies'}],passive:undefined,bondGroup:'천지왕본풀이',bond:{applyTo:'damage',perStack:3} },
      { name:'소별왕',cardType:'신',cost:2,effects:[{kind:'damage',amount:8,target:'enemy'},{kind:'applyStatus',status:'신명',amount:1,target:'self'}],passive:undefined,bondGroup:'천지왕본풀이',bond:{applyTo:'damage',perStack:3} },
      { name:'제주 삼승할망',cardType:'신',cost:2,effects:[{kind:'heal',amount:12},{kind:'block',amount:8}],passive:undefined,bondGroup:'삼승할망본풀이',bond:{applyTo:'block',perStack:3} },
      { name:'제주 구삼승할망',cardType:'신',cost:1,effects:[{kind:'applyStatus',status:'부정',amount:4,target:'enemy'},{kind:'applyStatus',status:'부정',amount:1,target:'self'}],passive:undefined,bondGroup:'삼승할망본풀이',bond:undefined },
      { name:'제주 칠성신',cardType:'신',cost:2,effects:[{kind:'gainEnergy',amount:1},{kind:'draw',amount:1}],passive:undefined,bondGroup:'칠성본풀이',bond:undefined },
      { name:'안칠성',cardType:'신',cost:1,effects:[{kind:'block',amount:7}],passive:undefined,bondGroup:'칠성본풀이',bond:{applyTo:'block',perStack:3} },
      { name:'밧칠성',cardType:'신',cost:1,effects:[{kind:'damage',amount:7,target:'enemy'}],passive:undefined,bondGroup:'칠성본풀이',bond:{applyTo:'damage',perStack:3} },
      { name:'녹디생인',cardType:'신',cost:1,effects:[{kind:'block',amount:8}],passive:undefined,bondGroup:'문전본풀이',bond:{applyTo:'block',perStack:3} },
      { name:'남선비',cardType:'신',cost:1,effects:[{kind:'damage',amount:4,target:'enemy'},{kind:'block',amount:4}],passive:undefined,bondGroup:'문전본풀이',bond:{applyTo:'damage',perStack:2} },
      { name:'여산부인',cardType:'신',cost:2,effects:[{kind:'heal',amount:8},{kind:'block',amount:6}],passive:undefined,bondGroup:'문전본풀이',bond:{applyTo:'block',perStack:2} },
      { name:'노일저대귀일의 딸',cardType:'신',cost:2,effects:[{kind:'applyStatus',status:'부정',amount:3,target:'enemy'},{kind:'applyStatus',status:'액',amount:1,target:'enemy'}],passive:undefined,bondGroup:'문전본풀이',bond:undefined },
      { name:'설문대할망',cardType:'신',cost:3,effects:[{kind:'damage',amount:21,target:'allEnemies'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'요령',cardType:'무구',cost:1,effects:[],passive:{kind:'drawBonus',amount:1},bondGroup:undefined,bond:undefined },
      { name:'산판',cardType:'무구',cost:2,effects:[],passive:{kind:'energyBonus',amount:1},bondGroup:undefined,bond:undefined },
      { name:'명두',cardType:'무구',cost:1,effects:[],passive:{kind:'statusDamageBonus',status:'액',percent:30},bondGroup:undefined,bond:undefined },
      { name:'물색',cardType:'무구',cost:1,effects:[],passive:{kind:'turnStart',effects:[{kind:'block',amount:4}]},bondGroup:undefined,bond:undefined },
      { name:'심방쾌자',cardType:'무구',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'heal',amount:2}]},bondGroup:undefined,bond:undefined },
      { name:'본맹두',cardType:'무구',cost:1,effects:[],passive:{kind:'turnStart',effects:[{kind:'draw',amount:1}]},bondGroup:'초공본풀이',bond:undefined },
      { name:'신맹두',cardType:'무구',cost:2,effects:[],passive:{kind:'flatDamageBonus',amount:3},bondGroup:'초공본풀이',bond:undefined },
      { name:'삼맹두',cardType:'무구',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'block',amount:5}]},bondGroup:'초공본풀이',bond:undefined },
      { name:'초감제',cardType:'굿',cost:1,effects:[{kind:'tutor',cardType:'신'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'시왕맞이',cardType:'굿',cost:3,effects:[{kind:'cancelIntent',target:'enemy'},{kind:'applyStatus',status:'액',amount:3,target:'enemy'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'귀양풀이',cardType:'굿',cost:1,effects:[{kind:'transferStatus',status:'부정',target:'enemy'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'불도맞이',cardType:'굿',cost:2,effects:[{kind:'cleanse',statuses:['액','넋나감','부정']},{kind:'heal',amount:8}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'영등굿',cardType:'굿',cost:1,effects:[{kind:'draw',amount:3},{kind:'costReduction',amount:1}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'요왕맞이',cardType:'굿',cost:2,effects:[{kind:'recover',amount:2}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'삼공맞이',cardType:'굿',cost:2,effects:[{kind:'duplicate'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'성주풀이',cardType:'굿',cost:2,effects:[{kind:'blockToDamage',percent:150,target:'enemy'}],passive:undefined,bondGroup:undefined,bond:undefined },
      { name:'제주 문전신',cardType:'좌정',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'block',amount:6}]},bondGroup:'문전본풀이',bond:undefined },
      { name:'제주 조왕신',cardType:'좌정',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'heal',amount:3}]},bondGroup:'문전본풀이',bond:undefined },
      { name:'제주 측간신',cardType:'좌정',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'applyStatus',status:'부정',amount:2,target:'allEnemies'}]},bondGroup:'문전본풀이',bond:undefined },
      { name:'제주 주목지신',cardType:'좌정',cost:1,effects:[],passive:{kind:'turnStart',effects:[{kind:'block',amount:3}]},bondGroup:'문전본풀이',bond:undefined },
      { name:'성주신',cardType:'좌정',cost:3,effects:[],passive:{kind:'turnStart',effects:[{kind:'block',amount:4},{kind:'draw',amount:1}]},bondGroup:undefined,bond:undefined },
      { name:'터주신',cardType:'좌정',cost:2,effects:[],passive:{kind:'turnStart',effects:[{kind:'applyStatus',status:'정성',amount:1,target:'self'}]},bondGroup:undefined,bond:undefined },
    ], '42장 전체 계약');
    assert(new Set(rewardCards.map((card) => card.id)).size === 42, 'id 중복');
    assert(new Set(rewardCards.map((card) => card.name)).size === 42, '이름 중복');
  }],
  ['26 굿 턴당 한 장', () => {
    const guts = rewardCards.filter((card) => card.cardType === '굿').slice(0, 2);
    let state = baseState(); state.hand = guts; state.energy = 9; state.drawPile = [];
    state = playCard(state, 0, undefined, fixedRng);
    const snapshot = JSON.stringify(state);
    assert(JSON.stringify(playCard(state, 0, 'test-enemy', fixedRng)) === snapshot, '두 번째 굿 거부');
    state.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    assert(endTurn(state, fixedRng).gutPlayedThisTurn === false, '다음 턴 리셋');
  }],
  ['27 좌정 교체', () => {
    const seats = rewardCards.filter((card) => card.cardType === '좌정');
    let state = baseState(); state.hand = seats.slice(0, 2); state.energy = 9; state.drawPile = [];
    state = playCard(state, 0, undefined, fixedRng);
    const first = state.installed!;
    state = playCard(state, 0, undefined, fixedRng);
    assert(state.installed?.name === seats[1].name && state.exhaustPile.some((card) => card.id === first.id), '좌정 교체');
  }],
  ['28 무구 장착', () => {
    const weapon = rewardCards.find((card) => card.cardType === '무구')!;
    const next = playCard(withCard(baseState(), weapon), 0, undefined, fixedRng);
    assert(next.equipped.length === 1 && next.discardPile.length === 0 && next.exhaustPile.length === 0, '장착 위치');
  }],
  ['29 turnStart 순서', () => {
    const installed = { ...rewardCards[36], passive: { kind: 'turnStart' as const, effects: [
      { kind: 'applyStatus' as const, status: '액' as const, amount: 1, target: 'allEnemies' as const },
    ] } };
    const equipped = { ...rewardCards[23], passive: { kind: 'turnStart' as const, effects: [
      { kind: 'damage' as const, amount: 4, target: 'allEnemies' as const },
    ] } };
    const state = { ...baseState(), installed, equipped: [equipped], hand: [] };
    const hp = state.enemies[0].hp;
    const next = startPlayerTurn(state, fixedRng);
    equal([hp - next.enemies[0].hp, next.enemies[0].statuses.액], [6, 1], '좌정 액 부여 후 무구 피해');
  }],
  ['30 드로우·장단 보너스', () => {
    // drawPile에 6장 이상을 넣어야 drawBonus를 실제로 검증할 수 있다 (부족하면 B1 §5.5에 따라 드로우가 중단된다).
    const state = { ...baseState(), installed: null, equipped: [rewardCards[20], rewardCards[21]], hand: [], drawPile: createStartingDeck() };
    const next = startPlayerTurn(state, fixedRng);
    equal([next.hand.length, next.energy], [6, 4], '보너스');
  }],
  ['31 피해 passive 순서', () => {
    const state = withCard(baseState(), attackCard); state.player.statuses.넋나감 = 1; state.enemies[0].statuses.액 = 1;
    state.equipped = [rewardCards[26], rewardCards[22]];
    const hp = state.enemies[0].hp;
    const next = playCard(state, 0, 'test-enemy', fixedRng);
    // 6+3=9 → 넋나감 floor(6.75)=6 → 액 floor(9)=9 → 명두 floor(11.7)=11. 각 곱셈 직후 floor가 계약이다.
    assert(hp - next.enemies[0].hp === 11, 'floor(floor(floor((6+3)*0.75)*1.5)*1.3) = 11');
  }],
  ['32 tutor·recover RNG 불변', () => {
    const god = rewardCards[0], tutor = rewardCards[28], recover = rewardCards[33];
    let rngFunctionCalls = 0;
    const forbiddenRng: Rng = () => {
      rngFunctionCalls += 1;
      throw new Error('tutor/recover가 RNG 함수를 호출함');
    };
    let state = baseState(); state.hand = [tutor]; state.drawPile = [god]; state.energy = 9;
    const calls = state.rngCalls; state = playCard(state, 0, undefined, forbiddenRng);
    assert(state.rngCalls === calls && rngFunctionCalls === 0 && state.hand[0].name === god.name, 'tutor 결정성');
    // 초감제·요왕맞이는 둘 다 굿이라 같은 턴에 연속으로 낼 수 없다(검사 26). 턴이 바뀐 상황을 만든다.
    state.hand = [recover]; state.discardPile = [god, rewardCards[1]]; state.energy = 9; state.gutPlayedThisTurn = false;
    const calls2 = state.rngCalls; state = playCard(state, 0, undefined, forbiddenRng);
    assert(state.rngCalls === calls2 && rngFunctionCalls === 0 && state.hand[0].name === rewardCards[1].name, 'recover 최근순');
  }],
  ['33 duplicate 1회 소비', () => {
    let state = baseState(); state.hand = [rewardCards[34], attackCard, { ...attackCard, id: 'attack-2' }]; state.energy = 9;
    state = playCard(state, 0, undefined, fixedRng); const hp = state.enemies[0].hp;
    state = playCard(state, 0, 'test-enemy', fixedRng);
    equal([hp - state.enemies[0].hp, state.duplicateNext], [12, false], '복제');
    const hp2 = state.enemies[0].hp; state = playCard(state, 0, 'test-enemy', fixedRng);
    assert(hp2 - state.enemies[0].hp === 6, '한 장만');
  }],
  ['34 유틸 프리미티브', () => {
    let state = baseState(); state.player.statuses.부정 = 3; state.player.statuses.액 = 2; state.player.block = 10;
    state.hand = [rewardCards[30], rewardCards[31], rewardCards[35], rewardCards[29], rewardCards[32]]; state.energy = 20;
    state = playCard(state, 0, 'test-enemy', fixedRng);
    equal([state.player.statuses.부정, state.enemies[0].statuses.부정], [0, 3], '전이');
    state.gutPlayedThisTurn = false;
    state = playCard(state, 0, undefined, fixedRng); assert(state.player.statuses.액 === 0, '정화');
    state.gutPlayedThisTurn = false;
    const hp = state.enemies[0].hp; state = playCard(state, 0, 'test-enemy', fixedRng); assert(hp - state.enemies[0].hp === 15 && state.player.block === 10, '넋 피해');
    const intent = state.enemies[0].intentIndex; state.gutPlayedThisTurn = false; state = playCard(state, 0, 'test-enemy', fixedRng);
    assert(state.enemies[0].intentIndex !== intent, '의도 취소');
    state.gutPlayedThisTurn = false; state = playCard(state, 0, undefined, fixedRng); assert(state.costReduction === 1, '비용 감소');
  }],
  ['35 연계 보상 보장', () => {
    const deck = [{ ...rewardCards[0], id: 'owned#0' }];
    const offered = offerRewards(deck, fixedRng);
    assert(offered.length === 3 && new Set(offered.map((card) => card.id)).size === 3, '3장 중복 없음');
    assert(offered.some((card) => card.bondGroup === '세경본풀이' && card.name !== '자청비'), '보유 연계 없음');
  }],
  ['37 프로필 저장 왕복', () => {
    const values = new Map<string, string>();
    const storage: StorageAdapter = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    const profile = createDefaultProfile();
    assert(saveProfile(storage, profile).ok, '저장 실패');
    const loaded = loadProfile(storage);
    assert(loaded.ok && loaded.profile !== null, '로드 실패');
    equal(loaded.profile, profile, '왕복 프로필');
  }],
  ['38 손상 프로필 로드', () => {
    for (const value of ['{', JSON.stringify({ schemaVersion: 1 })]) {
      const result = loadProfile({ getItem: () => value, setItem: () => undefined });
      assert(!result.ok, '손상된 값이 성공함');
    }
  }],
  ['39 저장 예외 Result', () => {
    const result = saveProfile({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, createDefaultProfile());
    assert(!result.ok, '저장 예외가 성공함');
  }],
  ['40 런 종료 저장 실패 fail-closed', () => {
    const profile = createDefaultProfile();
    const before = JSON.stringify(profile);
    const result = completeRunFailClosed(
      { getItem: () => null, setItem: () => { throw new Error('quota'); } },
      profile, ['jacheongbi'], true, fixedRng,
    );
    assert(!result.ok && JSON.stringify(profile) === before, '실패 후 프로필 변경');
  }],
  ['41 덱 편집 제한', () => {
    assert(!validateStartingDeck(['sinkal'], {}).ok, '50장 미만 허용');
    const tooMany = [...createDefaultProfile().startingDeck.slice(0, 45), ...Array<string>(5).fill('jacheongbi')];
    assert(!validateStartingDeck(tooMany, { jacheongbi: 5 }).ok, '보상 5장 허용');
    const overOwned = [...createDefaultProfile().startingDeck.slice(0, 46), ...Array<string>(4).fill('jacheongbi')];
    assert(!validateStartingDeck(overOwned, { jacheongbi: 1 }).ok, '보유 초과 허용');
  }],
  ['42 기본 카드 무제한', () => {
    assert(validateStartingDeck(Array(50).fill('sinkal'), {}).ok, '기본 카드 무제한 실패');
  }],
  ['43 고른 카드 보관', () => {
    const result = calculateCompletedProfile(createDefaultProfile(), ['jacheongbi', 'jacheongbi', 'sanpan'], false, fixedRng);
    equal(result.profile.collection, { jacheongbi: 2, sanpan: 1 }, '획득 수량');
  }],
  ['44 승리 꾸러미와 패배 보관', () => {
    const won = calculateCompletedProfile(createDefaultProfile(), ['jacheongbi'], true, fixedRng);
    assert(won.pack.length === 3 && Object.values(won.profile.collection).reduce((sum, count) => sum + count, 0) === 4, '승리 꾸러미');
    const lost = calculateCompletedProfile(createDefaultProfile(), ['jacheongbi'], false, fixedRng);
    equal([lost.pack.length, lost.profile.collection.jacheongbi], [0, 1], '패배 보관');
  }],
  ['45 꾸러미 주입 RNG 결정성', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random 호출'); };
    try {
      equal(drawBonpuriPack(seeded(77)), drawBonpuriPack(seeded(77)), '동일 시드');
    } finally {
      Math.random = original;
    }
  }],
  ['46 2턴 이후 손패 5장', () => {
    const state = baseState();
    state.enemies[0].intents = [{ kind: 'block', amount: 0 }];
    const next = endTurn(state, fixedRng);
    equal([next.turn, next.hand.length], [2, 5], '2턴 손패');
  }],
  ['47 첫 턴과 이후 턴 drawBonus', () => {
    const drawBonus = rewardCards.find((card) => card.passive?.kind === 'drawBonus')!;
    const firstBase = baseState();
    const first = startPlayerTurn({
      ...firstBase, turn: 0, hand: [], drawPile: createStartingDeck(), equipped: [drawBonus],
    }, fixedRng);
    const later = startPlayerTurn({
      ...firstBase, turn: 1, hand: [], drawPile: createStartingDeck(), equipped: [drawBonus],
    }, fixedRng);
    equal([first.hand.length, later.hand.length], [8, 6], 'drawBonus 손패');
  }],
  ['48 50장 검증과 보상 상한', () => {
    assert(!validateStartingDeck(Array(49).fill('sinkal'), {}).ok, '49장 허용');
    assert(!validateStartingDeck(Array(51).fill('sinkal'), {}).ok, '51장 허용');
    const fourRewards = [...Array<string>(46).fill('sinkal'), ...Array<string>(4).fill('jacheongbi')];
    assert(validateStartingDeck(fourRewards, { jacheongbi: 4 }).ok, '보상 4장 거부');
    const fiveRewards = [...Array<string>(45).fill('sinkal'), ...Array<string>(5).fill('jacheongbi')];
    assert(!validateStartingDeck(fiveRewards, { jacheongbi: 5 }).ok, '보상 5장 허용');
    assert(validateStartingDeck(Array(50).fill('saseol'), {}).ok, '기본 카드 상한 적용');
  }],
  ['49 보상 덱 3장과 collection 1종', () => {
    const started = startMiniRun(fixedRng);
    const reward = rewardCards[0];
    const rewardState: MiniRunState = {
      ...started, phase: 'reward', battle: started.battle, rewards: [reward],
    };
    const next = chooseReward(rewardState, 0, fixedRng);
    const gained = next.deck.filter((card) => card.id.split('#')[0] === reward.id);
    const basics = next.deck.reduce<Record<string, number>>((counts, card) => {
      const id = card.id.split('#')[0];
      if (id === 'sinkal' || id === 'neokgarim' || id === 'saseol') counts[id] = (counts[id] ?? 0) + 1;
      return counts;
    }, {});
    assert(next.deck.length === 50 && gained.length === 3, '런 덱 크기 유지 또는 보상 3장 교체 실패');
    equal(basics, { sinkal: 23, neokgarim: 19, saseol: 5 }, '기본 카드 교체');
    assert(new Set(gained.map((card) => card.id)).size === 3, '보상 카드 id 중복');
    assert(next.battle?.discardPile.length === 3 &&
      next.battle.discardPile.every((card) => card.id.split('#')[0] === reward.id), '보상 3장이 시작 버림더미에 없음');
    assert(next.battle.hand.every((card) => card.id.split('#')[0] !== reward.id) &&
      next.battle.drawPile.every((card) => card.id.split('#')[0] !== reward.id), '보상 카드가 시작 셔플에 포함됨');
    equal(next.acquiredCardIds, [reward.id], '보관 대상');
    const completed = calculateCompletedProfile(createDefaultProfile(), next.acquiredCardIds, false, fixedRng);
    assert(completed.profile.collection[reward.id] === 1, 'collection 1 증가 실패');
  }],
  ['50 v1 덱 마이그레이션과 collection 보존', () => {
    const legacy = {
      schemaVersion: 1, collection: { jacheongbi: 3 }, startingDeck: Array(10).fill('sinkal'),
      runsCompleted: 2, runsWon: 1, rulesPanelOpen: false,
    };
    let persisted = '';
    const loaded = loadProfile({
      getItem: () => JSON.stringify(legacy),
      setItem: (_key, value) => { persisted = value; },
    });
    assert(loaded.ok && loaded.profile !== null, '마이그레이션 실패');
    equal(loaded.profile.startingDeck, [...createDefaultProfile().startingDeck], '기본 50장 교체');
    equal(loaded.profile.collection, legacy.collection, 'collection 보존');
    assert(loaded.profile.schemaVersion === 3 && persisted !== '', '최신 스키마 변환/저장 실패');
  }],
  ['51 마이그레이션 즉시 저장과 fail-closed', () => {
    const legacy = {
      schemaVersion: 1, collection: { sanpan: 1 }, startingDeck: Array(10).fill('neokgarim'),
      runsCompleted: 0, runsWon: 0, rulesPanelOpen: true,
    };
    let writes = 0;
    const storage: StorageAdapter = {
      getItem: () => JSON.stringify(legacy),
      setItem: (_key, value) => {
        writes += 1;
        const saved = JSON.parse(value) as { schemaVersion: number; startingDeck: string[] };
        assert(saved.schemaVersion === 3 && saved.startingDeck.length === 50, '저장 후보 오류');
      },
    };
    assert(loadProfile(storage).ok && writes === 1, '즉시 저장 1회 실패');
    const failed = loadProfile({
      getItem: () => JSON.stringify(legacy),
      setItem: () => { throw new Error('quota'); },
    });
    assert(!failed.ok, '저장 실패 후 마이그레이션 프로필 반환');
  }],
  ['52 마이그레이션 알림 플래그', () => {
    const legacy = {
      schemaVersion: 1, collection: {}, startingDeck: Array(10).fill('sinkal'),
      runsCompleted: 0, runsWon: 0, rulesPanelOpen: true,
    };
    // 덱이 조용히 기본값으로 바뀌면 사용자가 알 수 없다. 로드 결과가 이를 알려야 한다.
    const migrated = loadProfile({ getItem: () => JSON.stringify(legacy), setItem: () => {} });
    assert(migrated.ok && migrated.migrated === true, '마이그레이션 플래그 없음');
    // 정상 v2 프로필은 플래그가 서면 안 된다.
    const current = loadProfile({ getItem: () => JSON.stringify(createDefaultProfile()), setItem: () => {} });
    assert(current.ok && !current.migrated, '정상 로드인데 플래그가 섬');
    // 저장된 값이 없을 때도 플래그가 서면 안 된다.
    const empty = loadProfile({ getItem: () => null, setItem: () => {} });
    assert(empty.ok && !empty.migrated && empty.profile === null, '빈 저장소 처리 오류');
  }],
  ['53 제거 우선순위와 기본 카드 부족 보충', () => {
    const shortageDeck = [
      'sinkal', 'neokgarim', ...Array<string>(48).fill('saseol'),
    ];
    const started = startMiniRun(fixedRng, shortageDeck);
    const rewardState: MiniRunState = { ...started, phase: 'reward', rewards: [rewardCards[0]] };
    const next = chooseReward(rewardState, 0, fixedRng);
    const counts = next.deck.reduce<Record<string, number>>((result, card) => {
      const id = card.id.split('#')[0];
      result[id] = (result[id] ?? 0) + 1;
      return result;
    }, {});
    equal([counts.sinkal ?? 0, counts.neokgarim ?? 0, counts.saseol ?? 0], [0, 0, 47], '기본 카드 부족 보충');
  }],
  ['54 기본 카드 소진 시 최다 수량·id 순 제거', () => {
    const deck = [...Array<string>(25).fill('jacheongbi'), ...Array<string>(25).fill('sanpan')];
    const started = startMiniRun(fixedRng, deck);
    const rewardState: MiniRunState = { ...started, phase: 'reward', rewards: [rewardCards[1]] };
    const first = chooseReward(rewardState, 0, fixedRng);
    const second = chooseReward(rewardState, 0, fixedRng);
    const count = (state: MiniRunState, id: string) => state.deck.filter((card) => card.id.split('#')[0] === id).length;
    assert(count(first, 'jacheongbi') === 22 && count(first, 'sanpan') === 25, '동률 id 오름차순 제거');
    equal(first.deck.map((card) => card.id), second.deck.map((card) => card.id), '비기본 제거 결정성');
  }],
  ['55 정화 보상 명 +8·기본 카드 1장 제거', () => {
    const started = startMiniRun(fixedRng);
    const rewardState: MiniRunState = { ...started, phase: 'reward', playerHp: 65, rewards: [rewardCards[0]] };
    const next = skipReward(rewardState, fixedRng);
    assert(next.playerHp === 70 && next.deck.length === 49, '정화 회복 또는 덱 1장 제거 실패');
    assert(next.deck.filter((card) => card.id.split('#')[0] === 'sinkal').length === 24, '정화 제거 우선순위 실패');
  }],
  ['56 기본 카드가 없으면 정화는 회복만 적용', () => {
    const started = startMiniRun(fixedRng, Array<string>(50).fill('jacheongbi'));
    const rewardState: MiniRunState = { ...started, phase: 'reward', playerHp: 60, rewards: [rewardCards[0]] };
    const next = skipReward(rewardState, fixedRng);
    assert(next.playerHp === 68 && next.deck.length === 50, '기본 카드 없는 정화가 덱을 변경함');
  }],
  ['57 카드 보상 4회 후 덱 크기 유지', () => {
    let state = startMiniRun(fixedRng);
    for (let index = 0; index < 4; index += 1) {
      state = chooseReward({ ...state, phase: 'reward', rewards: [rewardCards[index]] }, 0, fixedRng);
    }
    assert(state.deck.length === 50, '카드 보상 4회 후 덱 크기 변경');
  }],
  ['58 승천 0 절대 배율·회복', () => {
    const modifier = getAscensionModifier(0);
    equal(
      [modifier.enemyDamageMultiplier, modifier.enemyHpMultiplier, modifier.startingHp, modifier.purifyHeal],
      [1.40, 1.20, 70, 8],
      '승천 0 절대값',
    );
    const explicit = startMiniRun(fixedRng, undefined, 0);
    const actual = explicit.battle?.enemies[0];
    const source = miniRunEnemies[0];
    assert(actual, '승천 0 적 없음');
    equal(actual.intents, source.intents.map((intent) => intent.kind === 'attack'
      ? { ...intent, amount: Math.floor(intent.amount * 1.40) }
      : { ...intent }), '승천 0 피해 ×1.40');
    equal([actual.hp, actual.maxHp], [Math.floor(source.hp * 1.20), Math.floor(source.maxHp * 1.20)], '승천 0 명 ×1.20');
    equal([explicit.playerHp, explicit.battle?.player.hp, explicit.battle?.player.maxHp], [70, 70, 70], '승천 0 시작 명');
    const rewardState: MiniRunState = { ...explicit, phase: 'reward', playerHp: 60, rewards: [rewardCards[0]] };
    const purified = skipReward(rewardState, fixedRng);
    equal([purified.playerHp, purified.deck.length, purified.battle?.player.hp], [68, 49, 68], '승천 0 정화 +8');
  }],
  ['59 승천 5 공격 의도만 피해 ×1.55 적용', () => {
    const modifier = getAscensionModifier(5);
    equal([modifier.enemyDamageMultiplier, modifier.enemyHpMultiplier], [1.55, 1.60], '승천 5 절대 배율');
    let state = startMiniRun(fixedRng, undefined, 5);
    for (let battleIndex = 0; battleIndex < miniRunEnemies.length; battleIndex += 1) {
      const actual = state.battle?.enemies[0];
      const source = miniRunEnemies[battleIndex];
      assert(actual, `승천 적 ${battleIndex + 1} 없음`);
      equal(actual.intents, source.intents.map((intent) => intent.kind === 'attack'
        ? { ...intent, amount: Math.floor(intent.amount * 1.55) }
        : { ...intent }), `승천 적 ${battleIndex + 1} attack ×1.55·block/applyStatus 불변`);
      equal([actual.hp, actual.maxHp], [Math.floor(source.hp * 1.60), Math.floor(source.maxHp * 1.60)], `승천 적 ${battleIndex + 1} 명 ×1.60`);
      if (battleIndex < miniRunEnemies.length - 1) {
        state = chooseReward({ ...state, phase: 'reward', rewards: [rewardCards[0]] }, 0, fixedRng);
      }
    }
  }],
  ['60 승천 적 적용은 원본 불변', () => {
    const before = JSON.stringify(miniRunEnemies);
    for (let ascension = 0; ascension <= 10; ascension += 1) startMiniRun(fixedRng, undefined, ascension);
    assert(JSON.stringify(miniRunEnemies) === before, '승천이 miniRunEnemies 원본을 변형');
  }],
  ['61 전 승천 보스 개시 액 0', () => {
    for (let ascension = 0; ascension <= 10; ascension += 1) {
      assert(getAscensionModifier(ascension).bossOpeningAffliction === 0, `승천 ${ascension} 보스 개시 액 설정`);
      let state = startMiniRun(fixedRng, undefined, ascension);
      for (let battleIndex = 1; battleIndex < miniRunEnemies.length; battleIndex += 1) {
        state = chooseReward({ ...state, phase: 'reward', rewards: [rewardCards[0]] }, 0, fixedRng);
      }
      assert(state.battleNumber === 5 && state.battle?.player.statuses.액 === 0, `승천 ${ascension} 보스 개시 액 적용`);
    }
  }],
  ['62 같은 시드·승천 결정성', () => {
    const run = (seed: number): MiniRunState => {
      const rng = seeded(seed);
      let state = startMiniRun(rng, undefined, 8);
      for (let battleIndex = 1; battleIndex < miniRunEnemies.length; battleIndex += 1) {
        state = chooseReward({ ...state, phase: 'reward', rewards: [rewardCards[0]] }, 0, rng);
      }
      return state;
    };
    equal(run(881), run(881), '같은 시드·승천 결과');
  }],
  ['63 승천 인자 기본값은 0과 동일', () => {
    const implicit = startMiniRun(seeded(991));
    const explicit = startMiniRun(seeded(991), undefined, 0);
    equal(implicit, explicit, '승천 기본값');
  }],
  ['64 연계 스택 상한 3과 기록 지속', () => {
    const bonded: BattleCard = {
      id: 'capped-bond', name: '상한 연계 시험', cost: 0, exhaust: false, bondGroup: '상한시험본풀이',
      bond: { applyTo: 'block', perStack: 4 },
      effects: [{ kind: 'block', amount: 2 }],
    };
    let state = baseState();
    state.hand = Array.from({ length: 5 }, (_, index) => ({ ...bonded, id: `${bonded.id}-${index + 1}` }));
    const bonuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const beforeBlock = state.player.block;
      state = playCard(state, 0, undefined, fixedRng);
      bonuses.push(state.player.block - beforeBlock - 2);
    }
    equal(bonuses, [0, 4, 8, 12, 12], '장별 연계 보너스');
    assert(state.playedMyths.상한시험본풀이 === 5, '연계 플레이 기록이 상한에서 멈춤');
  }],

  // ── WO-007 전투 신뢰성 ──────────────────────────────────────────────
  ['65 적 의도 단일 기준이 인덱스를 순환', () => {
    const enemy: Enemy = { ...createTestEnemy(), intents: [{ kind: 'attack', amount: 7 }, { kind: 'block', amount: 5 }] };
    const at = (index: number) => currentIntent({ ...enemy, intentIndex: index });
    equal(at(0), enemy.intents[0], 'index 0');
    equal(at(1), enemy.intents[1], 'index length-1');
    equal(at(2), enemy.intents[0], 'index length (한 바퀴)');
    equal(at(5), enemy.intents[1], 'index > length');
    assert(currentIntent({ ...enemy, intents: [] }) === undefined, '의도가 없으면 undefined');
  }],
  ['66 표시 의도와 실제 실행 행동이 모든 순환 위치에서 일치', () => {
    for (let index = 0; index < 6; index += 1) {
      const enemy: Enemy = {
        ...createTestEnemy(), hp: 99, maxHp: 99, intentIndex: index,
        intents: [{ kind: 'attack', amount: 6 }, { kind: 'block', amount: 4 }],
      };
      let state = startBattle([enemy], fixedRng);
      state = { ...state, enemies: [{ ...state.enemies[0], intentIndex: index }] };
      const shown = currentIntent(state.enemies[0]);
      const before = state.player.hp;
      const after = endTurn(state, fixedRng);
      const attacked = after.player.hp < before;
      assert(shown !== undefined, `index ${index}: 표시 의도가 있어야 함`);
      assert(attacked === (shown.kind === 'attack'), `index ${index}: 표시(${shown.kind})와 실제 행동 불일치`);
    }
  }],
  ['67 의도 취소로 인덱스가 늘어난 직후에도 표시가 실제와 일치', () => {
    const enemy: Enemy = {
      ...createTestEnemy(), hp: 99, maxHp: 99,
      intents: [{ kind: 'attack', amount: 6 }, { kind: 'block', amount: 4 }],
    };
    let state = startBattle([enemy], fixedRng);
    const cancel: BattleCard = {
      id: 'cancel-test', name: '취소 시험', cost: 0, exhaust: false,
      effects: [{ kind: 'cancelIntent', target: 'enemy' }],
    };
    state = { ...state, hand: [cancel] };
    state = playCard(state, 0, state.enemies[0].id, fixedRng);
    assert(state.enemies[0].intentIndex === 1, '취소로 인덱스가 1 증가');
    const shown = currentIntent(state.enemies[0]);
    assert(shown?.kind === 'block', '취소 직후 표시는 두 번째 의도');
    const before = state.player.hp;
    assert(endTurn(state, fixedRng).player.hp === before, '표시가 방어면 실제로 공격하지 않음');
  }],
  ['68 예상 명 피해가 부정·넋·상태감소·순환의도를 모두 반영', () => {
    const cases: [string, (state: BattleState) => void][] = [
      ['부정만', (s) => { s.player.statuses.부정 = 3; s.enemies[0].intents = [{ kind: 'block', amount: 4 }]; }],
      ['공격만', () => {}],
      ['부정+공격', (s) => { s.player.statuses.부정 = 3; }],
      ['넋이 전부 흡수', (s) => { s.player.block = 40; }],
      ['넋이 일부 흡수', (s) => { s.player.block = 4; }],
      ['액·넋나감 동시', (s) => { s.player.statuses.액 = 2; s.enemies[0].statuses.넋나감 = 2; }],
      ['한 바퀴 순환 후', (s) => { s.enemies[0].intentIndex = 2; }],
      ['부정으로 먼저 사망', (s) => { s.player.hp = 2; s.player.statuses.부정 = 9; }],
    ];
    for (const [label, setup] of cases) {
      const enemy: Enemy = {
        ...createTestEnemy(), hp: 99, maxHp: 99,
        intents: [{ kind: 'attack', amount: 8 }, { kind: 'block', amount: 4 }],
      };
      const state = startBattle([enemy], fixedRng);
      setup(state);
      const snapshot = JSON.stringify(state);
      const forecast = forecastTurnEnd(state);
      assert(JSON.stringify(state) === snapshot, `${label}: 예상 계산이 입력을 변경함`);
      const actual = state.player.hp - endTurn(state, fixedRng).player.hp;
      assert(forecast.total === actual, `${label}: 예상 ${forecast.total} !== 실제 ${actual}`);
      assert(forecast.corruption + forecast.attack === forecast.total, `${label}: 내역 합이 총량과 다름`);
      assert(forecast.total <= Math.max(0, state.player.hp), `${label}: 현재 명을 초과한 예상값`);
    }
  }],
  ['69 예상 명 피해는 플레이어 턴이 아니면 0', () => {
    const state = startBattle([createTestEnemy()], fixedRng);
    equal(forecastTurnEnd({ ...state, phase: 'enemyTurn' }), { total: 0, corruption: 0, attack: 0 }, '적 턴');
  }],
  ['70 턴 시작 드로우: 기본 보충 후 turnStart 뽑기가 추가로 얹힘', () => {
    const card = (id: string): BattleCard => {
      const found = rewardCards.find((entry) => entry.id === id);
      assert(found, `${id} 없음`);
      return found;
    };
    const bonmaengdu2: BattleCard = { ...card('bonmaengdu'), id: 'bonmaengdu#2' };
    const cases: [string, BattleCard[], number][] = [
      ['지속 카드 없음', [], 5],
      ['본맹두 1개', [card('bonmaengdu')], 6],
      ['본맹두 2개', [card('bonmaengdu'), bonmaengdu2], 7],
      ['요령 drawBonus', [card('yoryeong')], 6],
      ['요령+본맹두 2개', [card('yoryeong'), card('bonmaengdu'), bonmaengdu2], 8],
    ];
    for (const [label, equipped, expected] of cases) {
      let state = startBattle([createTestEnemy()], fixedRng);
      state = startPlayerTurn({ ...state, equipped, hand: [] }, fixedRng);
      assert(state.hand.length === expected, `${label}: 기대 ${expected}장 / 실제 ${state.hand.length}장`);
    }
  }],
  ['71 좌정이 장착 무구보다 먼저 처리되는 순서 유지', () => {
    const order: string[] = [];
    // 좌정은 넋, 무구는 회복을 준다. 결과 상태로 둘 다 실행됐음을 확인한다.
    const seat: BattleCard = {
      id: 'seat', name: '좌정 시험', cost: 0, exhaust: false, cardType: '좌정', effects: [],
      passive: { kind: 'turnStart', effects: [{ kind: 'block', amount: 6 }] },
    };
    const relic: BattleCard = {
      id: 'relic', name: '무구 시험', cost: 0, exhaust: false, cardType: '무구', effects: [],
      passive: { kind: 'turnStart', effects: [{ kind: 'heal', amount: 3 }] },
    };
    let state = startBattle([createTestEnemy()], fixedRng);
    state = startPlayerTurn({ ...state, installed: seat, equipped: [relic], hand: [], player: { ...state.player, hp: 60 } }, fixedRng);
    assert(state.player.block === 6, '좌정 넋 적용');
    assert(state.player.hp === 63, '무구 회복 적용');
    order.push('ok');
    assert(order.length === 1, '순서 확인');
  }],

  // ── WO-007 승천 ────────────────────────────────────────────────────
  ['72 신규 프로필은 승천 0만 가능', () => {
    const profile = createDefaultProfile();
    assert(profile.ascensionUnlocked === 0 && profile.ascensionSelected === 0, '기본 승천 0');
  }],
  ['73 해금 최고 단계 승리만 다음 단계를 연다', () => {
    const base = { ...createDefaultProfile(), ascensionUnlocked: 3, ascensionSelected: 3 };
    assert(nextAscensionUnlocked(base, 3, true) === 4, '최고 단계 승리 → 해금');
    assert(nextAscensionUnlocked(base, 2, true) === 3, '낮은 단계 승리 → 건너뛰지 않음');
    assert(nextAscensionUnlocked(base, 3, false) === 3, '패배 → 해금 없음');
    const top = { ...base, ascensionUnlocked: MAX_ASCENSION, ascensionSelected: MAX_ASCENSION };
    assert(nextAscensionUnlocked(top, MAX_ASCENSION, true) === MAX_ASCENSION, '상한을 넘지 않음');
  }],
  ['74 승천 해금은 저장 성공에만 반영(fail-closed)', () => {
    const profile = { ...createDefaultProfile(), ascensionUnlocked: 0, ascensionSelected: 0 };
    const failing: StorageAdapter = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const failed = completeRunFailClosed(failing, profile, [], true, fixedRng, 0);
    assert(!failed.ok, '저장 실패 시 실패로 반환');
    let stored = '';
    const working: StorageAdapter = { getItem: () => null, setItem: (_k, v) => { stored = v; } };
    const okResult = completeRunFailClosed(working, profile, [], true, fixedRng, 0);
    assert(okResult.ok && okResult.ascensionUnlockedNow && okResult.profile.ascensionUnlocked === 1, '승리 시 승천 1 해금');
    assert(JSON.parse(stored).ascensionUnlocked === 1, '해금이 저장에 반영');
  }],
  ['75 v2 프로필은 기록을 보존한 채 승천 필드를 얻는다', () => {
    const v2 = {
      schemaVersion: 2, collection: { jacheongbi: 2 }, startingDeck: Array(50).fill('sinkal'),
      runsCompleted: 4, runsWon: 2, rulesPanelOpen: false,
    };
    let persisted = '';
    const storage: StorageAdapter = { getItem: () => JSON.stringify(v2), setItem: (_k, v) => { persisted = v; } };
    const loaded = loadProfile(storage);
    assert(loaded.ok && loaded.profile !== null, 'v2 로드 실패');
    equal(loaded.profile.collection, v2.collection, 'collection 보존');
    equal(loaded.profile.startingDeck, v2.startingDeck, 'startingDeck 보존');
    assert(loaded.profile.runsCompleted === 4 && loaded.profile.runsWon === 2, '전적 보존');
    assert(loaded.profile.rulesPanelOpen === false, 'rulesPanelOpen 보존');
    assert(loaded.profile.schemaVersion === 3, '최신 스키마');
    assert(loaded.profile.ascensionUnlocked === 1, '기존 승리 기록이 있으면 승천 1 해금');
    assert(loaded.profile.ascensionSelected === 0, '최초 선택은 0');
    assert(loaded.migrated === undefined, 'v2 는 덱이 그대로라 알림 없음');
    assert(persisted !== '', '변환 결과 저장');
  }],
  ['76 승리 기록이 없는 v2 는 승천 0만 해금', () => {
    const v2 = {
      schemaVersion: 2, collection: {}, startingDeck: Array(50).fill('sinkal'),
      runsCompleted: 3, runsWon: 0, rulesPanelOpen: true,
    };
    const storage: StorageAdapter = { getItem: () => JSON.stringify(v2), setItem: () => {} };
    const loaded = loadProfile(storage);
    assert(loaded.ok && loaded.profile !== null && loaded.profile.ascensionUnlocked === 0, '승천 0');
  }],
  ['77 선택 단계는 해금 범위를 벗어난 프로필을 거부', () => {
    const bad = { ...createDefaultProfile(), ascensionUnlocked: 1, ascensionSelected: 5 };
    assert(!isBonpuriProfile(bad), '선택 > 해금은 무효');
    const over = { ...createDefaultProfile(), ascensionUnlocked: MAX_ASCENSION + 1, ascensionSelected: 0 };
    assert(!isBonpuriProfile(over), '해금이 상한을 넘으면 무효');
  }],
  ['78 선택한 승천이 실제 런의 적 수치에 적용', () => {
    const base = startMiniRun(fixedRng, undefined, 0);
    const high = startMiniRun(fixedRng, undefined, 5);
    const modifier = getAscensionModifier(5);
    assert(high.ascension === 5, '런에 단계 기록');
    assert(high.battle !== null && base.battle !== null, '전투 생성');
    assert(high.battle.enemies[0].maxHp === Math.floor(miniRunEnemies[0].maxHp * modifier.enemyHpMultiplier), '적 명 배율 적용');
    assert(high.battle.enemies[0].maxHp > base.battle.enemies[0].maxHp, '승천이 높을수록 적 명 증가');
    assert(high.playerHp === modifier.startingHp, '시작 명 적용');
  }],

  // ── WO-009 Phase 1 클라우드 저장 · 순수 데이터 경계 ──────────────────
  ['79 소유자 메타 왕복과 손상 데이터 거부', () => {
    const box: Record<string, string> = {};
    const storage: StorageAdapter = { getItem: (k) => box[k] ?? null, setItem: (k, v) => { box[k] = v; } };
    const meta: ProfileMeta = { schemaVersion: 1, owner: { kind: 'google', uid: 'uid-a' }, savedAt: 1000, device: 'dev-1' };
    assert(writeMeta(storage, meta).ok, '메타 저장');
    equal(readMeta(storage), meta, '메타 왕복');
    box[PROFILE_META_KEY] = '{';
    assert(readMeta(storage) === null, '손상 메타는 null');
    box[PROFILE_META_KEY] = JSON.stringify({ schemaVersion: 1, owner: { kind: 'google' }, savedAt: 1, device: 'd' });
    assert(readMeta(storage) === null, 'uid 없는 google 소유자 거부');
  }],
  ['80 소유자 관계 판정 — legacy/guest/동일/전환', () => {
    const meta = (owner: ProfileOwner): ProfileMeta => ({ schemaVersion: 1, owner, savedAt: 1, device: 'd' });
    equal(classifyOwner(null, false, 'uid-a').kind, 'no-local-record', '로컬 기록 없음');
    equal(classifyOwner(null, true, 'uid-a').kind, 'legacy-local', '메타 없는 기존 기록');
    equal(classifyOwner(meta({ kind: 'legacy-local' }), true, 'uid-a').kind, 'legacy-local', 'legacy 명시');
    equal(classifyOwner(meta({ kind: 'guest' }), true, 'uid-a').kind, 'guest-record', '게스트 기록');
    // 익명 UID 를 Google 에 연결해 UID 가 유지된 경우는 같은 사용자다.
    equal(classifyOwner(meta({ kind: 'google', uid: 'uid-a' }), true, 'uid-a').kind, 'same-owner', '동일 UID');
    equal(classifyOwner(meta({ kind: 'google', uid: 'uid-a' }), true, 'uid-b').kind, 'account-changed', 'UID 전환');
    equal(classifyOwner(meta({ kind: 'google', uid: 'uid-a' }), true, null).kind, 'account-changed', '로그아웃 상태');
  }],
  ['81 의미 있는 기록 판정', () => {
    const empty = createDefaultProfile();
    assert(!isMeaningfulProfile(empty), '빈 기록은 물어볼 가치 없음');
    assert(isMeaningfulProfile({ ...empty, collection: { jacheongbi: 1 } }), '획득 카드');
    assert(isMeaningfulProfile({ ...empty, runsCompleted: 1 }), '완료 런');
    assert(isMeaningfulProfile({ ...empty, runsWon: 1 }), '승리 기록');
    assert(isMeaningfulProfile({ ...empty, ascensionUnlocked: 1 }), '승천 해금');
    const deck = [...empty.startingDeck]; deck[0] = 'neokgarim';
    assert(isMeaningfulProfile({ ...empty, startingDeck: deck }), '기본과 다른 덱');
    assert(!isMeaningfulProfile({ ...empty, collection: { jacheongbi: 0 } }), '0장 보유는 의미 없음');
  }],
  ['82 클라우드 payload 검증 — 정상 v3', () => {
    const profile = { ...createDefaultProfile(), collection: { jacheongbi: 2 }, runsCompleted: 3, runsWon: 1, ascensionUnlocked: 1, ascensionSelected: 1 };
    const result = parseCloudPayload(JSON.stringify(profile));
    assert(result.ok && result.from === 3 && !result.deckReset, 'v3 통과');
    equal(result.profile.collection, profile.collection, 'collection 보존');
  }],
  ['83 클라우드 payload 검증 — v1·v2 마이그레이션', () => {
    const v2 = { schemaVersion: 2, collection: { sanpan: 1 }, startingDeck: Array(50).fill('sinkal'), runsCompleted: 2, runsWon: 1, rulesPanelOpen: false };
    const r2 = parseCloudPayload(JSON.stringify(v2));
    assert(r2.ok && r2.from === 2 && !r2.deckReset, 'v2 변환');
    assert(r2.profile.schemaVersion === 3 && r2.profile.ascensionUnlocked === 1, 'v2 → v3 · 승천 1 해금');
    assert(r2.profile.rulesPanelOpen === false, 'v2 설정 보존');
    const v1 = { schemaVersion: 1, collection: {}, startingDeck: Array(10).fill('sinkal'), runsCompleted: 0, runsWon: 0, rulesPanelOpen: true };
    const r1 = parseCloudPayload(JSON.stringify(v1));
    assert(r1.ok && r1.from === 1 && r1.deckReset, 'v1 변환 · 덱 초기화 표시');
    assert(r1.profile.startingDeck.length === 50, 'v1 덱 50장 복구');
  }],
  ['84 클라우드 payload 거부 — malformed·잘못된 덱·보유량 초과·범위 밖', () => {
    const bad: [string, unknown][] = [
      ['문자열 아님', 42],
      ['빈 문자열', ''],
      ['깨진 JSON', '{'],
      ['알 수 없는 스키마', JSON.stringify({ schemaVersion: 9, collection: {}, startingDeck: [], runsCompleted: 0, runsWon: 0, rulesPanelOpen: true })],
      ['덱 49장', JSON.stringify({ ...createDefaultProfile(), startingDeck: Array(49).fill('sinkal') })],
      ['존재하지 않는 카드', JSON.stringify({ ...createDefaultProfile(), startingDeck: [...Array(49).fill('sinkal'), 'not_a_card'] })],
      ['보유량 초과', JSON.stringify({ ...createDefaultProfile(), collection: { jacheongbi: 1 }, startingDeck: [...Array(48).fill('sinkal'), 'jacheongbi', 'jacheongbi'] })],
      ['같은 카드 5장', JSON.stringify({ ...createDefaultProfile(), collection: { jacheongbi: 9 }, startingDeck: [...Array(45).fill('sinkal'), ...Array(5).fill('jacheongbi')] })],
      ['음수 보유량', JSON.stringify({ ...createDefaultProfile(), collection: { jacheongbi: -1 } })],
      ['승천 범위 밖', JSON.stringify({ ...createDefaultProfile(), ascensionUnlocked: 99 })],
      ['선택 > 해금', JSON.stringify({ ...createDefaultProfile(), ascensionUnlocked: 1, ascensionSelected: 5 })],
      ['상한 초과 크기', `"${'x'.repeat(MAX_CLOUD_PAYLOAD_LENGTH)}"`],
    ];
    for (const [label, raw] of bad) {
      assert(!parseCloudPayload(raw).ok, `${label}: 거부해야 함`);
    }
    // 상한 경계 바로 아래의 정상 payload 는 통과해야 한다.
    const ok = JSON.stringify(createDefaultProfile());
    assert(ok.length < MAX_CLOUD_PAYLOAD_LENGTH && parseCloudPayload(ok).ok, '상한 미만 정상 payload 통과');
  }],
  ['85 envelope schema 는 3만 허용', () => {
    assert(isSupportedEnvelope(3), 'schema 3 허용');
    for (const bad of [2, 1, 4, '3', null, undefined]) {
      assert(!isSupportedEnvelope(bad), `envelope ${String(bad)} 거부`);
    }
  }],
  ['86 동일 기록 판정은 키 순서에 흔들리지 않음', () => {
    const base = { ...createDefaultProfile(), collection: { jacheongbi: 2, sanpan: 1 } };
    const shuffled: BonpuriProfile = { ...base, collection: { sanpan: 1, jacheongbi: 2 } };
    assert(sameProfile(base, shuffled), '키 순서가 달라도 같은 기록');
    assert(sameProfile(base, { ...base, collection: { ...base.collection, mulsaek: 0 } }), '0장은 무시');
    assert(!sameProfile(base, { ...base, runsWon: 1 }), '전적이 다르면 다른 기록');
    assert(!sameProfile(base, { ...base, collection: { jacheongbi: 3, sanpan: 1 } }), '수량이 다르면 다른 기록');
    assert(canonicalProfileJson(base) === canonicalProfileJson(shuffled), '정규화 문자열 동일');
  }],
  ['87 충돌 요약은 UID·원시 JSON 을 담지 않음', () => {
    const profile = { ...createDefaultProfile(), collection: { jacheongbi: 2, sanpan: 1, mulsaek: 0 }, runsCompleted: 4, runsWon: 2, ascensionUnlocked: 2, ascensionSelected: 1 };
    const summary = summarizeProfile(profile, 'cloud', 1700);
    equal(summary, { source: 'cloud', cards: 3, kinds: 2, runsCompleted: 4, runsWon: 2, ascensionUnlocked: 2, deckSize: 50, savedAt: 1700 }, '요약 내용');
    const serialized = JSON.stringify(summary);
    for (const leak of ['uid', 'startingDeck', 'collection', 'portal/saves', 'schemaVersion']) {
      assert(!serialized.includes(leak), `요약에 ${leak} 누출`);
    }
  }],
  ['88 백업 왕복과 손상 백업 거부', () => {
    const box: Record<string, string> = {};
    const storage: StorageAdapter = { getItem: (k) => box[k] ?? null, setItem: (k, v) => { box[k] = v; } };
    assert(readBackup(storage) === null, '백업 없음');
    const profile = { ...createDefaultProfile(), collection: { jacheongbi: 1 } };
    const ok = backupProfile(storage, { schemaVersion: 1, payload: JSON.stringify(profile), source: 'cloud', savedAt: 500, owner: { kind: 'google', uid: 'uid-a' }, profileSchema: 3 });
    assert(ok.ok, '백업 저장');
    const read = readBackup(storage);
    assert(read !== null && read.source === 'cloud' && read.savedAt === 500, '백업 왕복');
    box[PROFILE_BACKUP_KEY] = JSON.stringify({ schemaVersion: 1, payload: '', source: 'cloud', savedAt: 1, owner: { kind: 'guest' }, profileSchema: 3 });
    assert(readBackup(storage) === null, '빈 payload 백업 거부');
  }],
  ['89 복원은 현재 기록을 먼저 백업한 뒤 수행', () => {
    const box: Record<string, string> = {};
    const storage: StorageAdapter = { getItem: (k) => box[k] ?? null, setItem: (k, v) => { box[k] = v; } };
    const lost = { ...createDefaultProfile(), collection: { jacheongbi: 4 }, runsWon: 3, ascensionUnlocked: 1 };
    const current = { ...createDefaultProfile(), collection: { sanpan: 1 } };
    backupProfile(storage, { schemaVersion: 1, payload: JSON.stringify(lost), source: 'local', savedAt: 100, owner: { kind: 'guest' }, profileSchema: 3 });
    const restored = restoreBackup(storage, { profile: current, owner: { kind: 'guest' } }, 900);
    assert(restored.ok, '복원 성공');
    equal(restored.profile.collection, lost.collection, '잃었던 기록이 돌아옴');
    // 복원이 또 다른 소실이 되면 안 된다 — 방금 밀려난 기록이 백업에 들어가야 한다.
    const swapped = readBackup(storage);
    assert(swapped !== null && swapped.savedAt === 900, '현재 기록이 새 백업으로 교체');
    equal(JSON.parse(swapped.payload).collection, current.collection, '밀려난 기록 보존');
    assert(JSON.parse(box['bonpuri_profile_v1']).collection.jacheongbi === 4, '프로필 키에 복원본 저장');
  }],
  ['90 복원 실패 시 현재 기록을 건드리지 않음', () => {
    const box: Record<string, string> = { bonpuri_profile_v1: JSON.stringify(createDefaultProfile()) };
    const storage: StorageAdapter = { getItem: (k) => box[k] ?? null, setItem: (k, v) => { box[k] = v; } };
    assert(!restoreBackup(storage, null, 1).ok, '백업 없으면 실패');
    box[PROFILE_BACKUP_KEY] = JSON.stringify({ schemaVersion: 1, payload: '{', source: 'local', savedAt: 1, owner: { kind: 'guest' }, profileSchema: 3 });
    assert(!restoreBackup(storage, null, 1).ok, '깨진 백업이면 실패');
    equal(JSON.parse(box['bonpuri_profile_v1']), createDefaultProfile(), '프로필 무변경');
  }],
  ['91 localStorage 실패는 메타·백업·복원 모두에서 실패로 전파', () => {
    const failing: StorageAdapter = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    assert(!writeMeta(failing, { schemaVersion: 1, owner: { kind: 'guest' }, savedAt: 1, device: 'd' }).ok, '메타 저장 실패');
    assert(!backupProfile(failing, { schemaVersion: 1, payload: '{}', source: 'local', savedAt: 1, owner: { kind: 'guest' }, profileSchema: 3 }).ok, '백업 실패');
    // 백업이 실패하면 복원도 진행하지 않는다 — 덮어쓰기 전에 남길 수 없으면 덮지 않는다.
    const box: Record<string, string> = { [PROFILE_BACKUP_KEY]: JSON.stringify({ schemaVersion: 1, payload: JSON.stringify(createDefaultProfile()), source: 'local', savedAt: 1, owner: { kind: 'guest' }, profileSchema: 3 }) };
    const halfFailing: StorageAdapter = { getItem: (k) => box[k] ?? null, setItem: () => { throw new Error('quota'); } };
    assert(!restoreBackup(halfFailing, { profile: createDefaultProfile(), owner: { kind: 'guest' } }, 2).ok, '백업 못 하면 복원 중단');
  }],
];

let failures = 0;
for (const [name, test] of tests) {
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`결과: ${tests.length - failures}/${tests.length} 통과`);
if (failures > 0) process.exitCode = 1;
