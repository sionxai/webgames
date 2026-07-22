import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ServerSimulator, serverSimulator } from './services/serverSimulator';
import {
  calculateEnhancePreview,
  calculateEssenceExtraction,
  calculateRepairCost,
  getRequiredProgressChargeId,
  SWORD_SERIES_LIST,
  SWORD_STAGES
} from './constants/gameBalance';
import {
  BossDefeatResult,
  EnhanceAttemptResult,
  ForgeController,
  HuntResolution,
  SwordSeriesId,
  UserGameProfile
} from './types/game';
import {
  ForgeAgentActionEnvelope,
  ForgeAgentActionOption,
  ForgeAgentActionResult,
  ForgeAgentObservation,
  ForgeAgentRuntimeSnapshot,
  ForgeAgentSpeed,
  ForgeAgentStrategy,
  ForgeAgentTraceExport
} from './types/agent';
import { createForgeAgentRuntime } from './services/forgeAgentRuntime';
import { CombatAttackResult, CombatCanvas } from './components/game/CombatCanvas';
import { EnhancePanel } from './components/game/EnhancePanel';
import { AgentRunPanel } from './components/agent/AgentRunPanel';
import { PermanentUpgradesModal } from './components/game/PermanentUpgradesModal';
import { ShareCardModal } from './components/game/ShareCardModal';
import { RankingView } from './components/portal/RankingView';
import { CollectionGuideView } from './components/portal/CollectionGuideView';
import { LegalDocsModal } from './components/portal/LegalDocsModal';
import { GAME_IMAGES } from './constants/imageAssets';
import { BookOpen, Bot, Flame, ScrollText, Share2, Sparkles, Trophy } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
type ActiveTab = 'game' | 'arena' | 'ranking' | 'collection';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ForgeAgentBridge {
  observe(): ForgeAgentObservation;
  actions(): ForgeAgentActionOption[];
  act(envelope: ForgeAgentActionEnvelope): Promise<ForgeAgentActionResult>;
  exportTrace(): ForgeAgentTraceExport;
}

