import { useEffect, useRef, useState } from "react";
import { BottomNav, type LifestyleSurface } from "./components/BottomNav";
import { CampaignEnd } from "./components/CampaignEnd";
import { DayReview } from "./components/DayReview";
import {
  DirectControls,
  type DirectMoveVector,
} from "./components/DirectControls";
import {
  HouseCanvas,
  type GroundMoveTarget,
} from "./components/HouseCanvas";
import { LifestyleDialog } from "./components/LifestyleDialog";
import { MorningPlan } from "./components/MorningPlan";
import { TopBar, type GameSpeed } from "./components/TopBar";
import {
  WorldActionBar,
  type WorldActionTarget,
  type WorldContextAction as WorldActionBarItem,
} from "./components/WorldActionBar";
import {
  createCampaignSettings,
  createOwnerResources,
  curriculumTip,
  generateDaySchedule,
  loadProfile,
  saveProfile,
  WAITDOG_PROFILE_KEY,
  type CampaignPhase,
  type CampaignSettings,
  type Hypothesis,
  type OwnerResources,
} from "./services/campaign";
import {
  buildCampaignOutcomes,
  buildDayNarrative,
} from "./services/narrative";
import {
  createSim,
  type ItemPlacementTarget,
  type WaitdogUiSim,
  type WaitdogUiView,
  type WorldContextAction,
  type WorldInteractionTarget,
  type WorldTargetId,
} from "./services/waitdogSim";
import type {
  BarrierItemId,
  CatalogCategory,
  CatalogItemId,
  LifestyleActionResult,
  PadItemId,
  RoomId,
  SalaryUpgradeId,
} from "./types";
import {
  createCloudSave,
  type CloudSaveRecord,
  type CloudSaveState,
} from "../lib/cloudSave";
import { initPortalAuth, subscribePortalAuth } from "../lib/portalAuth";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const SIMULATION_SEED = 20260722;
const DAY_END_MINUTE = 23 * 60;
const GAME_MINUTES_PER_SECOND = 2;
const STORAGE_LOAD_MESSAGE =
  "저장 기록을 불러오지 못해 이번 진행을 안전하게 새로 시작했습니다.";
const STORAGE_SAVE_MESSAGE =
  "저장 공간에 기록하지 못했습니다. 현재 화면의 진행은 계속됩니다.";
const WAITDOG_LOCAL_SAVED_AT_KEY = "portal_cloud_save_local_updated_at_waitdog";
const waitdogCloudSave = createCloudSave("waitdog", 2);
const waitdogLocalExistedAtStartup =
  typeof window !== "undefined" &&
  window.localStorage.getItem(WAITDOG_PROFILE_KEY) !== null;

interface BootstrapState {
  sim: WaitdogUiSim;
  phase: CampaignPhase;
  resources: OwnerResources;
  hypotheses: Hypothesis[];
  settings: CampaignSettings;
  storageMessage: string | null;
}

interface AdvanceResult {
  minutes: number;
  reason: "alert" | "dayEnd" | "limit" | "paused";
}

type PlaceableItemId = PadItemId | BarrierItemId;
type PlacementPreset = "a" | "b";

interface DirectInputActions {
  interact: () => void;
  selectContextAction: (index: number) => void;
  praise: () => void;
  treat: () => void;
  setWorkHold: (holding: boolean) => void;
  openSurface: (surface: LifestyleSurface) => void;
  closeSurface: () => void;
}

const DIRECT_CONTROL_STEP_MS = 64;
const MIN_INPUT_DELTA_MS = 16;
const MAX_INPUT_DELTA_MS = 250;
const PERSISTENCE_TRAILING_MS = 240;
const WORK_ALERT_INTERRUPT_ACTION = "work:alert:interrupt";
const WORK_ALERT_CONTINUE_ACTION = "work:alert:continue";
const ZERO_DIRECT_VECTOR: DirectMoveVector = { dx: 0, dy: 0 };
const MOVE_KEY_VECTORS: Readonly<Record<string, DirectMoveVector>> = {
  KeyW: { dx: 0, dy: -1 },
  ArrowUp: { dx: 0, dy: -1 },
  KeyS: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyA: { dx: -1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};
const DIRECT_ACTION_CODES = new Set([
  "KeyE",
  "Digit1",
  "Digit2",
  "Digit3",
  "Space",
  "KeyQ",
  "KeyR",
  "KeyB",
  "KeyM",
  "KeyC",
  "KeyU",
]);

const isEditableGameTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT";
};

const freshBootstrap = (storageMessage: string | null): BootstrapState => {
  const sim = createSim(SIMULATION_SEED);
  return {
    sim,
    phase: "morning",
    resources: createOwnerResources(),
    hypotheses: [],
    settings: createCampaignSettings(SIMULATION_SEED),
    storageMessage,
  };
};

const bootstrapFromStorage = (
  storage: Pick<Storage, "getItem" | "setItem">,
): BootstrapState => {
  try {
    const loaded = loadProfile(storage);
    if (!loaded.ok) return freshBootstrap(STORAGE_LOAD_MESSAGE);
    if (loaded.profile === null) return freshBootstrap(null);
    const sim = createSim(loaded.profile.settings.seed);
    let settings = loaded.profile.settings;
    try {
      sim.restore(loaded.profile.simSnapshot);
      if (settings.morningSnapshot !== null) {
        const validator = createSim(settings.seed);
        validator.restore(settings.morningSnapshot);
        settings = { ...settings, morningSnapshot: validator.serialize() };
      }
    } catch {
      return freshBootstrap(STORAGE_LOAD_MESSAGE);
    }
    if (sim.getDogView().day !== loaded.profile.day) {
      return freshBootstrap(STORAGE_LOAD_MESSAGE);
    }
    return {
      sim,
      phase: loaded.profile.phase,
      resources: loaded.profile.ownerResources,
      hypotheses: loaded.profile.hypotheses,
      settings,
      storageMessage: null,
    };
  } catch {
    return freshBootstrap(STORAGE_LOAD_MESSAGE);
  }
};

const bootstrap = (): BootstrapState => {
  if (typeof window === "undefined") return freshBootstrap(null);
  return bootstrapFromStorage(window.localStorage);
};

const bootstrapFromPayload = (payload: string): BootstrapState =>
  bootstrapFromStorage({
    getItem: (key) => key === WAITDOG_PROFILE_KEY ? payload : null,
    setItem: () => undefined,
  });

