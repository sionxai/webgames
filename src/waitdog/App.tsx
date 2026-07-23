import { useEffect, useRef, useState } from "react";
import { CampaignEnd } from "./components/CampaignEnd";
import { ControlPanel } from "./components/ControlPanel";
import { DayReview } from "./components/DayReview";
import { HouseCanvas } from "./components/HouseCanvas";
import { MorningPlan } from "./components/MorningPlan";
import { ObservationPanel } from "./components/ObservationPanel";
import { TopBar, type GameSpeed } from "./components/TopBar";
import { TrainingPanel } from "./components/TrainingPanel";
import { BALANCE } from "./constants/balance";
import {
  createCampaignSettings,
  createOwnerResources,
  createTrainingProgress,
  curriculumTip,
  generateDaySchedule,
  loadProfile,
  recommendedTrainingGoal,
  saveProfile,
  updateOwnerResources,
  type CampaignPhase,
  type CampaignScheduleItem,
  type CampaignSettings,
  type Hypothesis,
  type OwnerResources,
  type TrainingGoalId,
  type TrainingProgress,
} from "./services/campaign";
import {
  buildCampaignOutcomes,
  buildDayNarrative,
} from "./services/narrative";
import {
  createSim,
  type WaitdogSnapshot,
  type WaitdogUiSim,
  type WaitdogUiView,
} from "./services/waitdogSim";
import type { InterventionKind, InterventionResult, RoomId } from "./types";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const SIMULATION_SEED = 20260722;
const DAY_END_MINUTE = 23 * 60;
const GAME_MINUTES_PER_SECOND = 2;
const SMART_SKIP_LIMIT = 180;
const STORAGE_LOAD_MESSAGE =
  "저장 기능에 문제가 있어 이번 진행을 안전하게 새로 시작했습니다.";
const STORAGE_SAVE_MESSAGE =
  "저장 공간에 기록하지 못했습니다. 현재 화면의 진행은 계속됩니다.";

interface InterventionMessage {
  id: number;
  text: string;
}

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
  reason: "opportunity" | "schedule" | "dayEnd" | "limit";
}

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

