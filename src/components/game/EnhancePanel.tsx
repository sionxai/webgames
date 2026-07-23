import React, { useEffect, useRef, useState } from 'react';
import {
  calculateEssenceExtraction,
  calculateEnhancePreview,
  calculateRepairCost,
  calculateSwordSellValue,
  getRequiredProgressChargeId,
  SWORD_SERIES_LIST,
  SWORD_STAGES
} from '../../constants/gameBalance';
import { EnhanceAttemptResult, EnhancePreview, SwordSeriesId, UserGameProfile } from '../../types/game';
import { SwordSprite } from '../common/SwordSprite';
import confetti from 'canvas-confetti';
import { AlertTriangle, ArrowRight, Coins, Gem, RotateCcw, ShieldCheck, Tv, Wrench, Zap } from 'lucide-react';

interface EnhancePanelProps {
  profile: UserGameProfile;
  readOnly?: boolean;
  density: 'simple' | 'detail';
  onDensityChange: (density: 'simple' | 'detail') => void;
  onAttemptEnhance: () => EnhanceAttemptResult | null;
  onRepairCrack: () => void;
  onAdRestore: () => void;
  onFinishRun: () => void;
  onSellSword: () => void;
  onExtractSword: () => void;
  onSelectSeries: (seriesId: SwordSeriesId) => void;
}

interface PanelNotice {
  tone: 'success' | 'error' | 'info';
  message: string;
}

