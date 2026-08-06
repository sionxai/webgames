import type { Statuses } from '../core/types';

export function StatusList({ statuses }: { statuses: Statuses }) {
  const active = Object.entries(statuses).filter(([, value]) => value > 0);
  return <div className="statuses">{active.map(([name, value]) => <span key={name}>{name} {value}</span>)}</div>;
}
