export interface Notice {
  date: string;
  text: string;
  href?: string;
}

export const NOTICES: Notice[] = [
  {
    date: "2026-07-09",
    text: "홈이 클리커 중심으로 새 단장 — 어디를 눌러도 딸깍이 쌓여요",
  },
  {
    date: "2026-07-06",
    text: "다다닥 클리커(실물) 관심 등록·SKU 투표 받는 중",
    href: "/clicker",
  },
  {
    date: "2026-07-02",
    text: "글로벌 이벤트 매치 — 매시 정각에 열려요",
    href: "/event",
  },
];