declare global {
  interface Window {
    webgamesAgent?: ForgeAgentBridge;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseCombatState(renderState: (() => string) | null): unknown {
  if (!renderState) return null;
  try {
    return JSON.parse(renderState());
  } catch {
    return null;
  }
}

function chooseSeriesForStrategy(
  profile: UserGameProfile,
  strategy: ForgeAgentStrategy
): SwordSeriesId {
  const blueprintLevel = profile.upgrades.ancient_blueprint || 0;
  const unlocked = new Set(
    SWORD_SERIES_LIST
      .filter(series => blueprintLevel >= series.requiredBlueprintLevel)
      .map(series => series.id)
  );
  const preferences: Record<ForgeAgentStrategy, readonly SwordSeriesId[]> = {
    aggressive: ['dragon', 'berserk', 'flame', 'kingdom', 'guardian'],
    cautious: ['guardian', 'dragon', 'kingdom', 'flame', 'berserk'],
    balanced: ['dragon', 'flame', 'guardian', 'kingdom', 'berserk']
  };
  return preferences[strategy].find(seriesId => unlocked.has(seriesId)) ?? 'kingdom';
}

function buildAgentActions(
  profile: UserGameProfile,
  hasCombatTarget: boolean,
  strategy: ForgeAgentStrategy
): ForgeAgentActionOption[] {
  const destroyed = profile.currentCrackCount >= 3;
  const maxLevel = profile.currentLevel >= SWORD_STAGES.length - 1;
  const preview = calculateEnhancePreview(profile);
  const requiredChargeId = getRequiredProgressChargeId(profile.currentLevel);
  const chargeReady = requiredChargeId === null
    || profile.currentWeapon.progressCharges[requiredChargeId] > 0;
  const canAfford = profile.gold >= preview.cost;
  const repairCost = calculateRepairCost(profile);
  const canRepair = profile.currentCrackCount > 0
    && !destroyed
    && profile.gold >= repairCost;
  const canSelectSeries = profile.currentLevel === 0
    && profile.currentCrackCount === 0
    && profile.currentWeapon.enhanceAttempts === 0;
  const targetSeriesId = chooseSeriesForStrategy(profile, strategy);
  const shouldSelectSeries = canSelectSeries && targetSeriesId !== profile.currentSeriesId;
  const voluntaryEssences = calculateEssenceExtraction(profile.currentLevel);
  const debrisEssences = Math.floor(voluntaryEssences * 0.25);

  let enhanceReason = '강화 조건이 충족되었습니다.';
  if (destroyed) enhanceReason = '파괴된 검은 강화할 수 없습니다.';
  else if (maxLevel) enhanceReason = '이미 최고 +20 단계입니다.';
  else if (!chargeReady) enhanceReason = `${requiredChargeId === 'tempered' ? '제련의 불씨' : '심연의 인장'} 충전이 필요합니다.`;
  else if (!canAfford) enhanceReason = `${(preview.cost - profile.gold).toLocaleString()} G가 부족합니다.`;

  let repairReason = '균열 1개를 수리할 수 있습니다.';
  if (destroyed) repairReason = '파괴된 검은 수리 대신 복구 또는 잔해 정산이 필요합니다.';
  else if (profile.currentCrackCount <= 0) repairReason = '수리할 균열이 없습니다.';
  else if (profile.gold < repairCost) repairReason = `${(repairCost - profile.gold).toLocaleString()} G가 부족합니다.`;

  return [
    {
      action: 'attack',
      enabled: hasCombatTarget && !destroyed,
      label: '현재 적 공격',
      reason: destroyed
        ? '파괴된 검으로는 공격할 수 없습니다.'
        : hasCombatTarget ? '현재 AI 전투 화면의 적을 공격합니다.' : 'AI 관전 화면을 열어야 공격할 수 있습니다.'
    },
    {
      action: 'enhance',
      enabled: !destroyed && !maxLevel && chargeReady && canAfford,
      label: `+${Math.min(20, profile.currentLevel + 1)} 강화`,
      reason: enhanceReason,
      metadata: { cost: preview.cost, requiredChargeId, chargeReady, canAfford }
    },
    {
      action: 'repair',
      enabled: canRepair,
      label: '균열 수리',
      reason: repairReason,
      metadata: { cost: repairCost }
    },
    {
      action: 'sell',
      enabled: !destroyed && profile.currentLevel > 0,
      label: '검 매각',
      reason: destroyed
        ? '파괴된 검은 잔해 정산만 가능합니다.'
        : profile.currentLevel > 0 ? '골드를 받고 현재 런을 계속합니다.' : '+0 검은 매각하지 않습니다.'
    },
    {
      action: 'extract',
      enabled: destroyed || profile.currentLevel >= 5,
      label: destroyed ? '파괴 잔해 정산' : '정수 추출',
      reason: destroyed
        ? '자발 추출량의 25%를 회수하고 새 런을 시작합니다.'
        : profile.currentLevel >= 5 ? '정수를 회수하고 새 런을 시작합니다.' : '+5 이상 검만 자발적으로 추출할 수 있습니다.',
      payload: { settlement: destroyed ? 'debris' : 'voluntary' },
      metadata: { essences: destroyed ? debrisEssences : voluntaryEssences }
    },
    {
      action: 'ad_restore',
      enabled: destroyed && profile.adRestoredCountThisRun < 1,
      label: '로컬 모의 복구',
      reason: !destroyed
        ? '파괴된 검만 복구할 수 있습니다.'
        : profile.adRestoredCountThisRun >= 1 ? '이번 런의 복구 기회를 이미 사용했습니다.' : '검을 2단계 낮추고 균열 1개로 복구합니다.'
    },
    {
      action: 'select_series',
      enabled: shouldSelectSeries,
      label: '검 계열 선택',
      reason: !canSelectSeries
        ? '+0 무시도 새 검에서만 계열을 선택할 수 있습니다.'
        : shouldSelectSeries ? '현재 전략에 맞는 해금 계열을 선택합니다.' : '현재 계열이 전략에 맞는 선택입니다.',
      payload: { seriesId: targetSeriesId }
    },
    {
      action: 'wait',
      enabled: true,
      label: '대기',
      reason: '상태를 변경하지 않고 다음 판단 주기를 기다립니다.'
    }
  ];
}

export default function App() {
  const agentSimulatorRef = useRef<ServerSimulator | null>(null);
  if (agentSimulatorRef.current === null) {
    agentSimulatorRef.current = new ServerSimulator(Math.random, {
      controller: 'agent',
      nickname: 'Forge Watcher'
    });
  }
  const agentSimulator = agentSimulatorRef.current;

  const [humanProfile, setHumanProfile] = useState<UserGameProfile>(() => serverSimulator.getProfile());
  const [agentProfile, setAgentProfile] = useState<UserGameProfile>(() => agentSimulator.getProfile());
  const [activeTab, setActiveTab] = useState<ActiveTab>('game');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map<number, number>());
  const upgradeButtonRef = useRef<HTMLButtonElement | null>(null);
  const agentRevisionRef = useRef(0);
  const agentProfileRef = useRef(agentProfile);
  const agentStrategyRef = useRef<ForgeAgentStrategy>('balanced');
  const agentAttackRef = useRef<(() => CombatAttackResult) | null>(null);
  const agentRenderStateRef = useRef<(() => string) | null>(null);
  const agentDisposeTimerRef = useRef<number | null>(null);
  agentProfileRef.current = agentProfile;

  useEffect(() => () => {
    toastTimersRef.current.forEach(timer => window.clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(current => [...current.slice(-2), { id, message, tone }]);

    const timer = window.setTimeout(() => {
      setToasts(current => current.filter(toast => toast.id !== id));
      toastTimersRef.current.delete(id);
    }, 3600);
    toastTimersRef.current.set(id, timer);
  }, []);

  const refreshHumanProfile = useCallback(() => {
    const nextProfile = serverSimulator.getProfile();
    setHumanProfile(nextProfile);
    return nextProfile;
  }, []);

  const refreshAgentProfile = useCallback(() => {
    const nextProfile = agentSimulator.getProfile();
    agentProfileRef.current = nextProfile;
    agentRevisionRef.current += 1;
    setAgentProfile(nextProfile);
    return agentRevisionRef.current;
  }, [agentSimulator]);

  const getAgentObservation = useCallback((): ForgeAgentObservation => {
    const profile = agentSimulator.getProfile();
    const preview = calculateEnhancePreview(profile);
    const requiredChargeId = getRequiredProgressChargeId(profile.currentLevel);
    const chargeReady = requiredChargeId === null
      || profile.currentWeapon.progressCharges[requiredChargeId] > 0;

    return {
      revision: agentRevisionRef.current,
      observedAt: Date.now(),
      profile: {
        nickname: profile.nickname,
        controller: profile.controller,
        gold: profile.gold,
        essences: profile.essences,
        currentSeriesId: profile.currentSeriesId,
        currentLevel: profile.currentLevel,
        currentCrackCount: profile.currentCrackCount,
        totalEnhanceAttempts: profile.totalEnhanceAttempts,
        isDestroyed: profile.currentCrackCount >= 3,
        currentWeapon: {
          weaponId: profile.currentWeapon.weaponId,
          enhanceAttempts: profile.currentWeapon.enhanceAttempts,
          repairCount: profile.currentWeapon.repairCount,
          adRestoreCount: profile.currentWeapon.adRestoreCount,
          progressCharges: { ...profile.currentWeapon.progressCharges }
        },
        bestRecord: profile.bestRecords.agent ? { ...profile.bestRecords.agent } : null
      },
      enhance: {
        cost: preview.cost,
        canAfford: profile.gold >= preview.cost,
        requiredChargeId,
        chargeReady,
        hasRequiredCharge: chargeReady,
        isMaxLevel: profile.currentLevel >= SWORD_STAGES.length - 1
      },
      combat: parseCombatState(agentRenderStateRef.current)
    };
  }, [agentSimulator]);

  const getAgentActions = useCallback(() => buildAgentActions(
    agentSimulator.getProfile(),
    agentAttackRef.current !== null,
    agentStrategyRef.current
  ), [agentSimulator]);

  const executeAgentAction = useCallback((
    envelope: ForgeAgentActionEnvelope
  ) => {
    const option = getAgentActions().find(candidate => candidate.action === envelope.action);
    if (!option?.enabled) {
      return {
        ok: false,
        revision: agentRevisionRef.current,
        message: option?.reason ?? '현재 상태에서 실행할 수 없는 행동입니다.'
      };
    }

    try {
      switch (envelope.action) {
        case 'attack': {
          const requestAttack = agentAttackRef.current;
          if (!requestAttack) throw new Error('AI 관전 전투 화면이 준비되지 않았습니다.');
          const result = requestAttack();
          agentRevisionRef.current += 1;
          return {
            ok: result.ok,
            revision: agentRevisionRef.current,
            message: result.message
          };
        }
        case 'enhance': {
          const result = agentSimulator.attemptEnhance();
          const revision = refreshAgentProfile();
          return { ok: true, revision, message: result.message, data: result };
        }
        case 'repair': {
          const repaired = agentSimulator.repairCrack();
          const revision = repaired ? refreshAgentProfile() : agentRevisionRef.current;
          return {
            ok: repaired,
            revision,
            message: repaired ? '균열 1개를 수리했습니다.' : '수리할 균열이 없습니다.'
          };
        }
        case 'sell': {
          const goldGained = agentSimulator.sellCurrentSword();
          const revision = refreshAgentProfile();
          return {
            ok: true,
            revision,
            message: `검을 매각해 ${goldGained.toLocaleString()} G를 획득했습니다.`,
            data: { goldGained }
          };
        }
        case 'extract': {
          const destroyed = agentSimulator.getProfile().currentCrackCount >= 3;
          const essencesGained = destroyed
            ? agentSimulator.finishRunAndClaimEssences()
            : agentSimulator.extractCurrentSword();
          const revision = refreshAgentProfile();
          return {
            ok: true,
            revision,
            message: destroyed
              ? `파괴 잔해를 정산해 정수 ${essencesGained.toLocaleString()}개를 회수했습니다.`
              : `검에서 정수 ${essencesGained.toLocaleString()}개를 추출했습니다.`,
            data: { essencesGained, settlement: destroyed ? 'debris' : 'voluntary' }
          };
        }
        case 'ad_restore': {
          const restored = agentSimulator.adRestoreSword();
          const revision = restored ? refreshAgentProfile() : agentRevisionRef.current;
          return {
            ok: restored,
            revision,
            message: restored ? '로컬 모의 복구를 적용했습니다.' : '검을 복구하지 못했습니다.'
          };
        }
        case 'select_series': {
          const advertisedSeriesId = option.payload?.seriesId;
          const requestedSeriesId = envelope.payload?.seriesId;
          if (typeof requestedSeriesId !== 'string' || requestedSeriesId !== advertisedSeriesId) {
            throw new Error('현재 actions()가 제시한 해금 계열만 선택할 수 있습니다.');
          }
          const selected = agentSimulator.selectSwordSeries(requestedSeriesId as SwordSeriesId);
          const revision = selected ? refreshAgentProfile() : agentRevisionRef.current;
          const selectedSeries = SWORD_SERIES_LIST.find(series => series.id === requestedSeriesId);
          return {
            ok: selected,
            revision,
            message: selected ? `${selectedSeries?.name ?? requestedSeriesId} 계열을 선택했습니다.` : '검 계열을 선택하지 못했습니다.'
          };
        }
        case 'wait':
          return {
            ok: true,
            revision: agentRevisionRef.current,
            message: '상태를 변경하지 않고 대기했습니다.'
          };
      }
    } catch (error: unknown) {
      return {
        ok: false,
        revision: agentRevisionRef.current,
        message: getErrorMessage(error, '도메인 행동을 실행하지 못했습니다.')
      };
    }
  }, [agentSimulator, getAgentActions, refreshAgentProfile]);

  const [agentRuntime] = useState(() => createForgeAgentRuntime({
    getObservation: getAgentObservation,
    getAvailableActions: getAgentActions,
    executeAction: executeAgentAction
  }, {
    agentName: 'Forge Watcher',
    strategy: 'balanced'
  }));
  const [agentSnapshot, setAgentSnapshot] = useState<ForgeAgentRuntimeSnapshot>(() => (
    agentRuntime.getSnapshot()
  ));

  useEffect(() => {
    const unsubscribe = agentRuntime.subscribe(setAgentSnapshot);
    setAgentSnapshot(agentRuntime.getSnapshot());
    return () => unsubscribe();
  }, [agentRuntime]);

  useEffect(() => {
    if (agentDisposeTimerRef.current !== null) {
      window.clearTimeout(agentDisposeTimerRef.current);
      agentDisposeTimerRef.current = null;
    }
    const bridge: ForgeAgentBridge = Object.freeze({
      observe: agentRuntime.observe.bind(agentRuntime),
      actions: agentRuntime.actions.bind(agentRuntime),
      act: agentRuntime.act.bind(agentRuntime),
      exportTrace: agentRuntime.exportTrace.bind(agentRuntime)
    });
    window.webgamesAgent = bridge;
    return () => {
      if (window.webgamesAgent === bridge) delete window.webgamesAgent;
      // React StrictMode는 개발 중 effect를 setup → cleanup → setup으로 재실행한다.
      // 다음 setup이 취소할 수 있도록 실제 dispose를 한 task 늦춰 진짜 언마운트만 정리한다.
      agentDisposeTimerRef.current = window.setTimeout(() => {
        agentRuntime.dispose();
        agentDisposeTimerRef.current = null;
      }, 0);
    };
  }, [agentRuntime]);

  const simulatorFor = useCallback((lane: ForgeController) => (
    lane === 'agent' ? agentSimulator : serverSimulator
  ), [agentSimulator]);

  const refreshLane = useCallback((lane: ForgeController) => (
    lane === 'agent' ? refreshAgentProfile() : refreshHumanProfile()
  ), [refreshAgentProfile, refreshHumanProfile]);

  const handleNormalEnemyDefeated = useCallback((
    lane: ForgeController,
    baseGold: number
  ): HuntResolution => {
    const result = simulatorFor(lane).defeatNormalEnemy(baseGold);
    refreshLane(lane);
    if (result.bossRevealed && result.activeEncounter) {
      showToast(`${lane === 'agent' ? 'AI · ' : ''}+${result.activeEncounter.levelSnapshot} 단계 보스 조우`, 'info');
    }
    return result;
  }, [refreshLane, showToast, simulatorFor]);

  const handleBossDefeated = useCallback((
    lane: ForgeController,
    encounterId: string
  ): BossDefeatResult => {
    try {
      const result = simulatorFor(lane).defeatBoss(encounterId);
      refreshLane(lane);
      const prefix = lane === 'agent' ? 'AI · ' : '';
      showToast(
        result.firstRewardGranted
          ? `${prefix}최초 격파 · ${result.goldGained.toLocaleString()} G / 정수 ${result.essencesGained.toLocaleString()}개`
          : `${prefix}확정 진행 충전 지급`,
        result.firstRewardGranted ? 'success' : 'info'
      );
      return result;
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '보스 보상을 처리하지 못했습니다.'), 'error');
      throw error;
    }
  }, [refreshLane, showToast, simulatorFor]);

  const handleAttemptEnhance = useCallback((lane: ForgeController): EnhanceAttemptResult => {
    const result = simulatorFor(lane).attemptEnhance();
    refreshLane(lane);
    return result;
  }, [refreshLane, simulatorFor]);

  const handleRepairCrack = useCallback((lane: ForgeController) => {
    simulatorFor(lane).repairCrack();
    refreshLane(lane);
  }, [refreshLane, simulatorFor]);

  const handleAdRestore = useCallback((lane: ForgeController) => {
    simulatorFor(lane).adRestoreSword();
    refreshLane(lane);
  }, [refreshLane, simulatorFor]);

  const handleFinishRun = useCallback((lane: ForgeController) => {
    const gained = simulatorFor(lane).finishRunAndClaimEssences();
    refreshLane(lane);
    showToast(`${lane === 'agent' ? 'AI · ' : ''}파괴 잔해 정산 · 정수 +${gained.toLocaleString()}개`, 'success');
  }, [refreshLane, showToast, simulatorFor]);

  const handleSellSword = useCallback((lane: ForgeController) => {
    const goldGained = simulatorFor(lane).sellCurrentSword();
    refreshLane(lane);
    showToast(`${lane === 'agent' ? 'AI · ' : ''}검 매각 · +${goldGained.toLocaleString()} G`, 'success');
  }, [refreshLane, showToast, simulatorFor]);

  const handleExtractSword = useCallback((lane: ForgeController) => {
    const essencesGained = simulatorFor(lane).extractCurrentSword();
    refreshLane(lane);
    showToast(`${lane === 'agent' ? 'AI · ' : ''}정수 추출 · +${essencesGained.toLocaleString()}개`, 'success');
  }, [refreshLane, showToast, simulatorFor]);

  const handleSelectSeries = useCallback((lane: ForgeController, seriesId: SwordSeriesId) => {
    simulatorFor(lane).selectSwordSeries(seriesId);
    refreshLane(lane);
  }, [refreshLane, simulatorFor]);

  const currentLane: ForgeController = activeTab === 'arena' ? 'agent' : 'human';
  const activeProfile = currentLane === 'agent' ? agentProfile : humanProfile;

  const handleBuyUpgrade = useCallback((upgradeId: string) => {
    try {
      const lane: ForgeController = activeTab === 'arena' ? 'agent' : 'human';
      const purchased = simulatorFor(lane).buyUpgrade(upgradeId);
      if (!purchased) throw new Error('존재하지 않는 영구 성장 항목입니다.');
      refreshLane(lane);
      showToast(`${lane === 'agent' ? 'AI · ' : ''}영구 성장 적용 완료`, 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '영구 성장을 적용하지 못했습니다.'), 'error');
    }
  }, [activeTab, refreshLane, showToast, simulatorFor]);

  const closeUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    window.requestAnimationFrame(() => upgradeButtonRef.current?.focus());
  }, []);

  const showHumanGame = useCallback(() => {
    agentRuntime.pause();
    setActiveTab('game');
  }, [agentRuntime]);

  const showNonAgentTab = useCallback((tab: Exclude<ActiveTab, 'arena'>) => {
    agentRuntime.pause();
    setActiveTab(tab);
  }, [agentRuntime]);

  const handleAgentStart = useCallback(() => {
    setActiveTab('arena');
    agentRuntime.start();
  }, [agentRuntime]);

  const handleAgentStrategyChange = useCallback((strategy: ForgeAgentStrategy) => {
    agentStrategyRef.current = strategy;
    agentRuntime.setStrategy(strategy);
  }, [agentRuntime]);

  const handleAgentSpeedChange = useCallback((speed: ForgeAgentSpeed) => {
    agentRuntime.setSpeed(speed);
  }, [agentRuntime]);

  const handleAgentAttackReady = useCallback((requestAttack: (() => CombatAttackResult) | null) => {
    agentAttackRef.current = requestAttack;
  }, []);

  const handleAgentRenderStateReady = useCallback((renderState: (() => string) | null) => {
    agentRenderStateRef.current = renderState;
  }, []);

  return (
    <div className="forge-app">
      <header
        className="forge-header"
        style={{ backgroundImage: `url(${GAME_IMAGES.forgeArena})` }}
      >
        <div className="forge-header__shade" />
        <div className="forge-header__content">
          <div className="forge-brand-row">
            <div>
              <p className="forge-brand__eyebrow">THE ANVIL AWAITS</p>
              <h1>Project Forge</h1>
            </div>
            <button
              type="button"
              className="icon-text-button forge-policy-button"
              onClick={() => setShowLegalModal(true)}
            >
              <ScrollText size={15} aria-hidden="true" />
              정책
            </button>
          </div>

          <div className="resource-hud" aria-label={`${currentLane === 'agent' ? 'AI' : '사람'} 보유 자원과 빠른 메뉴`}>
            <span className={`resource-lane-badge resource-lane-badge--${currentLane}`}>
              {currentLane === 'agent' ? 'AI SAVE' : 'HUMAN SAVE'}
            </span>
            <div className="resource-hud__balances">
              <span className="resource-chip resource-chip--gold">
                <span aria-hidden="true">◆</span>
                <strong>{activeProfile.gold.toLocaleString()}</strong>
                <small>G</small>
              </span>
              <span className="resource-chip resource-chip--essence">
                <span aria-hidden="true">✦</span>
                <strong>{activeProfile.essences.toLocaleString()}</strong>
                <small>정수</small>
              </span>
            </div>
            <div className="resource-hud__actions">
              <button
                ref={upgradeButtonRef}
                type="button"
                className="hud-action hud-action--essence"
                onClick={() => setShowUpgradeModal(true)}
                disabled={currentLane === 'agent'}
                title={currentLane === 'agent' ? 'AI 관전 화면에서는 직접 성장할 수 없습니다.' : undefined}
              >
                <Sparkles size={15} aria-hidden="true" />
                성장
              </button>
              <button
                type="button"
                className="hud-action"
                onClick={() => setShowShareModal(true)}
              >
                <Share2 size={15} aria-hidden="true" />
                공유
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="forge-tabs" aria-label="Project Forge 메뉴">
        <button
          type="button"
          className={activeTab === 'game' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={showHumanGame}
          aria-current={activeTab === 'game' ? 'page' : undefined}
        >
          <Flame size={17} aria-hidden="true" />
          대장간
        </button>
        <button
          type="button"
          className={activeTab === 'arena' ? 'forge-tab is-active forge-tab--agent' : 'forge-tab forge-tab--agent'}
          onClick={() => setActiveTab('arena')}
          aria-current={activeTab === 'arena' ? 'page' : undefined}
        >
          <Bot size={17} aria-hidden="true" />
          AI 관전
        </button>
        <button
          type="button"
          className={activeTab === 'ranking' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={() => showNonAgentTab('ranking')}
          aria-current={activeTab === 'ranking' ? 'page' : undefined}
        >
          <Trophy size={17} aria-hidden="true" />
          기록
        </button>
        <button
          type="button"
          className={activeTab === 'collection' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={() => showNonAgentTab('collection')}
          aria-current={activeTab === 'collection' ? 'page' : undefined}
        >
          <BookOpen size={17} aria-hidden="true" />
          도감
        </button>
      </nav>

      <main className={activeTab === 'game' || activeTab === 'arena' ? 'forge-main forge-main--game' : 'forge-main'}>
        {activeTab === 'game' && (
          <>
            <CombatCanvas
              profile={humanProfile}
              mode="human"
              onNormalEnemyDefeated={baseGold => handleNormalEnemyDefeated('human', baseGold)}
              onBossDefeated={encounterId => handleBossDefeated('human', encounterId)}
            />
            <EnhancePanel
              profile={humanProfile}
              onAttemptEnhance={() => handleAttemptEnhance('human')}
              onRepairCrack={() => handleRepairCrack('human')}
              onAdRestore={() => handleAdRestore('human')}
              onFinishRun={() => handleFinishRun('human')}
              onSellSword={() => handleSellSword('human')}
              onExtractSword={() => handleExtractSword('human')}
              onSelectSeries={seriesId => handleSelectSeries('human', seriesId)}
            />
          </>
        )}

        {activeTab === 'arena' && (
          <>
            <AgentRunPanel
              snapshot={agentSnapshot}
              view="agent"
              onViewChange={view => {
                if (view === 'human') showHumanGame();
              }}
              onStrategyChange={handleAgentStrategyChange}
              onStart={handleAgentStart}
              onPause={() => agentRuntime.pause()}
              onStop={() => agentRuntime.stop()}
              onSpeedChange={handleAgentSpeedChange}
            />
            <CombatCanvas
              profile={agentProfile}
              mode="agent"
              autoAttackEnabled={agentSnapshot.status === 'running'}
              onNormalEnemyDefeated={baseGold => handleNormalEnemyDefeated('agent', baseGold)}
              onBossDefeated={encounterId => handleBossDefeated('agent', encounterId)}
              onAgentAttackReady={handleAgentAttackReady}
              onRenderStateReady={handleAgentRenderStateReady}
            />
            <EnhancePanel
              profile={agentProfile}
              readOnly
              onAttemptEnhance={() => handleAttemptEnhance('agent')}
              onRepairCrack={() => handleRepairCrack('agent')}
              onAdRestore={() => handleAdRestore('agent')}
              onFinishRun={() => handleFinishRun('agent')}
              onSellSword={() => handleSellSword('agent')}
              onExtractSword={() => handleExtractSword('agent')}
              onSelectSeries={seriesId => handleSelectSeries('agent', seriesId)}
            />
          </>
        )}

        {activeTab === 'ranking' && (
          <RankingView humanProfile={humanProfile} agentProfile={agentProfile} />
        )}
        {activeTab === 'collection' && <CollectionGuideView profile={humanProfile} />}
      </main>

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(toast => (
          <div key={toast.id} className={`forge-toast forge-toast--${toast.tone}`} role="status">
            <span className="forge-toast__mark" aria-hidden="true" />
            {toast.message}
          </div>
        ))}
      </div>

      {showUpgradeModal && (
        <PermanentUpgradesModal
          profile={activeProfile}
          onBuyUpgrade={handleBuyUpgrade}
          onClose={closeUpgradeModal}
        />
      )}
      {showShareModal && (
        <ShareCardModal profile={activeProfile} onClose={() => setShowShareModal(false)} />
      )}
      {showLegalModal && <LegalDocsModal onClose={() => setShowLegalModal(false)} />}
    </div>
  );
}
