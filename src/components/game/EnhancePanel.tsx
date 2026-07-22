import React, { useEffect, useRef, useState } from 'react';
import {
  calculateEnhancePreview,
  calculateSwordSellValue,
  getCatalystGateStatus,
  SWORD_SERIES_LIST,
  SWORD_STAGES
} from '../../constants/gameBalance';
import { CatalystActivationResult, EnhanceAttemptResult, UserGameProfile } from '../../types/game';
import { MaterialSprite } from '../common/MaterialSprite';
import { SwordSprite } from '../common/SwordSprite';
import confetti from 'canvas-confetti';
import { AlertTriangle, ArrowRight, Coins, RotateCcw, ShieldCheck, Tv, Wrench, Zap } from 'lucide-react';

interface EnhancePanelProps {
  profile: UserGameProfile;
  onAttemptEnhance: () => EnhanceAttemptResult | null;
  onActivateCatalyst: () => CatalystActivationResult;
  onRepairCrack: () => void;
  onAdRestore: () => void;
  onFinishRun: () => void;
  onSellSword: () => void;
}

interface PanelNotice {
  tone: 'success' | 'error' | 'info';
  message: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const EnhancePanel: React.FC<EnhancePanelProps> = ({
  profile,
  onAttemptEnhance,
  onActivateCatalyst,
  onRepairCrack,
  onAdRestore,
  onFinishRun,
  onSellSword
}) => {
  const [lastResult, setLastResult] = useState<EnhanceAttemptResult | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const enhanceTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (enhanceTimerRef.current !== null) {
      window.clearTimeout(enhanceTimerRef.current);
    }
  }, []);

  const currentStage = SWORD_STAGES[profile.currentLevel] || SWORD_STAGES[0];
  const nextStage = SWORD_STAGES[profile.currentLevel + 1] || null;
  const series = SWORD_SERIES_LIST.find(item => item.id === profile.currentSeriesId) || SWORD_SERIES_LIST[0];
  const preview = calculateEnhancePreview(profile);
  const rawSellValue = calculateSwordSellValue(
    profile.currentLevel,
    profile.currentSeriesId,
    profile.currentCrackCount
  );
  const forgeTemperatureLevel = profile.upgrades.forge_temp || 0;
  const estimatedSellValue = Math.round(rawSellValue * (1 + forgeTemperatureLevel * 0.15));
  const estimatedEssences = Math.floor(Math.pow(profile.currentLevel, 1.2));
  const isDestroyed = profile.currentCrackCount >= 3;
  const isMaxLevel = profile.currentLevel >= SWORD_STAGES.length - 1;
  const catalystGate = getCatalystGateStatus(profile);
  const lacksGold = profile.gold < preview.cost;
  const canSell = profile.currentLevel > 0;

  let enhanceDisabledReason: string | null = null;
  if (isDestroyed) enhanceDisabledReason = '검이 파괴되어 복구 또는 런 정산이 필요합니다.';
  else if (isMaxLevel) enhanceDisabledReason = '최고 +20 단계에 도달했습니다.';
  else if (catalystGate && catalystGate.activeCharges <= 0) {
    enhanceDisabledReason = catalystGate.inventoryCount > 0
      ? `${catalystGate.definition.name}을 먼저 장착하세요.`
      : `${catalystGate.definition.name} 촉매 충전이 필요합니다. 보스 추적으로 획득하세요.`;
  }
  else if (lacksGold) enhanceDisabledReason = `${(preview.cost - profile.gold).toLocaleString()} G가 더 필요합니다.`;
  else if (isEnhancing) enhanceDisabledReason = '망치질 결과를 확인하는 중입니다.';

  const handleActivateCatalyst = () => {
    if (!catalystGate?.canActivate) return;

    try {
      const result = onActivateCatalyst();
      setLastResult(null);
      setNotice({
        tone: 'success',
        message: `${catalystGate.definition.name} 장착 완료 · 강화 충전 ${result.activeCharges}회`
      });
    } catch (error: unknown) {
      setNotice({ tone: 'error', message: getErrorMessage(error, '촉매 장착에 실패했습니다.') });
    }
  };

  const handleEnhanceClick = () => {
    if (enhanceDisabledReason) {
      setNotice({ tone: 'info', message: enhanceDisabledReason });
      return;
    }

    setNotice(null);
    setIsEnhancing(true);
    enhanceTimerRef.current = window.setTimeout(() => {
      enhanceTimerRef.current = null;
      setIsEnhancing(false);
      try {
        const result = onAttemptEnhance();
        if (!result) {
          setNotice({ tone: 'error', message: '강화 결과를 확인하지 못했습니다.' });
          return;
        }

        setLastResult(result);
        if (result.success && result.newLevel >= 10 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          confetti({
            particleCount: 56,
            spread: 72,
            origin: { y: 0.66 },
            colors: ['#f2b35f', '#f6e3b4', '#5dbb95']
          });
        }
      } catch (error: unknown) {
        setNotice({ tone: 'error', message: getErrorMessage(error, '강화 중 오류가 발생했습니다.') });
      }
    }, 320);
  };

  const handleRepairClick = () => {
    try {
      onRepairCrack();
      setLastResult(null);
      setNotice({ tone: 'success', message: '균열 1개를 안전하게 수리했습니다.' });
    } catch (error: unknown) {
      setNotice({ tone: 'error', message: getErrorMessage(error, '균열 수리에 실패했습니다.') });
    }
  };

  const handleSimulateAdComplete = () => {
    try {
      onAdRestore();
      setShowAdModal(false);
      setLastResult(null);
      setNotice({ tone: 'success', message: '1회 복구 완료 · 검 단계가 2 낮아지고 균열 1개로 복구되었습니다.' });
    } catch (error: unknown) {
      setShowAdModal(false);
      setNotice({ tone: 'error', message: getErrorMessage(error, '광고 복구에 실패했습니다.') });
    }
  };

  const handleFinishRun = () => {
    setLastResult(null);
    setNotice(null);
    onFinishRun();
  };

  const handleSellSword = () => {
    if (!canSell) {
      setNotice({ tone: 'info', message: '+0 녹슨 철검은 매각할 수 없습니다.' });
      return;
    }
    setLastResult(null);
    setNotice(null);
    onSellSword();
  };

  return (
    <section className="enhance-panel" aria-labelledby="forge-workbench-title">
      <div className="enhance-panel__heading">
        <div>
          <span className="section-kicker">FORGE WORKBENCH</span>
          <h2 id="forge-workbench-title">강화 설계대</h2>
        </div>
        <span className="series-badge">{series.name}</span>
      </div>

      <div className="sword-comparison">
        <div className="sword-comparison__icon" style={{ '--sword-accent': currentStage.color } as React.CSSProperties}>
          <SwordSprite level={profile.currentLevel} seriesId={profile.currentSeriesId} size={72} />
        </div>
        <div className="sword-comparison__stage">
          <small>현재 검</small>
          <strong style={{ color: currentStage.color }}>+{profile.currentLevel} {currentStage.name}</strong>
          <span><Zap size={14} aria-hidden="true" /> 공격력 {currentStage.attackPower.toLocaleString()}</span>
        </div>
        <ArrowRight className="sword-comparison__arrow" size={21} aria-hidden="true" />
        <div className="sword-comparison__stage sword-comparison__stage--next">
          <small>성공 시</small>
          {nextStage ? (
            <>
              <strong style={{ color: nextStage.color }}>+{nextStage.level} {nextStage.name}</strong>
              <span><Zap size={14} aria-hidden="true" /> 공격력 {nextStage.attackPower.toLocaleString()}</span>
            </>
          ) : (
            <>
              <strong className="legend-complete">전설 완성</strong>
              <span>최고 단계 달성</span>
            </>
          )}
        </div>
      </div>

      <div className={profile.currentCrackCount > 0 ? 'crack-status has-cracks' : 'crack-status'}>
        <div>
          <small>검의 균열</small>
          <strong>{profile.currentCrackCount} / 3</strong>
        </div>
        <div className="crack-status__marks" aria-label={`균열 ${profile.currentCrackCount}개, 최대 3개`}>
          {[1, 2, 3].map(mark => (
            <span key={mark} className={mark <= profile.currentCrackCount ? 'is-filled' : ''} aria-hidden="true" />
          ))}
        </div>
        {profile.currentCrackCount > 0 && !isDestroyed && (
          <button type="button" className="repair-button" onClick={handleRepairClick}>
            <Wrench size={15} aria-hidden="true" />
            1칸 수리
          </button>
        )}
      </div>

      {catalystGate && (
        <div className={catalystGate.activeCharges > 0 ? 'catalyst-card is-charged' : 'catalyst-card'}>
          <div className="catalyst-card__material">
            <MaterialSprite atlasCell={catalystGate.definition.atlasCell} size={62} />
            <div>
              <small>+{profile.currentLevel} 강화 필수 촉매</small>
              <strong>{catalystGate.definition.name}</strong>
              <span>
                {catalystGate.discovered ? '발견 완료' : '미발견'} · 보유 {catalystGate.inventoryCount}개
              </span>
            </div>
          </div>

          <dl className="catalyst-card__stats">
            <div>
              <dt>활성 충전</dt>
              <dd>{catalystGate.activeCharges} / {catalystGate.definition.chargesPerItem}</dd>
            </div>
            <div>
              <dt>드롭률</dt>
              <dd>{catalystGate.definition.dropRate}%</dd>
            </div>
            <div>
              <dt>천장</dt>
              <dd>{catalystGate.pityCount} / {catalystGate.definition.pityThreshold}</dd>
            </div>
          </dl>

          {catalystGate.activeCharges > 0 ? (
            <p className="catalyst-card__guide" role="status">
              장착 완료 · 다음 강화 시 충전 1회를 소모합니다.
            </p>
          ) : catalystGate.inventoryCount > 0 ? (
            <button
              type="button"
              className="catalyst-activate-button"
              onClick={handleActivateCatalyst}
              disabled={!catalystGate.canActivate}
            >
              {catalystGate.canActivate
                ? `촉매 장착 · ${catalystGate.definition.chargesPerItem}회 충전`
                : '검 복구 후 촉매 장착 가능'}
            </button>
          ) : (
            <p className="catalyst-card__guide">
              보스 추적에서 {catalystGate.definition.name}을 획득하세요. 확정까지 최대 {catalystGate.killsUntilGuaranteed}회
            </p>
          )}
        </div>
      )}

      {lastResult && (
        <div className={lastResult.success ? 'forge-result is-success' : 'forge-result is-failure'} role="status">
          <strong>{lastResult.success ? '강화 성공' : '강화 결과'}</strong>
          <span>{lastResult.message}</span>
          {lastResult.catalystChargeSpent && (
            <small className="forge-result__catalyst">
              촉매 충전 1회 소모 · 잔여 {lastResult.catalystChargesRemaining}회
            </small>
          )}
        </div>
      )}

      {notice && (
        <div className={`panel-notice panel-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      {isDestroyed ? (
        <div className="destroyed-actions">
          <div className="destroyed-actions__message">
            <AlertTriangle size={22} aria-hidden="true" />
            <div>
              <strong>검 파괴 · 경제 루프 정지</strong>
              <span>사냥 보상이 중단되었습니다. 복구하거나 정수를 정산하세요.</span>
            </div>
          </div>
          <div className="destroyed-actions__buttons">
            <button
              type="button"
              className="secondary-cta secondary-cta--essence"
              onClick={() => setShowAdModal(true)}
              disabled={profile.adRestoredCountThisRun >= 1}
            >
              <Tv size={17} aria-hidden="true" />
              {profile.adRestoredCountThisRun >= 1 ? '이번 런 복구 사용 완료' : `1회 복구 · +${Math.max(0, profile.currentLevel - 2)}`}
            </button>
            <button type="button" className="secondary-cta" onClick={handleFinishRun}>
              <RotateCcw size={17} aria-hidden="true" />
              정수 정산 · 다음 런
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="enhance-odds" aria-label="강화 확률과 비용">
            <div className="odds-cell odds-cell--success">
              <small>성공 확률</small>
              <strong>{preview.successRate.toFixed(1)}%</strong>
              {preview.isProtected && <span><ShieldCheck size={13} aria-hidden="true" /> 초반 보호 적용</span>}
            </div>
            <div className="odds-cell odds-cell--risk">
              <small>실패 시 균열 위험</small>
              <strong>{preview.crackRate.toFixed(1)}%</strong>
              <span>현재 실제 판정값</span>
            </div>
            <div className="odds-cell">
              <small>연속 실패 보정</small>
              <strong>+{preview.failBonus.toFixed(1)}%p</strong>
              <span>{profile.consecutiveFailCount}회 연속 실패</span>
            </div>
            <div className="odds-cell odds-cell--cost">
              <small>강화 비용</small>
              <strong>{preview.cost.toLocaleString()} G</strong>
              <span>보유 {profile.gold.toLocaleString()} G</span>
            </div>
          </div>

          <div className="forge-cta-stack">
            <button
              type="button"
              className="primary-forge-cta"
              onClick={handleEnhanceClick}
              disabled={Boolean(enhanceDisabledReason)}
            >
              <span className="primary-forge-cta__hammer" aria-hidden="true">◆</span>
              <span>
                <strong>{isEnhancing ? '망치질 중…' : isMaxLevel ? '+20 전설 완성' : `+${profile.currentLevel + 1} 강화`}</strong>
                <small>
                  {isMaxLevel
                    ? '더 이상 강화할 수 없습니다'
                    : catalystGate && catalystGate.activeCharges > 0
                      ? `${preview.cost.toLocaleString()} G + 촉매 충전 1회 사용`
                      : `${preview.cost.toLocaleString()} G 사용`}
                </small>
              </span>
            </button>
            {enhanceDisabledReason && (
              <p className="cta-reason" role="status">{enhanceDisabledReason}</p>
            )}

            <div className="sale-preview">
              <div>
                <small>지금 매각하면</small>
                <strong>{estimatedSellValue.toLocaleString()} G</strong>
              </div>
              <div>
                <small>예상 정수</small>
                <strong>+{estimatedEssences.toLocaleString()}</strong>
              </div>
              <button
                type="button"
                className="sell-cta"
                onClick={handleSellSword}
                disabled={!canSell}
              >
                <Coins size={17} aria-hidden="true" />
                {canSell ? '검 매각' : '+0 매각 불가'}
              </button>
            </div>
          </div>
        </>
      )}

      {showAdModal && (
        <div className="modal-backdrop modal-backdrop--top" role="presentation">
          <div className="ad-reward-modal" role="dialog" aria-modal="true" aria-labelledby="ad-reward-title">
            <span className="section-kicker">ONE-TIME RECOVERY</span>
            <h3 id="ad-reward-title">보상형 복구 확인</h3>
            <div className="ad-reward-modal__icon" aria-hidden="true">▶</div>
            <p>모의 광고 시청 보상으로 검을 2단계 낮추고 균열 1개 상태로 복구합니다.</p>
            <button type="button" className="secondary-cta secondary-cta--essence" onClick={handleSimulateAdComplete}>
              보상 수령 및 복구
            </button>
            <button type="button" className="text-button" onClick={() => setShowAdModal(false)}>
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
