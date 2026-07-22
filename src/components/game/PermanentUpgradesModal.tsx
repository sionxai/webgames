import React, { useEffect, useRef } from 'react';
import { PERMANENT_UPGRADES } from '../../constants/gameBalance';
import { UserGameProfile } from '../../types/game';
import { Sparkles, X } from 'lucide-react';

interface PermanentUpgradesModalProps {
  profile: UserGameProfile;
  onBuyUpgrade: (upgradeId: string) => void;
  onClose: () => void;
}

export const PermanentUpgradesModal: React.FC<PermanentUpgradesModalProps> = ({
  profile,
  onBuyUpgrade,
  onClose
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
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

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        ref={modalRef}
        className="upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permanent-upgrades-title"
        aria-describedby="permanent-upgrades-description"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="upgrade-modal__header">
          <div>
            <span className="section-kicker">MASTER CRAFT</span>
            <h2 id="permanent-upgrades-title">
              <Sparkles size={20} aria-hidden="true" />
              영구 성장
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="영구 성장 닫기"
          >
            <X size={23} aria-hidden="true" />
          </button>
        </header>

        <div className="upgrade-wallet">
          <div>
            <small id="permanent-upgrades-description">런을 넘어 유지되는 성장 자원</small>
            <span>보유 대장장이 정수</span>
          </div>
          <strong><span aria-hidden="true">✦</span> {profile.essences.toLocaleString()}</strong>
        </div>

        <div className="upgrade-list">
          {PERMANENT_UPGRADES.map(upgrade => {
            const currentLevel = profile.upgrades[upgrade.id] || 0;
            const isMax = currentLevel >= upgrade.maxLevel;
            const cost = Math.round(upgrade.baseCost * Math.pow(upgrade.costMultiplier, currentLevel));
            const canAfford = profile.essences >= cost && !isMax;
            const missingEssences = Math.max(0, cost - profile.essences);
            const progress = Math.min(100, (currentLevel / upgrade.maxLevel) * 100);

            return (
              <article
                key={upgrade.id}
                className={canAfford ? 'upgrade-card is-affordable' : isMax ? 'upgrade-card is-max' : 'upgrade-card'}
              >
                <div className="upgrade-card__icon" aria-hidden="true">{upgrade.icon}</div>
                <div className="upgrade-card__content">
                  <div className="upgrade-card__title">
                    <strong>{upgrade.name}</strong>
                    <span>Lv.{currentLevel} / {upgrade.maxLevel}</span>
                  </div>
                  <p>{upgrade.description}</p>
                  <div className="upgrade-card__progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <small className={canAfford ? 'upgrade-card__status is-ready' : 'upgrade-card__status'}>
                    {isMax
                      ? '최고 단계 적용 중'
                      : canAfford
                        ? '구매 가능'
                        : `정수 ${missingEssences.toLocaleString()}개 부족`}
                  </small>
                </div>
                <button
                  type="button"
                  className="upgrade-buy-button"
                  onClick={() => onBuyUpgrade(upgrade.id)}
                  disabled={!canAfford}
                  aria-label={isMax ? `${upgrade.name} 최고 단계` : `${upgrade.name} 구매, 정수 ${cost}개`}
                >
                  {isMax ? 'MAX' : <><span aria-hidden="true">✦</span> {cost.toLocaleString()}</>}
                </button>
              </article>
            );
          })}
        </div>

        <footer className="upgrade-modal__footer">
          <button type="button" className="secondary-cta" onClick={onClose}>대장간으로 돌아가기</button>
        </footer>
      </div>
    </div>
  );
};
