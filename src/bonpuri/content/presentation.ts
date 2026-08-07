export type CardArt = { src: string; objectPosition?: string };

const cardArtById = new Map<string, CardArt>([
  ['sinkal', { src: '/assets/bonpuri/cards/sinkal.webp' }],
  ['neokgarim', { src: '/assets/bonpuri/cards/neokgarim.webp' }],
  ['saseol', { src: '/assets/bonpuri/cards/saseol.webp' }],
  ['jacheongbi', { src: '/assets/bonpuri/cards/jacheongbi.webp' }],
  ['gangnimchasa', { src: '/assets/bonpuri/cards/gangnimchasa.webp' }],
  ['myeongdu', { src: '/assets/bonpuri/cards/myeongdu.webp' }],
  ['yeongdeunggut', { src: '/assets/bonpuri/cards/yeongdeunggut.webp' }],
  ['munjeonsin', { src: '/assets/bonpuri/cards/munjeonsin.webp' }],
]);

const enemyArtById = new Map<string, string>([
  ['japgwi', '/assets/bonpuri/enemies/japgwi.webp'],
]);

const battleBackgroundByEnemyId = new Map<string, string>([
  ['japgwi', '/assets/bonpuri/backgrounds/isung.webp'],
]);

/** 런타임 카드 ID는 `기본ID#일련번호` 형태다(sinkal#7). '#' 앞만 쓴다. */
export function baseCardId(id: string): string {
  const separator = id.indexOf('#');
  return separator === -1 ? id : id.slice(0, separator);
}

/** 매핑이 없으면 undefined. 그것이 정상이며 결함이 아니다. */
export function cardArt(cardId: string): CardArt | undefined {
  return cardArtById.get(baseCardId(cardId));
}

export function enemyArt(enemyId: string): string | undefined {
  return enemyArtById.get(enemyId);
}

export function battleBackground(enemyId: string): string | undefined {
  return battleBackgroundByEnemyId.get(enemyId);
}
