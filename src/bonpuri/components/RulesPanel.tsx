export function RulesPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <aside className={`rules-panel ${open ? 'open' : ''}`} aria-label="전투 규칙">
    <div className="rules-heading">
      <span>{open ? '카드를 눌러 사용하고, 끝나면 턴 종료를 누르세요' : '명·장단·넋 규칙 안내'}</span>
      <button onClick={onToggle}>{open ? '접기' : '펴기'}</button>
    </div>
    {open && <dl>
      <div><dt>명</dt><dd>체력, 0이면 런 종료</dd></div>
      <div><dt>장단</dt><dd>매 턴 3 회복, 이월 없음</dd></div>
      <div><dt>넋</dt><dd>방어막, 턴 시작 시 사라짐</dd></div>
    </dl>}
  </aside>;
}
