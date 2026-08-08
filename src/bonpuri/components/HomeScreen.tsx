import { getAscensionModifier, MAX_ASCENSION } from '../content/ascension';
import type { BonpuriProfile } from '../services/profile';

/** 0~10 버튼을 한 줄로 늘어놓으면 모바일에서 터치가 불가능해진다. 단계 조절 방식으로 간다. */
function AscensionPicker({ profile, onSelect }: {
  profile: BonpuriProfile;
  onSelect: (ascension: number) => void;
}) {
  const { ascensionUnlocked: unlocked, ascensionSelected: selected } = profile;
  if (unlocked === 0) {
    return <section className="ascension panel">
      <div className="ascension-heading"><small>승천</small><b>잠김</b></div>
      <p className="ascension-hint">승천은 다섯 굿을 모두 마치면 열립니다.</p>
    </section>;
  }
  const modifier = getAscensionModifier(selected);
  const atMax = unlocked >= MAX_ASCENSION;
  return <section className="ascension panel">
    <div className="ascension-heading">
      <small>승천</small>
      <div className="ascension-step">
        <button type="button" aria-label="승천 단계 낮추기" disabled={selected <= 0}
          onClick={() => onSelect(selected - 1)}>−</button>
        <b aria-live="polite">{selected} 단계</b>
        <button type="button" aria-label="승천 단계 올리기" disabled={selected >= unlocked}
          onClick={() => onSelect(selected + 1)}>+</button>
      </div>
    </div>
    <dl className="ascension-facts">
      <div><dt>적 명</dt><dd>×{modifier.enemyHpMultiplier.toFixed(2)}</dd></div>
      <div><dt>적 공격</dt><dd>×{modifier.enemyDamageMultiplier.toFixed(2)}</dd></div>
      <div><dt>시작 명</dt><dd>{modifier.startingHp}</dd></div>
      <div><dt>정화 회복</dt><dd>{modifier.purifyHeal}</dd></div>
    </dl>
    <p className="ascension-hint">
      {atMax
        ? `승천 ${MAX_ASCENSION}까지 모두 열렸습니다. 해금 최고 단계 ${unlocked}.`
        : `해금 최고 단계 ${unlocked}. 승천 ${unlocked}을(를) 이기면 승천 ${unlocked + 1}이(가) 열립니다.`}
    </p>
  </section>;
}

export function HomeScreen({ profile, notice, onStart, onEdit, onSelectAscension }: {
  profile: BonpuriProfile;
  notice?: string;
  onStart: () => void;
  onEdit: () => void;
  onSelectAscension: (ascension: number) => void;
}) {
  const total = Object.values(profile.collection).reduce((sum, count) => sum + count, 0);
  return <main className="home centered">
    <div className="seal">本</div>
    <h1>본풀이 · 다섯 굿</h1>
    <p>신들의 이야기를 모아 나만의 굿을 준비하세요.</p>
    {notice && <p className="notice" role="alert">{notice}</p>}
    <section className="home-summary panel">
      <div><small>보관함</small><b>{total}장 · {Object.keys(profile.collection).length}종</b></div>
      <div><small>전적</small><b>{profile.runsWon}승 / {profile.runsCompleted}회</b></div>
    </section>
    <AscensionPicker profile={profile} onSelect={onSelectAscension} />
    <button className="primary" onClick={onStart}>
      런 시작{profile.ascensionUnlocked > 0 ? ` · 승천 ${profile.ascensionSelected}` : ''}
    </button>
    <button className="secondary" onClick={onEdit}>덱 편집</button>
  </main>;
}
