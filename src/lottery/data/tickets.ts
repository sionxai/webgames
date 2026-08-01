import type { TicketProduct } from "../types";

export const TICKETS: TicketProduct[] = [
  {
    id: 500, name: "긁는순간 500", real: true, issued: 4000000, rule: "match3",
    luckyCount: 0, mineCount: 6, cols: 3, rows: 2,
    background: "/assets/images/lottery-ticket-500.webp", kind: "3매치게임",
    ruleText: "같은 금액이 3개 나오면 당첨(합산 불가)",
    prizes: [
      { rank: 1, prize: 200000000, count: 1 }, { rank: 2, prize: 1000000, count: 20 },
      { rank: 3, prize: 5000, count: 60000 }, { rank: 4, prize: 500, count: 1200000 },
    ],
  },
  {
    id: 1000, name: "긁는순간 1000", real: true, issued: 5000000, rule: "lucky",
    luckyCount: 1, mineCount: 6, cols: 3, rows: 2,
    background: "/assets/images/lottery-ticket-1000.webp", kind: "행운숫자게임",
    ruleText: "행운숫자와 나의 숫자가 일치하면 당첨",
    prizes: [
      { rank: 1, prize: 500000000, count: 1 }, { rank: 2, prize: 20000000, count: 5 },
      { rank: 3, prize: 10000, count: 27500 }, { rank: 4, prize: 5000, count: 125000 },
      { rank: 5, prize: 1000, count: 1500000 },
    ],
  },
  {
    id: 2000, name: "긁는순간 2000", real: true, issued: 5000000, rule: "lucky",
    luckyCount: 2, mineCount: 8, cols: 4, rows: 2, needAll: true,
    background: "/assets/images/lottery-ticket-2000.webp", kind: "2매치게임",
    ruleText: "행운숫자 2개가 모두 일치하면 당첨",
    prizes: [
      { rank: 1, prize: 1000000000, count: 1 }, { rank: 2, prize: 100000000, count: 3 },
      { rank: 3, prize: 10000000, count: 25 }, { rank: 4, prize: 20000, count: 13750 },
      { rank: 5, prize: 4000, count: 350000 }, { rank: 6, prize: 2000, count: 1400000 },
    ],
  },
  {
    id: 5000, name: "긁는순간 5000", real: false, issued: 5000000, rule: "lucky",
    luckyCount: 2, mineCount: 8, cols: 4, rows: 2,
    background: "/assets/images/lottery-ticket-5000.webp", kind: "행운숫자게임",
    ruleText: "행운숫자 2개 중 하나만 일치해도 당첨",
    prizes: [
      { rank: 1, prize: 3000000000, count: 1 }, { rank: 2, prize: 300000000, count: 3 },
      { rank: 3, prize: 30000000, count: 20 }, { rank: 4, prize: 50000, count: 20000 },
      { rank: 5, prize: 10000, count: 300000 }, { rank: 6, prize: 5000, count: 1200000 },
    ],
  },
  {
    id: 10000, name: "긁는순간 10000", real: false, issued: 5000000, rule: "lucky",
    luckyCount: 2, mineCount: 10, cols: 5, rows: 2,
    background: "/assets/images/lottery-ticket-10000.webp", kind: "행운숫자게임",
    ruleText: "행운숫자 2개 중 하나만 일치 · 기회 10번",
    prizes: [
      { rank: 1, prize: 10000000000, count: 1 }, { rank: 2, prize: 1000000000, count: 3 },
      { rank: 3, prize: 100000000, count: 20 }, { rank: 4, prize: 100000, count: 10000 },
      { rank: 5, prize: 20000, count: 250000 }, { rank: 6, prize: 10000, count: 500000 },
    ],
  },
];

export const ticketById = (id: number) => TICKETS.find((ticket) => ticket.id === id);
