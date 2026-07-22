import { useEffect, useRef, useState } from "react";
import { CampaignEnd } from "./components/CampaignEnd";
import { ControlPanel } from "./components/ControlPanel";
import { DayReview } from "./components/DayReview";
import { HouseCanvas } from "./components/HouseCanvas";
import { MorningPlan } from "./components/MorningPlan";
import { ObservationPanel } from "./components/ObservationPanel";
import { TopBar, type GameSpeed } from "./components/TopBar";
import { BALANCE } from "./constants/balance";
import {
  createCampaignSettings,
  createOwnerResources,
  curriculumTip,
  generateDaySchedule,
  loadProfile,
  saveProfile,
  updateOwnerResources,
  type CampaignPhase,
  type CampaignScheduleItem,
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
  type WaitdogUiSim,
  type WaitdogUiView,
} from "./services/waitdogSim";
import type { InterventionKind, InterventionResult, RoomId } from "./types";

const SIMULATION_SEED = 20260722;
const DAY_END_MINUTE = 23 * 60;
const GAME_MINUTES_PER_SECOND = 2;
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
    try {
      sim.restore(loaded.profile.simSnapshot);
      if (loaded.profile.settings.morningSnapshot !== null) {
        const morningValidator = createSim(loaded.profile.settings.seed);
        morningValidator.restore(loaded.profile.settings.morningSnapshot);
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
      settings: loaded.profile.settings,
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

  const phaseRef = useRef(phase);
  const settingsRef = useRef(settings);
  const resourcesRef = useRef(resources);
  const ownerAwayRef = useRef(ownerAway);
  const messageIdRef = useRef(initial.storageMessage ? 1 : 0);
  const storageNoticeRef = useRef(initial.storageMessage !== null);
  phaseRef.current = phase;
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
  const liveSchedule = settings.daySchedule;
  const activeFocusSchedule = activeScheduleAt(
    liveSchedule,
    view.minuteOfDay,
    (item) => item.focusLock &&
      !settings.interruptedScheduleIds.includes(item.id),
  );

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

  const commitResources = (delta: Partial<OwnerResources>) => {
    const next = updateOwnerResources(resourcesRef.current, delta);
    resourcesRef.current = next;
    setResources(next);
  };

  const commitPhase = (next: CampaignPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const commitSpeed = (next: GameSpeed) => {
    setSpeed(next);
    commitSettings({ ...settingsRef.current, speed: next });
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
    setSpeed(0);
    setView(nextView);
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

  useEffect(() => {
    if (view.visibility === "seen" && view.room !== null) {
      setLastSeenRoom(view.room);
    }
  }, [view.room, view.visibility]);

  useEffect(() => {
    if (phase !== "live" || speed === 0 || ended) return;
    const intervalId = window.setInterval(() => {
      const currentSim = simRef.current;
      let next = currentSim.getDogView();
      const previousPoopRevision = next.poopRevision;
      const ticks = GAME_MINUTES_PER_SECOND * speed;
      for (let minute = 0; minute < ticks; minute += 1) {
        currentSim.advanceMinutes(1);
        next = syncAutomation();
        if (next.poopRevision !== previousPoopRevision) {
          commitSpeed(1);
          break;
        }
        if (next.minuteOfDay >= DAY_END_MINUTE) break;
      }
      setView(next);
      if (next.minuteOfDay >= DAY_END_MINUTE) enterReview(next);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [ended, phase, speed]);

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
    const previousPoopRevision = currentSim.getDogView().poopRevision;
    const result = command();
    const next = resync ? syncAutomation() : currentSim.getDogView();
    setView(next);
    if (next.poopRevision !== previousPoopRevision) commitSpeed(1);
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

  const handleIntervention = (kind: InterventionKind, label: string) => {
    if (ownerAwayRef.current) return;
    commitResources({
      energy: -BALANCE.W3.COST.INTERVENTION_ENERGY,
      focus: -BALANCE.W3.COST.INTERVENTION_FOCUS,
    });
    const result: InterventionResult = runCommand(
      () => simRef.current.intervene(kind),
      kind === "cleanup",
    );
    if (result.interrupted) {
      appendMessage(`${label}: 집중 업무 중 개입이 끼어들었습니다.`);
    } else if (result.success) {
      appendMessage(`${label} 개입에 강아지가 반응했습니다.`);
    } else {
      appendMessage(`${label} 개입에는 아직 반응이 없습니다.`);
    }
  };

  const handleStartDay = () => {
    const currentSettings = settingsRef.current;
    commitSettings({
      ...currentSettings,
      speed: currentSettings.speed === 0 ? 1 : currentSettings.speed,
      daySchedule: proposedSchedule,
      interruptedScheduleIds: [],
      morningSnapshot: simRef.current.serialize(),
      filteredObservations: [],
    });
    if (speed === 0) setSpeed(1);
    commitPhase("live");
    setView(syncAutomation());
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
    setView(next);
    setSpeed(1);
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: simRef.current.serialize(),
      filteredObservations: [],
    });
    commitPhase("morning");
  };

  const handleInfinite = () => {
    simRef.current.newDay();
    const next = simRef.current.getDogView();
    ownerAwayRef.current = false;
    setOwnerAway(false);
    setView(next);
    setSpeed(1);
    commitSettings({
      ...settingsRef.current,
      speed: 1,
      infinite: true,
      interruptedScheduleIds: [],
      daySchedule: [],
      morningSnapshot: simRef.current.serialize(),
      filteredObservations: [],
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
    setSettings(nextSettings);
    setResources(nextResources);
    setHypotheses([]);
    setOwnerAway(false);
    setLastSeenRoom("living");
    setInterventionMessages([]);
    setSpeed(1);
    setView(nextSim.getDogView());
    commitPhase("morning");
  };

  if (phase === "morning") {
    return (
      <MorningPlan
        day={view.day}
        schedule={proposedSchedule}
        prediction={morningPrediction}
        tip={curriculumTip(view.day, settings.infinite)}
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
        guide={view.day === 1 && !settings.infinite ? "오늘은 지켜보세요" : null}
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
          <ObservationPanel
            view={view}
            interventionMessages={interventionMessages}
          />
          <ControlPanel
            blocked={view.blocked}
            focusLocked={view.owner.focusLocked}
            away={ownerAway}
            disabled={ended}
            onIntervene={handleIntervention}
            onInterruptWork={handleInterruptWork}
            onWalk={() => {
              if (ownerAwayRef.current) return;
              commitResources({ energy: -BALANCE.W3.COST.WALK_ENERGY });
              runCommand(() => simRef.current.walk(30), true);
            }}
            onFeed={() => runCommand(() => simRef.current.feed(70))}
            onWater={() => runCommand(() => simRef.current.water())}
          />
        </aside>
      </div>
    </main>
  );
}
