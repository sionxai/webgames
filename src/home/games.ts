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
  /** 로컬 AI 관전·플레이 브리지를 제공하는 게임인지 여부. */
  agentSupport?: boolean;
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
    status: 'live',
    agentSupport: true
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
    id: 'bakara',
    title: '프리미엄 바카라',
    genre: '카지노 카드 시뮬',
    tagline: '자동 배팅 전략으로 즐기는 바카라',
    description: '프리미엄 바카라 게임 - 자동 배팅 전략 시뮬레이터',
    path: '/games/bakara/',
    thumbnail: '/assets/images/bakara-key-v1.webp',
    status: 'live'
  },
  {
    id: 'gacha',
    title: '가챠 RPG',
    genre: '실시간 멀티플레이 RPG',
    tagline: '장비를 모으고 캐릭터를 키워 PvP까지',
    description:
      'Firebase 실시간 멀티플레이 환경에서 장비를 수집하고 캐릭터를 육성해 PvP 전투를 즐기는 가챠 RPG입니다.',
    path: '/games/gacha/',
    thumbnail: '/assets/images/gacha-key-v1.webp',
    status: 'live'
  },
  {
    id: 'life-rpg',
    title: 'Life RPG Simulator',
    genre: '라이프 시뮬레이션 RPG',
    tagline: '스탯을 키우며 살아가는 나만의 인생 RPG',
    description:
      '스탯과 직업·알바를 관리하고 상점, 퀘스트, 알람과 공백 처리까지 즐기는 웹 기반 Life RPG 시뮬레이터입니다.',
    path: '/games/life-rpg/',
    thumbnail: '/assets/images/liferpg-key-v1.webp',
    status: 'live'
  },
  {
    id: 'coming-soon-2',
    title: 'DADADAK',
    genre: '준비 중',
    tagline: '서버 오픈과 함께 공개 예정',
    description: '실시간 대전 게임 — 서버 준비 중입니다.',
    path: '',
    thumbnail: null,
    status: 'coming-soon'
  }
];
