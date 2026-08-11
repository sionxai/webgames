import type { CloudSaveState } from '../../lib/cloudSave';
import type { ProfileSummary } from '../services/cloudProfile';

export type CloudGateState =
  | { kind: 'auth-loading' }
  | { kind: 'auth-error' }
  | { kind: 'setup-required' }
  | { kind: 'sync-loading' }
  | { kind: 'sync-error'; message: string }
  | { kind: 'legacy-choice'; local: ProfileSummary; cloud: ProfileSummary | null }
  | { kind: 'account-changed'; cloud: ProfileSummary | null }
  | { kind: 'diverged'; local: ProfileSummary; cloud: ProfileSummary };

function Summary({ summary, title }: { summary: ProfileSummary; title: string }) {
  return <section className="bonpuri-cloud-summary">
    <strong>{title}</strong>
    <dl>
      <div><dt>보관함</dt><dd>{summary.cards}장 · {summary.kinds}종</dd></div>
      <div><dt>전적</dt><dd>{summary.runsWon}승 / {summary.runsCompleted}회</dd></div>
      <div><dt>승천</dt><dd>{summary.ascensionUnlocked}단계</dd></div>
      <div><dt>덱</dt><dd>{summary.deckSize}장</dd></div>
    </dl>
  </section>;
}

export function CloudSavePanel({ gate, onUseLocal, onUseCloud, onUseNew, onRetry }: {
  gate: CloudGateState;
  onUseLocal: () => void;
  onUseCloud: () => void;
  onUseNew: () => void;
  onRetry: () => void;
}) {
  const isError = gate.kind === 'auth-error' || gate.kind === 'setup-required' || gate.kind === 'sync-error';
  return <main className="bonpuri-cloud-gate centered">
    <div className="seal" aria-hidden="true">本</div>
    <h1>본풀이 기록 확인</h1>
    <section className="panel bonpuri-cloud-panel" role={isError ? 'alert' : 'status'} aria-live="polite">
      {(gate.kind === 'auth-loading' || gate.kind === 'sync-loading') && <>
        <strong>안전하게 계정을 확인하고 있습니다.</strong>
        <p>확인이 끝날 때까지 기존 덱과 보관함은 열지 않습니다.</p>
      </>}
      {gate.kind === 'auth-error' && <>
        <strong>계정을 확인하지 못했습니다.</strong>
        <p>기존 기록을 보호하기 위해 게임을 열지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" className="primary" onClick={onRetry}>다시 시도</button>
      </>}
      {gate.kind === 'setup-required' && <>
        <strong>게스트 로그인을 준비해야 합니다.</strong>
        <p>기존 기록을 보호하기 위해 게임을 열지 않았습니다. 계정 설정을 확인해 주세요.</p>
      </>}
      {gate.kind === 'sync-error' && <>
        <strong>클라우드 기록을 확인하지 못했습니다.</strong>
        <p>{gate.message}</p>
        <button type="button" className="primary" onClick={onRetry}>다시 확인</button>
      </>}
      {gate.kind === 'legacy-choice' && <>
        <strong>이 기기의 기존 기록을 발견했습니다.</strong>
        <p>어느 기록을 이 계정에 연결할지 직접 선택해 주세요. 선택 전에는 업로드하지 않습니다.</p>
        <div className="bonpuri-cloud-choices">
          <Summary summary={gate.local} title="이 기기 기록" />
          {gate.cloud && <Summary summary={gate.cloud} title="클라우드 기록" />}
        </div>
        <div className="bonpuri-cloud-actions">
          <button type="button" className="secondary" onClick={onUseLocal}>이 기기 기록 사용</button>
          {gate.cloud
            ? <button type="button" className="primary" onClick={onUseCloud}>클라우드 기록 사용</button>
            : <button type="button" className="primary" onClick={onUseNew}>새 기록 시작</button>}
        </div>
      </>}
      {gate.kind === 'account-changed' && <>
        <strong>다른 계정의 로컬 기록을 보호하고 있습니다.</strong>
        <p>이전 계정의 덱과 보관함은 표시하거나 현재 계정에 올리지 않습니다.</p>
        {gate.cloud && <Summary summary={gate.cloud} title="현재 계정의 클라우드 기록" />}
        <button type="button" className="primary" onClick={gate.cloud ? onUseCloud : onUseNew}>
          {gate.cloud ? '현재 계정 기록 사용' : '현재 계정 새 기록 시작'}
        </button>
      </>}
      {gate.kind === 'diverged' && <>
        <strong>두 기록이 서로 다릅니다.</strong>
        <p>자동으로 덮어쓰지 않았습니다. 계속 사용할 기록을 선택해 주세요.</p>
        <div className="bonpuri-cloud-choices">
          <Summary summary={gate.local} title="이 기기 기록" />
          <Summary summary={gate.cloud} title="클라우드 기록" />
        </div>
        <div className="bonpuri-cloud-actions">
          <button type="button" className="secondary" onClick={onUseLocal}>이 기기 기록 사용</button>
          <button type="button" className="primary" onClick={onUseCloud}>클라우드 기록 사용</button>
        </div>
      </>}
      <a className="bonpuri-account-link" href="/">계정 설정으로 이동</a>
    </section>
  </main>;
}

const labels: Record<CloudSaveState, string> = {
  idle: '로컬 저장',
  loading: '동기화 중',
  synced: '클라우드 저장됨',
  offline: '오프라인 · 로컬 저장',
  conflict: '기록 선택 필요',
  error: '동기화 오류',
};

export function CloudStatusBadge({ state, google, onRetry }: {
  state: CloudSaveState;
  google: boolean;
  onRetry: () => void;
}) {
  const effective = google ? state : 'idle';
  const className = `bonpuri-cloud-badge bonpuri-cloud-badge--${effective}`;
  if (google && (effective === 'offline' || effective === 'error')) {
    return <button type="button" className={className} onClick={onRetry}
      title="클라우드 저장을 다시 시도합니다.">{labels[effective]} · 다시 시도</button>;
  }
  return <span className={className} role="status" aria-live="polite">{labels[effective]}</span>;
}
