"use client";

export const ssr = false;

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Apple,
  Armchair,
  ArrowDown,
  BarChart3,
  Beer,
  Bell,
  Bike,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronsUp,
  Clock,
  Cloud,
  Coffee,
  Dumbbell,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Gem,
  Gift,
  Ghost,
  GraduationCap,
  Headphones,
  Heart,
  Lightbulb,
  Link,
  Lock,
  LogOut,
  Monitor,
  Moon,
  MoonStar,
  MoveVertical,
  PenTool,
  Pill,
  Plane,
  Play,
  Plus,
  RefreshCw,
  Shield,
  ShoppingBag,
  Smile,
  Sparkles,
  Smartphone,
  Square,
  Star,
  Stethoscope,
  Target,
  Truck,
  User,
  Wind,
  Zap,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { limitToLast, onValue, push, query, ref, runTransaction, serverTimestamp, update } from "firebase/database";

import { AuthGate, Sidebar, StatRadarComponent, Topbar } from "@/components/common";
import { AlertModal, AuthModal, GapModal } from "@/components/modals";
import { DashboardTab, HistoryTab, InventoryTab, JobTab, QuestTab, ShopTab } from "@/components/tabs";
import { useAuth, useEngine, useGameState } from "@/hooks";
import { ACTIONS, COMPANY_TIERS, GAP_ACTIVITIES, INDUSTRIES, LONG_TERM_GOALS, PART_TIME_JOBS, POSITIONS, QUESTS, SHOP_ITEMS, STATS_DEF, WORK_COST } from "@/lib/constants";
import { auth, database, firebaseAppId, initialAuthToken } from "@/lib/firebase";
import { calcOverallScore, formatChangeValue, formatMoney, roundChangeValue, toNumber } from "@/lib/utils";
import type {
  ActionId,
  CareerState,
  GapData,
  IndustryId,
  LogEntry,
  ModalState,
  PartTimeJobId,
  Profile,
  QuestDefinition,
  QuestReward,
  RemoteTimerLock,
  StatKey,
  Stats,
  TimerState,
  WorkType,
} from "@/types/game";

const STAT_MAX = 300;
const DECAY_RATE = 0.0001;
const ENTRY_REQ_STAT = 20;
const WORK_MIN_HEALTH = 5;

const LOCAL_STORAGE_KEY = "life-rpg-state-v1";
const LOCAL_LAST_ACTIVE_KEY = "localLastActive";

const SHOP_CATEGORIES = [
  { id: "study", label: "📚 공부/지능" },
  { id: "health", label: "🏋 운동/건강" },
  { id: "mind", label: "🧘 멘탈/정서" },
  { id: "work", label: "🔥 근로/장비" },
  { id: "passive", label: "⭐ 패시브/방어" },
  { id: "special", label: "🎮 스페셜" },
] as const;

const ACTIVE_TIMER_TTL_MS = 15000;

