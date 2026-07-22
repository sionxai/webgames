import React, { useEffect, useRef, useState } from 'react';
import {
  calculateEnhancePreview,
  calculateSwordSellValue,
  getRequiredProgressChargeId,
  SWORD_SERIES_LIST,
  SWORD_STAGES
} from '../../constants/gameBalance';
import { EnhanceAttemptResult, EnhancePreview, UserGameProfile } from '../../types/game';
import { SwordSprite } from '../common/SwordSprite';
import confetti from 'canvas-confetti';
import { AlertTriangle, ArrowRight, Coins, RotateCcw, ShieldCheck, Tv, Wrench, Zap } from 'lucide-react';

interface EnhancePanelProps {
  profile: UserGameProfile;
  onAttemptEnhance: () => EnhanceAttemptResult | null;
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

function getDisplayedRates(preview: EnhancePreview) {
  const raw = [preview.successRate, preview.keepRate, preview.crackRate, preview.dropRate];
  const tenths = raw.map(rate => Math.floor(rate * 10 + Number.EPSILON));
  const remainder = 1000 - tenths.reduce((sum, rate) => sum + rate, 0);
  const order = raw
    .map((rate, index) => ({ index, fraction: rate * 10 - tenths[index] }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; index < remainder; index += 1) {
    tenths[order[index % order.length].index] += 1;
  }
  return {
    success: tenths[0] / 10,
    keep: tenths[1] / 10,
    crack: tenths[2] / 10,
    drop: tenths[3] / 10
  };
}

export const EnhancePanel: React.FC<EnhancePanelProps> = ({
  profile,
  onAttemptEnhance,
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
  const requiredChargeId = getRequiredProgressChargeId(profile.currentLevel);
  const progressCharges = profile.currentWeapon.progressCharges;
  const requiredChargeCount = requiredChargeId ? progressCharges[requiredChargeId] : 0;
  const requiredChargeName = requiredChargeId === 'tempered' ? '제련의 불씨' : '심연의 인장';
  const displayedRates = getDisplayedRates(preview);
  const lacksGold = profile.gold < preview.cost;
  const canSell = profile.currentLevel > 0;

  let enhanceDisabledReason: string | null = null;
  if (isDestroyed) enhanceDisabledReason = '검이 파괴되어 복구 또는 런 정산이 필요합니다.';
  else if (isMaxLevel) enhanceDisabledReason = '최고 +20 단계에 도달했습니다.';
  else if (requiredChargeId && requiredChargeCount <= 0) {
    enhanceDisabledReason = `${requiredChargeName} 충전이 필요합니다. 일반 적을 처치해 보스 징조를 진행하세요.`;
  }
  else if (lacksGold) enhanceDisabledReason = `${(preview.cost - profile.gold).toLocaleString()} G가 더 필요합니다.`;
  else if (isEnhancing) enhanceDisabledReason = '망치질 결과를 확인하는 중입니다.';

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

      {(profile.currentLevel >= 5 || progressCharges.tempered > 0 || progressCharges.awakened > 0) && (
        <div className="progress-charge-card">
          <div className="progress-charge-card__heading">
            <div>
              <small>WEAPON-BOUND CHARGES</small>
              <strong>현재 검의 공용 진행 충전</strong>
            </div>
            <span>{profile.currentWeapon.weaponId}</span>
          </div>
          <dl className="progress-charge-grid">
            <div className={requiredChargeId === 'tempered' ? 'is-required' : ''}>
              <dt>제련의 불씨</dt>
              <dd>{progressCharges.tempered} / 4</dd>
              <span>+10~+13 시도</span>
            </div>
            <div className={requiredChargeId === 'awakened' ? 'is-required' : ''}>
              <dt>심연의 인장</dt>
              <dd>{progressCharges.awakened} / 3</dd>
              <span>+14~+19 시도</span>
            </div>
          </dl>
          <p className="progress-charge-card__lifecycle" role="note">
            현재 검에 귀속 · 성공·유지·균열·하락과 파괴 후 복구에서는 유지됩니다. 매각·런 정산으로 새 검을 만들면 모두 소멸합니다.
          </p>
        </div>
      )}

      {lastResult && (
        <div className={lastResult.success ? 'forge-result is-success' : 'forge-result is-failure'} role="status">
          <strong>{lastResult.success ? '강화 성공' : '강화 결과'}</strong>
          <span>{lastResult.message}</span>
          {lastResult.progressChargeSpent && lastResult.progressChargeId && (
            <small className="forge-result__progress">
              {lastResult.progressChargeId === 'tempered' ? '제련의 불씨' : '심연의 인장'} 1회 소모 · 잔여 {lastResult.progressChargesRemaining}회
            </small>
          )}
          {lastResult.transcendenceRewards.map((reward, index) => (
            <small key={`${reward.source}:${index}`} className="forge-result__transcendence">
              초월 보상 · {reward.relicId === 'godblood' ? '신혈' : '종말'} 조각 +{reward.shardsGained}
              {reward.relicsGained > 0 ? ` · 성유물 +${reward.relicsGained}` : ''}
            </small>
          ))}
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
          <div className="enhance-odds" aria-label={`최종 강화 4분포, 합계 ${(displayedRates.success + displayedRates.keep + displayedRates.crack + displayedRates.drop).toFixed(1)}%`}>
            <div className="odds-cell odds-cell--success">
              <small>성공 확률</small>
              <strong>{displayedRates.success.toFixed(1)}%</strong>
              <span>{preview.isProtected ? <><ShieldCheck size={13} aria-hidden="true" /> 초반 보호 적용</> : `연속 실패 +${preview.failBonus.toFixed(1)}%p`}</span>
            </div>
            <div className="odds-cell">
              <small>단계 유지</small>
              <strong>{displayedRates.keep.toFixed(1)}%</strong>
              <span>균열 저항 감소분 포함</span>
            </div>
            <div className="odds-cell odds-cell--risk">
              <small>균열 발생</small>
              <strong>{displayedRates.crack.toFixed(1)}%</strong>
              <span>3번째 균열은 파괴</span>
            </div>
            <div className="odds-cell odds-cell--drop">
              <small>단계 하락</small>
              <strong>{displayedRates.drop.toFixed(1)}%</strong>
              <span>최종 4분포 합계 100.0%</span>
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
                    : requiredChargeId && requiredChargeCount > 0
                      ? `${preview.cost.toLocaleString()} G + ${requiredChargeName} 1회 사용`
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
