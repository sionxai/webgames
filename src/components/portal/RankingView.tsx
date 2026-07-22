import React, { useState } from 'react';
import { UserGameProfile, RankingEntry, SwordSeriesId } from '../../types/game';
import { Trophy, ShieldCheck, Zap } from 'lucide-react';

interface RankingViewProps {
  profile: UserGameProfile;
}

export const RankingView: React.FC<RankingViewProps> = ({ profile }) => {
  const [tab, setTab] = useState<'daily' | 'pure'>('daily');

  // 모의 랭킹 리스트 데이터
  const mockRankings: RankingEntry[] = [
    { id: '1', userId: 'usr_sword_master', nickname: '강화의신', swordSeriesId: 'dragon' as SwordSeriesId, maxLevel: 19, attemptsCount: 142, isPure: true, timestamp: Date.now(), dateStr: '오늘' },
    { id: '2', userId: 'usr_hero99', nickname: '초보대장장이', swordSeriesId: 'flame' as SwordSeriesId, maxLevel: 17, attemptsCount: 98, isPure: false, timestamp: Date.now(), dateStr: '오늘' },
    { id: '3', userId: profile.userId, nickname: `${profile.nickname} (나)`, swordSeriesId: profile.currentSeriesId as SwordSeriesId, maxLevel: profile.maxLevelReached, attemptsCount: profile.totalEnhanceAttempts, isPure: profile.isPureRun, timestamp: Date.now(), dateStr: '오늘' },
    { id: '4', userId: 'usr_luck7', nickname: '운7기3', swordSeriesId: 'guardian' as SwordSeriesId, maxLevel: 15, attemptsCount: 65, isPure: true, timestamp: Date.now(), dateStr: '오늘' },
    { id: '5', userId: 'usr_iron', nickname: '무쇠팔', swordSeriesId: 'kingdom' as SwordSeriesId, maxLevel: 14, attemptsCount: 110, isPure: true, timestamp: Date.now(), dateStr: '오늘' }
  ].sort((a, b) => b.maxLevel - a.maxLevel);

  const filtered = tab === 'pure' ? mockRankings.filter(r => r.isPure) : mockRankings;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffd700' }}>
        <Trophy size={24} />
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>전설의 명예의 전당 (랭킹)</h2>
      </div>

      {/* 탭 버튼 */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px' }}>
        <button
          onClick={() => setTab('daily')}
          style={{
            flex: 1,
            background: tab === 'daily' ? '#ff9800' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '8px',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          🏆 오늘의 최고 강화
        </button>
        <button
          onClick={() => setTab('pure')}
          style={{
            flex: 1,
            background: tab === 'pure' ? '#4caf50' : 'transparent',
            color: '#fff',
            border: 'none',
            padding: '8px',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}
        >
          <ShieldCheck size={16} /> 순수 대장장이 랭킹
        </button>
      </div>

      {/* 랭킹 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map((entry, index) => {
          const isMe = entry.userId === profile.userId;
          return (
            <div
              key={entry.id}
              style={{
                background: isMe ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: isMe ? '1px solid #ffd700' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#888',
                  width: '24px'
                }}>
                  #{index + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.9rem' }}>
                    {entry.nickname}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <span>시도 {entry.attemptsCount}회</span>
                    {entry.isPure ? (
                      <span style={{ color: '#81c784' }}>• 🛡️ 순수</span>
                    ) : (
                      <span style={{ color: '#b388ff' }}>• 🎬 광고복구 포함</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ffca28' }}>
                  +{entry.maxLevel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