export default function LifeRPGPage() {
  const {
    user,
    setUser,
    authError,
    setAuthError,
    syncMode,
    setSyncMode,
    isSyncing,
    setIsSyncing,
    authModalOpen,
    setAuthModalOpen,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authMode,
    setAuthMode,
    authLoading,
    setAuthLoading,
    authMessage,
    setAuthMessage,
  } = useAuth();

  const {
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
  } = useGameState();

  const {
    timerIntervalRef,
    decayIntervalRef,
    decayAccumRef,
    decaySecondsRef,
    saveIntervalRef,
    notifyRef,
    localLoadedRef,
    lastSavedAtRef,
    audioRef,
    timerActiveRef,
    healthRef,
    authInitRef,
    authRetryTimeoutRef,
    tabIdRef,
    lockHeartbeatRef,
    timerOwnerRef,
    logsDbRef,
  } = useEngine();

  const selectedGoalDef = useMemo(
    () => LONG_TERM_GOALS.find((goal) => goal.id === selectedGoal) ?? LONG_TERM_GOALS[0],
    [selectedGoal],
  );

  const aggregateLogStats = useCallback(
    (targetLogs: LogEntry[]) => {
      const statsDelta: Partial<Record<StatKey, number>> = {};
      let moneyDelta = 0;
      targetLogs.forEach((log) => {
        const changes = log.changes ?? log.gains ?? {};
        Object.entries(changes).forEach(([key, value]) => {
          if (key === "money") {
            moneyDelta += typeof value === "number" ? value : 0;
            return;
          }
          if (!STATS_DEF[key as StatKey] || typeof value !== "number") return;
          statsDelta[key as StatKey] = (statsDelta[key as StatKey] || 0) + value;
        });
      });
      return { statsDelta, moneyDelta };
    },
    [],
  );

  const calculateQuestReward = useCallback((quest: QuestDefinition): QuestReward => {
    const baseMoney = Math.round((quest.targetMinutes || 0) * 0.33 * quest.difficulty);
    const money = quest.reward.money ?? baseMoney;
    return { ...quest.reward, money };
  }, []);

  const isQuestUnlocked = useCallback(
    (quest: QuestDefinition) => {
      const unlock = quest.unlockCondition;
      if (!unlock) return { unlocked: true, reason: "" };
      if (unlock.type === "questComplete") {
        const count = questCompletions[unlock.questId] || 0;
        return count >= unlock.count ? { unlocked: true, reason: "" } : { unlocked: false, reason: `${unlock.questId} ${unlock.count}회 완료 필요` };
      }
      if (unlock.type === "statRequirement") {
        const current = stats[unlock.stat];
        return current >= unlock.value ? { unlocked: true, reason: "" } : { unlocked: false, reason: `${STATS_DEF[unlock.stat].label} ${unlock.value}+ 필요` };
      }
      if (unlock.type === "level") {
        return level >= unlock.value ? { unlocked: true, reason: "" } : { unlocked: false, reason: `레벨 ${unlock.value}+ 필요` };
      }
      return { unlocked: true, reason: "" };
    },
    [level, questCompletions, stats],
  );

  const getQuestProgressValue = useCallback(
    (quest: QuestDefinition): { current: number; percent: number } => {
      if (quest.target.kind === "single") {
        const current = questProgress[quest.id] || 0;
        const percent = Math.min(100, (current / quest.target.minutes) * 100);
        return { current, percent };
      }
      const requirements = quest.target.requirements;
      const catProgress = questMultiProgress[quest.id] || {};
      const ratios: number[] = [];
      Object.entries(requirements).forEach(([cat, minutes]) => {
        const current = catProgress[cat as ActionId] || 0;
        ratios.push(Math.min(1, current / (minutes || 1)));
      });
      const minRatio = ratios.length ? Math.min(...ratios) : 0;
      const percent = minRatio * 100;
      const current = minRatio * (quest.targetMinutes || 0);
      return { current, percent };
    },
    [questMultiProgress, questProgress],
  );

  const isQuestCompleted = useCallback(
    (quest: QuestDefinition) => {
      if (quest.target.kind === "single") {
        return (questProgress[quest.id] || 0) >= quest.target.minutes;
      }
      const requirements = quest.target.requirements;
      const catProgress = questMultiProgress[quest.id] || {};
      return Object.entries(requirements).every(
        ([cat, minutes]) => (catProgress[cat as ActionId] || 0) >= (minutes || 0),
      );
    },
    [questMultiProgress, questProgress],
  );

  useEffect(() => {
    timerActiveRef.current = timer.active;
  }, [timer.active]);

  useEffect(() => {
    healthRef.current = stats.health;
  }, [stats.health]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission("unsupported");
    }
  }, []);

  useEffect(() => {
    if (!user && !localLoadedRef.current) {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
      if (raw) {
        try {
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (data.stats) setStats(data.stats as Stats);
          if (data.money !== undefined) setMoney(toNumber(data.money, 0));
          if (Array.isArray(data.inventory)) setInventory(data.inventory as string[]);
          if (data.consumables) setConsumables(data.consumables as Record<string, number>);
          if (typeof data.dailyMealUses === "number") setDailyMealUses(data.dailyMealUses);
          if (typeof data.dailyMealDate === "string") setDailyMealDate(data.dailyMealDate);
          if (data.questProgress) setQuestProgress(data.questProgress as Record<string, number>);
          if (data.questMultiProgress)
            setQuestMultiProgress(data.questMultiProgress as Record<string, Partial<Record<ActionId, number>>>);
          if (data.questClaims) setQuestClaims(data.questClaims as Record<string, boolean>);
          if (data.questCompletions) setQuestCompletions(data.questCompletions as Record<string, number>);
          if (data.profile) {
            const nextProfile = data.profile as Profile;
            setProfile(nextProfile);
            setProfileInput(nextProfile);
          }
          if (data.career) setCareer(data.career as CareerState);
          if (data.partTimeJobId) setPartTimeJobId(data.partTimeJobId as PartTimeJobId);
          if (data.selectedGoal) setSelectedGoal(data.selectedGoal as string);
          const localLastActiveRaw =
            typeof data.localLastActive === "number"
              ? data.localLastActive
              : data.localLastActive
                ? Number(data.localLastActive)
                : null;
          if (localLastActiveRaw) {
            lastSavedAtRef.current = localLastActiveRaw;
          } else {
            const savedLocal = typeof window !== "undefined" ? localStorage.getItem(LOCAL_LAST_ACTIVE_KEY) : null;
            if (savedLocal) {
              const parsed = Number(savedLocal);
              if (!Number.isNaN(parsed)) lastSavedAtRef.current = parsed;
            }
          }
        } catch (error) {
          console.error("Local load error", error);
        }
      }
      localLoadedRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    const makeTabId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    tabIdRef.current = makeTabId();
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (dailyMealDate !== today) {
      setDailyMealDate(today);
      setDailyMealUses(0);
    }
  }, [dailyMealDate]);

  useEffect(() => {
    if (!timer.active || !timer.category || !remoteActiveTimer) return;
    const last = remoteActiveTimer.lastHeartbeat || 0;
    const stale = Date.now() - last > ACTIVE_TIMER_TTL_MS;
    const takenByOther = !stale && remoteActiveTimer.owner !== tabIdRef.current;
    if (takenByOther) {
      timerOwnerRef.current = false;
      setTimer({ active: false, category: null, startTime: null, elapsed: 0 });
      setAlarmTime(null);
      setAlarmRinging(false);
      setModal({ title: "다른 탭에서 실행 중", message: "다른 창에서 타이머가 동작 중이라 현재 창의 진행을 중단했습니다." });
    }
  }, [remoteActiveTimer, timer.active, timer.category]);

  const applySnapshotData = useCallback((data: Record<string, unknown>) => {
    const incomingLastActiveRaw =
      typeof data.localLastActive === "number"
        ? data.localLastActive
        : data.localLastActive
          ? Number(data.localLastActive)
          : typeof data.lastActive === "number"
            ? data.lastActive
            : data.lastActive
              ? Number(data.lastActive)
              : null;
    if (lastSavedAtRef.current && incomingLastActiveRaw && incomingLastActiveRaw < lastSavedAtRef.current) {
      return;
    }
    if (incomingLastActiveRaw) {
      lastSavedAtRef.current = incomingLastActiveRaw;
    } else if (lastSavedAtRef.current) {
      // 최신 저장 시간이 있는데 들어온 데이터에 타임스탬프가 없으면 덮어쓰지 않음
      return;
    }
    if (!timerActiveRef.current) {
      if (data.stats) setStats(data.stats as Stats);
      if (data.money !== undefined) setMoney(toNumber(data.money, 0));
      if (Array.isArray(data.inventory)) setInventory(data.inventory as string[]);
      if (data.consumables) setConsumables(data.consumables as Record<string, number>);
      if (typeof data.dailyMealUses === "number") setDailyMealUses(data.dailyMealUses);
      if (typeof data.dailyMealDate === "string") setDailyMealDate(data.dailyMealDate);
      if (data.questProgress) setQuestProgress(data.questProgress as Record<string, number>);
      if (data.questMultiProgress) setQuestMultiProgress(data.questMultiProgress as Record<string, Partial<Record<ActionId, number>>>);
      if (data.questClaims) setQuestClaims(data.questClaims as Record<string, boolean>);
      if (data.questCompletions) setQuestCompletions(data.questCompletions as Record<string, number>);
      if (data.profile) {
        const nextProfile = data.profile as Profile;
        setProfile(nextProfile);
        setProfileInput(nextProfile);
      }
      // logs는 별도 경로에서 구독
      if (data.career) setCareer(data.career as CareerState);
      if (data.partTimeJobId) setPartTimeJobId(data.partTimeJobId as PartTimeJobId);
      if (data.selectedGoal) setSelectedGoal(data.selectedGoal as string);
    }
    if (data.lastActive) {
      const lastActiveValue = typeof data.lastActive === "number" ? data.lastActive : Number(data.lastActive);
      if (!Number.isNaN(lastActiveValue)) {
        const diffMinutes = Math.floor((Date.now() - lastActiveValue) / (1000 * 60));
        if (diffMinutes >= 5) {
          setGapData({ minutes: diffMinutes });
        }
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    setDailyMealDate((prev) => {
      if (prev !== today) {
        setDailyMealUses(0);
      }
      return today;
    });
  }, []);

  const getUidForSave = useCallback(() => user?.uid ?? null, [user?.uid]);

  const appendLog = useCallback(
    async (entry: Omit<LogEntry, "id">) => {
      const uid = getUidForSave();
      const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newLog: LogEntry = { ...entry, id: tempId };
      setLogs((prev) => [newLog, ...prev].slice(0, 200));
      if (!uid) return newLog;
      try {
        const logRef = logsDbRef.current ?? ref(database, `artifacts/${firebaseAppId}/users/${uid}/logs`);
        logsDbRef.current = logRef;
        const pushed = await push(logRef, { ...entry, createdAt: serverTimestamp() });
        const finalId = pushed.key || tempId;
        const finalLog: LogEntry = { ...entry, id: finalId };
        setLogs((prev) => [finalLog, ...prev.filter((log) => log.id !== tempId)].slice(0, 200));
        return finalLog;
      } catch (error) {
        console.error("Append log error", error);
        return newLog;
      }
    },
    [getUidForSave],
  );

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      setModal({ title: "알림 불가", message: "브라우저가 알림을 지원하지 않습니다." });
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "denied") {
        setModal({ title: "알림 거부됨", message: "브라우저 설정에서 알림을 허용해야 합니다." });
      } else if (result === "granted") {
        setModal({ title: "알림 활성화", message: "타이머 알람 시 브라우저 알림을 보냅니다." });
      }
    } catch (error) {
      console.error("Notification permission error", error);
      setNotificationPermission("default");
    }
  };

  const getActiveTimerRef = useCallback(
    (uid: string) => ref(database, `artifacts/${firebaseAppId}/users/${uid}/state/active_timer`),
    [],
  );

  const getTotalStats = useCallback(
    () => Object.values(stats).reduce((acc, value) => acc + value, 0),
    [stats],
  );

  const calculateWage = useCallback(() => {
    if (!career) return 0;
    const industry = INDUSTRIES[career.industry];
    const company = COMPANY_TIERS.find((c) => c.id === career.company);
    const position = POSITIONS.find((p) => p.id === career.position);
    if (!industry || !company || !position) return 0;
    return parseFloat((industry.baseWage * company.mult * position.mult).toFixed(2));
  }, [career]);

  const getPositionScore = (industryId: IndustryId) => {
    const industry = INDUSTRIES[industryId];
    if (!industry || !career) return 0;
    const company = COMPANY_TIERS.find((c) => c.id === career.company);
    const position = POSITIONS.find((p) => p.id === career.position);
    const requirement = (company?.minStat ?? ENTRY_REQ_STAT) + (position?.addStat ?? 0);
    const avgCoreStat =
      industry.core.reduce((acc, key) => acc + stats[key], 0) / (industry.core.length || 1);
    if (requirement === 0) return 0;
    return parseFloat(((avgCoreStat / requirement) * 100).toFixed(1));
  };

  const getJobInfo = useCallback((): { label: string; wage: number; isCareer: boolean; workType: WorkType } => {
    if (career) {
      const company = COMPANY_TIERS.find((c) => c.id === career.company);
      const position = POSITIONS.find((p) => p.id === career.position);
      const wage = calculateWage();
      const industry = INDUSTRIES[career.industry];
      const core = industry?.core ? ([...industry.core] as StatKey[]) : ([] as StatKey[]);
      const isPhysical = core.includes("health") || core.includes("immunity");
      const workType: WorkType = isPhysical ? "physical" : "mental";
      return {
        label: `${position?.label || ""} (${company?.label || ""})`,
        wage,
        isCareer: true,
        workType,
      };
    }
    const job = PART_TIME_JOBS.find((j) => j.id === partTimeJobId) ?? PART_TIME_JOBS[0];
    let workType: WorkType = "light";
    if (["restaurant", "cleaning", "delivery_rent", "delivery_bike", "delivery_own", "moving"].includes(job.id)) {
      workType = "physical";
    } else if (job.id === "tutor_part") {
      workType = "mental";
    }
    return { label: job.label, wage: job.wage, isCareer: false, workType };
  }, [career, calculateWage, partTimeJobId]);

  const jobInfo = useMemo(() => getJobInfo(), [getJobInfo]);

  const activeLockInfo = useMemo(() => {
    if (!remoteActiveTimer) return null;
    const last = remoteActiveTimer.lastHeartbeat || 0;
    const alive = Date.now() - last < ACTIVE_TIMER_TTL_MS;
    return alive ? remoteActiveTimer : null;
  }, [remoteActiveTimer]);

  const getDecayMultiplier = useCallback(
    (statKey: StatKey) => {
      let mult = 1;
      SHOP_ITEMS.forEach((item) => {
        if (inventory.includes(item.id) && "passive" in item && item.passive) {
          const passive = item.passive;
          if ("stat" in passive) {
            if (passive.stat === "all" || passive.stat === statKey) {
              mult *= passive.rate ?? 1;
            }
          }
        }
      });
      return mult;
    },
    [inventory],
  );

  const getGlobalBoost = useCallback(() => {
    let mult = 1;
    SHOP_ITEMS.forEach((item) => {
      if (inventory.includes(item.id) && "passive" in item && item.passive) {
        const passive = item.passive;
        if ("type" in passive && passive.type === "growth") {
          mult *= passive.rate ?? 1;
        }
      }
    });
    return mult;
  }, [inventory]);

  const acquireTimerLock = useCallback(
    async (catId: ActionId) => {
      const uid = getUidForSave();
      if (!uid) return { ok: true, reason: "" };
      const ownerId = tabIdRef.current;
      const now = Date.now();
      const timerRef = getActiveTimerRef(uid);
      const txn = await runTransaction(timerRef, (currentData) => {
        const current = currentData as RemoteTimerLock | null;
        if (current && current.owner) {
          const alive = now - (current.lastHeartbeat || 0) < ACTIVE_TIMER_TTL_MS;
          if (alive && current.owner !== ownerId) {
            return current;
          }
        }
        return {
          owner: ownerId,
          category: catId,
          startedAt: now,
          lastHeartbeat: now,
          speed: speedMultiplier,
        } as RemoteTimerLock;
      });
      const committed = txn.committed && txn.snapshot?.val()?.owner === ownerId;
      if (!committed) {
        return { ok: false, reason: "다른 탭에서 이미 실행 중입니다." };
      }
      return { ok: true, reason: "" };
    },
    [getActiveTimerRef, getUidForSave, speedMultiplier],
  );

  const releaseTimerLock = useCallback(async () => {
    const uid = getUidForSave();
    if (!uid) return;
    const ownerId = tabIdRef.current;
    const timerRef = getActiveTimerRef(uid);
    await runTransaction(timerRef, (currentData) => {
      const current = currentData as RemoteTimerLock | null;
      if (current && current.owner === ownerId) {
        return null;
      }
      return current;
    });
  }, [getActiveTimerRef, getUidForSave]);

  useEffect(
    () => () => {
      void releaseTimerLock();
    },
    [releaseTimerLock],
  );

  useEffect(() => {
    const handleUnload = () => {
      if (timerOwnerRef.current) {
        void releaseTimerLock();
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [releaseTimerLock]);

  const claimableQuests = useMemo(
    () =>
      QUESTS.filter((quest) => {
        const { unlocked } = isQuestUnlocked(quest);
        return unlocked && isQuestCompleted(quest) && !questClaims[quest.id];
      }),
    [isQuestCompleted, isQuestUnlocked, questClaims],
  );

  const sortedQuests = useMemo(() => {
    return [...QUESTS].sort((a, b) => {
      const aUnlocked = isQuestUnlocked(a).unlocked;
      const bUnlocked = isQuestUnlocked(b).unlocked;
      const aClaimable = aUnlocked && isQuestCompleted(a) && !questClaims[a.id];
      const bClaimable = bUnlocked && isQuestCompleted(b) && !questClaims[b.id];
      const aClaimed = Boolean(questClaims[a.id]);
      const bClaimed = Boolean(questClaims[b.id]);

      const aScore = aClaimable ? 0 : aClaimed ? 2 : 1;
      const bScore = bClaimable ? 0 : bClaimed ? 2 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return a.id.localeCompare(b.id);
    });
  }, [isQuestCompleted, isQuestUnlocked, questClaims]);

  const passiveSummary = useMemo(() => {
    const decay: Record<StatKey, number> = {
      health: 1,
      intelligence: 1,
      focus: 1,
      immunity: 1,
      eq: 1,
      willpower: 1,
    };
    let growth = 1;
    let gap = 1;
    let penalty = 1;
    let sleep = 1;
    const actionBoosts = Object.keys(ACTIONS).reduce((acc, key) => {
      acc[key as ActionId] = 1;
      return acc;
    }, {} as Record<ActionId, number>);

    (SHOP_ITEMS ?? []).forEach((item) => {
      if (!inventory.includes(item.id)) return;
      if ("passive" in item && item.passive) {
        const passive = item.passive;
        if ("stat" in passive) {
          if (passive.stat === "all") {
            (Object.keys(decay) as StatKey[]).forEach((statKey) => {
              decay[statKey] *= passive.rate ?? 1;
            });
          } else if (passive.stat && decay[passive.stat as StatKey] !== undefined) {
            decay[passive.stat as StatKey] *= passive.rate ?? 1;
          }
        }
        if ("type" in passive) {
          if (passive.type === "growth") growth *= passive.rate ?? 1;
          if (passive.type === "gap") gap *= passive.rate ?? 1;
          if (passive.type === "penalty") penalty *= passive.rate ?? 1;
          if (passive.type === "sleep") sleep *= passive.rate ?? 1;
        }
      }
      if ("targetAction" in item && item.targetAction && item.targetAction !== "none" && (item.boost ?? 0) > 0) {
        actionBoosts[item.targetAction as ActionId] *= item.boost ?? 1;
      }
    });

    return { decay, growth, gap, penalty, sleep, actionBoosts };
  }, [inventory]);

  const ownedItems = useMemo(
    () => SHOP_ITEMS.filter((item) => !("consumable" in item && item.consumable) && inventory.includes(item.id)),
    [inventory],
  );

  const consumableList = useMemo(
    () => SHOP_ITEMS.filter((item) => "consumable" in item && item.consumable && (consumables[item.id] || 0) > 0),
    [consumables],
  );
  const remainingMeals = Math.max(0, 3 - dailyMealUses);

  const saveData = useCallback(
    async (uidParam?: string, overrides?: Partial<Record<string, unknown>>) => {
      const currentMoney = toNumber(money, 0);
      lastSavedAtRef.current = Date.now();
      const payload = {
        stats,
        money: currentMoney,
        inventory,
        questProgress,
        questMultiProgress,
        questClaims,
        questCompletions,
        career,
        partTimeJobId,
        selectedGoal,
        consumables,
        dailyMealUses,
        dailyMealDate,
        profile,
        lastActive: Date.now(),
        localLastActive: lastSavedAtRef.current,
        ...(overrides || {}),
      };

      const uid = uidParam || user?.uid;
      if (!uid) {
        // 로컬 모드 저장
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
          localStorage.setItem(LOCAL_LAST_ACTIVE_KEY, String(lastSavedAtRef.current));
        } catch (error) {
          console.error("Local save error", error);
        }
        return;
      }
      setIsSyncing(true);
      try {
        const dataRef = ref(database, `artifacts/${firebaseAppId}/users/${uid}/data/game_state`);
        await update(dataRef, { ...payload, lastActive: serverTimestamp(), localLastActive: lastSavedAtRef.current });
        const totalStats = getTotalStats();
        const newLevel = Math.floor(currentMoney / 5000) + Math.floor(totalStats / 200) + 1;
        setLevel(newLevel);
        lastSavedAtRef.current = Date.now();
      } catch (error) {
        console.error("Save Error", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [
      career,
      consumables,
      dailyMealDate,
      dailyMealUses,
      getTotalStats,
      inventory,
      money,
      partTimeJobId,
      profile,
      questClaims,
      questCompletions,
      questMultiProgress,
      questProgress,
      selectedGoal,
      stats,
      user?.uid,
    ],
  );

  useEffect(() => {
    let unsubscribeValue: (() => void) | null = null;

    const initAuth = async () => {
      if (authInitRef.current || auth.currentUser) return;
      if (syncMode === "local" && !authModalOpen) return;
      authInitRef.current = true;
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        }
      } catch (error) {
        console.error("Auth Error", error);
        setAuthError(error instanceof Error ? error.message : String(error));
        authInitRef.current = false;
        setSyncMode("local");
        if ((error as FirebaseError)?.code === "auth/too-many-requests") {
          if (authRetryTimeoutRef.current) {
            clearTimeout(authRetryTimeoutRef.current);
          }
          authRetryTimeoutRef.current = setTimeout(() => {
            setSyncMode("firebase");
            authInitRef.current = false;
          }, 30000);
        }
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        authInitRef.current = false;
        if (unsubscribeValue) {
          unsubscribeValue();
          unsubscribeValue = null;
        }
        return;
      }

      const dataRef = ref(database, `artifacts/${firebaseAppId}/users/${currentUser.uid}/data/game_state`);
      unsubscribeValue = onValue(
        dataRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val() as Record<string, unknown>;
            applySnapshotData(data);
          } else {
            void saveData(currentUser.uid);
          }
        },
        (error) => {
          console.error("Realtime load error", error);
        },
      );
    });

    return () => {
      if (unsubscribeValue) unsubscribeValue();
      unsubscribe();
    };
  }, [applySnapshotData, authModalOpen, syncMode, saveData]);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }
    const uid = user.uid;
    const logRef = ref(database, `artifacts/${firebaseAppId}/users/${uid}/logs`);
    logsDbRef.current = logRef;
    const q = query(logRef, limitToLast(200));
    const unsubscribe = onValue(
      q,
      (snapshot) => {
        if (!snapshot.exists()) {
          setLogs([]);
          return;
        }
        const val = snapshot.val() as Record<string, unknown>;
        const arr: LogEntry[] = Object.entries(val).map(
          ([key, value]) =>
            ({
              id: key,
              ...(value as Omit<LogEntry, "id">),
            }) as LogEntry,
        );
        arr.sort((a, b) => {
          const ta = new Date((a.timestamp as string) || 0).getTime();
          const tb = new Date((b.timestamp as string) || 0).getTime();
          return tb - ta;
        });
        setLogs(arr);
      },
      (error) => {
        console.error("Logs subscribe error", error);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRemoteActiveTimer(null);
      return;
    }
    const timerRef = getActiveTimerRef(user.uid);
    const unsubscribe = onValue(
      timerRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setRemoteActiveTimer(snapshot.val() as RemoteTimerLock);
        } else {
          setRemoteActiveTimer(null);
        }
      },
      (error) => {
        console.error("Active timer subscribe error", error);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [getActiveTimerRef, user]);

  useEffect(
    () => () => {
      if (authRetryTimeoutRef.current) {
        clearTimeout(authRetryTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const uid = getUidForSave();
    if (!uid) return;
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }
    saveIntervalRef.current = setInterval(() => {
      void saveData(uid);
    }, 30000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [getUidForSave, saveData]);

  useEffect(() => {
    decayIntervalRef.current = setInterval(() => {
      setStats((prev) => {
        const next: Stats = { ...prev };
        const decayDelta: Partial<Record<StatKey, number>> = {};
        (Object.keys(next) as StatKey[]).forEach((key) => {
          const decayMult = getDecayMultiplier(key);
          const delta = DECAY_RATE * decayMult;
          next[key] = parseFloat(Math.max(0, next[key] - delta).toFixed(5));
          decayDelta[key] = -(delta);
          decayAccumRef.current[key] = (decayAccumRef.current[key] || 0) - delta;
        });
        decaySecondsRef.current += 1;
        // 1시간마다 누적 감소를 로그로 기록
        if (decaySecondsRef.current >= 3600) {
          const roundedDecay: Partial<Record<StatKey, number>> = {};
          Object.entries(decayAccumRef.current).forEach(([key, value]) => {
            if (!STATS_DEF[key as StatKey]) return;
            const rounded = roundChangeValue(typeof value === "number" ? value : Number(value), 4);
            if (rounded !== 0) {
              roundedDecay[key as StatKey] = rounded;
            }
          });
          const hasDecay = Object.values(roundedDecay).some((val) => Math.abs(val || 0) > 0);
          if (hasDecay) {
            const decayLog = {
              category: "decay",
              label: "능력치 자연 감소",
              duration: Math.floor(decaySecondsRef.current / 60),
              timestamp: new Date().toISOString(),
              gains: roundedDecay,
              money: 0,
              changes: { ...roundedDecay },
              source: "decay",
            };
            void appendLog(decayLog);
          }
          decayAccumRef.current = {};
          decaySecondsRef.current = 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (decayIntervalRef.current) {
        clearInterval(decayIntervalRef.current);
      }
    };
  }, [getDecayMultiplier, appendLog]);

  useEffect(() => {
    if (timer.active && timer.category) {
      if (!timerOwnerRef.current) {
        return;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      timerIntervalRef.current = setInterval(() => {
        const categoryId = timer.category;
        if (!categoryId) return;
        const deltaSeconds = speedMultiplier;
        setTimer((prev) => {
          const nextElapsed = prev.elapsed + deltaSeconds;
          if (alarmTime && nextElapsed >= alarmTime && !alarmRinging) {
            setAlarmRinging(true);
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                if (notifyRef.current) {
                  notifyRef.current.close();
                  notifyRef.current = null;
                }
                notifyRef.current = new Notification("Life RPG", {
                  body: `${ACTIONS[categoryId]?.label ?? "타이머"} 알람이 울렸습니다.`,
                  icon: "/icons/icon-192x192.png",
                });
              } catch (error) {
                console.error("Notification error", error);
              }
            }
            if (audioRef.current) {
              audioRef.current.play().catch(() => { });
            }
          }
          return { ...prev, elapsed: nextElapsed };
        });

        const category = ACTIONS[categoryId];
        if (!category) return;

        const { wage, workType } = jobInfo;
        const globalBoost = getGlobalBoost();
        let itemMultiplier = 1;
        SHOP_ITEMS.forEach((item) => {
          if ("targetAction" in item && inventory.includes(item.id) && item.targetAction === timer.category) {
            itemMultiplier *= item.boost ?? 1;
          }
        });
        if (timer.category === "work" && inventory.includes("pro_tool")) {
          itemMultiplier *= 1.2;
        }

        if (timer.category === "work") {
          const costProfile = WORK_COST[workType ?? "light"];
          let shouldStop = false;
          setStats((prev) => {
            const next: Stats = { ...prev };
            Object.entries(costProfile).forEach(([key, amount]) => {
              if (!STATS_DEF[key as StatKey]) return;
              const delta = amount * deltaSeconds;
              next[key as StatKey] = parseFloat(
                Math.max(0, Math.min(STAT_MAX, next[key as StatKey] + delta)).toFixed(5),
              );
            });
            if (next.health < WORK_MIN_HEALTH) {
              shouldStop = true;
            }
            return next;
          });
          if (shouldStop || healthRef.current < WORK_MIN_HEALTH) {
            setTimer({ active: false, category: null, startTime: null, elapsed: 0 });
            setModal({ title: "근로 중단", message: "체력이 부족하여 근로를 중단했습니다. 식사/휴식으로 회복 후 다시 시도하세요." });
            timerOwnerRef.current = false;
            void releaseTimerLock();
            return;
          }
          const wagePerSec = wage / 3600;
          setMoney((prev) => parseFloat((prev + wagePerSec * itemMultiplier * deltaSeconds).toFixed(5)));
        } else if (typeof category.moneyGain === "number" && category.moneyGain > 0) {
          setMoney((prev) => parseFloat((prev + category.moneyGain * itemMultiplier * deltaSeconds).toFixed(5)));
        } else {
          setStats((prev) => {
            const next: Stats = { ...prev };
            Object.entries(category.multipliers).forEach(([key, amount]) => {
              if (!STATS_DEF[key as StatKey]) return;
              const buff = selectedGoalDef.boost.includes(key as StatKey) ? 1.2 : 1;
              const gain = amount * buff * itemMultiplier * globalBoost * deltaSeconds;
              next[key as StatKey] = parseFloat(
                Math.min(STAT_MAX, next[key as StatKey] + gain).toFixed(5),
              );
            });
            return next;
          });
        }
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [
    timer.active,
    timer.category,
    alarmTime,
    alarmRinging,
    inventory,
    jobInfo,
    selectedGoalDef,
    getGlobalBoost,
    speedMultiplier,
    releaseTimerLock,
  ]);

  useEffect(() => {
    if (lockHeartbeatRef.current) {
      clearInterval(lockHeartbeatRef.current);
      lockHeartbeatRef.current = null;
    }
    if (!timer.active || !timer.category || !timerOwnerRef.current) return;
    const uid = getUidForSave();
    if (!uid) return;
    const timerRef = getActiveTimerRef(uid);
    const sendHeartbeat = () => {
      const now = Date.now();
      void update(timerRef, { lastHeartbeat: now, category: timer.category, speed: speedMultiplier });
    };
    sendHeartbeat();
    lockHeartbeatRef.current = setInterval(sendHeartbeat, 4000);
    return () => {
      if (lockHeartbeatRef.current) {
        clearInterval(lockHeartbeatRef.current);
        lockHeartbeatRef.current = null;
      }
    };
  }, [getActiveTimerRef, getUidForSave, speedMultiplier, timer.active, timer.category]);

  const tryStartAction = async (catId: ActionId) => {
    if (timer.active) return;
    if (catId === "work" && stats.health < WORK_MIN_HEALTH) {
      setModal({ title: "근로 불가", message: `체력이 부족합니다. (필요 최소 ${WORK_MIN_HEALTH}) 회복 후 시도하세요.` });
      return;
    }
    const lockResult = await acquireTimerLock(catId);
    if (!lockResult.ok) {
      setModal({ title: "다른 탭에서 실행 중", message: lockResult.reason });
      return;
    }
    timerOwnerRef.current = true;
    setTimer({ active: true, category: catId, startTime: Date.now(), elapsed: 0 });
    setAlarmTime(null);
    setAlarmRinging(false);
    const uid = getUidForSave();
    if (uid) void saveData(uid);
  };

  const stopAction = async () => {
    if (!timer.active) return;
    const minutes = Math.max(1, Math.round(timer.elapsed / 60));
    if (timer.category) {
      const summary = calculateGainsForElapsed(timer.elapsed);
      const statGains: Partial<Record<StatKey, number>> = {};
      let moneyDelta = 0;
      if (summary) {
        Object.entries(summary.stats).forEach(([key, info]) => {
          if (info.net !== 0) {
            statGains[key as StatKey] = Number(info.net.toFixed(2));
          }
        });
        moneyDelta = summary.money;
      }
      const newLog = {
        category: timer.category,
        duration: minutes,
        timestamp: new Date().toISOString(),
        gains: statGains,
        money: Number(moneyDelta.toFixed(2)),
        label: ACTIONS[timer.category]?.label,
        changes: { ...statGains, money: Number(moneyDelta.toFixed(2)) },
        source: "action",
      };
      void appendLog(newLog);
      lastSavedAtRef.current = Date.now();
      setQuestProgress((prev) => {
        const next = { ...prev };
        QUESTS.forEach((quest) => {
          if (quest.target.kind === "single" && quest.target.category === timer.category) {
            next[quest.id] = (next[quest.id] || 0) + minutes;
          }
        });
        return next;
      });
      setQuestMultiProgress((prev) => {
        const next = { ...prev };
        QUESTS.forEach((quest) => {
          if (quest.target.kind === "multi" && quest.target.requirements[timer.category as ActionId]) {
            const current = next[quest.id] || {};
            const prevVal = current[timer.category as ActionId] || 0;
            const cat = timer.category as ActionId;
            next[quest.id] = { ...current, [cat]: prevVal + minutes };
          }
        });
        return next;
      });
    }
    setTimer({ active: false, category: null, startTime: null, elapsed: 0 });
    setAlarmTime(null);
    setAlarmRinging(false);
    timerOwnerRef.current = false;
    void releaseTimerLock();
    const uid = getUidForSave();
    if (uid) await saveData(uid);
  };

  const resolveGap = async (activityId: keyof typeof GAP_ACTIVITIES) => {
    if (!gapData) return;
    const activity = GAP_ACTIVITIES[activityId];
    const minutes = gapData.minutes;
    const { wage } = jobInfo;
    const effectStats: Partial<Record<StatKey, number>> = {};
    let moneyDelta = 0;

    let gapMult = 1;
    if (inventory.includes("mini_drone")) gapMult = 1.2;

    let penaltyReduction = 1;
    if (inventory.includes("nutrition_pack") && (activityId === "drinking" || activityId === "gaming")) {
      penaltyReduction = 0.7;
    }

    Object.entries(activity.effect).forEach(([key, value]) => {
      if (!STATS_DEF[key as StatKey]) return;
      let change = value;
      if (value > 0) change *= gapMult;
      if (value < 0) change *= penaltyReduction;
      const delta = parseFloat((change * minutes).toFixed(5));
      effectStats[key as StatKey] = delta;
    });

    setStats((prev) => {
      const next: Stats = { ...prev };
      Object.entries(effectStats).forEach(([key, value]) => {
        next[key as StatKey] = Math.max(
          0,
          Math.min(STAT_MAX, parseFloat((next[key as StatKey] + (value ?? 0)).toFixed(5))),
        );
      });
      return next;
    });

    if (activity.money === "dynamic") {
      const delta = parseFloat(((wage / 60) * minutes).toFixed(2));
      setMoney((prev) => Math.max(0, prev + delta));
      moneyDelta = delta;
    } else if (activity.money !== 0) {
      moneyDelta = activity.money;
      if (moneyDelta < 0) moneyDelta *= penaltyReduction;
      const delta = parseFloat((moneyDelta * minutes).toFixed(2));
      setMoney((prev) => Math.max(0, prev + delta));
      moneyDelta = delta;
    }

    const gapLog = {
      category: "gap",
      label: `[공백] ${activity.label}`,
      duration: minutes,
      timestamp: new Date().toISOString(),
      gains: effectStats,
      money: Number(moneyDelta.toFixed(2)),
      changes: { ...effectStats, money: Number(moneyDelta.toFixed(2)) },
      source: "gap",
      meta: { activityId },
    };
    void appendLog(gapLog);
    lastSavedAtRef.current = Date.now();

    setGapData(null);
    const uid = getUidForSave();
    if (uid) await saveData(uid);
  };

  const resetStateDefaults = () => {
    setSpeedMultiplier(1);
    setStats({
      health: 10,
      intelligence: 10,
      focus: 10,
      immunity: 10,
      eq: 10,
      willpower: 10,
    });
    setMoney(100);
    setInventory([]);
    setConsumables({});
    const today = new Date().toISOString().slice(0, 10);
    setDailyMealDate(today);
    setDailyMealUses(0);
    setCareer(null);
    setPartTimeJobId("convenience");
    setLogs([]);
    setQuestProgress({});
    setQuestMultiProgress({});
    setQuestClaims({});
    setQuestCompletions({});
    setSelectedGoal(LONG_TERM_GOALS[0].id);
    setTimer({ active: false, category: null, startTime: null, elapsed: 0 });
    setAlarmTime(null);
    setAlarmRinging(false);
    setGapData(null);
    setLevel(1);
    setProfile({ nickname: "", age: null, gender: "" });
    setProfileInput({ nickname: "", age: null, gender: "" });
    timerOwnerRef.current = false;
    void releaseTimerLock();
  };

  const handleCheat = () => {
    const code = cheatInput.trim().toLowerCase();
    if (!code) return;
    if (code === "showmethemoney") {
      setMoney(9999999);
    } else if (code === "dontdie") {
      setSpeedMultiplier(1000);
    } else if (code === "stopjok") {
      resetStateDefaults();
    }
    setCheatInput("");
  };

  const handleAuthSubmit = async () => {
    if (!authEmail || !authPassword) {
      setAuthMessage("이메일/비밀번호를 입력하세요.");
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setAuthMessage("회원가입 및 로그인 완료");
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setAuthMessage("로그인 완료");
      }
      setSyncMode("firebase");
      setAuthModalOpen(false);
    } catch (error) {
      const message = (error as FirebaseError)?.message || "인증 오류";
      setAuthMessage(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await releaseTimerLock();
      await signOut(auth);
      resetStateDefaults();
      setSyncMode("local");
      setAuthMessage("로그아웃 완료");
    } catch (error) {
      const message = (error as FirebaseError)?.message || "로그아웃 실패";
      setAuthMessage(message);
    }
  };

  const claimQuestReward = (questId: string) => {
    const quest = QUESTS.find((item) => item.id === questId);
    if (!quest) return;
    const { unlocked } = isQuestUnlocked(quest);
    if (!unlocked || questClaims[questId]) return;
    if (!isQuestCompleted(quest)) return;
    const reward = calculateQuestReward(quest);
    if (reward.money) {
      setMoney((prev) => prev + reward.money!);
    }
    const rewardStatChanges: Partial<Record<StatKey, number>> = {};
    if (reward.health || reward.intelligence || reward.focus || reward.immunity || reward.eq || reward.willpower) {
      setStats((prev) => {
        const next: Stats = { ...prev };
        (Object.keys(reward) as (keyof typeof reward)[]).forEach((key) => {
          if (key === "money" || !STATS_DEF[key as StatKey]) return;
          const inc = reward[key] || 0;
          next[key as StatKey] = Math.min(STAT_MAX, parseFloat((next[key as StatKey] + inc).toFixed(5)));
          rewardStatChanges[key as StatKey] = inc || 0;
        });
        return next;
      });
    }
    setQuestClaims((prev) => ({ ...prev, [questId]: true }));
    setQuestCompletions((prev) => ({ ...prev, [questId]: (prev[questId] || 0) + 1 }));
    const questLog = {
      category: "quest",
      label: `${quest.label} 보상`,
      duration: 0,
      timestamp: new Date().toISOString(),
      gains: rewardStatChanges,
      money: reward.money ? Number(reward.money.toFixed(2)) : 0,
      changes: { ...rewardStatChanges, money: reward.money ? Number(reward.money.toFixed(2)) : 0 },
      source: "quest",
      meta: { questId },
    };
    void appendLog(questLog);
    const uid = getUidForSave();
    if (uid) {
      void saveData(uid, {
        questClaims: { ...questClaims, [questId]: true },
        questCompletions: { ...questCompletions, [questId]: (questCompletions[questId] || 0) + 1 },
        money: reward.money ? reward.money + money : money,
      });
    }
    setModal({ title: "보상 수령 완료", message: `${quest.label} 보상을 수령했습니다.` });
  };

  const saveProfile = async () => {
    if (!user) {
      setAuthMessage("로그인 후 저장 가능합니다.");
      return;
    }
    const ageValid =
      profileInput.age === null ||
      (Number.isFinite(profileInput.age) && profileInput.age >= 0 && profileInput.age <= 120);
    if (!profileInput.nickname.trim()) {
      setAuthMessage("닉네임을 입력하세요.");
      return;
    }
    if (!ageValid) {
      setAuthMessage("나이는 0~120 범위로 입력하세요.");
      return;
    }
    try {
      const dataRef = ref(database, `artifacts/${firebaseAppId}/users/${user.uid}/data/game_state`);
      const newProfile: Profile = {
        nickname: profileInput.nickname.trim(),
        age: profileInput.age,
        gender: profileInput.gender,
      };
      await update(dataRef, { profile: newProfile });
      setProfile(newProfile);
      setAuthMessage("프로필 저장 완료");
    } catch (error) {
      const message = (error as FirebaseError)?.message || "프로필 저장 실패";
      setAuthMessage(message);
    }
  };

  const addAlarmTime = (minutes: number) => {
    setAlarmTime((prev) => (prev ?? timer.elapsed) + minutes * 60);
  };

  const setManualAlarm = () => {
    const minutes = parseInt(manualAlarmInput, 10);
    if (!Number.isNaN(minutes) && minutes > 0) {
      setAlarmTime(timer.elapsed + minutes * 60);
      setManualAlarmInput("");
    }
  };

  const resetAlarm = () => {
    setAlarmTime(null);
    setAlarmRinging(false);
  };

  const calculateGainsForElapsed = useCallback(
    (elapsedSeconds: number) => {
      if (!timer.active || !timer.category) return null;
      const category = ACTIONS[timer.category];
      const { wage, workType } = jobInfo;
      const elapsed = Math.max(0, elapsedSeconds);
      const activeItemLabels: string[] = [];
      let itemMultiplier = 1;
      SHOP_ITEMS.forEach((item) => {
        if ("targetAction" in item && inventory.includes(item.id) && item.targetAction === timer.category) {
          itemMultiplier *= item.boost ?? 1;
          activeItemLabels.push(item.label);
        }
      });
      if (timer.category === "work" && inventory.includes("pro_tool")) {
        itemMultiplier *= 1.2;
        activeItemLabels.push("전문가용 장비");
      }
      const globalBoost = getGlobalBoost();
      const gains: {
        stats: Record<string, { net: number; decayReduction: number }>;
        money: number;
        activeItemLabels: string[];
        itemMultiplier: number;
      } = { stats: {}, money: 0, activeItemLabels, itemMultiplier };

      if (timer.category === "work") {
        const costProfile = WORK_COST[workType ?? "light"];
        Object.entries(costProfile).forEach(([key, amount]) => {
          if (!STATS_DEF[key as StatKey]) return;
          const total = amount * elapsed;
          gains.stats[key] = { net: Number(total.toFixed(2)), decayReduction: 0 };
        });
      } else {
        Object.entries(category.multipliers).forEach(([key, amount]) => {
          if (!STATS_DEF[key as StatKey]) return;
          const buff = selectedGoalDef.boost.includes(key as StatKey) ? 1.2 : 1;
          const gainTotal = amount * buff * itemMultiplier * globalBoost * elapsed;
          const decayMult = getDecayMultiplier(key as StatKey);
          const decayTotal = DECAY_RATE * decayMult * elapsed;
          const net = Number((gainTotal - decayTotal).toFixed(2));
          const decayReduction = Number(((1 - decayMult) * 100).toFixed(0));
          gains.stats[key] = { net, decayReduction };
        });
      }

      let moneyTotal = 0;
      if (timer.category === "work") {
        moneyTotal = (wage / 3600) * itemMultiplier * elapsed;
      } else if (typeof category.moneyGain === "number" && category.moneyGain > 0) {
        moneyTotal = category.moneyGain * itemMultiplier * elapsed;
      }
      gains.money = Number(moneyTotal.toFixed(2));
      return gains;
    },
    [getDecayMultiplier, getGlobalBoost, inventory, jobInfo, selectedGoalDef, timer.active, timer.category],
  );

  const currentGains = useMemo(() => calculateGainsForElapsed(timer.elapsed), [calculateGainsForElapsed, timer.elapsed]);

  const projectedGains = useMemo(() => {
    if (!timer.active || !timer.category || !alarmTime) return null;
    const targetElapsed = Math.max(alarmTime, timer.elapsed);
    const totalAtTarget = calculateGainsForElapsed(targetElapsed);
    const totalAtCurrent = calculateGainsForElapsed(timer.elapsed);
    if (!totalAtTarget || !totalAtCurrent) return null;
    const stats: Record<string, { net: number; decayReduction: number }> = {};
    Object.keys(totalAtTarget.stats).forEach((key) => {
      const target = totalAtTarget.stats[key] ?? { net: 0, decayReduction: 0 };
      const current = totalAtCurrent.stats[key] ?? { net: 0, decayReduction: target.decayReduction };
      stats[key] = { net: Number((target.net - current.net).toFixed(2)), decayReduction: target.decayReduction };
    });
    const money = Number((totalAtTarget.money - totalAtCurrent.money).toFixed(2));
    const remainingSeconds = Math.max(0, targetElapsed - timer.elapsed);
    return {
      stats,
      money,
      itemMultiplier: totalAtTarget.itemMultiplier,
      activeItemLabels: totalAtTarget.activeItemLabels,
      remainingSeconds,
    };
  }, [alarmTime, calculateGainsForElapsed, timer.active, timer.category, timer.elapsed]);

  const overallScore = calcOverallScore(stats);

  const switchPartTime = (jobId: PartTimeJobId) => {
    const job = PART_TIME_JOBS.find((item) => item.id === jobId);
    if (!job) return;
    let qualified = true;
    const req = job.req as Record<string, unknown>;
    if (typeof req.health === "number" && stats.health < req.health) qualified = false;
    if (typeof req.intelligence === "number" && stats.intelligence < req.intelligence) qualified = false;
    if (typeof req.immunity === "number" && stats.immunity < req.immunity) qualified = false;
    if (typeof req.item === "string" && !inventory.includes(req.item)) qualified = false;
    if (!qualified) {
      setModal({ title: "자격 미달", message: "스탯이나 아이템 부족" });
      return;
    }
    setModal({
      title: "알바 변경",
      message: `[${job.label}]으로 변경?`,
      onConfirm: () => {
        setPartTimeJobId(job.id);
        setModal(null);
      },
    });
  };

  const startCareer = (industryId: IndustryId) => {
    setModal({
      title: "커리어 시작",
      message: `[${INDUSTRIES[industryId].label}] 분야 시작?`,
      onConfirm: () => {
        setCareer({ industry: industryId, company: "sme", position: "entry" });
        setModal(null);
      },
    });
  };

  const handleResign = () => {
    setModal({
      title: "퇴사",
      message: "정말 퇴사하시겠습니까?",
      onConfirm: () => {
        setCareer(null);
        setModal(null);
        setPartTimeJobId("convenience");
      },
    });
  };

  const checkPromotion = () => {
    if (!career) {
      setModal({ title: "승진 심사", message: "소속된 직장이 없습니다." });
      return;
    }
    const industryInfo = INDUSTRIES[career.industry];
    const companyInfo = COMPANY_TIERS.find((c) => c.id === career.company);
    const positionInfo = POSITIONS.find((p) => p.id === career.position);
    if (!industryInfo || !companyInfo || !positionInfo) return;

    const currentPosIndex = POSITIONS.findIndex((p) => p.id === career.position);
    if (currentPosIndex >= POSITIONS.length - 1) {
      setModal({ title: "승진 심사", message: "이미 최고 직급입니다." });
      return;
    }

    const nextPosition = POSITIONS[currentPosIndex + 1];
    const avgCoreStat = industryInfo.core.reduce((acc, key) => acc + stats[key], 0) / (industryInfo.core.length || 1);
    const requiredStat = companyInfo.minStat + nextPosition.addStat;

    if (avgCoreStat >= requiredStat) {
      setModal({
        title: "승진 성공!",
        message: `축하합니다! [${nextPosition.label}](으)로 승진하셨습니다.`,
        onConfirm: () => {
          setCareer({ ...career, position: nextPosition.id });
          setModal(null);
          void appendLog({
            category: "quest",
            label: "승진: " + nextPosition.label,
            duration: 0,
            timestamp: new Date().toISOString(),
            gains: {},
            source: "promotion",
          });
          const uid = getUidForSave();
          if (uid) {
            void saveData(uid, { career: { ...career, position: nextPosition.id } });
          }
        }
      });
    } else {
      setModal({
        title: "심사 탈락",
        message: `조건 부족. (필요 코어 평균 스탯: ${requiredStat.toFixed(1)}, 현재 스탯: ${avgCoreStat.toFixed(1)})`
      });
    }
  };

  const buyItem = async (itemId: (typeof SHOP_ITEMS)[number]["id"]) => {
    if (purchasingItemId) return;
    const item = SHOP_ITEMS.find((shopItem) => shopItem.id === itemId);
    if (!item) return;
    const isConsumable = "consumable" in item && Boolean(item.consumable);
    if (!isConsumable && inventory.includes(item.id)) return;
    setPurchasingItemId(itemId);
    const availableMoney = toNumber(money, 0);
    if (availableMoney < item.cost) {
      setModal({ title: "구매 실패", message: "잔액 부족" });
      setPurchasingItemId(null);
      return;
    }
    const nextMoney = Math.max(0, availableMoney - item.cost);
    const nextInventory = !isConsumable ? [...inventory, item.id] : inventory;
    const nextConsumables = isConsumable ? { ...consumables, [item.id]: (consumables[item.id] || 0) + 1 } : consumables;

    setMoney(nextMoney);
    if (isConsumable) {
      setConsumables(nextConsumables);
    } else {
      setInventory(nextInventory);
    }
    const purchaseLog = {
      category: "purchase",
      label: `${item.label} 구매`,
      duration: 0,
      timestamp: new Date().toISOString(),
      gains: {},
      money: Number((-item.cost).toFixed(2)),
      changes: { money: Number((-item.cost).toFixed(2)) },
      source: "purchase",
      meta: { itemId: item.id },
    };
    void appendLog(purchaseLog);
    lastSavedAtRef.current = Date.now();
    const uid = getUidForSave();
    if (uid) {
      const overrides: Record<string, unknown> = { money: nextMoney };
      if (!isConsumable) overrides.inventory = nextInventory;
      if (isConsumable) overrides.consumables = nextConsumables;
      await saveData(uid, overrides);
    }
    setPurchasingItemId(null);
  };

  const consumeItem = async (itemId: (typeof SHOP_ITEMS)[number]["id"]) => {
    const item = SHOP_ITEMS.find((shopItem) => shopItem.id === itemId && "consumable" in shopItem && shopItem.consumable);
    if (!item) return;
    const count = consumables[item.id] || 0;
    if (count <= 0) {
      setModal({ title: "사용 불가", message: "보유 수량이 없습니다." });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dailyMealDate !== today) {
      setDailyMealDate(today);
      setDailyMealUses(0);
    }
    const limit = 3;
    if (dailyMealUses >= limit) {
      setModal({ title: "사용 불가", message: "하루 3회 사용 한도를 초과했습니다." });
      return;
    }
    const restore = "restore" in item ? (item as { restore?: Partial<Stats> }).restore ?? {} : {};
    const statRestore: Partial<Record<StatKey, number>> = {};
    setStats((prev) => {
      const next: Stats = { ...prev };
      Object.entries(restore).forEach(([key, value]) => {
        if (!STATS_DEF[key as StatKey]) return;
        const inc = typeof value === "number" ? value : 0;
        next[key as StatKey] = Math.min(STAT_MAX, parseFloat((next[key as StatKey] + inc).toFixed(5)));
        statRestore[key as StatKey] = inc;
      });
      return next;
    });
    setConsumables((prev) => {
      const next = { ...prev, [item.id]: count - 1 };
      if (next[item.id] <= 0) {
        delete next[item.id];
      }
      return next;
    });
    setDailyMealUses((prev) => prev + 1);
    setDailyMealDate(today);
    const consumeLog = {
      category: "consume",
      label: `${item.label} 사용`,
      duration: 0,
      timestamp: new Date().toISOString(),
      gains: statRestore,
      money: 0,
      changes: { ...statRestore },
      source: "consume",
      meta: { itemId: item.id },
    };
    void appendLog(consumeLog);
    lastSavedAtRef.current = Date.now();
    const uid = getUidForSave();
    if (uid) {
      const overrides: Record<string, unknown> = {};
      overrides.consumables = { ...consumables, [item.id]: Math.max(0, count - 1) };
      await saveData(uid, overrides);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  };

  const StatRadar = useCallback(() => <StatRadarComponent stats={stats} statMax={STAT_MAX} />, [stats]);

  if (!user) {
    return (
      <AuthGate
        authMode={authMode}
        authEmail={authEmail}
        authPassword={authPassword}
        authMessage={authMessage}
        authError={authError}
        authLoading={authLoading}
        onModeChange={setAuthMode}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onSubmit={() => {
          void handleAuthSubmit();
        }}
      />
    );
  }

  const activeAction = timer.category ? ACTIONS[timer.category] : null;
  const isOfflineMode = syncMode === "local";

  return (
    <div
      suppressHydrationWarning
      className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans overflow-hidden select-none"
    >
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />

      {!dndMode && (
        <Topbar
          dndMode={dndMode}
          isOfflineMode={isOfflineMode}
          isSyncing={isSyncing}
          level={level}
          money={money}
          jobLabel={jobInfo.label}
          nickname={profile.nickname || user?.email || "게스트"}
          onOpenAuth={() => setAuthModalOpen(true)}
          onToggleDnd={() => setDndMode((prev) => !prev)}
        />
      )}

      {isOfflineMode && (
        <div className="bg-yellow-50 text-yellow-800 text-xs px-4 py-2 flex items-center gap-2 border-y border-yellow-200">
          <AlertTriangle size={14} />
          Firebase 인증 오류로 로컬 저장 모드로 동작 중입니다. 연결이 회복되면 자동으로 재동기화합니다.
        </div>
      )}

      {dndMode && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setDndMode(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/50 text-white text-xs font-bold backdrop-blur-sm"
          >
            <Eye size={14} /> 해제
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!dndMode && <Sidebar activeTab={activeTab} onChange={setActiveTab} />}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {(activeTab === "dashboard" || dndMode) && (
            <DashboardTab
              dndMode={dndMode}
              claimableQuests={claimableQuests}
              setActiveTab={setActiveTab}
              activeLockInfo={activeLockInfo}
              tabIdRef={tabIdRef}
              overallScore={overallScore}
              stats={stats}
              showStatsGraph={showStatsGraph}
              setShowStatsGraph={setShowStatsGraph}
              StatRadar={StatRadar}
              timer={timer}
              activeAction={activeAction}
              alarmRinging={alarmRinging}
              jobInfo={jobInfo}
              formatTime={formatTime}
              currentGains={currentGains}
              projectedGains={projectedGains}
              alarmTime={alarmTime}
              requestNotificationPermission={requestNotificationPermission}
              notificationPermission={notificationPermission}
              addAlarmTime={addAlarmTime}
              resetAlarm={resetAlarm}
              manualAlarmInput={manualAlarmInput}
              setManualAlarmInput={setManualAlarmInput}
              setManualAlarm={setManualAlarm}
              stopAction={stopAction}
              selectedGoalDef={selectedGoalDef}
              tryStartAction={tryStartAction}
              cheatInput={cheatInput}
              setCheatInput={setCheatInput}
              handleCheat={handleCheat}
            />
          )}

          {!dndMode && activeTab === "inventory" && (
            <InventoryTab
              ownedItems={ownedItems}
              dailyMealUses={dailyMealUses}
              remainingMeals={remainingMeals}
              consumableList={consumableList}
              consumables={consumables}
              consumeItem={consumeItem}
              showEffectSummary={showEffectSummary}
              setShowEffectSummary={setShowEffectSummary}
              passiveSummary={passiveSummary}
            />
          )}

          {!dndMode && activeTab === "job" && (
            <JobTab
              career={career}
              partTimeJobId={partTimeJobId}
              stats={stats}
              inventory={inventory}
              switchPartTime={switchPartTime}
              startCareer={startCareer}
              handleResign={handleResign}
              calculateWage={calculateWage}
              getPositionScore={getPositionScore}
              checkPromotion={checkPromotion}
              ENTRY_REQ_STAT={ENTRY_REQ_STAT}
            />
          )}

          {!dndMode && activeTab === "shop" && (
            <ShopTab
              shopCategories={SHOP_CATEGORIES}
              shopFilter={shopFilter}
              setShopFilter={setShopFilter}
              money={money}
              inventory={inventory}
              consumables={consumables}
              purchasingItemId={purchasingItemId}
              buyItem={buyItem}
            />
          )}

          {!dndMode && activeTab === "quest" && (
            <QuestTab
              sortedQuests={sortedQuests}
              getQuestProgressValue={getQuestProgressValue}
              isQuestUnlocked={isQuestUnlocked}
              isQuestCompleted={isQuestCompleted}
              questClaims={questClaims}
              calculateQuestReward={calculateQuestReward}
              questMultiProgress={questMultiProgress}
              claimQuestReward={claimQuestReward}
            />
          )}

          {!dndMode && activeTab === "history" && <HistoryTab logs={logs} aggregateLogStats={aggregateLogStats} />}

          <GapModal gapData={gapData} resolveGap={resolveGap} />
          <AuthModal
            open={authModalOpen}
            authMode={authMode}
            setAuthMode={setAuthMode}
            setAuthModalOpen={setAuthModalOpen}
            handleAuthSubmit={handleAuthSubmit}
            authEmail={authEmail}
            setAuthEmail={setAuthEmail}
            authPassword={authPassword}
            setAuthPassword={setAuthPassword}
            authMessage={authMessage}
            authLoading={authLoading}
            user={user}
            handleSignOut={handleSignOut}
            profileInput={profileInput}
            setProfileInput={setProfileInput}
            saveProfile={saveProfile}
          />
          <AlertModal modal={modal} setModal={setModal} />
        </main>
      </div>
    </div>
  );
}
