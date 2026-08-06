import { rewardCards } from '../content/cards';

export function EndScreen({ won, acquiredCardIds, pack, saveError, onHome }: {
  won: boolean;
  acquiredCardIds: string[];
  pack: string[];
  saveError?: string;
  onHome: () => void;
}) {
  const name = (id: string) => rewardCards.find((card) => card.id === id)?.name ?? id;
  return <main className="ending centered">
    <div className="seal">{won ? '完' : '終'}</div>
    <h1>{won ? '다섯 굿을 모두 마쳤습니다' : '굿이 끊어졌습니다'}</h1>
    <p>{won ? '신들의 이야기가 한데 이어졌습니다.' : '다른 연계와 선택으로 다시 맞서 보세요.'}</p>
    <section className="result-cards panel">
      <b>이번 런에서 얻은 카드</b>
      <p>{acquiredCardIds.length ? acquiredCardIds.map(name).join(' · ') : '없음'}</p>
      {won && <><b>본풀이 꾸러미</b><p>{pack.length ? pack.map(name).join(' · ') : '저장 후 열립니다'}</p></>}
    </section>
    {saveError && <p className="notice" role="alert">{saveError}</p>}
    <button className="restart" onClick={onHome}>본향으로</button>
  </main>;
}
