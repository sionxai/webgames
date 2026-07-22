import React, { useState } from 'react';
import { SWORD_SERIES_LIST, SWORD_STAGES } from '../../constants/gameBalance';
import { ForgeController, ForgeRunRecord, UserGameProfile } from '../../types/game';
import { Bot, CalendarDays, Hammer, RotateCcw, ShieldCheck, Trophy, Wrench } from 'lucide-react';

interface RankingViewProps {
  humanProfile: UserGameProfile;
  agentProfile: UserGameProfile;
}

function formatAchievedAt(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return '기록 시각 없음';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function RecordCard({ record }: { record: ForgeRunRecord }) {
  const stage = SWORD_STAGES[record.level] || SWORD_STAGES[0];
  const series = SWORD_SERIES_LIST.find(item => item.id === record.seriesId) || SWORD_SERIES_LIST[0];

  return (
    <article className="local-record-card">
      <div className="local-record-card__hero">
        <div>
          <small>PERSONAL BEST</small>
          <strong style={{ color: stage.color }}>+{record.level} {stage.name}</strong>
          <span>{series.icon} {series.name}</span>
        </div>
        <span className={record.isPure ? 'record-purity is-pure' : 'record-purity'}>
          {record.isPure ? <ShieldCheck size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
          {record.isPure ? '순수 기록' : '복구·수리 기록'}
        </span>
      </div>

      <dl className="local-record-stats">
        <div>
          <dt><Hammer size={14} aria-hidden="true" /> 강화 시도</dt>
          <dd>{record.weaponAttempts.toLocaleString()}회</dd>
        </div>
        <div>
          <dt><Wrench size={14} aria-hidden="true" /> 수리</dt>
          <dd>{record.repairCount.toLocaleString()}회</dd>
        </div>
        <div>
          <dt><RotateCcw size={14} aria-hidden="true" /> 광고 복구</dt>
          <dd>{record.adRestoreCount.toLocaleString()}회</dd>
        </div>
        <div>
          <dt><Bot size={14} aria-hidden="true" /> 조작 주체</dt>
          <dd>{record.controller === 'agent' ? 'AI' : '사람'}</dd>
        </div>
      </dl>

      <div className="local-record-card__date">
        <CalendarDays size={14} aria-hidden="true" />
        달성 {formatAchievedAt(record.achievedAt)}
      </div>
    </article>
  );
}

export const RankingView: React.FC<RankingViewProps> = ({ humanProfile, agentProfile }) => {
  const [controller, setController] = useState<ForgeController>('human');
  const record = controller === 'human'
    ? humanProfile.bestRecords.human
    : agentProfile.bestRecords.agent;

  return (
    <section className="local-ranking" aria-labelledby="local-ranking-title">
      <header className="local-ranking__heading">
        <div>
          <span className="section-kicker">LOCAL RECORDS</span>
          <h2 id="local-ranking-title"><Trophy size={22} aria-hidden="true" /> 최고 기록</h2>
        </div>
        <span className="local-ranking__notice">로컬 비공식 기록</span>
      </header>

      <p className="local-ranking__description">
        서버 경쟁자가 아닌 이 브라우저의 사람·AI 최고 기록 스냅샷만 표시합니다.
      </p>

      <div className="local-ranking__tabs" role="tablist" aria-label="기록 조작 주체">
        <button
          type="button"
          role="tab"
          aria-selected={controller === 'human'}
          className={controller === 'human' ? 'is-active' : ''}
          onClick={() => setController('human')}
        >
          사람 로컬
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={controller === 'agent'}
          className={controller === 'agent' ? 'is-active' : ''}
          onClick={() => setController('agent')}
        >
          AI 로컬
        </button>
      </div>

      <div role="tabpanel" className="local-ranking__panel">
        {record ? (
          <RecordCard record={record} />
        ) : (
          <div className="local-record-empty" role="status">
            <Trophy size={28} aria-hidden="true" />
            <strong>{controller === 'agent' ? 'AI 최고 기록이 아직 없습니다.' : '사람 최고 기록이 아직 없습니다.'}</strong>
            <span>강화에 성공하면 해당 검의 불변 최고 기록이 여기에 저장됩니다.</span>
          </div>
        )}
      </div>
    </section>
  );
};
