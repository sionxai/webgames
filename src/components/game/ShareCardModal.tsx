import React, { useEffect, useRef, useState } from 'react';
import { UserGameProfile } from '../../types/game';
import { SWORD_STAGES, SWORD_SERIES_LIST } from '../../constants/gameBalance';
import { Check, Copy, Share2, X } from 'lucide-react';
import { GAME_IMAGES } from '../../constants/imageAssets';
import {
  getSwordAtlasCell,
  SWORD_ATLAS_CELL_SIZE,
  SWORD_SERIES_VISUALS
} from '../../constants/swordVisuals';

interface ShareCardModalProps {
  profile: UserGameProfile;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ profile, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const record = profile.bestRecords[profile.controller];
  const stageInfo = record ? SWORD_STAGES[record.level] || SWORD_STAGES[0] : null;
  const seriesInfo = record
    ? SWORD_SERIES_LIST.find(series => series.id === record.seriesId) || SWORD_SERIES_LIST[0]
    : null;
  onCloseRef.current = onClose;

  useEffect(() => {
    const backdrop = backdropRef.current;
    const backgroundStates = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children)
        .filter((element): element is HTMLElement => (
          element instanceof HTMLElement && element !== backdrop
        ))
        .map(element => ({
          element,
          hadInert: element.hasAttribute('inert'),
          ariaHidden: element.getAttribute('aria-hidden')
        }))
      : [];
    backgroundStates.forEach(({ element }) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      backgroundStates.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (!record || !stageInfo || !seriesInfo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let disposed = false;

    const drawCard = (swordAtlas?: HTMLImageElement) => {
      const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
      bgGrad.addColorStop(0, '#0f111a');
      bgGrad.addColorStop(1, '#2a1226');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1200, 630);

      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, 1160, 590);

      ctx.fillStyle = '#ffca28';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Project Forge — 로컬 최고 기록', 60, 80);

      ctx.fillStyle = '#aaa';
      ctx.font = '24px sans-serif';
      const controllerLabel = record.controller === 'agent' ? 'AI 플레이' : '사람 플레이';
      const achievedLabel = new Date(record.achievedAt).toLocaleString('ko-KR');
      ctx.fillText(`${controllerLabel} | 달성 ${achievedLabel}`, 60, 120);

      ctx.fillStyle = stageInfo.color;
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText(`+${record.level} ${stageInfo.name}`, 60, 235);

      ctx.fillStyle = '#fff';
      ctx.font = '30px sans-serif';
      ctx.fillText(`검 계열: ${seriesInfo.name}`, 60, 295);
      ctx.fillText(`해당 검 강화 시도: ${record.weaponAttempts}회`, 60, 342);
      ctx.fillText(`수리 ${record.repairCount}회 · 광고 복구 ${record.adRestoreCount}회`, 60, 389);

      ctx.fillStyle = record.isPure ? '#4caf50' : '#75508f';
      ctx.fillRect(60, 430, 300, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(record.isPure ? '순수 기록' : '수리 또는 복구 포함 기록', 78, 464);

      ctx.fillStyle = '#d8cdbf';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('로컬 비공식 기록 · webgames', 60, 550);

      if (swordAtlas?.complete && swordAtlas.naturalWidth > 0) {
        const cell = getSwordAtlasCell(record.level);
        const visual = SWORD_SERIES_VISUALS[record.seriesId];
        const aura = ctx.createRadialGradient(1090, 336, 20, 1090, 336, 180);
        aura.addColorStop(0, visual.glow);
        aura.addColorStop(0.48, 'rgba(255, 193, 76, 0.08)');
        aura.addColorStop(1, 'rgba(255, 193, 76, 0)');
        ctx.fillStyle = aura;
        ctx.fillRect(860, 105, 310, 475);

        ctx.save();
        ctx.translate(1090, 560);
        ctx.rotate(0.1);
        ctx.shadowColor = visual.glow;
        ctx.shadowBlur = 42;
        ctx.filter = visual.filter;
        ctx.drawImage(
          swordAtlas,
          cell.column * SWORD_ATLAS_CELL_SIZE,
          cell.row * SWORD_ATLAS_CELL_SIZE,
          SWORD_ATLAS_CELL_SIZE,
          SWORD_ATLAS_CELL_SIZE,
          -200,
          -400,
          400,
          400
        );
        ctx.restore();
      }
    };

    drawCard();
    const swordAtlas = new Image();
    swordAtlas.decoding = 'async';
    swordAtlas.onload = () => {
      if (!disposed) drawCard(swordAtlas);
    };
    swordAtlas.src = GAME_IMAGES.swordLevelAtlas;

    return () => {
      disposed = true;
      swordAtlas.onload = null;
    };
  }, [record, seriesInfo, stageInfo]);

  const pageLink = `${window.location.origin}${window.location.pathname}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageLink);
      setCopyError(null);
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 2000);
    } catch {
      setCopyError('링크를 복사하지 못했습니다. 주소창의 페이지 주소를 사용해 주세요.');
    }
  };

  return (
    <div ref={backdropRef} className="share-modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="share-record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-record-title"
        tabIndex={-1}
      >
        <header className="share-record-modal__header">
          <div>
            <Share2 color="#ffd700" size={22} aria-hidden="true" />
            <h2 id="share-record-title">최고 기록 공유</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="share-record-modal__close"
            onClick={onClose}
            aria-label="공유 기록 닫기"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        {record ? (
          <>
            <canvas
              ref={canvasRef}
              width={1200}
              height={630}
              className="share-record-canvas"
              aria-label={`+${record.level} ${seriesInfo?.name ?? ''} 로컬 최고 기록 카드`}
            />
            <dl className="share-record-summary">
              <div><dt>해당 검 시도</dt><dd>{record.weaponAttempts}회</dd></div>
              <div><dt>수리</dt><dd>{record.repairCount}회</dd></div>
              <div><dt>광고 복구</dt><dd>{record.adRestoreCount}회</dd></div>
              <div><dt>기록 구분</dt><dd>{record.isPure ? '순수' : '복구 포함'}</dd></div>
            </dl>
          </>
        ) : (
          <div className="share-record-empty" role="status">
            <strong>공유할 최고 기록이 아직 없습니다.</strong>
            <span>현재 라이브 검 상태는 기록으로 가장하지 않습니다. 강화 성공 후 저장된 최고 기록을 공유할 수 있습니다.</span>
          </div>
        )}

        <div className="share-page-link">
          <div>게임 페이지 링크</div>
          <div>
            <input type="text" readOnly value={pageLink} aria-label="Project Forge 페이지 링크" />
            <button type="button" onClick={() => void handleCopyLink()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <small>특정 조건이나 동일 기록을 보장하지 않는 일반 게임 페이지 링크입니다.</small>
          {copyError && <p role="alert">{copyError}</p>}
        </div>
      </section>
    </div>
  );
};