const readLocalSavedAt = (): number | null => {
  const value = Number(window.localStorage.getItem(WAITDOG_LOCAL_SAVED_AT_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const formatSavedAt = (value: number | null): string =>
  value === null
    ? "시각 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);

const summarizeWaitdogPayload = (payload: string): string => {
  try {
    const parsed = JSON.parse(payload) as {
      day?: unknown;
      settings?: { infinite?: unknown };
    };
    const day = typeof parsed.day === "number"
      ? Math.max(1, Math.floor(parsed.day))
      : 1;
    return `Day ${day} · ${parsed.settings?.infinite === true ? "무한" : "캠페인"}`;
  } catch {
    return "진행도 정보를 읽을 수 없음";
  }
};

const cloudBadgeLabel = (state: CloudSaveState): string => {
  if (state === "synced") return "☁ 저장됨";
  if (state === "loading") return "동기화 중";
  if (state === "offline" || state === "error") return "로컬 저장 중";
  if (state === "conflict") return "기록 선택 필요";
  return "게스트 — 이 기기에만 저장";
};

const cloudBadgeTitle = (state: CloudSaveState): string => {
  if (state === "offline") {
    return "네트워크 연결을 확인해 주세요. 진행도는 이 기기에 계속 저장됩니다.";
  }
  if (state === "error") {
    return "클라우드 저장을 사용할 수 없습니다. 진행도는 이 기기에 계속 저장됩니다.";
  }
  if (state === "idle") return "게스트 기록은 이 기기에만 저장됩니다.";
  if (state === "conflict") return "사용할 진행 기록을 선택해 주세요.";
  return "계정 진행도를 클라우드와 동기화합니다.";
};

const surfacePauseLabel = (surface: LifestyleSurface): string => {
  if (surface === "bag") return "가방 열림";
  if (surface === "petMart") return "펫마트 열림";
  if (surface === "clinic") return "병원 메뉴 열림";
  return "업그레이드 메뉴 열림";
};

const blockedPauseReason = (
  currentView: WaitdogUiView,
  surface: LifestyleSurface | null,
): string | null => {
  if (currentView.activeEncounter !== null) return "미션 응답 대기";
  if (currentView.work.alert !== null) return "업무 알림 응답 대기";
  if (surface !== null) return surfacePauseLabel(surface);
  return null;
};

const itemLabel = (
  currentView: WaitdogUiView,
  itemId: CatalogItemId,
): string =>
  currentView.catalog.find((item) => item.itemId === itemId)?.label ?? itemId;

const placementFor = (
  currentView: WaitdogUiView,
  itemId: PlaceableItemId,
  preset: PlacementPreset,
): ItemPlacementTarget => {
  const item = currentView.catalog.find((entry) => entry.itemId === itemId);
  if (item?.category === "pad") {
    return preset === "a"
      ? { room: "toilet", x: 0.64, y: 0.66 }
      : { room: "kitchen", x: 0.66, y: 0.66 };
  }
  const panels = item?.panels ?? 1;
  const size = panels === 4
    ? { width: 0.5, height: 0.42 }
    : panels === 2
    ? { width: 0.4, height: 0.1 }
    : { width: 0.28, height: 0.08 };
  return preset === "a"
    ? {
      room: "toilet",
      x: 0.6,
      y: 0.62,
      ...size,
    }
    : {
      room: "kitchen",
      x: 0.62,
      y: 0.3,
      ...size,
  };
};

const roomLabel = (room: RoomId): string => {
  if (room === "living") return "거실";
  if (room === "kitchen") return "주방";
  return "화장실";
};

const worldTargetPresentation = (
  targetId: WorldTargetId,
): WorldActionTarget => {
  if (targetId === "dog") return { icon: "🐕", label: "강아지" };
  if (targetId === "cue") return { icon: "◎", label: "강아지 신호" };
  if (targetId === "computer") return { icon: "▰", label: "컴퓨터" };
  if (targetId === "foodBowl") return { icon: "◉", label: "사료 그릇" };
  if (targetId === "waterBowl") return { icon: "◌", label: "물그릇" };
  if (targetId === "activePoop") return { icon: "✦", label: "배변 흔적" };
  if (targetId === "bath") return { icon: "◇", label: "목욕 공간" };
  const destination = targetId.slice("door:".length) as RoomId;
  return { icon: "↗", label: `${roomLabel(destination)} 문` };
};

const worldActionIcon = (actionId: string): string => {
  if (actionId === WORK_ALERT_INTERRUPT_ACTION) return "◎";
  if (actionId === WORK_ALERT_CONTINUE_ACTION) return "▰";
  if (actionId === "encounter:observe") return "◎";
  if (actionId.startsWith("encounter:response:")) return "→";
  if (actionId === "encounter:reinforce:praise") return "♡";
  if (actionId === "encounter:reinforce:treat") return "◆";
  if (actionId === "encounter:dismiss") return "✓";
  if (actionId === "work:sit") return "▰";
  if (actionId.startsWith("food:")) return "◉";
  if (actionId.startsWith("water:")) return "◌";
  if (actionId === "poop:cleanup") return "✦";
  if (actionId.startsWith("bath:")) return "◇";
  if (actionId.startsWith("door:")) return "↗";
  return "•";
};

const isAutoInteractAction = (actionId: string): boolean =>
  actionId === "encounter:observe" ||
  actionId === "encounter:dismiss" ||
  actionId === "work:sit" ||
  actionId.startsWith("water:") ||
  actionId === "poop:cleanup" ||
  actionId.startsWith("door:");

const toActionBarItems = (
  actions: readonly WorldContextAction[],
): WorldActionBarItem[] =>
  actions.slice(0, 3).map((action, index) => ({
    id: action.id,
    label: action.label,
    icon: worldActionIcon(action.id),
    shortcut: String(index + 1),
    disabled: !action.enabled,
    disabledReason: action.reason ?? undefined,
  }));

const nearbyWorldTarget = (
  currentView: WaitdogUiView,
): WorldInteractionTarget | null => {
  const targetId = currentView.interaction.nearbyTarget;
  if (targetId === null) return null;
  return currentView.interaction.targets.find((target) =>
    target.id === targetId
  ) ?? null;
};

export default function App() {
  const bootstrapRef = useRef<BootstrapState | null>(null);
  if (bootstrapRef.current === null) bootstrapRef.current = bootstrap();
  const initial = bootstrapRef.current;

  const simRef = useRef<WaitdogUiSim>(initial.sim);
  const [phase, setPhase] = useState<CampaignPhase>(initial.phase);
  const [view, setView] = useState<WaitdogUiView>(() => initial.sim.getDogView());
  const [speed, setSpeed] = useState<GameSpeed>(initial.settings.speed);
  const [resources, setResources] = useState<OwnerResources>(initial.resources);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(
    initial.hypotheses,
  );
  const [settings, setSettings] = useState<CampaignSettings>(initial.settings);
  const [lastSeenRoom, setLastSeenRoom] = useState<RoomId | null>(
    view.visibility === "seen" ? view.room : null,
  );
  const [openSurface, setOpenSurface] = useState<LifestyleSurface | null>(null);
  const [encounterFeedback, setEncounterFeedback] = useState<string | null>(
    null,
  );
  const [workFeedback, setWorkFeedback] = useState<string | null>(null);
  const [surfaceFeedback, setSurfaceFeedback] = useState<string | null>(null);
  const [secondaryFeedback, setSecondaryFeedback] = useState<string | null>(
    initial.storageMessage,
  );
  const [cloudState, setCloudState] = useState<CloudSaveState>(
    () => waitdogCloudSave.getState(),
  );
  const [cloudConflict, setCloudConflict] = useState<CloudSaveRecord | null>(null);
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(
    () => readLocalSavedAt(),
  );

  const phaseRef = useRef(phase);
  const viewRef = useRef(view);
  const speedRef = useRef(speed);
  const settingsRef = useRef(settings);
  const resourcesRef = useRef(resources);
  const hypothesesRef = useRef(hypotheses);
  const surfaceRef = useRef(openSurface);
  const externalClockRef = useRef(false);
  const automationRemainderRef = useRef(0);
  const storageNoticeRef = useRef(initial.storageMessage !== null);
  const hasMeaningfulLocalRef = useRef(waitdogLocalExistedAtStartup);
  const initialPersistencePendingRef = useRef(true);
  const skipNextSaveEffectRef = useRef(false);
  const syncSequenceRef = useRef(0);
  const syncedUidRef = useRef<string | null>(null);
  const retryCloudSyncRef = useRef<() => void>(() => undefined);
  const heldMoveKeysRef = useRef<Set<string>>(new Set());
  const virtualMoveRef = useRef<DirectMoveVector>(ZERO_DIRECT_VECTOR);
  const clickMoveTargetRef = useRef<GroundMoveTarget | null>(null);
  const workHoldRef = useRef(false);
  const lastDirectTickAtRef = useRef<number | null>(null);
  const directInputActionsRef = useRef<DirectInputActions | null>(null);
  const persistenceTimerRef = useRef<number | null>(null);
  const persistencePendingRef = useRef(false);
  const persistProfileRef = useRef<
    (silent: boolean, suppressCloudPush: boolean) => void
  >(() => undefined);
  phaseRef.current = phase;
  viewRef.current = view;
  speedRef.current = speed;
  settingsRef.current = settings;
  resourcesRef.current = resources;
  hypothesesRef.current = hypotheses;
  surfaceRef.current = openSurface;

  const sim = simRef.current;
  const ended = view.minuteOfDay >= DAY_END_MINUTE;
  const activeEncounter = view.activeEncounter;
  const pausedReason = blockedPauseReason(view, openSurface);
  const proposedSchedule = generateDaySchedule(
    view.day,
    settings.seed,
    sim.predictPoopWindow(),
    settings.infinite,
  );

  const clearDirectInput = () => {
    heldMoveKeysRef.current.clear();
    virtualMoveRef.current = ZERO_DIRECT_VECTOR;
    clickMoveTargetRef.current = null;
    workHoldRef.current = false;
    lastDirectTickAtRef.current = null;
  };

  const flushPendingPersistence = (silent: boolean) => {
    if (!persistencePendingRef.current) return;
    if (persistenceTimerRef.current !== null) {
      window.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = null;
    }
    persistencePendingRef.current = false;
    persistProfileRef.current(silent, false);
  };

  const commitPhase = (next: CampaignPhase) => {
    if (next !== "live") clearDirectInput();
    phaseRef.current = next;
    setPhase(next);
  };

  const commitView = (next: WaitdogUiView) => {
    viewRef.current = next;
    setView(next);
  };

  const commitSettings = (next: CampaignSettings) => {
    settingsRef.current = next;
    setSettings(next);
  };

  const commitSpeed = (next: GameSpeed) => {
    speedRef.current = next;
    setSpeed(next);
    commitSettings({ ...settingsRef.current, speed: next });
  };

  const applyCloudPayload = (payload: string): boolean => {
    const next = bootstrapFromPayload(payload);
    if (next.storageMessage !== null) return false;

    const nextView = next.sim.getDogView();
    try {
      window.localStorage.setItem(WAITDOG_PROFILE_KEY, payload);
    } catch {
      if (!storageNoticeRef.current) {
        storageNoticeRef.current = true;
        setSecondaryFeedback(STORAGE_SAVE_MESSAGE);
      }
      return false;
    }

    skipNextSaveEffectRef.current = true;
    if (persistenceTimerRef.current !== null) {
      window.clearTimeout(persistenceTimerRef.current);
      persistenceTimerRef.current = null;
    }
    persistencePendingRef.current = false;
    hasMeaningfulLocalRef.current = true;
    simRef.current = next.sim;
    phaseRef.current = next.phase;
    viewRef.current = nextView;
    speedRef.current = next.settings.speed;
    settingsRef.current = next.settings;
    resourcesRef.current = next.resources;
    surfaceRef.current = null;
    externalClockRef.current = false;
    automationRemainderRef.current = 0;
    clearDirectInput();
    setPhase(next.phase);
    setView(nextView);
    setSpeed(next.settings.speed);
    setSettings(next.settings);
    setResources(next.resources);
    setHypotheses(next.hypotheses);
    setLastSeenRoom(nextView.visibility === "seen" ? nextView.room : null);
    setOpenSurface(null);
    setEncounterFeedback(null);
    setWorkFeedback(null);
    setSurfaceFeedback(null);
    setSecondaryFeedback(null);
    storageNoticeRef.current = false;
    return true;
  };

  useEffect(() => {
    const unsubscribeCloud = waitdogCloudSave.subscribe(setCloudState);
    const syncAccount = (uid: string): void => {
      const sequence = ++syncSequenceRef.current;
      void (async () => {
        const cloudRecord = await waitdogCloudSave.pull();
        if (
          sequence !== syncSequenceRef.current ||
          syncedUidRef.current !== uid
        ) return;

        const localPayload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
        if (!cloudRecord) {
          if (
            localPayload !== null &&
            waitdogCloudSave.getState() === "loading"
          ) {
            waitdogCloudSave.push(localPayload);
            await waitdogCloudSave.flush();
          }
          return;
        }

        if (localPayload === null || !hasMeaningfulLocalRef.current) {
          if (applyCloudPayload(cloudRecord.payload)) {
            try {
              window.localStorage.setItem(
                WAITDOG_LOCAL_SAVED_AT_KEY,
                String(cloudRecord.updatedAt),
              );
              setLocalSavedAt(cloudRecord.updatedAt);
            } catch {
              // Companion metadata failure must not block profile application.
            }
          } else {
            setCloudConflict(cloudRecord);
          }
        }

        const currentPayload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
        setCloudConflict(
          currentPayload === cloudRecord.payload ? null : cloudRecord,
        );
        if (currentPayload !== null) waitdogCloudSave.push(currentPayload);
      })();
    };

    retryCloudSyncRef.current = () => {
      const uid = syncedUidRef.current;
      if (uid) syncAccount(uid);
    };
    const handleOnline = (): void => {
      if (
        waitdogCloudSave.getState() === "offline" ||
        waitdogCloudSave.getState() === "error"
      ) {
        retryCloudSyncRef.current();
      }
    };
    window.addEventListener("online", handleOnline);

    initPortalAuth();
    const unsubscribeAuth = subscribePortalAuth((authState) => {
      if (authState.status !== "google") {
        syncedUidRef.current = null;
        setCloudConflict(null);
        return;
      }
      if (syncedUidRef.current === authState.user.uid) return;

      syncedUidRef.current = authState.user.uid;
      syncAccount(authState.user.uid);
    });

    return () => {
      ++syncSequenceRef.current;
      syncedUidRef.current = null;
      retryCloudSyncRef.current = () => undefined;
      window.removeEventListener("online", handleOnline);
      unsubscribeAuth();
      unsubscribeCloud();
    };
  }, []);

  const commitSurface = (next: LifestyleSurface | null) => {
    clearDirectInput();
    surfaceRef.current = next;
    setOpenSurface(next);
    setSurfaceFeedback(null);
  };

  const enterReview = (nextView: WaitdogUiView) => {
    if (phaseRef.current !== "live") return;
    const evening = simRef.current.serialize();
    const morning = settingsRef.current.morningSnapshot ?? evening;
    const narrative = buildDayNarrative(morning, evening);
    const prior = settingsRef.current.daySummaries.filter((item) =>
      item.day !== evening.day
    );
    commitSettings({
      ...settingsRef.current,
      speed: 0,
      filteredObservations: narrative.timeline,
      daySummaries: [...prior, narrative.summary],
    });
    speedRef.current = 0;
    setSpeed(0);
    commitSurface(null);
    commitView(nextView);
    commitPhase("review");
  };

  const simulationIsPaused = (): boolean =>
    phaseRef.current !== "live" ||
    speedRef.current === 0 ||
    viewRef.current.minuteOfDay >= DAY_END_MINUTE ||
    blockedPauseReason(viewRef.current, surfaceRef.current) !== null;

  const advanceSimulation = (requestedMinutes: number): AdvanceResult => {
    if (simulationIsPaused()) {
      return { minutes: 0, reason: "paused" };
    }
    let next = simRef.current.getDogView();
    let minutes = 0;
    let reason: AdvanceResult["reason"] = "limit";
    for (let minute = 0; minute < requestedMinutes; minute += 1) {
      simRef.current.advanceMinutes(1);
      next = simRef.current.getDogView();
      minutes += 1;
      if (next.work.alert !== null) {
        reason = "alert";
        break;
      }
      if (next.minuteOfDay >= DAY_END_MINUTE) {
        reason = "dayEnd";
        break;
      }
    }
    commitView(next);
    if (next.minuteOfDay >= DAY_END_MINUTE) enterReview(next);
    return { minutes, reason };
  };

  const syncAfterCommand = (): WaitdogUiView => {
    const next = simRef.current.getDogView();
    commitView(next);
    if (next.minuteOfDay >= DAY_END_MINUTE) enterReview(next);
    return next;
  };

  const runLifestyle = (
    command: () => LifestyleActionResult,
    onFeedback: (message: string | null) => void,
    successMessage: string | null = null,
  ): LifestyleActionResult => {
    const result = command();
    syncAfterCommand();
    onFeedback(result.ok ? successMessage : result.reason ?? "실행하지 못했습니다.");
    return result;
  };

  useEffect(() => {
    if (view.visibility === "seen" && view.room !== null) {
      setLastSeenRoom(view.room);
    }
  }, [view.room, view.visibility]);

  useEffect(() => {
    if (phase !== "live" || speed === 0 || ended) return;
    const intervalId = window.setInterval(() => {
      if (externalClockRef.current || simulationIsPaused()) return;
      advanceSimulation(GAME_MINUTES_PER_SECOND * speedRef.current);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [ended, phase, speed]);

  useEffect(() => {
    const directControlTick = () => {
      const current = viewRef.current;
      if (
        phaseRef.current !== "live" ||
        surfaceRef.current !== null ||
        current.minuteOfDay >= DAY_END_MINUTE ||
        !current.interaction.directControlEnabled
      ) {
        clearDirectInput();
        return;
      }

      const now = performance.now();
      const elapsedMs = Math.min(
        MAX_INPUT_DELTA_MS,
        Math.max(
          MIN_INPUT_DELTA_MS,
          lastDirectTickAtRef.current === null
            ? DIRECT_CONTROL_STEP_MS
            : now - lastDirectTickAtRef.current,
        ),
      );
      lastDirectTickAtRef.current = now;

      let dx = 0;
      let dy = 0;
      const heldKeys = heldMoveKeysRef.current;
      for (const code of heldKeys) {
        const vector = MOVE_KEY_VECTORS[code];
        if (!vector) continue;
        dx += vector.dx;
        dy += vector.dy;
      }

      if (heldKeys.size === 0) {
        dx = virtualMoveRef.current.dx;
        dy = virtualMoveRef.current.dy;
      }

      const magnitude = Math.hypot(dx, dy);
      let result: LifestyleActionResult | null = null;
      if (magnitude > 0) {
        workHoldRef.current = false;
        clickMoveTargetRef.current = null;
        result = simRef.current.moveOwnerBy({
          dx: dx / magnitude,
          dy: dy / magnitude,
          elapsedMs,
        });
      } else if (clickMoveTargetRef.current !== null) {
        workHoldRef.current = false;
        result = simRef.current.stepOwnerToward({
          ...clickMoveTargetRef.current,
          elapsedMs,
        });
      } else if (workHoldRef.current) {
        const beforeProgress = current.work.progress;
        result = simRef.current.advanceWorkHold(elapsedMs);
        const next = simRef.current.getDogView();
        if (!result.ok) {
          workHoldRef.current = false;
          setWorkFeedback(result.reason ?? "업무를 진행하지 못했습니다.");
        } else if (beforeProgress < 100 && next.work.progress === 100) {
          workHoldRef.current = false;
          setWorkFeedback(
            `업무 100% 완료 · ${next.work.salaryPreview.toLocaleString("ko-KR")}원이 정산되었습니다.`,
          );
        }
        commitView(next);
        return;
      }

      if (result === null) return;
      if (!result.ok) {
        if (clickMoveTargetRef.current !== null) {
          clickMoveTargetRef.current = null;
        }
        commitView(simRef.current.getDogView());
        return;
      }

      const next = simRef.current.getDogView();
      const clickTarget = clickMoveTargetRef.current;
      if (
        clickTarget !== null &&
        (
          (
            next.activeEncounter !== null &&
            next.interaction.encounterReady
          ) ||
          (
            next.ownerSpatial.room === clickTarget.room &&
            Math.hypot(
                next.ownerSpatial.x - clickTarget.x,
                next.ownerSpatial.y - clickTarget.y,
              ) <= 0.001
          )
        )
      ) {
        clickMoveTargetRef.current = null;
      }
      commitView(next);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const actions = directInputActionsRef.current;
      if (!actions || event.isComposing) return;

      if (
        surfaceRef.current !== null &&
        event.code === "Escape" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        actions.closeSurface();
        return;
      }
      if (
        surfaceRef.current !== null ||
        isEditableGameTarget(event.target) ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        phaseRef.current !== "live"
      ) return;

      if (MOVE_KEY_VECTORS[event.code]) {
        event.preventDefault();
        actions.setWorkHold(false);
        setEncounterFeedback(null);
        setWorkFeedback(null);
        setSecondaryFeedback(null);
        clickMoveTargetRef.current = null;
        heldMoveKeysRef.current.add(event.code);
        return;
      }

      if (!DIRECT_ACTION_CODES.has(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;

      if (event.code === "KeyE") actions.interact();
      else if (event.code === "Digit1") actions.selectContextAction(0);
      else if (event.code === "Digit2") actions.selectContextAction(1);
      else if (event.code === "Digit3") actions.selectContextAction(2);
      else if (event.code === "Space") actions.praise();
      else if (event.code === "KeyQ") actions.treat();
      else if (event.code === "KeyR") actions.setWorkHold(true);
      else if (event.code === "KeyB") actions.openSurface("bag");
      else if (event.code === "KeyM") actions.openSurface("petMart");
      else if (event.code === "KeyC") actions.openSurface("clinic");
      else if (event.code === "KeyU") actions.openSurface("upgrade");
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyR") {
        directInputActionsRef.current?.setWorkHold(false);
        event.preventDefault();
        return;
      }
      if (!MOVE_KEY_VECTORS[event.code]) return;
      const released = heldMoveKeysRef.current.delete(event.code);
      if (released) event.preventDefault();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") clearDirectInput();
    };
    const handleWindowBlur = () => clearDirectInput();

    const intervalId = window.setInterval(
      directControlTick,
      DIRECT_CONTROL_STEP_MS,
    );
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      clearDirectInput();
    };
  }, []);

  useEffect(() => {
    if (phaseRef.current !== "live") return;
    const result = simRef.current.ensureFirstEncounter();
    const next = simRef.current.getDogView();
    commitView(next);
    if (
      result.ok &&
      next.activeEncounter !== null &&
      !settingsRef.current.lifestyle.tutorialStarted
    ) {
      commitSettings({
        ...settingsRef.current,
        lifestyle: {
          ...settingsRef.current.lifestyle,
          tutorialStarted: true,
        },
      });
    } else if (
      !result.ok &&
      result.reason !== "첫 encounter는 이미 시작되었습니다."
    ) {
      setEncounterFeedback(result.reason);
    }
  }, [phase]);

  useEffect(() => {
    const renderGameToText = () => {
      const current = viewRef.current;
      const encounter = current.activeEncounter;
      const contextActions: WorldContextAction[] = current.work.alert === null
        ? current.interaction.contextActions.slice(0, 3)
        : [
          {
            id: WORK_ALERT_INTERRUPT_ACTION,
            label: "돌봄 신호 확인",
            enabled: true,
            reason: null,
          },
          {
            id: WORK_ALERT_CONTINUE_ACTION,
            label: "업무 계속",
            enabled: true,
            reason: null,
          },
        ];
      const nearby = nearbyWorldTarget(current);
      const availableActions: string[] = [];
      if (
        phaseRef.current === "live" &&
        current.minuteOfDay < DAY_END_MINUTE
      ) {
        if (surfaceRef.current !== null) {
          availableActions.push("Esc:close-surface");
        } else {
          if (current.interaction.directControlEnabled) {
            availableActions.push(
              "WASD/ArrowKeys:move",
              "ground-click:move",
            );
          }
          if (current.work.alert !== null) {
            availableActions.push(
              "1:interrupt-work",
              "2:continue-work",
            );
          } else {
            if (
              contextActions.length === 1 &&
              contextActions[0].enabled &&
              isAutoInteractAction(contextActions[0].id)
            ) {
              availableActions.push(`E:${contextActions[0].id}`);
            } else if (nearby !== null && contextActions.length > 0) {
              availableActions.push("E:show-context-actions");
            }
            availableActions.push(
              ...contextActions.flatMap((action, index) =>
                action.enabled ? [`${index + 1}:${action.id}`] : []
              ),
            );
            if (
              contextActions.some((action) =>
                action.enabled &&
                action.id === "encounter:reinforce:praise"
              )
            ) {
              availableActions.push("Space:encounter:reinforce:praise");
            }
            if (
              contextActions.some((action) =>
                action.enabled &&
                action.id === "encounter:reinforce:treat"
              )
            ) {
              availableActions.push("Q:encounter:reinforce:treat");
            }
            if (
              current.work.seated &&
              current.work.progress < 100
            ) {
              availableActions.push("R-hold:work");
            }
            if (encounter === null) {
              availableActions.push(
                "B:bag",
                "M:pet-mart",
                "C:clinic",
                "U:upgrade",
              );
            }
          }
        }
      }
      const dogPosition = current.visibility === "seen" &&
          current.spatial.room !== null &&
          current.spatial.x !== null &&
          current.spatial.y !== null
        ? {
          room: current.spatial.room,
          x: current.spatial.x,
          y: current.spatial.y,
          activity: current.spatial.activity,
          moving: current.spatial.moving,
        }
        : null;
      const automaticPause = blockedPauseReason(current, surfaceRef.current);
      const pause = phaseRef.current !== "live"
        ? `phase:${phaseRef.current}`
        : current.minuteOfDay >= DAY_END_MINUTE
        ? "dayEnd"
        : automaticPause ?? (speedRef.current === 0 ? "manual" : null);
      return JSON.stringify({
        mode: phaseRef.current,
        coordinateSystem:
          "room-normalized coordinates: origin top-left, x right, y down, range 0..1",
        day: current.day,
        time: {
          minuteOfDay: current.minuteOfDay,
          absoluteMinute: current.t,
        },
        speed: speedRef.current,
        paused: pause !== null,
        pauseReason: pause,
        openSurface: surfaceRef.current,
        owner: {
          room: current.ownerSpatial.room,
          x: current.ownerSpatial.x,
          y: current.ownerSpatial.y,
          activity: current.ownerSpatial.activity,
          moving: current.ownerSpatial.moving,
        },
        dog: {
          visibility: current.visibility,
          action: current.action,
          position: dogPosition,
        },
        nearbyTarget: nearby === null
          ? null
          : {
            id: nearby.id,
            label: worldTargetPresentation(nearby.id).label,
            distance: nearby.distance,
          },
        visibleTargets: current.interaction.targets.map((target) => ({
          id: target.id,
          kind: target.kind,
          room: target.room,
          x: target.x,
          y: target.y,
          distance: target.distance,
          nearby: target.nearby,
        })),
        currentContextActions: contextActions.map((action) => ({
          id: action.id,
          label: action.label,
          enabled: action.enabled,
          reason: action.reason,
        })),
        encounter: encounter === null
          ? null
          : {
            id: encounter.id,
            stage: encounter.stage,
            cue: {
              kind: encounter.cue.kind,
              label: encounter.cue.label,
              room: encounter.cue.room,
              anchor: encounter.cue.anchor,
            },
            inferredCause: encounter.inferredCause,
            outcome: encounter.outcome === null
              ? null
              : {
                success: encounter.outcome.success,
                score: encounter.outcome.score,
                message: encounter.outcome.message,
              },
          },
        work: {
          state: current.work.state,
          progress: current.work.progress,
          seated: current.work.seated,
          alert: current.work.alert === null
            ? null
            : { cueLabel: current.work.alert.cueLabel },
          salaryPreview: current.work.salaryPreview,
        },
        bowls: {
          food: current.environmentPlacements.foodBowl,
          water: current.environmentPlacements.waterBowl,
        },
        activePoop: current.activePoop,
        economy: current.economy,
        availableActions,
      });
    };

    const advanceTime = (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0 || simulationIsPaused()) return;
      externalClockRef.current = true;
      automationRemainderRef.current +=
        ms * GAME_MINUTES_PER_SECOND * speedRef.current / 1000;
      const ticks = Math.floor(automationRemainderRef.current);
      if (ticks <= 0) return;
      automationRemainderRef.current -= ticks;
      const outcome = advanceSimulation(ticks);
      if (outcome.reason !== "limit") automationRemainderRef.current = 0;
    };

    window.render_game_to_text = renderGameToText;
    window.advanceTime = advanceTime;
    return () => {
      if (window.render_game_to_text === renderGameToText) {
        delete window.render_game_to_text;
      }
      if (window.advanceTime === advanceTime) delete window.advanceTime;
    };
  }, []);

  persistProfileRef.current = (silent, suppressCloudPush) => {
    const previousPayload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
    try {
      const currentView = viewRef.current;
      const result = saveProfile(window.localStorage, {
        day: currentView.day,
        phase: phaseRef.current,
        simSnapshot: simRef.current.serialize(),
        ownerResources: resourcesRef.current,
        hypotheses: hypothesesRef.current,
        settings: settingsRef.current,
      });
      if (!result.ok) {
        if (!silent && !storageNoticeRef.current) {
          storageNoticeRef.current = true;
          setSecondaryFeedback(STORAGE_SAVE_MESSAGE);
        }
        return;
      }

      const payload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
      if (
        suppressCloudPush ||
        payload === null ||
        payload === previousPayload
      ) return;

      hasMeaningfulLocalRef.current = true;
      const savedAt = Date.now();
      try {
        window.localStorage.setItem(
          WAITDOG_LOCAL_SAVED_AT_KEY,
          String(savedAt),
        );
        if (!silent) setLocalSavedAt(savedAt);
      } catch {
        // Companion metadata failure must not interrupt the existing local save.
      }
      waitdogCloudSave.push(payload);
    } catch {
      if (!silent && !storageNoticeRef.current) {
        storageNoticeRef.current = true;
        setSecondaryFeedback(STORAGE_SAVE_MESSAGE);
      }
    }
  };

  useEffect(() => {
    if (skipNextSaveEffectRef.current) {
      skipNextSaveEffectRef.current = false;
      initialPersistencePendingRef.current = false;
      if (persistenceTimerRef.current !== null) {
        window.clearTimeout(persistenceTimerRef.current);
        persistenceTimerRef.current = null;
      }
      persistencePendingRef.current = false;
      return;
    }

    const wasInitialPersistence = initialPersistencePendingRef.current;
    initialPersistencePendingRef.current = false;
    if (wasInitialPersistence) {
      persistProfileRef.current(false, true);
      return;
    }

    if (persistenceTimerRef.current !== null) {
      window.clearTimeout(persistenceTimerRef.current);
    }
    persistencePendingRef.current = true;
    persistenceTimerRef.current = window.setTimeout(() => {
      persistenceTimerRef.current = null;
      flushPendingPersistence(false);
    }, PERSISTENCE_TRAILING_MS);
  }, [hypotheses, phase, resources, settings, view]);

  useEffect(() => {
    const flushForExit = () => {
      flushPendingPersistence(true);
      void waitdogCloudSave.flush();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushForExit();
    };
    window.addEventListener("pagehide", flushForExit, true);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
      true,
    );
    return () => {
      window.removeEventListener("pagehide", flushForExit, true);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
        true,
      );
      flushForExit();
    };
  }, []);

  useEffect(() => {
    const locked = openSurface !== null;
    document.documentElement.classList.toggle("waitdog-dialog-open", locked);
    document.body.classList.toggle("waitdog-dialog-open", locked);
    return () => {
      document.documentElement.classList.remove("waitdog-dialog-open");
      document.body.classList.remove("waitdog-dialog-open");
    };
  }, [openSurface]);

  const setWorldFeedback = (message: string | null) => {
    setEncounterFeedback(null);
    setWorkFeedback(null);
    setSecondaryFeedback(message);
  };

  const clearWorldFeedback = () => {
    setEncounterFeedback(null);
    setWorkFeedback(null);
    setSecondaryFeedback(null);
  };

  const setWorkHoldActive = (holding: boolean) => {
    if (!holding) {
      workHoldRef.current = false;
      return;
    }
    const current = viewRef.current;
    const moving = heldMoveKeysRef.current.size > 0 ||
      virtualMoveRef.current.dx !== 0 ||
      virtualMoveRef.current.dy !== 0 ||
      clickMoveTargetRef.current !== null;
    if (
      phaseRef.current !== "live" ||
      surfaceRef.current !== null ||
      moving ||
      !current.work.seated ||
      current.work.alert !== null ||
      current.work.progress >= 100
    ) return;
    workHoldRef.current = true;
    setWorkFeedback(null);
  };

  const handleGroundMove = (target: GroundMoveTarget) => {
    workHoldRef.current = false;
    clickMoveTargetRef.current = target;
    clearWorldFeedback();
  };

  const handleVirtualMove = (vector: DirectMoveVector) => {
    if (vector.dx === 0 && vector.dy === 0) {
      virtualMoveRef.current = ZERO_DIRECT_VECTOR;
      return;
    }
    workHoldRef.current = false;
    clickMoveTargetRef.current = null;
    virtualMoveRef.current = vector;
    clearWorldFeedback();
  };

  const resolveWorkAlert = (choice: "interrupt" | "continue") => {
    workHoldRef.current = false;
    const resolution = simRef.current.resolveWorkAlert(choice);
    if (!resolution.ok) {
      syncAfterCommand();
      setWorldFeedback(resolution.reason);
      return;
    }
    if (choice === "interrupt") {
      const mission = simRef.current.startNextEncounter();
      syncAfterCommand();
      setWorldFeedback(
        mission.ok
          ? "업무 진행도를 보존하고 돌봄 미션으로 전환했습니다."
          : mission.reason,
      );
      return;
    }
    syncAfterCommand();
    setWorldFeedback("업무를 이어갑니다. R을 누르고 진행하세요.");
  };

  const executeWorldAction = (actionId: string) => {
    if (actionId === WORK_ALERT_INTERRUPT_ACTION) {
      resolveWorkAlert("interrupt");
      return;
    }
    if (actionId === WORK_ALERT_CONTINUE_ACTION) {
      resolveWorkAlert("continue");
      return;
    }

    workHoldRef.current = false;
    const encounterResultId = viewRef.current.activeEncounter?.id ?? null;
    const result = simRef.current.performWorldAction(actionId);
    const next = syncAfterCommand();
    if (!result.ok) {
      setWorldFeedback(result.reason ?? "행동을 실행하지 못했습니다.");
      return;
    }

    if (actionId === "encounter:dismiss") {
      commitSettings({
        ...settingsRef.current,
        lifestyle: {
          ...settingsRef.current.lifestyle,
          lastEncounterResultId: encounterResultId,
        },
      });
      setWorldFeedback(null);
      return;
    }

    let message: string | null = null;
    if (actionId === "encounter:observe") {
      message = "원인을 추정했습니다. 1~3 중 대응을 선택하세요.";
    } else if (actionId.startsWith("encounter:response:")) {
      message = "대응했습니다. 이어서 칭찬이나 보상을 선택하세요.";
    } else if (actionId.startsWith("encounter:reinforce:")) {
      message = next.activeEncounter?.outcome?.message ?? "돌봄 행동을 마쳤습니다.";
    } else if (actionId === "work:sit") {
      message = "컴퓨터에 앉았습니다. R을 누르는 동안 업무가 진행됩니다.";
    } else if (actionId.startsWith("food:")) {
      message = "사료를 그릇에 담았습니다.";
    } else if (actionId === "water:fill") {
      message = "깨끗한 물을 채웠습니다.";
    } else if (actionId === "water:clean") {
      message = "물그릇을 깨끗이 씻었습니다.";
    } else if (actionId === "poop:cleanup") {
      message = "배변 흔적을 정리했습니다.";
    } else if (actionId.startsWith("bath:")) {
      message = "목욕 돌봄을 마쳤습니다.";
    }
    setWorldFeedback(message);
  };

  const handleNearbyInteraction = () => {
    const current = viewRef.current;
    if (current.work.alert !== null) {
      setWorldFeedback("1~2 중 업무 알림 대응을 선택하세요.");
      return;
    }
    const actions = current.interaction.contextActions.slice(0, 3);
    if (
      actions.length === 1 &&
      isAutoInteractAction(actions[0].id)
    ) {
      executeWorldAction(actions[0].id);
      return;
    }
    if (actions.length > 0) {
      setWorldFeedback(`1~${actions.length} 중 행동을 선택하세요.`);
      return;
    }
    const target = nearbyWorldTarget(current);
    if (target !== null) {
      setWorldFeedback(
        `${worldTargetPresentation(target.id).label}에서 지금 할 행동이 없습니다.`,
      );
      return;
    }
    setWorldFeedback(
      current.activeEncounter === null
        ? "상호작용할 대상 가까이 이동해 주세요."
        : "강아지 신호 쪽으로 이동해 주세요.",
    );
  };

  const selectContextAction = (index: number) => {
    const current = viewRef.current;
    if (current.work.alert !== null) {
      if (index === 0) resolveWorkAlert("interrupt");
      else if (index === 1) resolveWorkAlert("continue");
      return;
    }
    const action = current.interaction.contextActions[index];
    if (action) executeWorldAction(action.id);
  };

  const executeReinforcementShortcut = (
    reinforcement: "praise" | "treat",
  ) => {
    const actionId = `encounter:reinforce:${reinforcement}`;
    const action = viewRef.current.interaction.contextActions.find(
      (candidate) => candidate.id === actionId,
    );
    if (action) executeWorldAction(action.id);
  };

  const openShortcutSurface = (surface: LifestyleSurface) => {
    const current = viewRef.current;
    if (
      current.activeEncounter !== null ||
      current.work.alert !== null ||
      current.minuteOfDay >= DAY_END_MINUTE
    ) return;
    commitSurface(surface);
  };

  const updateStoreCategory = (category: CatalogCategory) => {
    commitSettings({
      ...settingsRef.current,
      lifestyle: {
        ...settingsRef.current.lifestyle,
        selectedStoreCategory: category,
      },
    });
  };

  const purchaseItem = (itemId: CatalogItemId) => {
    const label = itemLabel(viewRef.current, itemId);
    runLifestyle(
      () => simRef.current.purchaseItem(itemId),
      setSurfaceFeedback,
      `${label} 1개를 구매했습니다.`,
    );
  };

  const placeItem = (
    itemId: PlaceableItemId,
    preset: PlacementPreset,
  ) => {
    const label = itemLabel(viewRef.current, itemId);
    const target = placementFor(viewRef.current, itemId, preset);
    runLifestyle(
      () => simRef.current.placeItem(itemId, target),
      setSurfaceFeedback,
      `${label} 배치를 안전 프리셋 ${preset.toUpperCase()} 위치에 완료했습니다.`,
    );
  };

  const scheduleClinic = () => {
    runLifestyle(
      () => simRef.current.scheduleClinic(),
      setSurfaceFeedback,
      "접종·예방 진료 예약을 완료했습니다.",
    );
  };

  const buyUpgrade = (upgradeId: SalaryUpgradeId) => {
    const label = viewRef.current.upgrades.find((upgrade) =>
      upgrade.id === upgradeId
    )?.label ?? upgradeId;
    runLifestyle(
      () => simRef.current.buyUpgrade(upgradeId),
      setSurfaceFeedback,
      `${label} 업그레이드를 적용했습니다.`,
    );
  };

  const handleStartDay = () => {
    const currentSettings = settingsRef.current;
    const morningSnapshot = simRef.current.serialize();
    const encounter = simRef.current.ensureFirstEncounter();
    const nextSpeed = currentSettings.speed === 0 ? 1 : currentSettings.speed;
    speedRef.current = nextSpeed;
    setSpeed(nextSpeed);
    commitSettings({
      ...currentSettings,
      speed: nextSpeed,
      daySchedule: proposedSchedule,
      interruptedScheduleIds: [],
      morningSnapshot,
      filteredObservations: [],
      training: null,
      lifestyle: {
        ...currentSettings.lifestyle,
        tutorialStarted: encounter.ok ||
          currentSettings.lifestyle.tutorialStarted,
      },
    });
    const next = simRef.current.getDogView();
    commitView(next);
    commitPhase("live");
    setEncounterFeedback(
      encounter.ok ||
          encounter.reason === "첫 encounter는 이미 시작되었습니다."
        ? null
        : encounter.reason,
    );
  };

  const handleHypothesis = (hypothesis: Hypothesis) => {
    if (view.day !== 5) return;
    setHypotheses([hypothesis]);
  };

  const handleReviewContinue = () => {
    if (view.day === 7 && !settingsRef.current.infinite) {
      commitPhase("campaignEnd");
      return;
    }
    simRef.current.newDay();
    const next = simRef.current.getDogView();
    automationRemainderRef.current = 0;
    speedRef.current = 1;
    setSpeed(1);
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: null,
      filteredObservations: [],
      training: null,
      lifestyle: {
        ...settingsRef.current.lifestyle,
        lastEncounterResultId: null,
      },
    });
    commitView(next);
    commitSurface(null);
    commitPhase("morning");
  };

  const handleInfinite = () => {
    simRef.current.newDay();
    const next = simRef.current.getDogView();
    automationRemainderRef.current = 0;
    speedRef.current = 1;
    setSpeed(1);
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      infinite: true,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: null,
      filteredObservations: [],
      training: null,
      lifestyle: {
        ...settingsRef.current.lifestyle,
        lastEncounterResultId: null,
      },
    });
    commitView(next);
    commitSurface(null);
    commitPhase("morning");
  };

  const handleNewCampaign = () => {
    const nextSim = createSim(SIMULATION_SEED);
    simRef.current = nextSim;
    const nextSettings = createCampaignSettings(SIMULATION_SEED);
    const nextResources = createOwnerResources();
    settingsRef.current = nextSettings;
    resourcesRef.current = nextResources;
    speedRef.current = 1;
    automationRemainderRef.current = 0;
    setSettings(nextSettings);
    setResources(nextResources);
    setHypotheses([]);
    setLastSeenRoom("living");
    setEncounterFeedback(null);
    setWorkFeedback(null);
    setSecondaryFeedback(null);
    setSpeed(1);
    commitView(nextSim.getDogView());
    commitSurface(null);
    commitPhase("morning");
  };

  const handleUseLocalSave = () => {
    waitdogCloudSave.resolveConflict("local");
    setCloudConflict(null);
  };

  const handleUseCloudSave = () => {
    if (cloudConflict === null || !applyCloudPayload(cloudConflict.payload)) {
      return;
    }
    try {
      window.localStorage.setItem(
        WAITDOG_LOCAL_SAVED_AT_KEY,
        String(cloudConflict.updatedAt),
      );
      setLocalSavedAt(cloudConflict.updatedAt);
    } catch {
      // Companion metadata failure must not block profile application.
    }
    waitdogCloudSave.resolveConflict("cloud");
    setCloudConflict(null);
  };

  directInputActionsRef.current = {
    interact: handleNearbyInteraction,
    selectContextAction,
    praise: () => executeReinforcementShortcut("praise"),
    treat: () => executeReinforcementShortcut("treat"),
    setWorkHold: setWorkHoldActive,
    openSurface: openShortcutSurface,
    closeSurface: () => commitSurface(null),
  };

  const cloudSaveUi = (
    <aside className="waitdog-cloud-save" aria-label="클라우드 저장 상태">
      {cloudState === "offline" || cloudState === "error" ? (
        <button
          type="button"
          className={`waitdog-cloud-badge waitdog-cloud-badge--${cloudState}`}
          title={`${cloudBadgeTitle(cloudState)} 눌러서 다시 시도할 수 있습니다.`}
          onClick={() => retryCloudSyncRef.current()}
        >
          {cloudBadgeLabel(cloudState)}
        </button>
      ) : (
        <span
          className={`waitdog-cloud-badge waitdog-cloud-badge--${cloudState}`}
          title={cloudBadgeTitle(cloudState)}
          role="status"
        >
          {cloudBadgeLabel(cloudState)}
        </span>
      )}
      {cloudState === "conflict" && cloudConflict && (
        <section className="waitdog-cloud-conflict">
          <p>어느 보호자 기록을 이어갈까요?</p>
          <div className="waitdog-cloud-conflict__options">
            <div>
              <strong>이 기기</strong>
              <span>{formatSavedAt(localSavedAt)}</span>
              <small>
                Day {view.day} · {settings.infinite ? "무한" : "캠페인"}
              </small>
            </div>
            <div>
              <strong>클라우드</strong>
              <span>{formatSavedAt(cloudConflict.updatedAt)}</span>
              <small>{summarizeWaitdogPayload(cloudConflict.payload)}</small>
            </div>
          </div>
          <div className="waitdog-cloud-conflict__actions">
            <button type="button" onClick={handleUseLocalSave}>
              이 기기 기록 사용
            </button>
            <button type="button" onClick={handleUseCloudSave}>
              클라우드 기록 사용
            </button>
          </div>
        </section>
      )}
    </aside>
  );

  if (phase === "morning") {
    return (
      <>
        {cloudSaveUi}
        <MorningPlan
          day={view.day}
          schedule={proposedSchedule}
          prediction={sim.predictPoopWindow()}
          tip={curriculumTip(view.day, settings.infinite)}
          onStart={handleStartDay}
        />
      </>
    );
  }

  const morning = settings.morningSnapshot ?? sim.serialize();
  const narrative = buildDayNarrative(morning, sim.serialize());
  if (phase === "review") {
    return (
      <>
        {cloudSaveUi}
        <DayReview
          day={view.day}
          narrative={narrative}
          selectedHypothesis={view.day === 5 ? hypotheses[0] ?? null : null}
          onHypothesis={handleHypothesis}
          onContinue={handleReviewContinue}
        />
      </>
    );
  }

  if (phase === "campaignEnd") {
    return (
      <>
        {cloudSaveUi}
        <CampaignEnd
          outcomes={buildCampaignOutcomes(settings.daySummaries)}
          onInfinite={handleInfinite}
          onNewCampaign={handleNewCampaign}
        />
      </>
    );
  }

  const directControlsDisabled = ended ||
    openSurface !== null ||
    !view.interaction.directControlEnabled;
  const nearbyTarget = nearbyWorldTarget(view);
  const cueTarget = view.interaction.targets.find((target) =>
    target.id === "cue"
  ) ?? null;
  const displayedTargetId = view.work.alert !== null
    ? "computer"
    : nearbyTarget?.id ?? cueTarget?.id ?? null;
  const actionBarTarget = displayedTargetId === null
    ? null
    : worldTargetPresentation(displayedTargetId);
  const engineContextActions = view.interaction.contextActions.slice(0, 3);
  const actionBarItems: WorldActionBarItem[] = view.work.alert === null
    ? toActionBarItems(engineContextActions)
    : [
      {
        id: WORK_ALERT_INTERRUPT_ACTION,
        label: "신호 확인",
        icon: worldActionIcon(WORK_ALERT_INTERRUPT_ACTION),
        shortcut: "1",
      },
      {
        id: WORK_ALERT_CONTINUE_ACTION,
        label: "업무 계속",
        icon: worldActionIcon(WORK_ALERT_CONTINUE_ACTION),
        shortcut: "2",
      },
    ];
  const automaticInteraction = engineContextActions.length === 1 &&
      isAutoInteractAction(engineContextActions[0].id)
    ? engineContextActions[0]
    : null;
  const interactionLabel = view.work.alert !== null
    ? "알림 선택"
    : automaticInteraction?.label ??
      (engineContextActions.length > 0 ? "행동 선택" : "상호작용");
  const worldFeedback = encounterFeedback ?? workFeedback ?? secondaryFeedback;
  const worldPrompt = (() => {
    if (worldFeedback !== null) return worldFeedback;
    if (view.work.alert !== null) {
      return `${view.work.alert.cueLabel} · 1~2 중 대응을 선택하세요.`;
    }
    if (activeEncounter !== null) {
      if (!view.interaction.encounterReady) {
        return "강아지 신호 쪽으로 이동하세요.";
      }
      if (activeEncounter.stage === "cause" || activeEncounter.stage === "cue") {
        return "E로 신호를 관찰하세요.";
      }
      if (activeEncounter.stage === "reinforcement") {
        return "Space·Q 또는 1~3으로 보상을 선택하세요.";
      }
      if (activeEncounter.stage === "outcome") {
        return "E로 결과를 확인하세요.";
      }
      return `1~${Math.max(1, engineContextActions.length)} 중 대응을 선택하세요.`;
    }
    if (nearbyTarget !== null) {
      if (automaticInteraction !== null) {
        return `E로 ${automaticInteraction.label} 행동을 실행하세요.`;
      }
      if (engineContextActions.length > 0) {
        return `1~${engineContextActions.length} 중 행동을 선택하세요.`;
      }
      return `${worldTargetPresentation(nearbyTarget.id).label} 가까이입니다.`;
    }
    if (view.work.seated) return "R을 누르는 동안 업무가 진행됩니다.";
    return "WASD·클릭으로 집을 살펴보세요.";
  })();
  const interactDisabled = view.work.alert === null && nearbyTarget === null;
  const workHoldDisabled = !view.work.seated ||
    view.work.alert !== null ||
    view.work.progress >= 100;
  const visibleWorkProgress = view.work.seated ? view.work.progress : null;

  return (
    <main
      className={`waitdog-page lifestyle-page${activeEncounter ? " is-encounter-active" : ""}${openSurface ? " is-surface-open" : ""}`}
    >
      {cloudSaveUi}
      <TopBar
        day={view.day}
        minuteOfDay={view.minuteOfDay}
        speed={speed}
        ownerRoom={view.ownerSpatial.room}
        ownerMoving={view.ownerSpatial.moving}
        money={view.economy.money}
        carePoints={view.economy.carePoints}
        salaryBonusPercent={view.economy.salaryBonusPercent}
        pausedReason={pausedReason}
        ended={ended}
        onSpeedChange={commitSpeed}
      />

      <div className="lifestyle-layout">
        <div className="world-live-column">
          <HouseCanvas
            view={view}
            lastSeenRoom={lastSeenRoom}
            disabled={directControlsDisabled}
            compact={activeEncounter !== null}
            encounter={activeEncounter}
            onGroundMove={handleGroundMove}
            onInteract={handleNearbyInteraction}
          />
          <WorldActionBar
            target={actionBarTarget}
            prompt={worldPrompt}
            cause={activeEncounter?.inferredCause ?? null}
            actions={actionBarItems}
            disabled={ended || openSurface !== null}
            interactLabel={interactionLabel}
            interactDisabled={interactDisabled}
            workProgress={visibleWorkProgress}
            workHoldLabel="업무"
            workHoldDisabled={workHoldDisabled}
            onAction={executeWorldAction}
            onInteract={handleNearbyInteraction}
            onWorkHoldChange={setWorkHoldActive}
          />
        </div>
      </div>

      <DirectControls
        disabled={directControlsDisabled}
        onMove={handleVirtualMove}
        onInteract={handleNearbyInteraction}
        interactionLabel={interactDisabled ? null : interactionLabel}
        interactionIcon={actionBarTarget?.icon ?? "◎"}
        interactionDisabled={interactDisabled}
        workProgress={visibleWorkProgress}
        workHoldLabel="업무"
        workHoldDisabled={workHoldDisabled}
        onWorkHoldChange={setWorkHoldActive}
      />

      <BottomNav
        active={openSurface}
        disabled={activeEncounter !== null || view.work.alert !== null || ended}
        onSelect={(surface) => commitSurface(surface)}
      />

      {openSurface && (
        <LifestyleDialog
          surface={openSurface}
          view={view}
          feedback={surfaceFeedback}
          storeCategory={settings.lifestyle.selectedStoreCategory}
          onStoreCategory={updateStoreCategory}
          onClose={() => commitSurface(null)}
          onPurchase={purchaseItem}
          onPlace={placeItem}
          onClinic={scheduleClinic}
          onUpgrade={buyUpgrade}
        />
      )}
    </main>
  );
}
