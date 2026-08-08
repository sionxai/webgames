import { rewardCards } from '../content/cards';

export function EndScreen({ won, ascension, ascensionUnlockedNow, unlockedAscension, acquiredCardIds, pack, saveError, onHome }: {
  won: boolean;
  ascension: number;
  /** 이번 런으로 새 단계가 열렸는지. 저장에 실패했으면 false 로 온다 — 거짓 해금을 띄우지 않는다. */
  ascensionUnlockedNow: boolean;
  unlockedAscension: number;
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
    {ascensionUnlockedNow && <p className="ascension-unlocked" role="status">
      <b>승천 {unlockedAscension} 해금</b> — 본향에서 단계를 올려 다시 도전할 수 있습니다.
    </p>}
    <section className="result-cards panel">
      <b>승천 단계</b>
      <p>{ascension} 단계로 치른 굿입니다.</p>
      <b>이번 런에서 얻은 카드</b>
      <p>{acquiredCardIds.length ? acquiredCardIds.map(name).join(' · ') : '없음'}</p>
      {won && <><b>본풀이 꾸러미</b><p>{pack.length ? pack.map(name).join(' · ') : '저장 후 열립니다'}</p></>}
    </section>
    {saveError && <p className="notice" role="alert">{saveError}</p>}
    <button className="restart" onClick={onHome}>본향으로</button>
  </main>;
}
