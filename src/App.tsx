import React, { useCallback, useEffect, useRef, useState } from 'react';
import { serverSimulator } from './services/serverSimulator';
import {
  BossDefeatResult,
  EnhanceAttemptResult,
  HuntResolution,
  UserGameProfile
} from './types/game';
import { CombatCanvas } from './components/game/CombatCanvas';
import { EnhancePanel } from './components/game/EnhancePanel';
import { PermanentUpgradesModal } from './components/game/PermanentUpgradesModal';
import { ShareCardModal } from './components/game/ShareCardModal';
import { RankingView } from './components/portal/RankingView';
import { CollectionGuideView } from './components/portal/CollectionGuideView';
import { LegalDocsModal } from './components/portal/LegalDocsModal';
import { GAME_IMAGES } from './constants/imageAssets';
import { BookOpen, Flame, ScrollText, Share2, ShieldAlert, Sparkles, Trophy } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function App() {
  const [profile, setProfile] = useState<UserGameProfile>(() => serverSimulator.getProfile());
  const [activeTab, setActiveTab] = useState<'game' | 'ranking' | 'collection'>('game');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map<number, number>());
  const upgradeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsChallengeMode(params.has('challenge'));
  }, []);

  useEffect(() => () => {
    toastTimersRef.current.forEach(timer => window.clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  const refreshProfile = useCallback(() => {
    setProfile(serverSimulator.getProfile());
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

  const handleNormalEnemyDefeated = useCallback((baseGold: number): HuntResolution => {
    const result = serverSimulator.defeatNormalEnemy(baseGold);
    refreshProfile();
    if (result.bossRevealed && result.activeEncounter) {
      showToast(`보스 조우 · +${result.activeEncounter.levelSnapshot} 단계의 징조가 현실이 되었습니다.`, 'info');
    }
    return result;
  }, [refreshProfile, showToast]);

  const handleBossDefeated = useCallback((encounterId: string): BossDefeatResult => {
    try {
      const result = serverSimulator.defeatBoss(encounterId);
      refreshProfile();

      if (result.firstRewardGranted) {
        showToast(
          `최초 격파 보상 · ${result.goldGained.toLocaleString()} G / 정수 ${result.essencesGained.toLocaleString()}개`,
          'success'
        );
      } else {
        showToast('이 마일스톤의 보상은 이번 런에서 이미 수령했습니다.', 'info');
      }

      const progressParts: string[] = [];
      if (result.progressReward.gained.tempered > 0) {
        progressParts.push(`제련의 불씨 +${result.progressReward.gained.tempered} (보유 ${result.progressReward.after.tempered}/4)`);
      }
      if (result.progressReward.gained.awakened > 0) {
        progressParts.push(`심연의 인장 +${result.progressReward.gained.awakened} (보유 ${result.progressReward.after.awakened}/3)`);
      }
      if (progressParts.length > 0) {
        showToast(`확정 진행 충전 · ${progressParts.join(' / ')}`, 'success');
      }

      if (result.transcendenceReward) {
        const rare = result.transcendenceReward;
        const relicName = rare.relicId === 'godblood' ? '신혈의 성유물' : '종말의 성유물';
        const rareSummary = rare.fullRelicDropped
          ? `${relicName} 완제품 +${rare.relicsGained}`
          : `${relicName} 조각 +${rare.shardsGained}`;
        showToast(`초월 판정 · ${rareSummary}`, rare.fullRelicDropped ? 'success' : 'info');
      }

      return result;
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '보스 보상을 처리하지 못했습니다.'), 'error');
      throw error;
    }
  }, [refreshProfile, showToast]);

  const handleAttemptEnhance = useCallback((): EnhanceAttemptResult | null => {
    const result = serverSimulator.attemptEnhance();
    refreshProfile();
    return result;
  }, [refreshProfile]);

  const handleRepairCrack = useCallback(() => {
    serverSimulator.repairCrack();
    refreshProfile();
  }, [refreshProfile]);

  const handleAdRestore = useCallback(() => {
    serverSimulator.adRestoreSword();
    refreshProfile();
  }, [refreshProfile]);

  const handleFinishRun = useCallback(() => {
    try {
      const gained = serverSimulator.finishRunAndClaimEssences();
      refreshProfile();
      showToast(`런 정산 완료 · 대장장이의 정수 +${gained.toLocaleString()}개`, 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '런 정산에 실패했습니다.'), 'error');
    }
  }, [refreshProfile, showToast]);

  const handleSellSword = useCallback(() => {
    if (profile.currentLevel <= 0) {
      showToast('+0 녹슨 철검은 매각할 수 없습니다.', 'info');
      return;
    }

    try {
      const goldGained = serverSimulator.sellCurrentSword();
      refreshProfile();
      showToast(`검 매각 완료 · +${goldGained.toLocaleString()} G`, 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '검 매각에 실패했습니다.'), 'error');
    }
  }, [profile.currentLevel, refreshProfile, showToast]);

  const handleBuyUpgrade = useCallback((upgradeId: string) => {
    try {
      const purchased = serverSimulator.buyUpgrade(upgradeId);
      if (!purchased) {
        throw new Error('존재하지 않는 영구 성장 항목입니다.');
      }
      refreshProfile();
      showToast('영구 성장 적용 완료', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error, '영구 성장을 적용하지 못했습니다.'), 'error');
    }
  }, [refreshProfile, showToast]);

  const closeUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    window.requestAnimationFrame(() => upgradeButtonRef.current?.focus());
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

          <div className="resource-hud" aria-label="보유 자원과 빠른 메뉴">
            <div className="resource-hud__balances">
              <span className="resource-chip resource-chip--gold">
                <span aria-hidden="true">◆</span>
                <strong>{profile.gold.toLocaleString()}</strong>
                <small>G</small>
              </span>
              <span className="resource-chip resource-chip--essence">
                <span aria-hidden="true">✦</span>
                <strong>{profile.essences.toLocaleString()}</strong>
                <small>정수</small>
              </span>
            </div>
            <div className="resource-hud__actions">
              <button
                ref={upgradeButtonRef}
                type="button"
                className="hud-action hud-action--essence"
                onClick={() => setShowUpgradeModal(true)}
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

      {isChallengeMode && (
        <div className="challenge-banner" role="status">
          <ShieldAlert size={15} aria-hidden="true" />
          공유 기록 돌파에 도전 중
        </div>
      )}

      <nav className="forge-tabs" aria-label="Project Forge 메뉴">
        <button
          type="button"
          className={activeTab === 'game' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={() => setActiveTab('game')}
          aria-current={activeTab === 'game' ? 'page' : undefined}
        >
          <Flame size={17} aria-hidden="true" />
          대장간
        </button>
        <button
          type="button"
          className={activeTab === 'ranking' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={() => setActiveTab('ranking')}
          aria-current={activeTab === 'ranking' ? 'page' : undefined}
        >
          <Trophy size={17} aria-hidden="true" />
          랭킹
        </button>
        <button
          type="button"
          className={activeTab === 'collection' ? 'forge-tab is-active' : 'forge-tab'}
          onClick={() => setActiveTab('collection')}
          aria-current={activeTab === 'collection' ? 'page' : undefined}
        >
          <BookOpen size={17} aria-hidden="true" />
          도감
        </button>
      </nav>

      <main className={activeTab === 'game' ? 'forge-main forge-main--game' : 'forge-main'}>
        {activeTab === 'game' && (
          <>
            <CombatCanvas
              profile={profile}
              onNormalEnemyDefeated={handleNormalEnemyDefeated}
              onBossDefeated={handleBossDefeated}
            />
            <EnhancePanel
              profile={profile}
              onAttemptEnhance={handleAttemptEnhance}
              onRepairCrack={handleRepairCrack}
              onAdRestore={handleAdRestore}
              onFinishRun={handleFinishRun}
              onSellSword={handleSellSword}
            />
          </>
        )}

        {activeTab === 'ranking' && <RankingView profile={profile} />}
        {activeTab === 'collection' && <CollectionGuideView profile={profile} />}
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
          profile={profile}
          onBuyUpgrade={handleBuyUpgrade}
          onClose={closeUpgradeModal}
        />
      )}
      {showShareModal && <ShareCardModal profile={profile} onClose={() => setShowShareModal(false)} />}
      {showLegalModal && <LegalDocsModal onClose={() => setShowLegalModal(false)} />}
    </div>
  );
}