type ConfirmationKind = 'sell' | 'extract' | 'debris' | 'ad';

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
  readOnly = false,
  density,
  onDensityChange,
  onAttemptEnhance,
  onRepairCrack,
  onAdRestore,
  onFinishRun,
  onSellSword,
  onExtractSword,
  onSelectSeries
}) => {
  const [lastResult, setLastResult] = useState<EnhanceAttemptResult | null>(null);
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSeriesExpanded, setIsSeriesExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationKind | null>(null);
  const enhanceTimerRef = useRef<number | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    if (enhanceTimerRef.current !== null) {
      window.clearTimeout(enhanceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const frame = window.requestAnimationFrame(() => confirmButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [confirmation]);

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
  const masterCapitalLevel = profile.upgrades.master_capital || 0;
  const estimatedSellValue = Math.round(rawSellValue * (1 + forgeTemperatureLevel * 0.15))
    + masterCapitalLevel * 1000;
  const estimatedEssences = calculateEssenceExtraction(profile.currentLevel);
  const estimatedDebrisEssences = Math.floor(estimatedEssences * 0.25);
  const repairCost = calculateRepairCost(profile);
  const isDestroyed = profile.currentCrackCount >= 3;
  const isMaxLevel = profile.currentLevel >= SWORD_STAGES.length - 1;
  const requiredChargeId = getRequiredProgressChargeId(profile.currentLevel);
  const progressCharges = profile.currentWeapon.progressCharges;
  const requiredChargeCount = requiredChargeId ? progressCharges[requiredChargeId] : 0;
  const requiredChargeName = requiredChargeId === 'tempered' ? '제련의 불씨' : '심연의 인장';
  const displayedRates = getDisplayedRates(preview);
  const lacksGold = profile.gold < preview.cost;
  const canSell = profile.currentLevel > 0;
  const canExtract = profile.currentLevel >= 5 && !isDestroyed;
  const canRepair = profile.currentCrackCount > 0 && !isDestroyed && profile.gold >= repairCost;
  const canSelectSeries = profile.currentLevel === 0
    && profile.currentCrackCount === 0
    && profile.currentWeapon.enhanceAttempts === 0;
  const blueprintLevel = profile.upgrades.ancient_blueprint || 0;
  const unlockedSeriesCount = SWORD_SERIES_LIST.filter(
    option => blueprintLevel >= option.requiredBlueprintLevel
  ).length;

  let enhanceDisabledReason: string | null = null;
  if (readOnly) enhanceDisabledReason = 'AI 관전 전용 화면에서는 직접 강화할 수 없습니다.';
  else if (isDestroyed) enhanceDisabledReason = '검이 파괴되어 복구 또는 런 정산이 필요합니다.';
  else if (isMaxLevel) enhanceDisabledReason = '최고 +20 단계에 도달했습니다.';
  else if (requiredChargeId && requiredChargeCount <= 0) {
    enhanceDisabledReason = `${requiredChargeName} 충전이 필요합니다. 일반 적을 처치해 보스 징조를 진행하세요.`;
  }
  else if (lacksGold) enhanceDisabledReason = `${(preview.cost - profile.gold).toLocaleString()} G가 더 필요합니다.`;
  else if (isEnhancing) enhanceDisabledReason = '망치질 결과를 확인하는 중입니다.';

  const handleEnhanceClick = () => {
    if (readOnly) return;
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
    if (readOnly) return;
    try {
      onRepairCrack();
      setLastResult(null);
      setNotice({ tone: 'success', message: '균열 1개를 안전하게 수리했습니다.' });
    } catch (error: unknown) {
      setNotice({ tone: 'error', message: getErrorMessage(error, '균열 수리에 실패했습니다.') });
    }
  };

  const openConfirmation = (kind: ConfirmationKind) => {
    if (readOnly) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setConfirmation(kind);
  };

  const closeConfirmation = () => {
    setConfirmation(null);
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  };

  const handleConfirmedAction = () => {
    if (!confirmation || readOnly) return;
    try {
      if (confirmation === 'sell') {
        onSellSword();
        setNotice({ tone: 'success', message: `검을 매각해 ${estimatedSellValue.toLocaleString()} G를 획득했습니다.` });
      } else if (confirmation === 'extract') {
        onExtractSword();
        setNotice({ tone: 'success', message: `정수 ${estimatedEssences.toLocaleString()}개를 추출하고 새 런을 시작했습니다.` });
      } else if (confirmation === 'debris') {
        onFinishRun();
        setNotice({ tone: 'success', message: `파괴 잔해에서 정수 ${estimatedDebrisEssences.toLocaleString()}개를 회수했습니다.` });
      } else {
        onAdRestore();
        setNotice({ tone: 'success', message: '1회 복구 완료 · 검 단계가 2 낮아지고 균열 1개로 복구되었습니다.' });
      }
      setLastResult(null);
      closeConfirmation();
    } catch (error: unknown) {
      const fallback = confirmation === 'sell'
        ? '검 매각에 실패했습니다.'
        : confirmation === 'extract'
          ? '정수 추출에 실패했습니다.'
          : confirmation === 'debris'
            ? '파괴 잔해 정산에 실패했습니다.'
            : '광고 복구에 실패했습니다.';
      setNotice({ tone: 'error', message: getErrorMessage(error, fallback) });
      closeConfirmation();
    }
  };

  const handleSelectSeries = (seriesId: SwordSeriesId) => {
    if (readOnly) return;
    try {
      onSelectSeries(seriesId);
      setLastResult(null);
      const selected = SWORD_SERIES_LIST.find(item => item.id === seriesId);
      setNotice({ tone: 'success', message: `${selected?.name ?? '검'} 계열을 선택했습니다.` });
    } catch (error: unknown) {
      setNotice({ tone: 'error', message: getErrorMessage(error, '검 계열을 선택하지 못했습니다.') });
    }
  };

  const handleConfirmationKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirmation();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      className={`enhance-panel forge-density-${density}`}
      aria-labelledby="forge-workbench-title"
      aria-describedby={readOnly ? 'forge-workbench-readonly' : undefined}
    >
      <div className="enhance-panel__heading">
        <div>
          <span className="section-kicker">FORGE WORKBENCH</span>
          <h2 id="forge-workbench-title">강화 설계대</h2>
        </div>
        <div className="forge-density-header-actions">
          <span className="series-badge">{series.name}</span>
          <div className="forge-density-toggle" role="group" aria-label="강화 패널 표시">
            <button
              type="button"
              className="forge-density-toggle-option"
              aria-pressed={density === 'simple'}
              onClick={() => onDensityChange('simple')}
            >
              간단히
            </button>
            <button
              type="button"
              className="forge-density-toggle-option"
              aria-pressed={density === 'detail'}
              onClick={() => onDensityChange('detail')}
            >
              자세히
            </button>
          </div>
        </div>
      </div>

      {readOnly && (
        <p id="forge-workbench-readonly" className="cta-reason" role="note">
          AI 관전 전용 · 강화, 수리, 정산, 복구, 계열 선택은 공개 에이전트 행동으로만 진행됩니다.
        </p>
      )}

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

      {canSelectSeries && unlockedSeriesCount >= 2 && (
        <button
          type="button"
          className="forge-density-series-toggle"
          aria-expanded={isSeriesExpanded}
          aria-controls="series-selector-title"
          onClick={() => setIsSeriesExpanded(expanded => !expanded)}
        >
          계열 변경 {isSeriesExpanded ? '▾' : '▸'}
        </button>
      )}

      {canSelectSeries && (
        <div
          className={isSeriesExpanded ? 'series-selector forge-density-series-expanded' : 'series-selector'}
          aria-labelledby="series-selector-title"
        >
          <div className="series-selector__heading">
            <div>
              <small>NEW SWORD BLUEPRINT</small>
              <strong id="series-selector-title">새 검 계열 선택</strong>
            </div>
            <span>설계도 Lv.{blueprintLevel}</span>
          </div>
          <div className="series-selector__grid">
            {SWORD_SERIES_LIST.map(option => {
              const unlocked = blueprintLevel >= option.requiredBlueprintLevel;
              const selected = profile.currentSeriesId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={selected ? 'series-option is-selected' : 'series-option'}
                  aria-pressed={selected}
                  disabled={readOnly || !unlocked}
                  onClick={() => handleSelectSeries(option.id)}
                  title={unlocked ? option.description : `고대 설계도 Lv.${option.requiredBlueprintLevel} 필요`}
                >
                  <span aria-hidden="true">{option.icon}</span>
                  <strong>{option.name}</strong>
                  <small>{unlocked ? selected ? '선택됨' : '선택' : `Lv.${option.requiredBlueprintLevel} 필요`}</small>
                </button>
              );
            })}
          </div>
          <p>강화 시도 전 +0 새 검에서만 변경할 수 있습니다.</p>
        </div>
      )}

      <div className={profile.currentCrackCount > 0
        ? 'crack-status has-cracks forge-density-risk-expanded'
        : 'crack-status'}
      >
        <span className="forge-density-crack-chip">균열 {profile.currentCrackCount}/3</span>
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
          <button
            type="button"
            className="repair-button"
            onClick={handleRepairClick}
            disabled={readOnly || !canRepair}
            title={readOnly
              ? 'AI 관전 전용 화면에서는 직접 수리할 수 없습니다.'
              : !canRepair ? `${(repairCost - profile.gold).toLocaleString()} G 부족` : undefined}
          >
            <Wrench size={15} aria-hidden="true" />
            1칸 수리 · {repairCost.toLocaleString()} G
          </button>
        )}
      </div>

      {profile.currentCrackCount > 0 && !isDestroyed && !canRepair && (
        <p className="repair-shortage" role="status">
          수리비가 {(repairCost - profile.gold).toLocaleString()} G 부족합니다.
        </p>
      )}

      {(profile.currentLevel >= 5 || progressCharges.tempered > 0 || progressCharges.awakened > 0) && (
        <div className="progress-charge-card forge-density-detail-only">
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
            <small className="forge-result__progress forge-density-result-detail">
              {lastResult.progressChargeId === 'tempered' ? '제련의 불씨' : '심연의 인장'} 1회 소모 · 잔여 {lastResult.progressChargesRemaining}회
            </small>
          )}
          {lastResult.transcendenceRewards.map((reward, index) => (
            <small
              key={`${reward.source}:${index}`}
              className="forge-result__transcendence forge-density-result-detail"
            >
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
              onClick={() => openConfirmation('ad')}
              disabled={readOnly || profile.adRestoredCountThisRun >= 1}
            >
              <Tv size={17} aria-hidden="true" />
              {profile.adRestoredCountThisRun >= 1 ? '이번 런 복구 사용 완료' : `1회 복구 · +${Math.max(0, profile.currentLevel - 2)}`}
            </button>
            <button
              type="button"
              className="secondary-cta"
              onClick={() => openConfirmation('debris')}
              disabled={readOnly}
            >
              <RotateCcw size={17} aria-hidden="true" />
              잔해 25% 정산 · 정수 +{estimatedDebrisEssences.toLocaleString()}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="enhance-odds" aria-label={`최종 강화 4분포, 합계 ${(displayedRates.success + displayedRates.keep + displayedRates.crack + displayedRates.drop).toFixed(1)}%`}>
            <div className="odds-cell odds-cell--success">
              <small>성공 확률</small>
              <strong>{displayedRates.success.toFixed(1)}%</strong>
              <span className={preview.isProtected ? 'forge-density-protection' : 'forge-density-fail-bonus'}>
                {preview.isProtected ? <><ShieldCheck size={13} aria-hidden="true" /> 초반 보호 적용</> : `연속 실패 +${preview.failBonus.toFixed(1)}%p`}
              </span>
            </div>
            <div className="odds-cell forge-density-secondary">
              <small>단계 유지</small>
              <strong>{displayedRates.keep.toFixed(1)}%</strong>
              <span>균열 저항 감소분 포함</span>
            </div>
            <div className="odds-cell odds-cell--risk forge-density-secondary">
              <small>균열 발생</small>
              <strong>{displayedRates.crack.toFixed(1)}%</strong>
              <span>3번째 균열은 파괴</span>
            </div>
            <div className="odds-cell odds-cell--drop forge-density-secondary">
              <small>단계 하락</small>
              <strong>{displayedRates.drop.toFixed(1)}%</strong>
              <span>최종 4분포 합계 100.0%</span>
            </div>
          </div>

          <div className="forge-cta-stack">
            <div className="forge-density-cost-summary">
              <span>강화 비용 {preview.cost.toLocaleString()} G</span>
              <span>보유 골드 {Math.floor(profile.gold).toLocaleString()} G</span>
            </div>
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

            <div className="economy-choices" aria-label="검 가치 회수 방법">
              <div className="economy-choice economy-choice--sell">
                <div className="economy-choice__icon" aria-hidden="true"><Coins size={18} /></div>
                <div>
                  <small>GOLD SALE · 런 계속</small>
                  <strong>{estimatedSellValue.toLocaleString()} G</strong>
                  <span>골드만 받고 새 검으로 교체합니다.</span>
                </div>
                <p className="forge-density-sale-summary">
                  지금 매각하면 {estimatedSellValue.toLocaleString()} G · 예상 정수 {estimatedEssences.toLocaleString()}
                </p>
                <button
                  type="button"
                  className="sell-cta"
                  onClick={() => openConfirmation('sell')}
                  disabled={readOnly || !canSell}
                >
                  {canSell ? '매각 확인' : '+0 매각 불가'}
                </button>
              </div>
              <div className="economy-choice economy-choice--extract forge-density-detail-only">
                <div className="economy-choice__icon" aria-hidden="true"><Gem size={18} /></div>
                <div>
                  <small>ESSENCE EXTRACTION · 새 런</small>
                  <strong>정수 +{estimatedEssences.toLocaleString()}</strong>
                  <span>+5 이상에서 영구 정수를 얻고 런을 초기화합니다.</span>
                </div>
                <button
                  type="button"
                  className="extract-cta"
                  onClick={() => openConfirmation('extract')}
                  disabled={readOnly || !canExtract}
                >
                  {canExtract ? '추출 확인' : '+5부터 추출'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmation && (
        <div className="modal-backdrop modal-backdrop--top" role="presentation">
          <div
            className="ad-reward-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forge-confirm-title"
            aria-describedby="forge-confirm-description"
            onKeyDown={handleConfirmationKeyDown}
          >
            <span className="section-kicker">
              {confirmation === 'ad' ? 'ONE-TIME RECOVERY' : 'IRREVERSIBLE CHOICE'}
            </span>
            <h3 id="forge-confirm-title">
              {confirmation === 'sell'
                ? '현재 검을 매각할까요?'
                : confirmation === 'extract'
                  ? '현재 검에서 정수를 추출할까요?'
                  : confirmation === 'debris'
                    ? '파괴 잔해를 정산할까요?'
                    : '보상형 복구를 사용할까요?'}
            </h3>
            <div className="ad-reward-modal__icon" aria-hidden="true">
              {confirmation === 'sell' ? '◆' : confirmation === 'ad' ? '▶' : '✦'}
            </div>
            <p id="forge-confirm-description">
              {confirmation === 'sell'
                ? `+${profile.currentLevel} ${currentStage.name}을 없애고 ${estimatedSellValue.toLocaleString()} G를 받습니다. 정수는 지급되지 않고 현재 런은 계속됩니다.`
                : confirmation === 'extract'
                  ? `+${profile.currentLevel} ${currentStage.name}을 영구 정수 ${estimatedEssences.toLocaleString()}개로 바꾸고 새 런을 시작합니다.${profile.currentLevel >= 20 ? ' 전설 검도 되돌릴 수 없습니다.' : ''}`
                  : confirmation === 'debris'
                    ? `자발 추출량의 25%인 정수 ${estimatedDebrisEssences.toLocaleString()}개만 회수하고 새 런을 시작합니다.`
                    : '모의 광고 보상으로 검을 2단계 낮추고 균열 1개 상태로 복구합니다. 이 기록은 순수 기록이 아닙니다.'}
            </p>
            <button
              ref={confirmButtonRef}
              type="button"
              className="secondary-cta secondary-cta--essence"
              onClick={handleConfirmedAction}
            >
              {confirmation === 'sell'
                ? '매각 확정'
                : confirmation === 'extract'
                  ? '정수 추출 확정'
                  : confirmation === 'debris'
                    ? '25% 잔해 정산'
                    : '보상 수령 및 복구'}
            </button>
            <button type="button" className="text-button" onClick={closeConfirmation}>
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
