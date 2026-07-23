import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav, type LifestyleSurface } from "./components/BottomNav";
import { CampaignEnd } from "./components/CampaignEnd";
import { ControlPanel } from "./components/ControlPanel";
import { DayReview } from "./components/DayReview";
import { EncounterPanel } from "./components/EncounterPanel";
import { HouseCanvas } from "./components/HouseCanvas";
import { LifestyleDialog } from "./components/LifestyleDialog";
import { MorningPlan } from "./components/MorningPlan";
import { TopBar, type GameSpeed } from "./components/TopBar";
import { WorkPanel } from "./components/WorkPanel";
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
  type WaitdogSnapshot,
  type WaitdogUiSim,
  type WaitdogUiView,
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

const hasFeedForDay = (snapshot: WaitdogSnapshot): boolean => {
  const dayStart = (snapshot.day - 1) * 1440;
  const dayEnd = dayStart + 1440;
  return snapshot.log.some((event) =>
    event.type === "feed" && event.t >= dayStart && event.t < dayEnd
  );
};

const surfacePauseLabel = (surface: LifestyleSurface): string => {
  if (surface === "mission") return "미션 메뉴 열림";
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
  phaseRef.current = phase;
  viewRef.current = view;
  speedRef.current = speed;
  settingsRef.current = settings;
  resourcesRef.current = resources;
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

  const commitPhase = (next: CampaignPhase) => {
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
    if (
      phaseRef.current !== "live" ||
      settingsRef.current.lifestyle.tutorialStarted ||
      viewRef.current.activeEncounter !== null
    ) return;
    const result = simRef.current.startNextEncounter();
    const next = simRef.current.getDogView();
    commitView(next);
    if (result.ok) {
      commitSettings({
        ...settingsRef.current,
        lifestyle: {
          ...settingsRef.current.lifestyle,
          tutorialStarted: true,
        },
      });
    } else {
      setEncounterFeedback(result.reason);
    }
  }, [phase]);

  useEffect(() => {
    const renderGameToText = () => {
      const current = viewRef.current;
      const encounter = current.activeEncounter;
      const stageOptions = encounter === null
        ? []
        : encounter.stage === "cause" || encounter.stage === "cue"
        ? encounter.causeChoices
        : encounter.stage === "response"
        ? encounter.responseChoices
        : encounter.stage === "reinforcement"
        ? encounter.reinforcementChoices
        : [];
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
        dog: {
          visibility: current.visibility,
          action: current.action,
          position: dogPosition,
        },
        ownerSpatial: {
          room: current.ownerSpatial.room,
          x: current.ownerSpatial.x,
          y: current.ownerSpatial.y,
          targetRoom: current.ownerSpatial.targetRoom,
          targetX: current.ownerSpatial.targetX,
          targetY: current.ownerSpatial.targetY,
          activity: current.ownerSpatial.activity,
          moving: current.ownerSpatial.moving,
        },
        ownerDogOverlap: current.ownerDogOverlap,
        encounter: encounter === null
          ? null
          : {
            id: encounter.id,
            kind: encounter.kind,
            title: encounter.title,
            stage: encounter.stage,
            cue: encounter.cue,
            publicClues: encounter.publicClues,
            currentOptions: stageOptions,
            selectedCauseId: encounter.selectedCauseId,
            selectedResponseId: encounter.selectedResponseId,
            hint: encounter.hint,
            safetyLevel: encounter.safetyLevel,
            safetyBanner: encounter.safetyBanner,
            result: encounter.outcome === null
              ? null
              : {
                success: encounter.outcome.success,
                score: encounter.outcome.score,
                carePointsAwarded: encounter.outcome.carePointsAwarded,
                message: encounter.outcome.message,
                safetyMessage: encounter.outcome.safetyMessage,
              },
          },
        economy: current.economy,
        inventory: current.inventory,
        work: current.work,
        visiblePlacements: current.environmentPlacements,
        nextTask: encounter === null
          ? "다음 생활 미션을 시작하거나 컴퓨터에서 업무 블록을 진행하세요."
          : "현재 미션의 공개 단서를 보고 한 가지 선택지를 고르세요.",
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

  useEffect(() => {
    if (skipNextSaveEffectRef.current) {
      skipNextSaveEffectRef.current = false;
      initialPersistencePendingRef.current = false;
      return;
    }

    const wasInitialPersistence = initialPersistencePendingRef.current;
    initialPersistencePendingRef.current = false;
    const previousPayload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
    try {
      const result = saveProfile(window.localStorage, {
        day: view.day,
        phase,
        simSnapshot: simRef.current.serialize(),
        ownerResources: resources,
        hypotheses,
        settings,
      });
      if (!result.ok) {
        if (!storageNoticeRef.current) {
          storageNoticeRef.current = true;
          setSecondaryFeedback(STORAGE_SAVE_MESSAGE);
        }
        return;
      }

      const payload = window.localStorage.getItem(WAITDOG_PROFILE_KEY);
      if (
        wasInitialPersistence ||
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
        setLocalSavedAt(savedAt);
      } catch {
        // Companion metadata failure must not interrupt the existing local save.
      }
      waitdogCloudSave.push(payload);
    } catch {
      if (!storageNoticeRef.current) {
        storageNoticeRef.current = true;
        setSecondaryFeedback(STORAGE_SAVE_MESSAGE);
      }
    }
  }, [hypotheses, phase, resources, settings, view]);

  useEffect(() => {
    const locked = openSurface !== null;
    document.documentElement.classList.toggle("waitdog-dialog-open", locked);
    document.body.classList.toggle("waitdog-dialog-open", locked);
    return () => {
      document.documentElement.classList.remove("waitdog-dialog-open");
      document.body.classList.remove("waitdog-dialog-open");
    };
  }, [openSurface]);

  const startMission = () => {
    const result = runLifestyle(
      () => simRef.current.startNextEncounter(),
      setEncounterFeedback,
    );
    if (!result.ok) return;
    commitSurface(null);
    setEncounterFeedback(null);
    if (!settingsRef.current.lifestyle.tutorialStarted) {
      commitSettings({
        ...settingsRef.current,
        lifestyle: {
          ...settingsRef.current.lifestyle,
          tutorialStarted: true,
        },
      });
    }
  };

  const selectEncounterCause = (choiceId: string) => {
    runLifestyle(
      () => simRef.current.selectEncounterCause(choiceId),
      setEncounterFeedback,
    );
  };

  const selectEncounterResponse = (choiceId: string) => {
    runLifestyle(
      () => simRef.current.selectEncounterResponse(choiceId),
      setEncounterFeedback,
    );
  };

  const selectEncounterReinforcement = (choiceId: string) => {
    runLifestyle(
      () => simRef.current.selectEncounterReinforcement(choiceId),
      setEncounterFeedback,
    );
  };

  const requestEncounterHint = () => {
    runLifestyle(
      () => simRef.current.requestEncounterHint(),
      setEncounterFeedback,
    );
  };

  const revealIdleHint = useCallback(() => {
    if (viewRef.current.activeEncounter === null) return;
    const advanced = simRef.current.advanceEncounterInput(8);
    if (!advanced.ok) return;
    simRef.current.requestEncounterHint();
    syncAfterCommand();
  }, []);

  const dismissEncounter = () => {
    const resultId = viewRef.current.activeEncounter?.id ?? null;
    const result = runLifestyle(
      () => simRef.current.dismissEncounterOutcome(),
      setEncounterFeedback,
    );
    if (!result.ok) return;
    setEncounterFeedback(null);
    commitSettings({
      ...settingsRef.current,
      lifestyle: {
        ...settingsRef.current.lifestyle,
        lastEncounterResultId: resultId,
      },
    });
  };

  const moveOwnerToRoom = (room: RoomId) => {
    runLifestyle(
      () => simRef.current.moveOwnerTo({ room, x: 0.5, y: 0.56 }),
      setSecondaryFeedback,
      `${room === "living" ? "생활방" : room === "kitchen" ? "부엌" : "화장실"}으로 이동합니다.`,
    );
  };

  const moveToComputer = () => {
    runLifestyle(
      () => simRef.current.moveOwnerTo({ hotspotId: "computer" }),
      setWorkFeedback,
      "컴퓨터 앞으로 이동합니다.",
    );
  };

  const performWorkBlock = () => {
    const before = viewRef.current.work.progress;
    const result = runLifestyle(
      () => simRef.current.performWorkBlock(),
      setWorkFeedback,
      null,
    );
    if (result.ok) {
      const after = viewRef.current.work.progress;
      setWorkFeedback(
        after === 100
          ? `업무 100% 완료 · ${viewRef.current.work.salaryPreview.toLocaleString("ko-KR")}원이 정산되었습니다.`
          : `업무가 ${before}%에서 ${after}%로 진행되었습니다.`,
      );
    }
  };

  const resolveWorkAlert = (choice: "interrupt" | "continue") => {
    const resolution = simRef.current.resolveWorkAlert(choice);
    if (!resolution.ok) {
      syncAfterCommand();
      setWorkFeedback(resolution.reason);
      return;
    }
    if (choice === "interrupt") {
      const mission = simRef.current.startNextEncounter();
      syncAfterCommand();
      setWorkFeedback(
        mission.ok
          ? "업무 진행도를 보존하고 돌봄 미션으로 전환했습니다."
          : mission.reason,
      );
      setEncounterFeedback(null);
      return;
    }
    syncAfterCommand();
    setWorkFeedback("업무를 이어갑니다. 다음 15분 블록을 시작하세요.");
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

  const useItem = (itemId: CatalogItemId) => {
    const label = itemLabel(viewRef.current, itemId);
    runLifestyle(
      () => simRef.current.useItem(itemId),
      setSurfaceFeedback,
      `${label} 사용을 완료했습니다.`,
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

  const handleWalk = () => {
    if (blockedPauseReason(viewRef.current, surfaceRef.current) !== null) return;
    simRef.current.walk(30);
    syncAfterCommand();
    setSecondaryFeedback("산책 30분을 마쳐 긴장과 지루함을 낮췄습니다.");
  };

  const handleWater = () => {
    if (blockedPauseReason(viewRef.current, surfaceRef.current) !== null) return;
    simRef.current.water();
    syncAfterCommand();
    setSecondaryFeedback("깨끗한 물을 채웠습니다.");
  };

  const handleCleanup = () => {
    if (blockedPauseReason(viewRef.current, surfaceRef.current) !== null) return;
    const result = simRef.current.intervene("cleanup");
    syncAfterCommand();
    setSecondaryFeedback(
      result.success ? "배변 흔적을 안전하게 정리했습니다." : "지금 정리할 배변 흔적이 없습니다.",
    );
  };

  const handleStartDay = () => {
    const currentSettings = settingsRef.current;
    if (!hasFeedForDay(simRef.current.serialize())) simRef.current.feed(70);
    const morningSnapshot = simRef.current.serialize();
    const encounter = simRef.current.startNextEncounter();
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
    commitView(simRef.current.getDogView());
    commitPhase("live");
    setEncounterFeedback(encounter.ok ? null : encounter.reason);
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

  const missionBlocked = view.work.state === "working" ||
    view.work.state === "alert";
  const controlsDisabled = ended || activeEncounter !== null ||
    view.work.alert !== null;

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
        <HouseCanvas
          view={view}
          lastSeenRoom={lastSeenRoom}
          disabled={controlsDisabled}
          compact={activeEncounter !== null}
          encounter={activeEncounter}
          onRoomSelect={moveOwnerToRoom}
          onComputer={moveToComputer}
        />

        <aside className="priority-rail" aria-label="현재 우선 행동">
          {activeEncounter ? (
            <EncounterPanel
              encounter={activeEncounter}
              feedback={encounterFeedback}
              onSelectCause={selectEncounterCause}
              onSelectResponse={selectEncounterResponse}
              onSelectReinforcement={selectEncounterReinforcement}
              onRequestHint={requestEncounterHint}
              onIdleHint={revealIdleHint}
              onDismiss={dismissEncounter}
            />
          ) : view.work.alert ? (
            <WorkPanel
              work={view.work}
              feedback={workFeedback}
              disabled={ended}
              onMoveToComputer={moveToComputer}
              onWorkBlock={performWorkBlock}
              onResolveAlert={resolveWorkAlert}
            />
          ) : (
            <>
              <section className="panel-card next-task-card">
                <span className="section-kicker">NEXT TASK</span>
                <h2>강아지의 다음 신호를 함께 읽어 보세요.</h2>
                <button
                  className="primary-action"
                  type="button"
                  disabled={ended || missionBlocked}
                  onClick={startMission}
                >
                  다음 생활 미션 시작
                </button>
                {missionBlocked && (
                  <p>진행 중인 업무 블록을 먼저 마쳐 주세요.</p>
                )}
              </section>

              <WorkPanel
                work={view.work}
                feedback={workFeedback}
                disabled={ended}
                onMoveToComputer={moveToComputer}
                onWorkBlock={performWorkBlock}
                onResolveAlert={resolveWorkAlert}
              />

              <ControlPanel
                blocked={view.blocked}
                disabled={controlsDisabled}
                feedback={secondaryFeedback}
                onWalk={handleWalk}
                onWater={handleWater}
                onCleanup={handleCleanup}
              />
            </>
          )}
        </aside>
      </div>

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
          onStartMission={startMission}
          onPurchase={purchaseItem}
          onUse={useItem}
          onPlace={placeItem}
          onClinic={scheduleClinic}
          onUpgrade={buyUpgrade}
        />
      )}
    </main>
  );
}