const bootstrap = (): BootstrapState => {
  if (typeof window === "undefined") return freshBootstrap(null);
  try {
    const loaded = loadProfile(window.localStorage);
    if (!loaded.ok) return freshBootstrap(STORAGE_LOAD_MESSAGE);
    if (loaded.profile === null) return freshBootstrap(null);
    const sim = createSim(loaded.profile.settings.seed);
    let settings = loaded.profile.settings;
    try {
      sim.restore(loaded.profile.simSnapshot);
      if (settings.morningSnapshot !== null) {
        const morningValidator = createSim(settings.seed);
        morningValidator.restore(settings.morningSnapshot);
        settings = {
          ...settings,
          morningSnapshot: morningValidator.serialize(),
        };
      }
    } catch {
      return freshBootstrap(STORAGE_LOAD_MESSAGE);
    }
    if (sim.getDogView().day !== loaded.profile.day) {
      return freshBootstrap(STORAGE_LOAD_MESSAGE);
    }
    if (loaded.profile.phase === "live" && settings.training === null) {
      settings = {
        ...settings,
        training: createTrainingProgress(
          loaded.profile.day,
          recommendedTrainingGoal(loaded.profile.day),
        ),
      };
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

const activeScheduleAt = (
  schedule: readonly CampaignScheduleItem[],
  minuteOfDay: number,
  predicate: (item: CampaignScheduleItem) => boolean,
): CampaignScheduleItem | null =>
  schedule.find((item) =>
    predicate(item) && item.startMinute <= minuteOfDay &&
    minuteOfDay < item.endMinute
  ) ?? null;

const visibleOpportunityRevision = (view: WaitdogUiView): number =>
  typeof view.opportunityRevision === "number"
    ? view.opportunityRevision
    : view.poopRevision;

const hasFeedForDay = (snapshot: WaitdogSnapshot): boolean => {
  const dayStart = (snapshot.day - 1) * 1440;
  const dayEnd = dayStart + 1440;
  return snapshot.log.some((event) =>
    event.type === "feed" && event.t >= dayStart && event.t < dayEnd
  );
};

const interventionResourceReason = (
  resources: OwnerResources,
): string | null => {
  const missing: string[] = [];
  if (resources.energy < BALANCE.W3.COST.INTERVENTION_ENERGY) {
    missing.push(`에너지 ${BALANCE.W3.COST.INTERVENTION_ENERGY}`);
  }
  if (resources.focus < BALANCE.W3.COST.INTERVENTION_FOCUS) {
    missing.push(`집중 ${BALANCE.W3.COST.INTERVENTION_FOCUS}`);
  }
  return missing.length === 0
    ? null
    : `개입하려면 ${missing.join("·")} 이상이 필요합니다.`;
};

const walkResourceReason = (resources: OwnerResources): string | null =>
  resources.energy < BALANCE.W3.COST.WALK_ENERGY
    ? `산책하려면 에너지 ${BALANCE.W3.COST.WALK_ENERGY} 이상이 필요합니다.`
    : null;

const completeTrainingRepetition = (
  progress: TrainingProgress,
  feedback: string,
): TrainingProgress => {
  const completed = Math.min(progress.target, progress.completed + 1);
  return {
    ...progress,
    completed,
    streak: progress.streak + 1,
    stage: completed >= progress.target ? "complete" : "watch",
    lastCueAt: null,
    feedback: completed >= progress.target
      ? `${feedback} 오늘 목표를 모두 달성했습니다!`
      : `${feedback} 다음 신호를 기다려 보세요.`,
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
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(initial.hypotheses);
  const [settings, setSettings] = useState<CampaignSettings>(initial.settings);
  const [ownerAway, setOwnerAway] = useState(
    () => initial.sim.serialize().owner.away,
  );
  const [lastSeenRoom, setLastSeenRoom] = useState<RoomId | null>(
    view.visibility === "seen" ? view.room : null,
  );
  const [interventionMessages, setInterventionMessages] = useState<
    InterventionMessage[]
  >(() => initial.storageMessage
    ? [{ id: 1, text: initial.storageMessage }]
    : []);
  const [skipping, setSkipping] = useState(false);

  const phaseRef = useRef(phase);
  const viewRef = useRef(view);
  const speedRef = useRef(speed);
  const settingsRef = useRef(settings);
  const resourcesRef = useRef(resources);
  const ownerAwayRef = useRef(ownerAway);
  const skippingRef = useRef(false);
  const externalClockRef = useRef(false);
  const automationRemainderRef = useRef(0);
  const messageIdRef = useRef(initial.storageMessage ? 1 : 0);
  const storageNoticeRef = useRef(initial.storageMessage !== null);
  phaseRef.current = phase;
  viewRef.current = view;
  speedRef.current = speed;
  settingsRef.current = settings;
  resourcesRef.current = resources;
  ownerAwayRef.current = ownerAway;

  const sim = simRef.current;
  const ended = view.minuteOfDay >= DAY_END_MINUTE;
  const morningPrediction = sim.predictPoopWindow();
  const proposedSchedule = generateDaySchedule(
    view.day,
    settings.seed,
    morningPrediction,
    settings.infinite,
  );
  const activeFocusSchedule = activeScheduleAt(
    settings.daySchedule,
    view.minuteOfDay,
    (item) => item.focusLock &&
      !settings.interruptedScheduleIds.includes(item.id),
  );
  const recommendedGoal = recommendedTrainingGoal(view.day);
  const morningTraining = settings.training?.day === view.day
    ? settings.training
    : createTrainingProgress(view.day, recommendedGoal);
  const liveTraining = settings.training?.day === view.day
    ? settings.training
    : morningTraining;
  const currentInterventionReason = interventionResourceReason(resources);
  const currentWalkReason = walkResourceReason(resources);
  const skipDisabledReason = ended
    ? "오늘 훈련 시간이 끝났습니다."
    : ownerAway
      ? "외출 중에는 훈련 기회를 관찰할 수 없습니다."
      : view.owner.focusLocked
        ? "집중 업무를 먼저 중단하거나 일정이 끝날 때까지 기다려 주세요."
        : liveTraining.stage === "complete"
          ? "오늘의 훈련 목표를 달성했습니다."
          : null;

  const appendMessage = (text: string) => {
    messageIdRef.current += 1;
    const message = { id: messageIdRef.current, text };
    setInterventionMessages((current) => [...current.slice(-5), message]);
  };

  const notifyStorageOnce = (text: string) => {
    if (storageNoticeRef.current) return;
    storageNoticeRef.current = true;
    appendMessage(text);
  };

  const commitSettings = (next: CampaignSettings) => {
    settingsRef.current = next;
    setSettings(next);
  };

  const commitTraining = (next: TrainingProgress) => {
    commitSettings({ ...settingsRef.current, training: next });
  };

  const commitResources = (delta: Partial<OwnerResources>) => {
    const next = updateOwnerResources(resourcesRef.current, delta);
    resourcesRef.current = next;
    setResources(next);
  };

  const commitPhase = (next: CampaignPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const commitView = (next: WaitdogUiView) => {
    viewRef.current = next;
    setView(next);
  };

  const commitSpeed = (next: GameSpeed) => {
    speedRef.current = next;
    setSpeed(next);
    commitSettings({ ...settingsRef.current, speed: next });
  };

  const expireTrainingAt = (absoluteMinute: number) => {
    const progress = settingsRef.current.training;
    if (
      progress === null || progress.stage !== "reward" ||
      progress.lastCueAt === null ||
      absoluteMinute - progress.lastCueAt <= 1
    ) return;
    commitTraining({
      ...progress,
      stage: "watch",
      streak: 0,
      lastCueAt: null,
      feedback: "보상 타이밍을 놓쳤습니다. 다음 신호부터 다시 시작해 보세요.",
    });
  };

  const markObservedOpportunity = (day: number) => {
    const progress = settingsRef.current.training;
    if (
      progress === null || progress.day !== day ||
      progress.stage !== "watch"
    ) return;
    commitTraining({
      ...progress,
      stage: "cue",
      feedback: "중요한 몸짓 신호를 포착했습니다. 지금 목표에 맞는 명령을 주세요.",
    });
  };

  const processViewTransition = (
    previous: WaitdogUiView,
    next: WaitdogUiView,
  ): boolean => {
    const opportunityChanged =
      visibleOpportunityRevision(next) !== visibleOpportunityRevision(previous);
    const followedCurrentSignal =
      previous.visibility === "heard" &&
      next.visibility === "seen" &&
      next.recentEvents.some((event) =>
        event.type === "sound" && event.t === next.t
      );
    expireTrainingAt(next.t);
    if (opportunityChanged && next.visibility === "seen") {
      markObservedOpportunity(next.day);
    } else if (followedCurrentSignal) {
      markObservedOpportunity(next.day);
    }
    if (opportunityChanged) {
      if (speedRef.current === 2 || speedRef.current === 4) commitSpeed(1);
    }
    return opportunityChanged;
  };

  const enterReview = (nextView: WaitdogUiView) => {
    if (phaseRef.current !== "live") return;
    expireTrainingAt(nextView.t);
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
    commitView(nextView);
    commitPhase("review");
  };

  const syncAutomation = (): WaitdogUiView => {
    const currentSim = simRef.current;
    const currentSettings = settingsRef.current;
    const current = currentSim.getDogView();
    const awayItem = activeScheduleAt(
      currentSettings.daySchedule,
      current.minuteOfDay,
      (item) => item.away,
    );
    const focusItem = activeScheduleAt(
      currentSettings.daySchedule,
      current.minuteOfDay,
      (item) => item.focusLock &&
        !currentSettings.interruptedScheduleIds.includes(item.id),
    );
    const nextAway = awayItem !== null;
    const nextFocus = focusItem !== null && !nextAway;
    if (
      current.owner.focusLocked !== nextFocus ||
      ownerAwayRef.current !== nextAway
    ) {
      currentSim.setOwner({
        room: current.owner.room,
        focusLocked: nextFocus,
        away: nextAway,
      });
    }
    ownerAwayRef.current = nextAway;
    setOwnerAway(nextAway);
    return currentSim.getDogView();
  };

  const advanceSimulation = (
    requestedMinutes: number,
    stopAtScheduleBoundary: boolean,
  ): AdvanceResult => {
    let next = simRef.current.getDogView();
    let minutes = 0;
    let reason: AdvanceResult["reason"] = "limit";
    for (let minute = 0; minute < requestedMinutes; minute += 1) {
      const previous = next;
      const wasAway = ownerAwayRef.current;
      const wasFocusLocked = previous.owner.focusLocked;
      simRef.current.advanceMinutes(1);
      next = syncAutomation();
      minutes += 1;
      const opportunityChanged = processViewTransition(previous, next);
      if (opportunityChanged) {
        reason = "opportunity";
        break;
      }
      if (next.minuteOfDay >= DAY_END_MINUTE) {
        reason = "dayEnd";
        break;
      }
      if (
        stopAtScheduleBoundary &&
        (wasAway !== ownerAwayRef.current ||
          wasFocusLocked !== next.owner.focusLocked)
      ) {
        reason = "schedule";
        break;
      }
    }
    commitView(next);
    if (next.minuteOfDay >= DAY_END_MINUTE) enterReview(next);
    return { minutes, reason };
  };

  useEffect(() => {
    if (view.visibility === "seen" && view.room !== null) {
      setLastSeenRoom(view.room);
    }
  }, [view.room, view.visibility]);

  useEffect(() => {
    if (phase !== "live" || speed === 0 || ended) return;
    const intervalId = window.setInterval(() => {
      if (externalClockRef.current) return;
      advanceSimulation(GAME_MINUTES_PER_SECOND * speedRef.current, false);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [ended, phase, speed]);

  useEffect(() => {
    const renderGameToText = () => {
      const currentView = viewRef.current;
      const currentResources = resourcesRef.current;
      const currentTraining = settingsRef.current.training;
      const interventionReason = interventionResourceReason(currentResources);
      const walkReason = walkResourceReason(currentResources);
      return JSON.stringify({
        mode: phaseRef.current,
        coordinateSystem:
          "dog.spatial uses room-normalized coordinates: origin top-left, x right, y down, range 0..1",
        day: currentView.day,
        time: {
          minuteOfDay: currentView.minuteOfDay,
          absoluteMinute: currentView.t,
        },
        speed: speedRef.current,
        dog: {
          visibility: currentView.visibility,
          room: currentView.room,
          action: currentView.action,
          spatial: currentView.spatial,
        },
        owner: {
          room: currentView.owner.room,
          focusLocked: currentView.owner.focusLocked,
          away: ownerAwayRef.current,
          resources: currentResources,
        },
        training: currentTraining,
        environment: {
          roomVisibility: currentView.roomVisibility,
          blocked: currentView.blocked,
          activePoop: currentView.activePoop,
        },
        controls: {
          intervention: {
            enabled: phaseRef.current === "live" &&
              !ownerAwayRef.current &&
              currentView.minuteOfDay < DAY_END_MINUTE &&
              interventionReason === null,
            reason: interventionReason,
          },
          walk: {
            enabled: phaseRef.current === "live" &&
              !ownerAwayRef.current &&
              currentView.minuteOfDay < DAY_END_MINUTE &&
              walkReason === null,
            reason: walkReason,
          },
          skipToOpportunity: {
            enabled: phaseRef.current === "live" &&
              !ownerAwayRef.current &&
              !currentView.owner.focusLocked &&
              currentView.minuteOfDay < DAY_END_MINUTE &&
              currentTraining?.stage !== "complete",
          },
        },
      });
    };

    const advanceTime = (ms: number) => {
      if (
        !Number.isFinite(ms) || ms <= 0 || phaseRef.current !== "live" ||
        speedRef.current === 0 ||
        viewRef.current.minuteOfDay >= DAY_END_MINUTE
      ) return;
      externalClockRef.current = true;
      automationRemainderRef.current +=
        ms * GAME_MINUTES_PER_SECOND * speedRef.current / 1000;
      const ticks = Math.floor(automationRemainderRef.current);
      if (ticks <= 0) return;
      automationRemainderRef.current -= ticks;
      const outcome = advanceSimulation(ticks, false);
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
    try {
      const result = saveProfile(window.localStorage, {
        day: view.day,
        phase,
        simSnapshot: simRef.current.serialize(),
        ownerResources: resources,
        hypotheses,
        settings,
      });
      if (!result.ok) notifyStorageOnce(STORAGE_SAVE_MESSAGE);
    } catch {
      notifyStorageOnce(STORAGE_SAVE_MESSAGE);
    }
  }, [hypotheses, phase, resources, settings, view]);

  const runCommand = <T,>(command: () => T, resync = false): T => {
    const currentSim = simRef.current;
    const previous = currentSim.getDogView();
    const result = command();
    const next = resync ? syncAutomation() : currentSim.getDogView();
    processViewTransition(previous, next);
    commitView(next);
    if (next.minuteOfDay >= DAY_END_MINUTE) enterReview(next);
    return result;
  };

  const handleRoomSelect = (room: RoomId) => {
    if (ownerAwayRef.current) return;
    runCommand(() => {
      const current = simRef.current.getDogView();
      simRef.current.setOwner({
        room,
        focusLocked: current.owner.focusLocked,
        away: false,
      });
    });
  };

  const handleInterruptWork = () => {
    const item = activeScheduleAt(
      settingsRef.current.daySchedule,
      simRef.current.getDogView().minuteOfDay,
      (candidate) => candidate.focusLock &&
        !settingsRef.current.interruptedScheduleIds.includes(candidate.id),
    );
    if (item === null) return;
    commitSettings({
      ...settingsRef.current,
      interruptedScheduleIds: [
        ...settingsRef.current.interruptedScheduleIds,
        item.id,
      ],
    });
    commitResources({
      workScore: -BALANCE.W3.COST.INTERRUPT_WORK_SCORE,
    });
    runCommand(() => {
      const current = simRef.current.getDogView();
      simRef.current.setOwner({
        room: current.owner.room,
        focusLocked: false,
        away: false,
      });
    });
    appendMessage("업무를 중단하고 즉시 관찰과 개입을 다시 시작했습니다.");
  };

  const updateTrainingForIntervention = (
    kind: InterventionKind,
    result: InterventionResult,
    now: number,
  ): string | null => {
    const progress = settingsRef.current.training;
    if (
      progress === null || progress.day !== viewRef.current.day ||
      progress.stage === "complete"
    ) return null;

    const validRecallReward = progress.goal === "recall" &&
      progress.stage === "reward" &&
      progress.lastCueAt !== null &&
      kind === "treat" &&
      now - progress.lastCueAt <= 1;
    if (validRecallReward) {
      const feedback = "부르기 성공 뒤 제때 간식을 주어 신뢰 훈련에 연결했습니다.";
      commitTraining(completeTrainingRepetition(progress, feedback));
      return feedback;
    }

    if (
      (kind === "praise" || kind === "treat") &&
      (result.attributedTo === "eatPoop" ||
        result.attributedTo === "watchOwner")
    ) {
      const feedback = result.attributedTo === "eatPoop"
        ? "주의: 보상이 배변 접근에 귀속됐습니다. 그 행동을 강화할 수 있어 연속 성공이 초기화됩니다."
        : "주의: 보상이 보호자 주시에 귀속됐습니다. 목표 행동 뒤에 보상해 주세요.";
      commitTraining({
        ...progress,
        stage: "watch",
        streak: 0,
        lastCueAt: null,
        feedback,
      });
      return feedback;
    }

    if (
      progress.goal === "mat" && progress.stage === "reward" &&
      (kind === "praise" || kind === "treat")
    ) {
      if (result.attributedTo === "moveToMat") {
        const feedback = "매트 이동 직후 보상이 정확히 귀속됐습니다.";
        commitTraining(completeTrainingRepetition(progress, feedback));
        return feedback;
      }
      const feedback = "매트 보상 타이밍이 어긋나 목표 행동에 귀속되지 않았습니다.";
      commitTraining({
        ...progress,
        stage: "watch",
        streak: 0,
        lastCueAt: null,
        feedback,
      });
      return feedback;
    }

    const matchingCommand =
      (progress.goal === "mat" && kind === "matCommand") ||
      (progress.goal === "recall" && kind === "calmCall") ||
      (progress.goal === "calm" && kind === "toyLure");
    if (!matchingCommand) return null;

    const attempts = progress.attempts + 1;
    if (progress.stage !== "cue") {
      const feedback = "관찰 가능한 몸짓 신호를 먼저 포착한 뒤 명령해 보세요.";
      commitTraining({
        ...progress,
        attempts,
        stage: "watch",
        streak: 0,
        lastCueAt: null,
        feedback,
      });
      return feedback;
    }
    if (!result.success) {
      const feedback = progress.goal === "mat"
        ? "매트 명령에 아직 반응하지 않았습니다. 다음 신호에서 다시 시도해 보세요."
        : progress.goal === "recall"
          ? "부르기에 돌아오지 않았습니다. 거리를 좁히고 차분히 다시 시도해 보세요."
          : "장난감으로 시선을 돌리지 못했습니다. 다음 신호를 기다려 보세요.";
      commitTraining({
        ...progress,
        attempts,
        stage: "watch",
        streak: 0,
        lastCueAt: null,
        feedback,
      });
      return feedback;
    }
    if (progress.goal === "calm") {
      const feedback = "장난감으로 시선을 안전하게 돌려 침착 전환에 성공했습니다.";
      commitTraining(completeTrainingRepetition(
        { ...progress, attempts },
        feedback,
      ));
      return feedback;
    }
    const feedback = progress.goal === "mat"
      ? "매트로 이동했습니다. 1게임분 안에 칭찬이나 간식을 주세요."
      : "차분한 부르기에 돌아왔습니다. 1게임분 안에 간식을 주세요.";
    commitTraining({
      ...progress,
      attempts,
      stage: "reward",
      lastCueAt: now,
      feedback,
    });
    return feedback;
  };

  const interventionMessage = (
    kind: InterventionKind,
    label: string,
    result: InterventionResult,
    trainingFeedback: string | null,
  ): string => {
    if (trainingFeedback !== null) return trainingFeedback;
    const interruption = result.interrupted ? " 집중 업무를 끊고 실행했습니다." : "";
    if (kind === "matCommand") {
      return result.success
        ? `매트 명령 성공: 강아지가 매트로 이동했습니다.${interruption}`
        : `매트 명령 실패: 아직 매트로 이동하지 않았습니다.${interruption}`;
    }
    if (kind === "calmCall") {
      return result.success
        ? `부르기 성공: 강아지가 보호자에게 돌아왔습니다.${interruption}`
        : `부르기 실패: 강아지가 아직 돌아오지 않았습니다.${interruption}`;
    }
    if (kind === "praise" || kind === "treat") {
      if (result.attributedTo === "moveToMat") {
        return `정확한 보상: 매트 이동에 보상이 귀속됐습니다.${interruption}`;
      }
      if (result.attributedTo === "eatPoop") {
        return `주의: 보상이 배변 접근 행동에 귀속됐습니다.${interruption}`;
      }
      if (result.attributedTo === "watchOwner") {
        return `주의: 보상이 보호자 주시에 귀속됐습니다.${interruption}`;
      }
      return `보상할 최근 목표 행동이 없어 학습에 귀속되지 않았습니다.${interruption}`;
    }
    if (kind === "toyLure") {
      return result.success
        ? `침착 전환 성공: 장난감으로 시선을 돌렸습니다.${interruption}`
        : `침착 전환 실패: 장난감에 아직 반응하지 않았습니다.${interruption}`;
    }
    return result.success
      ? `${label} 개입을 실행했습니다.${interruption}`
      : `${label} 개입 조건이 맞지 않아 변화가 없었습니다.${interruption}`;
  };

  const handleIntervention = (kind: InterventionKind, label: string) => {
    if (ownerAwayRef.current) {
      appendMessage("보호자 외출 중에는 개입할 수 없습니다.");
      return;
    }
    if (viewRef.current.minuteOfDay >= DAY_END_MINUTE) {
      appendMessage("오늘 일정이 끝나 개입할 수 없습니다.");
      return;
    }
    const resourceReason = interventionResourceReason(resourcesRef.current);
    if (resourceReason !== null) {
      appendMessage(resourceReason);
      return;
    }
    commitResources({
      energy: -BALANCE.W3.COST.INTERVENTION_ENERGY,
      focus: -BALANCE.W3.COST.INTERVENTION_FOCUS,
    });
    const result: InterventionResult = runCommand(
      () => simRef.current.intervene(kind),
      kind === "cleanup",
    );
    const trainingFeedback = updateTrainingForIntervention(
      kind,
      result,
      simRef.current.getDogView().t,
    );
    appendMessage(interventionMessage(kind, label, result, trainingFeedback));
  };

  const handleWalk = () => {
    if (ownerAwayRef.current) {
      appendMessage("보호자 외출 중에는 산책을 시작할 수 없습니다.");
      return;
    }
    if (viewRef.current.minuteOfDay >= DAY_END_MINUTE) {
      appendMessage("오늘 일정이 끝나 산책을 시작할 수 없습니다.");
      return;
    }
    const resourceReason = walkResourceReason(resourcesRef.current);
    if (resourceReason !== null) {
      appendMessage(resourceReason);
      return;
    }
    commitResources({ energy: -BALANCE.W3.COST.WALK_ENERGY });
    runCommand(() => simRef.current.walk(30), true);
    appendMessage("산책 30분을 마쳐 긴장과 지루함을 낮췄습니다.");
  };

  const handleGoalChange = (goal: TrainingGoalId) => {
    commitTraining(createTrainingProgress(viewRef.current.day, goal));
  };

  const handleStartDay = () => {
    const currentSettings = settingsRef.current;
    const currentSnapshot = simRef.current.serialize();
    if (!hasFeedForDay(currentSnapshot)) {
      simRef.current.feed(70);
      appendMessage("아침 급식 70을 한 번 제공했습니다.");
    }
    const training = currentSettings.training?.day === viewRef.current.day
      ? currentSettings.training
      : createTrainingProgress(
        viewRef.current.day,
        recommendedTrainingGoal(viewRef.current.day),
      );
    const nextSpeed = currentSettings.speed === 0 ? 1 : currentSettings.speed;
    speedRef.current = nextSpeed;
    setSpeed(nextSpeed);
    commitSettings({
      ...currentSettings,
      speed: nextSpeed,
      daySchedule: proposedSchedule,
      interruptedScheduleIds: [],
      morningSnapshot: simRef.current.serialize(),
      filteredObservations: [],
      training,
    });
    commitPhase("live");
    commitView(syncAutomation());
  };

  const handleSkipToOpportunity = () => {
    if (skippingRef.current || skipDisabledReason !== null) return;
    skippingRef.current = true;
    setSkipping(true);
    try {
      const outcome = advanceSimulation(SMART_SKIP_LIMIT, true);
      const message = outcome.reason === "opportunity"
        ? `${outcome.minutes}게임분 뒤 중요한 소리나 몸짓 신호를 감지해 멈췄습니다.`
        : outcome.reason === "schedule"
          ? `${outcome.minutes}게임분 뒤 보호자 일정이 바뀌어 멈췄습니다.`
          : outcome.reason === "dayEnd"
            ? `${outcome.minutes}게임분 뒤 하루가 끝났습니다.`
            : `${SMART_SKIP_LIMIT}게임분 동안 새 훈련 신호가 없어 현재 시각에서 멈췄습니다.`;
      appendMessage(message);
    } finally {
      skippingRef.current = false;
      setSkipping(false);
    }
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
    ownerAwayRef.current = false;
    setOwnerAway(false);
    commitView(next);
    speedRef.current = 1;
    setSpeed(1);
    automationRemainderRef.current = 0;
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: null,
      filteredObservations: [],
      training: null,
    });
    commitPhase("morning");
  };

  const handleInfinite = () => {
    simRef.current.newDay();
    const next = simRef.current.getDogView();
    ownerAwayRef.current = false;
    setOwnerAway(false);
    commitView(next);
    speedRef.current = 1;
    setSpeed(1);
    automationRemainderRef.current = 0;
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      infinite: true,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: null,
      filteredObservations: [],
      training: null,
    });
    commitPhase("morning");
  };

  const handleNewCampaign = () => {
    const nextSim = createSim(SIMULATION_SEED);
    simRef.current = nextSim;
    const nextSettings = createCampaignSettings(SIMULATION_SEED);
    const nextResources = createOwnerResources();
    settingsRef.current = nextSettings;
    resourcesRef.current = nextResources;
    ownerAwayRef.current = false;
    speedRef.current = 1;
    automationRemainderRef.current = 0;
    setSettings(nextSettings);
    setResources(nextResources);
    setHypotheses([]);
    setOwnerAway(false);
    setLastSeenRoom("living");
    setInterventionMessages([]);
    setSpeed(1);
    commitView(nextSim.getDogView());
    commitPhase("morning");
  };

  if (phase === "morning") {
    return (
      <MorningPlan
        day={view.day}
        schedule={proposedSchedule}
        prediction={morningPrediction}
        tip={curriculumTip(view.day, settings.infinite)}
        selectedGoal={morningTraining.goal}
        recommendedGoal={recommendedGoal}
        onGoalChange={handleGoalChange}
        onStart={handleStartDay}
      />
    );
  }

  const morning = settings.morningSnapshot ?? sim.serialize();
  const narrative = buildDayNarrative(morning, sim.serialize());
  if (phase === "review") {
    return (
      <DayReview
        day={view.day}
        narrative={narrative}
        selectedHypothesis={view.day === 5 ? hypotheses[0] ?? null : null}
        onHypothesis={handleHypothesis}
        onContinue={handleReviewContinue}
      />
    );
  }

  if (phase === "campaignEnd") {
    return (
      <CampaignEnd
        outcomes={buildCampaignOutcomes(settings.daySummaries)}
        onInfinite={handleInfinite}
        onNewCampaign={handleNewCampaign}
      />
    );
  }

  return (
    <main className="waitdog-page">
      <TopBar
        day={view.day}
        minuteOfDay={view.minuteOfDay}
        speed={speed}
        ownerRoom={view.owner.room}
        focusLocked={view.owner.focusLocked}
        away={ownerAway}
        resources={resources}
        guide={view.day === 1 && !settings.infinite ? "오늘은 몸짓 신호를 찾아보세요" : null}
        ended={ended}
        onSpeedChange={commitSpeed}
      />

      <div className="game-layout">
        <HouseCanvas
          view={view}
          lastSeenRoom={lastSeenRoom}
          ownerAway={ownerAway}
          disabled={ownerAway || ended}
          onRoomSelect={handleRoomSelect}
        />
        <aside className="side-panels">
          <TrainingPanel
            progress={liveTraining}
            view={view}
            skipping={skipping}
            skipDisabledReason={skipDisabledReason}
            onSkip={handleSkipToOpportunity}
          />
          <ObservationPanel
            view={view}
            interventionMessages={interventionMessages}
          />
          <ControlPanel
            blocked={view.blocked}
            focusLocked={view.owner.focusLocked}
            away={ownerAway}
            disabled={ended}
            interventionDisabledReason={currentInterventionReason}
            walkDisabledReason={currentWalkReason}
            onIntervene={handleIntervention}
            onInterruptWork={handleInterruptWork}
            onWalk={handleWalk}
            onFeed={() => runCommand(() => simRef.current.feed(70))}
            onWater={() => runCommand(() => simRef.current.water())}
          />
        </aside>
      </div>

      {activeFocusSchedule && (
        <p className="live-banner" role="status">
          {activeFocusSchedule.title} 진행 중 · 업무를 중단하면 업무 성과가 감소합니다.
        </p>
      )}
    </main>
  );
}
