export type CardArt = { src: string; objectPosition?: string };

const card = (id: string, objectPosition?: string): [string, CardArt] =>
  [id, objectPosition ? { src: `/assets/bonpuri/cards/${id}.webp`, objectPosition } : { src: `/assets/bonpuri/cards/${id}.webp` }];

// 카드 45종 전건 매핑. 순서는 content/cards.ts 와 같다 (기본 3 → 신 20 → 무구 8 → 굿 8 → 좌정 6).
// objectPosition 은 실제 크롭에서 주체가 잘리는 카드에만 준다. 자산이 전부 800x1200(2:3)이고
// 카드 상자는 데스크톱 0.64 / 모바일 0.79 비율이라 중앙 크롭으로 주체가 살아 남아 현재는 0건이다.
const cardArtById = new Map<string, CardArt>([
  card('sinkal'), card('neokgarim'), card('saseol'),
  card('jacheongbi'), card('mundoryeong'), card('jeongsunam'),
  card('gangnimchasa'), card('iljikchasa'), card('woljikchasa'), card('jeoseungsaja'),
  card('cheonjiwang'), card('daebyeolwang'), card('sobyeolwang'),
  card('samseunghalmang'), card('gusamseunghalmang'),
  card('chilseongsin'), card('anchilseong'), card('batchilseong'),
  card('nokdisaengin'), card('namseonbi'), card('yeosanbuin'), card('noiljeodaegwi'),
  card('seolmundaehalmang'),
  card('yoryeong'), card('sanpan'), card('myeongdu'), card('mulsaek'), card('simbangkwaeja'),
  card('bonmaengdu'), card('sinmaengdu'), card('sammaengdu'),
  card('chogamje'), card('siwangmaji'), card('gwiyangpuri'), card('buldomaji'),
  card('yeongdeunggut'), card('yowangmaji'), card('samgongmaji'), card('seongjupuri'),
  card('munjeonsin'), card('jowangsin'), card('cheukgansin'), card('jumokjisin'),
  card('seongjusin'), card('teojusin'),
]);

// 적 5종 전건. 어두운 초상 프레임 안에서 쓰므로 배경이 검은 자산이다.
const enemyArtById = new Map<string, string>([
  ['japgwi', '/assets/bonpuri/enemies/japgwi.webp'],
  ['mulgwisin', '/assets/bonpuri/enemies/mulgwisin.webp'],
  ['yeonggamsin', '/assets/bonpuri/enemies/yeonggamsin.webp'],
  ['gulbaem', '/assets/bonpuri/enemies/gulbaem.webp'],
  ['gusamseunghalmang', '/assets/bonpuri/enemies/gusamseunghalmang.webp'],
]);

// 배경 3종을 5전투에 배분한다. 이승(1·3전투) → 밤바다(2전투) → 저승 굿마당(4·5전투)으로
// 런이 진행될수록 이승에서 멀어지게 잡았다.
const battleBackgroundByEnemyId = new Map<string, string>([
  ['japgwi', '/assets/bonpuri/backgrounds/isung.webp'],
  ['mulgwisin', '/assets/bonpuri/backgrounds/jeju-night-sea.webp'],
  ['yeonggamsin', '/assets/bonpuri/backgrounds/isung.webp'],
  ['gulbaem', '/assets/bonpuri/backgrounds/jeoseung-gutmadang.webp'],
  ['gusamseunghalmang', '/assets/bonpuri/backgrounds/jeoseung-gutmadang.webp'],
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
