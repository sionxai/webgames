import { useState } from "react";
import type {
  ActionId,
  CareerState,
  GapData,
  LogEntry,
  ModalState,
  PartTimeJobId,
  Profile,
  RemoteTimerLock,
  Stats,
  TimerState,
} from "@/types/game";

export function useGameState() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [shopFilter, setShopFilter] = useState("all");
  const [dndMode, setDndMode] = useState(false);

  const [stats, setStats] = useState<Stats>({
    health: 10,
    intelligence: 10,
    focus: 10,
    immunity: 10,
    eq: 10,
    willpower: 10,
  });
  const [money, setMoney] = useState<number>(100);
  const [inventory, setInventory] = useState<string[]>([]);
  const [consumables, setConsumables] = useState<Record<string, number>>({});
  const [dailyMealUses, setDailyMealUses] = useState(0);
  const [dailyMealDate, setDailyMealDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [profile, setProfile] = useState<Profile>({ nickname: "", age: null, gender: "" });
  const [profileInput, setProfileInput] = useState<Profile>({ nickname: "", age: null, gender: "" });

  const [questProgress, setQuestProgress] = useState<Record<string, number>>({});
  const [questMultiProgress, setQuestMultiProgress] = useState<Record<string, Partial<Record<ActionId, number>>>>({});
  const [questClaims, setQuestClaims] = useState<Record<string, boolean>>({});
  const [questCompletions, setQuestCompletions] = useState<Record<string, number>>({});

  const [career, setCareer] = useState<CareerState | null>(null);
  const [partTimeJobId, setPartTimeJobId] = useState<PartTimeJobId>("convenience");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<string>("wealth");
  const [level, setLevel] = useState(1);

  const [timer, setTimer] = useState<TimerState>({ active: false, category: null, startTime: null, elapsed: 0 });
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [cheatInput, setCheatInput] = useState("");
  const [showStatsGraph, setShowStatsGraph] = useState(false);
  const [showEffectSummary, setShowEffectSummary] = useState(false);
  const [purchasingItemId, setPurchasingItemId] = useState<string | null>(null);
  const [remoteActiveTimer, setRemoteActiveTimer] = useState<RemoteTimerLock | null>(null);

  const [alarmTime, setAlarmTime] = useState<number | null>(null);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [manualAlarmInput, setManualAlarmInput] = useState("");

  const [gapData, setGapData] = useState<GapData | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  return {
    activeTab,
    setActiveTab,
    shopFilter,
    setShopFilter,
    dndMode,
    setDndMode,
    stats,
    setStats,
    money,
    setMoney,
    inventory,
    setInventory,
    consumables,
    setConsumables,
    dailyMealUses,
    setDailyMealUses,
    dailyMealDate,
    setDailyMealDate,
    profile,
    setProfile,
    profileInput,
    setProfileInput,
    questProgress,
    setQuestProgress,
    questMultiProgress,
    setQuestMultiProgress,
    questClaims,
    setQuestClaims,
    questCompletions,
    setQuestCompletions,
    career,
    setCareer,
    partTimeJobId,
    setPartTimeJobId,
    logs,
    setLogs,
    selectedGoal,
    setSelectedGoal,
    level,
    setLevel,
    timer,
    setTimer,
    speedMultiplier,
    setSpeedMultiplier,
    cheatInput,
    setCheatInput,
    showStatsGraph,
    setShowStatsGraph,
    showEffectSummary,
    setShowEffectSummary,
    purchasingItemId,
    setPurchasingItemId,
    remoteActiveTimer,
    setRemoteActiveTimer,
    alarmTime,
    setAlarmTime,
    alarmRinging,
    setAlarmRinging,
    notificationPermission,
    setNotificationPermission,
    manualAlarmInput,
    setManualAlarmInput,
    gapData,
    setGapData,
    modal,
    setModal,
  };
}
