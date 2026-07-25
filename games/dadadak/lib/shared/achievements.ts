export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-record",
    name: "첫 딸깍 기록",
    desc: "첫 측정을 완료했다",
    icon: "Timer",
  },
  {
    id: "first-win",
    name: "첫 승리",
    desc: "대결에서 처음 이겼다",
    icon: "Trophy",
  },
  { id: "wins-10", name: "연승 가도", desc: "대결 10승", icon: "Swords" },
  {
    id: "matches-50",
    name: "딸깍 중독",
    desc: "배틀 50판 완료",
    icon: "Repeat",
  },
  { id: "cps-10", name: "두 자릿수", desc: "CPS 10.0 이상 기록", icon: "Gauge" },
  {
    id: "cps-15",
    name: "손가락에 모터",
    desc: "CPS 15.0 이상 기록",
    icon: "Zap",
  },
  {
    id: "burst-20",
    name: "순간 폭발",
    desc: "3초 버스트 20CPS 이상",
    icon: "Flame",
  },
  {
    id: "ghost-win-5",
    name: "도장 브레이커",
    desc: "도장깨기 5승",
    icon: "Ghost",
  },
  {
    id: "event-win",
    name: "전국구",
    desc: "글로벌 이벤트 매치 우승",
    icon: "Globe",
  },
  {
    id: "golden-win",
    name: "골든 타임",
    desc: "골든 클릭 매치 승리",
    icon: "Star",
  },
  {
    id: "race-win",
    name: "선착순의 제왕",
    desc: "서든데스 레이스 승리",
    icon: "FlagTriangleRight",
  },
  {
    id: "taps-100k",
    name: "십만 딸깍",
    desc: "누적 100,000딸깍",
    icon: "MousePointerClick",
  },
  {
    id: "streak-7",
    name: "7일의 사나이",
    desc: "7일 연속 출석",
    icon: "CalendarCheck",
  },
  {
    id: "night-owl",
    name: "새벽의 딸깍러",
    desc: "00~05시(KST)에 배틀 완료",
    icon: "Moon",
  },
];
