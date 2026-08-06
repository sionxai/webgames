import type { BonpuriProfile } from '../services/profile';

export function HomeScreen({ profile, notice, onStart, onEdit }: {
  profile: BonpuriProfile;
  notice?: string;
  onStart: () => void;
  onEdit: () => void;
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
    <button className="primary" onClick={onStart}>런 시작</button>
    <button className="secondary" onClick={onEdit}>덱 편집</button>
  </main>;
}
