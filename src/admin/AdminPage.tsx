import { useEffect, useMemo, useState } from 'react';
import { GAMES } from '../home/games';
import {
  localDayKey,
  readGameStats,
  readPortalTotals,
  resolveAdminSession,
  type GameVisitCounts
} from '../lib/gameStats';

type Phase = 'loading' | 'denied' | 'ready' | 'error';

export function AdminPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [uid, setUid] = useState<string | null>(null);
  const [portal, setPortal] = useState<GameVisitCounts | null>(null);
  const [games, setGames] = useState<Record<string, GameVisitCounts>>({});

  const liveGames = useMemo(() => GAMES.filter(game => game.status === 'live'), []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await resolveAdminSession();
      if (cancelled) return;

      if (!session) {
        setPhase('error');
        return;
      }
      setUid(session.uid);
      if (!session.isAdmin) {
        setPhase('denied');
        return;
      }

      try {
        const [totals, perGame] = await Promise.all([
          readPortalTotals(),
          readGameStats(liveGames.map(game => game.id))
        ]);
        if (cancelled) return;
        setPortal(totals);
        setGames(perGame);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liveGames]);

  const ranked = useMemo(
    () =>
      [...liveGames]
        .map(game => ({ game, counts: games[game.id] ?? { total: 0, today: 0 } }))
        .sort((a, b) => b.counts.total - a.counts.total || b.counts.today - a.counts.today),
    [liveGames, games]
  );

  const clickTotal = ranked.reduce((sum, row) => sum + row.counts.total, 0);
  const clickToday = ranked.reduce((sum, row) => sum + row.counts.today, 0);

  return (
    <div className="admin">
      <header className="admin__header">
        <p className="admin__eyebrow">HANPAN ADMIN</p>
        <h1>운영 통계</h1>
        <p className="admin__date">{localDayKey()} 기준</p>
      </header>

      {phase === 'loading' && <p className="admin__note">불러오는 중…</p>}

      {phase === 'error' && (
        <p className="admin__note admin__note--warn">
          통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {phase === 'denied' && (
        <section className="admin__card">
          <h2>접근 권한이 없습니다</h2>
          <p className="admin__note">
            아래 사용자 ID를 Firebase 콘솔의{' '}
            <code>portal/admins/&lt;uid&gt;</code> 에 <code>true</code> 로 추가하면
            이 페이지를 볼 수 있습니다.
          </p>
          <p className="admin__uid">{uid ?? '-'}</p>
        </section>
      )}

      {phase === 'ready' && (
        <>
          <section className="admin__summary">
            <div className="admin__stat">
              <span>포털 총 방문</span>
              <strong>{portal?.total.toLocaleString() ?? '-'}</strong>
            </div>
            <div className="admin__stat">
              <span>포털 오늘</span>
              <strong>{portal?.today.toLocaleString() ?? '-'}</strong>
            </div>
            <div className="admin__stat">
              <span>게임 진입 누적</span>
              <strong>{clickTotal.toLocaleString()}</strong>
            </div>
            <div className="admin__stat">
              <span>게임 진입 오늘</span>
              <strong>{clickToday.toLocaleString()}</strong>
            </div>
          </section>

          <section className="admin__card">
            <h2>게임별 진입</h2>
            <table className="admin__table">
              <thead>
                <tr>
                  <th>게임</th>
                  <th>누적</th>
                  <th>오늘</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ game, counts }) => (
                  <tr key={game.id}>
                    <td>{game.title}</td>
                    <td>{counts.total.toLocaleString()}</td>
                    <td>{counts.today.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="admin__note">
              홈에서 게임 카드를 눌러 들어간 횟수입니다. 북마크나 주소 직접 입력으로
              들어온 방문은 포함되지 않습니다.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
