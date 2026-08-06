import type { ReactNode } from 'react';

export function Tooltip({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="tooltip-backdrop" onPointerDown={onClose}>
    <aside className="tooltip" role="dialog" aria-label={`${title} 설명`} onPointerDown={(event) => event.stopPropagation()}>
      <button className="tooltip-close" aria-label="설명 닫기" onClick={onClose}>×</button>
      <strong>{title}</strong>
      <div>{children}</div>
    </aside>
  </div>;
}
