import React, { useEffect, useRef, useState } from 'react';
import { UserGameProfile } from '../../types/game';
import { SWORD_STAGES, SWORD_SERIES_LIST } from '../../constants/gameBalance';
import { X, Share2, Copy, Check } from 'lucide-react';
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

export const ShareCardModal: React.FC<ShareCardModalProps> = ({ profile, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  const stageInfo = SWORD_STAGES[profile.currentLevel] || SWORD_STAGES[0];
  const seriesInfo = SWORD_SERIES_LIST.find(s => s.id === profile.currentSeriesId) || SWORD_SERIES_LIST[0];

  // 1200x630 동적 공유 카드 Canvas 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let disposed = false;

    const drawCard = (swordAtlas?: HTMLImageElement) => {
      // 배경 다크 포지 그라디언트
      const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
      bgGrad.addColorStop(0, '#0f111a');
      bgGrad.addColorStop(1, '#2a1226');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1200, 630);

      // 테두리
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, 1160, 590);

      // 헤더 로고
      ctx.fillStyle = '#ffca28';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Project Forge — 전설의 검 강화하기', 60, 80);

      // 닉네임 & 날짜
      ctx.fillStyle = '#aaa';
      ctx.font = '24px sans-serif';
      ctx.fillText(`대장장이: ${profile.nickname} | ${new Date().toLocaleDateString()}`, 60, 120);

      // 메인 카드 중앙 - 검 외형 및 강화 레벨
      ctx.fillStyle = stageInfo.color;
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText(`+${profile.currentLevel} ${stageInfo.name}`, 60, 240);

      ctx.fillStyle = '#fff';
      ctx.font = '32px sans-serif';
      ctx.fillText(`검 계열: ${seriesInfo.name}`, 60, 300);
      ctx.fillText(`강화 시도 횟수: ${profile.totalEnhanceAttempts}회`, 60, 350);
      ctx.fillText(`상위 백분위: 오늘 상위 ${(Math.max(0.1, 100 - profile.currentLevel * 4.8)).toFixed(1)}%`, 60, 400);

      // 순수 기록 / 광고 사용 여부 태그
      ctx.fillStyle = profile.isPureRun ? '#4caf50' : '#ab47bc';
      ctx.fillRect(60, 440, 260, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(profile.isPureRun ? '🛡️ 순수 대장장이 기록' : '🎬 광고 복구 사용 기록', 75, 475);

      // 하단 CTA
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('⚔️ 이 기록에 지금 바로 도전하세요!', 60, 550);

      if (swordAtlas?.complete && swordAtlas.naturalWidth > 0) {
        const cell = getSwordAtlasCell(profile.currentLevel);
        const visual = SWORD_SERIES_VISUALS[profile.currentSeriesId];
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
  }, [profile]);

  // 챌린지 공유 링크 생성
  const challengeLink = `${window.location.origin}${window.location.pathname}?challenge=${profile.userId}_${profile.currentLevel}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(challengeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 950,
      padding: '16px'
    }}>
      <div style={{
        background: '#161925',
        width: '100%',
        maxWidth: '480px',
        borderRadius: '20px',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 color="#ffd700" size={22} />
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#ffd700' }}>기록 공유 카드 생성</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* 1200x630 Canvas 미리보기 (축소) */}
        <canvas
          ref={canvasRef}
          width={1200}
          height={630}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        />

        {/* 챌린지 링크 복사 */}
        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: '#aaa' }}>🔗 동일 조건 도전 공유 링크</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={challengeLink}
              style={{
                flex: 1,
                background: '#0d0e15',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#81c784',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '0.78rem'
              }}
            />
            <button
              onClick={handleCopyLink}
              style={{
                background: copied ? '#388e3c' : 'linear-gradient(135deg, #ff9800, #f57c00)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
