export type GameStatus = 'live' | 'coming-soon';

export interface GameEntry {
  id: string;
  title: string;
  genre: string;
  tagline: string;
  description: string;
  /** 게임 페이지 경로. live 게임만 사용한다. */
  path: string;
  /** public 기준 절대 경로. 없으면 placeholder 썸네일을 그린다. */
  thumbnail: string | null;
  status: GameStatus;
}

/**
 * 포털에 노출되는 게임 목록.
 * 새 게임 추가 절차: games/<id>/index.html 엔트리 생성 → vite.config.ts input 등록 → 여기에 카드 등록.
 */
export const GAMES: GameEntry[] = [
  {
    id: 'forge',
    title: '전설의 검 강화하기',
    genre: '방치형 강화 RPG',
    tagline: '평범한 철검을 +20 전설의 검으로',
    description:
      '탭 사냥으로 골드를 모아 검을 강화하세요. 파괴돼도 남는 영구 성장, 단계별 보스와 재료 파밍, +20 초월 도전과 랭킹까지.',
    path: '/games/forge/',
    thumbnail: '/assets/images/forge-arena-v1.webp',
    status: 'live'
  },
  {
    id: 'waitdog',
    title: '기다려, 멍!',
    genre: '반려견 행동교정 시뮬',
    tagline: '내가 없을 때도 스스로 기다리는 강아지',
    description:
      '배변 신호를 관찰하고 올바른 타이밍에 보상하세요. 잘못 가르치면 나쁜 습관이, 잘 가르치면 자율 습관이 남는 7일 캠페인.',
    path: '/games/waitdog/',
    thumbnail: '/assets/images/waitdog-key-v1.webp',
    status: 'live'
  },
  {
    id: 'coming-soon-2',
    title: '세 번째 게임',
    genre: '준비 중',
    tagline: '순차 공개 예정',
    description: '새로운 웹게임을 준비하고 있습니다. 곧 이 자리에서 만나요.',
    path: '',
    thumbnail: null,
    status: 'coming-soon'
  }
];
