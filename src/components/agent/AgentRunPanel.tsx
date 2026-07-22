import type {
  ForgeAgentAction,
  ForgeAgentRuntimeSnapshot,
  ForgeAgentSpeed,
  ForgeAgentStrategy,
  ForgeAgentTraceEvent,
  ForgePlayerView
} from '../../types/agent';

const STRATEGY_LABELS: Record<ForgeAgentStrategy, string> = {
  aggressive: '공격형',
  cautious: '안전형',
  balanced: '혼합형'
};

const STATUS_LABELS: Record<ForgeAgentRuntimeSnapshot['status'], string> = {
  idle: '중지',
  running: '실행 중',
  paused: '일시정지'
};

const ACTION_LABELS: Record<ForgeAgentAction, string> = {
  attack: '공격',
  enhance: '강화',
  repair: '수리',
  sell: '매각',
  extract: '정수 추출',
  ad_restore: '로컬 복구',
  select_series: '계열 선택',
  wait: '대기'
};

export interface AgentRunPanelProps {
  snapshot: ForgeAgentRuntimeSnapshot;
  view: ForgePlayerView;
  onViewChange(view: ForgePlayerView): void;
  onStrategyChange(strategy: ForgeAgentStrategy): void;
  onStart(): void;
  onPause(): void;
  onStop(): void;
  onSpeedChange(speed: ForgeAgentSpeed): void;
  className?: string;
}

function formatEventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function eventTitle(event: ForgeAgentTraceEvent): string {
  if (event.action) return ACTION_LABELS[event.action];
  if (event.kind === 'decision') return '판단 보류';
  return '실행 상태';
}

export function AgentRunPanel({
  snapshot,
  view,
  onViewChange,
  onStrategyChange,
  onStart,
  onPause,
  onStop,
  onSpeedChange,
  className = ''
}: AgentRunPanelProps) {
  const recentEvents = snapshot.events.slice(-8).reverse();
  const isRunning = snapshot.status === 'running';
  const isIdle = snapshot.status === 'idle';
  const panelClassName = ['agent-run-panel', className].filter(Boolean).join(' ');

  return (
    <section className={panelClassName} aria-labelledby="agent-run-panel-title">
      <header className="agent-run-panel__header">
        <div className="agent-run-panel__identity">
          <p className="section-kicker">LOCAL SPECTATOR AGENT</p>
          <h2 id="agent-run-panel-title">{snapshot.agentName}</h2>
          <span>외부 AI를 호출하지 않는 규칙 기반 데모 정책</span>
        </div>
        <span
          className={`agent-status agent-status--${snapshot.status}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {STATUS_LABELS[snapshot.status]}
          {snapshot.isExecuting ? ' · 행동 처리 중' : ''}
        </span>
      </header>

      <div className="agent-view-toggle" role="group" aria-label="플레이 기록 보기">
        <button
          type="button"
          className={view === 'human' ? 'is-active' : ''}
          aria-pressed={view === 'human'}
          onClick={() => onViewChange('human')}
        >
          사람 플레이
        </button>
        <button
          type="button"
          className={view === 'agent' ? 'is-active' : ''}
          aria-pressed={view === 'agent'}
          onClick={() => onViewChange('agent')}
        >
          AI 관전
        </button>
      </div>

      <div className="agent-strategy-row">
        <label htmlFor="forge-agent-strategy">데모 전략</label>
        <select
          id="forge-agent-strategy"
          value={snapshot.strategy}
          onChange={event => onStrategyChange(event.target.value as ForgeAgentStrategy)}
        >
          {(Object.keys(STRATEGY_LABELS) as ForgeAgentStrategy[]).map(strategy => (
            <option key={strategy} value={strategy}>{STRATEGY_LABELS[strategy]}</option>
          ))}
        </select>
      </div>

      <div className="agent-decision" aria-live="polite" aria-atomic="true">
        <div>
          <small>현재 목표</small>
          <strong>{snapshot.currentGoal}</strong>
        </div>
        <p>
          <span>공개 판단</span>
          {snapshot.lastRationale}
        </p>
      </div>

      <div className="agent-controls" aria-label="AI 관전 실행 제어">
        <button type="button" onClick={onStart} disabled={isRunning}>
          {snapshot.status === 'paused' ? '계속' : '시작'}
        </button>
        <button type="button" onClick={onPause} disabled={!isRunning}>
          일시정지
        </button>
        <button type="button" onClick={onStop} disabled={isIdle}>
          중지
        </button>
      </div>

      <div className="agent-speed" role="group" aria-label="AI 관전 배속">
        <span>배속</span>
        {([1, 2, 4] as ForgeAgentSpeed[]).map(speed => (
          <button
            key={speed}
            type="button"
            className={snapshot.speed === speed ? 'is-active' : ''}
            aria-pressed={snapshot.speed === speed}
            onClick={() => onSpeedChange(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>

      <div className="agent-timeline">
        <div className="agent-timeline__heading">
          <h3>최근 이벤트</h3>
          <span>최대 8개 표시</span>
        </div>
        {recentEvents.length > 0 ? (
          <ol aria-label="AI 행동 타임라인">
            {recentEvents.map(event => (
              <li key={event.eventId} className={event.result?.ok === false ? 'is-error' : ''}>
                <time dateTime={new Date(event.timestamp).toISOString()}>
                  {formatEventTime(event.timestamp)}
                </time>
                <div>
                  <strong>{eventTitle(event)}</strong>
                  <span>{event.rationale || event.message}</span>
                  {event.rationale && event.message !== event.rationale && <small>{event.message}</small>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="agent-timeline__empty">시작하면 공개 판단과 행동 결과가 여기에 기록됩니다.</p>
        )}
      </div>

      <p className="agent-local-notice">
        AI 전용 로컬 세이브 · 공식 서버 기록 아님
      </p>
    </section>
  );
}
