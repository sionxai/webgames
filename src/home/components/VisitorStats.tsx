import { useEffect, useState } from 'react';
import { Users, Sunrise } from 'lucide-react';
import { subscribeVisitorStats, type VisitorStats as Stats } from '../../lib/visitorStats';

/** 홈 상단의 방문자 집계. 값을 못 읽으면 조용히 숨긴다. */
export function VisitorStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => subscribeVisitorStats(setStats), []);

  if (!stats) return null;

  return (
    <div className="visitor-stats" aria-label="방문자 통계">
      <span className="visitor-stats__item">
        <Users size={14} aria-hidden="true" />
        <span className="visitor-stats__label">총 방문</span>
        <strong>{stats.total.toLocaleString()}</strong>
      </span>
      <span className="visitor-stats__divider" aria-hidden="true" />
      <span className="visitor-stats__item">
        <Sunrise size={14} aria-hidden="true" />
        <span className="visitor-stats__label">오늘</span>
        <strong>{stats.today.toLocaleString()}</strong>
      </span>
    </div>
  );
}
