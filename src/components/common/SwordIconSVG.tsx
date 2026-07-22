import React from 'react';
import { SWORD_STAGES, SWORD_SERIES_LIST } from '../../constants/gameBalance';

interface SwordIconSVGProps {
  level: number;
  seriesId: string;
  size?: number;
}

export const SwordIconSVG: React.FC<SwordIconSVGProps> = ({ level, seriesId, size = 64 }) => {
  const stageInfo = SWORD_STAGES[level] || SWORD_STAGES[0];
  const seriesInfo = SWORD_SERIES_LIST.find(s => s.id === seriesId) || SWORD_SERIES_LIST[0];

  // 검 계열별 주 테마 색상 및 마법 이펙트
  let bladeColor = stageInfo.color;
  let glowColor = stageInfo.glowColor;
  let auraEffect = 'none';

  if (seriesId === 'flame') {
    bladeColor = '#ff6d00';
    glowColor = 'rgba(255, 109, 0, 0.8)';
  } else if (seriesId === 'guardian') {
    bladeColor = '#00e5ff';
    glowColor = 'rgba(0, 229, 255, 0.8)';
  } else if (seriesId === 'berserk') {
    bladeColor = '#d50000';
    glowColor = 'rgba(213, 0, 0, 0.8)';
  } else if (seriesId === 'dragon') {
    bladeColor = '#ffd700';
    glowColor = 'rgba(255, 215, 0, 0.9)';
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: `drop-shadow(0 0 10px ${glowColor})`,
        transition: 'all 0.3s ease'
      }}
    >
      <defs>
        {/* 네온 오라 그라디언트 */}
        <linearGradient id={`bladeGrad_${seriesId}_${level}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor={bladeColor} />
          <stop offset="100%" stopColor="#1a0d18" />
        </linearGradient>

        <linearGradient id={`hiltGrad_${seriesId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#8d6e63" />
        </linearGradient>

        <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 배경 마법 룬 원 */}
      <circle cx="50" cy="50" r="42" stroke={glowColor} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4" />

      {/* 칼날 (Blade) */}
      <path
        d="M50 10 L58 60 L50 72 L42 60 Z"
        fill={`url(#bladeGrad_${seriesId}_${level})`}
        stroke={bladeColor}
        strokeWidth="1.5"
        filter="url(#glowEffect)"
      />

      {/* 칼날 중앙 혈조 (Fuller line) */}
      <line x1="50" y1="14" x2="50" y2="58" stroke="#ffffff" strokeWidth="1" opacity="0.8" />

      {/* 룬 문자 문양 (+5 이상) */}
      {level >= 5 && (
        <g opacity="0.9">
          <circle cx="50" cy="30" r="2" fill="#ffffff" />
          <circle cx="50" cy="42" r="2.5" fill="#ffffff" />
        </g>
      )}

      {/* 검 코등이 (Guard) */}
      <path
        d="M32 60 C38 58, 62 58, 68 60 C64 64, 36 64, 32 60 Z"
        fill={`url(#hiltGrad_${seriesId})`}
        stroke="#ffd700"
        strokeWidth="1"
      />

      {/* 검 자루 & 폼멜 (Grip & Pommel) */}
      <rect x="47" y="63" width="6" height="20" rx="2" fill="#4e342e" stroke="#212121" strokeWidth="1" />
      <circle cx="50" cy="86" r="5" fill="#ffd700" stroke="#b78103" strokeWidth="1" />

      {/* 레벨 뱃지 (+N) */}
      <g transform="translate(62, 12)">
        <rect width="30" height="18" rx="9" fill="rgba(15, 17, 26, 0.9)" stroke="#ffd700" strokeWidth="1" />
        <text x="15" y="13" fill="#ffd700" fontSize="10" fontWeight="bold" textAnchor="middle">
          +{level}
        </text>
      </g>
    </svg>
  );
};
