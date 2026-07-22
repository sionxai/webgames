import { BALANCE } from "../src/waitdog/constants/balance";
import {
  createCampaignSettings,
  createOwnerResources,
  generateDaySchedule,
  loadProfile,
  saveProfile,
  updateOwnerResources,
  WAITDOG_PROFILE_KEY,
  type StorageAdapter,
  type WaitdogProfile,
} from "../src/waitdog/services/campaign";
import {
  buildDayNarrative,
  filteredTimeline,
} from "../src/waitdog/services/narrative";
import {
  createSim,
  type WaitdogSnapshot,
} from "../src/waitdog/services/waitdogSim";
import type {
  DecisionTrace,
  EventLog,
  WaitdogFullState,
  WaitdogSim,
} from "../src/waitdog/types";

let assertionCount = 0;

type ContractAssert = (
  condition: unknown,
  message: string,
) => asserts condition;

const assert: ContractAssert = (condition, message) => {
  if (!condition) {
    throw new Error(`CONTRACT FAIL: ${message}`);
  }
  assertionCount += 1;
};

const poopEvent = (sim: WaitdogSim, maxMinutes = 400): EventLog => {
  const priorPoops =
    sim.getLog().filter((event) => event.type === "poop").length;
  for (let minute = 0; minute < maxMinutes; minute += 1) {
    sim.advanceMinutes(1);
    const poops = sim.getLog().filter((event) => event.type === "poop");
    if (poops.length > priorPoops) {
      return poops[poops.length - 1];
    }
  }
  throw new Error("CONTRACT FAIL: expected a causal poop event");
};

const decisionAt = (sim: WaitdogSim, t: number): DecisionTrace => {
  const event = sim
    .getLog()
    .find((entry) => entry.type === "decision" && entry.t === t);
  if (!event) {
    throw new Error(`CONTRACT FAIL: missing decision at ${t}`);
  }
  return event.detail as unknown as DecisionTrace;
};

const eatScore = (decision: DecisionTrace): number => {
  const utility = decision.utilities.find((candidate) =>
    candidate.action === "eatPoop"
  );
  if (!utility) {
    throw new Error("CONTRACT FAIL: missing eatPoop utility");
  }
  return utility.score;
};

const finishPoop = (sim: WaitdogSim): void => {
  sim.advanceMinutes(BALANCE.DIGESTION.EAT_DELAY_MINUTES);
  if (sim.getFullState().activePoop !== null) {
    sim.intervene("cleanup");
  }
};

const traceForSeed = (seed: number): EventLog[] => {
  const sim = createSim(seed);
  sim.advanceMinutes(30);
  sim.feed(100);
  sim.advanceMinutes(360);
  return sim.getLog();
};

const deterministicA = traceForSeed(991);
const deterministicB = traceForSeed(991);
const deterministicOther = traceForSeed(992);
assert(
  JSON.stringify(deterministicA) === JSON.stringify(deterministicB),
  "same seed trace differs",
);
assert(
  JSON.stringify(deterministicA) !== JSON.stringify(deterministicOther),
  "different seed trace matches",
);
assert(
  deterministicA.some((event) => event.type === "decision"),
  "deterministic trace lacks decision",
);

const causal = createSim(301);
causal.advanceMinutes(30);
const fedAt = causal.getFullState().absoluteMinute;
causal.feed(100);
const causalPoop = poopEvent(causal, 360);
const feedToPoop = causalPoop.t - fedAt;
const causalSignals = causal
  .getLog()
  .filter((event) => ["sniffFloor", "circle", "wander"].includes(event.type));
assert(feedToPoop >= 180, "poop occurred before +180 minutes");
assert(feedToPoop <= 360, "poop occurred after +360 minutes");
assert(causalSignals.length >= 2, "fewer than two pre-poop signals");
assert(
  causalSignals.every((event) =>
    causalPoop.t - event.t >= 10 && causalPoop.t - event.t <= 25
  ),
  "pre-poop signal outside the 10-25 minute window",
);
assert(
  causalSignals.every((event) => event.t < causalPoop.t),
  "signal was not before poop",
);

const cleanupStartedAt = causal.getFullState().absoluteMinute;
const cleanupCompleteBefore =
  causal.getLog().filter((event) => event.type === "cleanupComplete").length;
const cleanupResult = causal.intervene("cleanup");
const cleanupState = causal.getFullState();
assert(cleanupResult.success, "cleanup with active poop failed");
assert(
  cleanupState.absoluteMinute ===
    cleanupStartedAt + BALANCE.TIME.CLEANUP_MINUTES,
  "successful cleanup did not consume exactly two minutes",
);
assert(cleanupState.activePoop === null, "cleanup left active poop");
assert(
  causal.getLog().filter((event) => event.type === "cleanupComplete").length ===
    cleanupCompleteBefore + 1,
  "successful cleanup did not emit one completion event",
);
assert(
  causal.getLog().some((event) =>
    event.type === "intervention" && event.t === cleanupStartedAt &&
    event.detail.kind === "cleanup"
  ),
  "cleanup intervention was not recorded at its start time",
);
const failedCleanupStartedAt = causal.getFullState().absoluteMinute;
assert(!causal.intervene("cleanup").success, "cleanup without poop succeeded");
assert(
  causal.getFullState().absoluteMinute === failedCleanupStartedAt,
  "failed cleanup consumed time",
);

const lateCleanup = createSim(302);
lateCleanup.intervene("block");
lateCleanup.feed(100);
poopEvent(lateCleanup, 360);
lateCleanup.advanceMinutes(BALANCE.TIME.ACTIVE_MINUTES);
const lateCleanupBefore = lateCleanup.getFullState();
const lateCleanupResult = lateCleanup.intervene("cleanup");
const lateCleanupAfter = lateCleanup.getFullState();
assert(!lateCleanupResult.success, "day-end cleanup unexpectedly succeeded");
assert(
  lateCleanupAfter.absoluteMinute === lateCleanupBefore.absoluteMinute &&
    lateCleanupAfter.minuteOfDay === lateCleanupBefore.minuteOfDay,
  "failed day-end cleanup changed a clock",
);
assert(
  lateCleanupAfter.activePoop !== null,
  "failed day-end cleanup removed poop",
);
assert(
  lateCleanupAfter.currentAction === lateCleanupBefore.currentAction,
  "failed day-end cleanup changed the pending action",
);
assert(
  JSON.stringify(lateCleanupAfter.memory) ===
    JSON.stringify(lateCleanupBefore.memory),
  "failed day-end cleanup changed learning",
);
assert(
  lateCleanupAfter.absoluteMinute ===
    (lateCleanupAfter.day - 1) * BALANCE.TIME.DAY_LENGTH +
      lateCleanupAfter.minuteOfDay,
  "day-end cleanup broke absolute/minute clock consistency",
);

const partialMeal = createSim(17);
const partialFedAt = partialMeal.getFullState().absoluteMinute;
partialMeal.feed(70);
const partialPoop = poopEvent(partialMeal, 360);
const partialSignals = partialMeal.getLog().filter((event) =>
  ["sniffFloor", "circle", "wander"].includes(event.type)
);
assert(
  partialPoop.t - partialFedAt >= 180,
  "70-volume meal pooped before +180",
);
assert(partialPoop.t - partialFedAt <= 360, "70-volume meal pooped after +360");
assert(
  partialSignals.length === 3,
  "70-volume meal did not emit exactly three signals",
);
assert(
  partialSignals.every((event) =>
    partialPoop.t - event.t >= 10 && partialPoop.t - event.t <= 25
  ),
  "70-volume meal emitted a stray signal",
);
partialMeal.advanceMinutes(BALANCE.TIME.ACTIVE_MINUTES);
assert(
  partialMeal.getLog().filter((event) => event.type === "poop").length === 1,
  "70-volume full-day run produced an unexpected poop count",
);
assert(
  partialMeal.getLog().filter((event) =>
    ["sniffFloor", "circle", "wander"].includes(event.type)
  ).length === partialSignals.length,
  "70-volume full-day run emitted signals after its poop",
);
partialMeal.newDay();
partialMeal.feed(20);
partialMeal.advanceMinutes(360);
assert(
  partialMeal.getLog().filter((event) =>
    ["sniffFloor", "circle", "wander"].includes(event.type)
  ).length === partialSignals.length,
  "next-day small feed caused a past-cycle stray signal",
);

let predictionHits = 0;
let predictionPoops = 0;
for (let seed = 1; seed <= 20; seed += 1) {
  const sim = createSim(seed);
  sim.advanceMinutes(30);
  sim.feed(100);
  const prediction = sim.predictPoopWindow();
  const actual = poopEvent(sim, 360);
  predictionPoops += 1;
  if (actual.t >= prediction.start && actual.t <= prediction.end) {
    predictionHits += 1;
  }
  assert(
    prediction.confidence >= 0 && prediction.confidence <= 100,
    `prediction confidence ${seed}`,
  );
}
assert(predictionPoops === 20, "prediction cohort did not produce 20 poops");
assert(
  predictionHits / predictionPoops >= 0.7,
  "prediction coverage below 70%",
);

interface FiveDayResult {
  state: WaitdogFullState;
  scores: number[];
}

const fiveScoldDays = (seed: number, scold: boolean): FiveDayResult => {
  const sim = createSim(seed);
  const scores: number[] = [];
  for (let day = 1; day <= 5; day += 1) {
    sim.feed(100);
    const poop = poopEvent(sim);
    scores.push(eatScore(decisionAt(sim, poop.t)));
    if (scold) {
      sim.intervene("scold");
    }
    finishPoop(sim);
    if (day < 5) {
      sim.newDay();
    }
  }
  return { state: sim.getFullState(), scores };
};

const scoldBaseline = fiveScoldDays(777, false);
const scoldRepeated = fiveScoldDays(777, true);
assert(
  scoldRepeated.state.memory.snatchExpectation >
    scoldBaseline.state.memory.snatchExpectation,
  "scold did not raise snatchExpectation",
);
assert(
  scoldRepeated.state.memory.hiddenPoopTendency >
    scoldBaseline.state.memory.hiddenPoopTendency,
  "scold did not raise hiddenPoopTendency",
);
assert(
  scoldRepeated.state.memory.approachSafety <
    scoldBaseline.state.memory.approachSafety,
  "scold did not lower approachSafety",
);
assert(
  scoldRepeated.scores[4] > scoldRepeated.scores[0],
  "day5 eatPoop score did not exceed day1",
);
assert(scoldRepeated.scores.length === 5, "scold scenario was not five days");

interface MatTrainingResult {
  sim: WaitdogSim;
  rewards: number;
}

const trainLivingMat = (seed: number): MatTrainingResult => {
  const sim = createSim(seed);
  let rewards = 0;
  for (let day = 1; day <= 5; day += 1) {
    sim.setOwner({ room: "living", focusLocked: false });
    sim.feed(100);
    poopEvent(sim);
    for (
      let call = 0;
      sim.getFullState().dogRoom !== "living" && call < 12;
      call += 1
    ) {
      sim.intervene("calmCall");
    }
    let matSuccess = false;
    for (let attempt = 0; !matSuccess && attempt < 12; attempt += 1) {
      matSuccess = sim.intervene("matCommand").success;
    }
    if (matSuccess) {
      const reward = sim.intervene("treat");
      if (reward.attributedTo === "moveToMat") {
        rewards += 1;
      }
    }
    sim.intervene("cleanup");
    if (day < 5) {
      sim.newDay();
    }
  }
  return { sim, rewards };
};

let daySixMoveToMat = 0;
let trainedCoproTotal = 0;
let matRewardTotal = 0;
const trainedStates: WaitdogFullState[] = [];
for (let trial = 0; trial < 10; trial += 1) {
  const trained = trainLivingMat(1200 + trial);
  matRewardTotal += trained.rewards;
  trained.sim.newDay();
  trained.sim.feed(100);
  const poop = poopEvent(trained.sim);
  if (decisionAt(trained.sim, poop.t).selected === "moveToMat") {
    daySixMoveToMat += 1;
  }
  const state = trained.sim.getFullState();
  trainedCoproTotal += state.memory.coproHabit;
  trainedStates.push(state);
}
assert(
  matRewardTotal >= 40,
  "mat training did not deliver enough correctly timed rewards",
);
assert(daySixMoveToMat >= 6, "day6 moveToMat choices below 6/10");
assert(
  trainedCoproTotal / 10 < BALANCE.INITIAL.MEMORY.coproHabit,
  "mat training did not lower coproHabit",
);
assert(
  trainedStates.every((state) =>
    state.memory.matExpectation > BALANCE.INITIAL.MEMORY.matExpectation
  ),
  "mat rewards did not raise matExpectation",
);

interface AttributionCohort {
  attention: number;
  approaches: number;
}

const attributionCohort = (mistimedReward: boolean): AttributionCohort => {
  let attention = 0;
  let approaches = 0;
  for (let seed = 2100; seed < 2120; seed += 1) {
    const sim = createSim(seed);
    for (let day = 1; day <= 5; day += 1) {
      sim.feed(100);
      const poop = poopEvent(sim);
      const selected = decisionAt(sim, poop.t).selected;
      if (selected === "eatPoop" || selected === "watchOwner") {
        approaches += 1;
        if (mistimedReward) {
          sim.intervene("treat");
        }
      }
      finishPoop(sim);
      if (day < 5) {
        sim.newDay();
      }
    }
    attention += sim.getFullState().memory.attentionViaPoop;
  }
  return { attention, approaches };
};

const noMistiming = attributionCohort(false);
const repeatedMistiming = attributionCohort(true);
assert(
  repeatedMistiming.attention > noMistiming.attention,
  "mistimed treats did not raise attentionViaPoop",
);
assert(
  repeatedMistiming.approaches > noMistiming.approaches,
  "mistimed treats did not increase approaches",
);

const blocked = createSim(3301);
const blockedBefore = blocked.getFullState();
blocked.intervene("block");
for (let day = 1; day <= 5; day += 1) {
  blocked.feed(100);
  poopEvent(blocked);
  blocked.advanceMinutes(BALANCE.DIGESTION.EAT_DELAY_MINUTES);
  blocked.intervene("cleanup");
  if (day < 5) {
    blocked.newDay();
  }
}
const blockedAfter = blocked.getFullState();
const blockedEats =
  blocked.getLog().filter((event) => event.type === "eatPoop").length;
assert(blockedEats === 0, "fence allowed eatPoop completion");
assert(
  JSON.stringify(blockedAfter.matSkill) ===
    JSON.stringify(blockedBefore.matSkill),
  "block changed matSkill",
);
assert(
  blockedAfter.memory.matExpectation === blockedBefore.memory.matExpectation,
  "block changed matExpectation",
);
assert(blockedAfter.blocked, "block did not remain enabled");

const generalized = trainLivingMat(4401);
const generalizedState = generalized.sim.getFullState();
assert(
  generalizedState.matSkill.living > generalizedState.matSkill.kitchen,
  "living skill did not lead kitchen",
);
assert(
  generalizedState.matSkill.living - BALANCE.INITIAL.MAT_SKILL >
    (generalizedState.matSkill.kitchen - BALANCE.INITIAL.MAT_SKILL) * 2,
  "room transfer exceeded GENERALIZE_RATE behavior",
);
assert(
  generalizedState.matSkillOwnerAway < generalizedState.matSkill.kitchen,
  "owner-away skill was not the lowest generalization",
);

const rangeSeeds = [5101, 5102, 5103];
for (const seed of rangeSeeds) {
  const sim = createSim(seed);
  const initialPersonality = sim.getFullState().personality;
  for (let day = 1; day <= 7; day += 1) {
    sim.feed(100);
    sim.advanceMinutes(BALANCE.TIME.ACTIVE_MINUTES);
    if (day < 7) {
      sim.newDay();
    }
  }
  const state = sim.getFullState();
  const boundedValues = [
    ...Object.values(state.stats),
    ...Object.values(state.personality),
    ...Object.values(state.memory),
    ...Object.values(state.matSkill),
    state.matSkillOwnerAway,
  ];
  assert(
    boundedValues.every((value) =>
      Number.isFinite(value) && value >= 0 && value <= 100
    ),
    `state escaped 0..100 for seed ${seed}`,
  );
  const log = sim.getLog();
  assert(
    log.every((event, index) => index === 0 || event.t >= log[index - 1].t),
    `log time regressed ${seed}`,
  );
  assert(
    JSON.stringify(state.personality) === JSON.stringify(initialPersonality),
    `personality mutated ${seed}`,
  );
  assert(
    state.absoluteMinute ===
      (state.day - 1) * BALANCE.TIME.DAY_LENGTH + state.minuteOfDay,
    `absolute/minute clock mismatch ${seed}`,
  );
}

const visibility = createSim(6101, { dogRoom: "toilet" });
visibility.setOwner({ room: "toilet", focusLocked: false });
assert(
  visibility.getDogView().visibility === "seen",
  "same unlocked room was not seen",
);
visibility.setOwner({ room: "living", focusLocked: false });
assert(
  visibility.getDogView().visibility === "heard",
  "adjacent room was not heard",
);
visibility.setOwner({ room: "kitchen", focusLocked: false });
assert(
  visibility.getDogView().visibility === "hidden",
  "non-adjacent room was not hidden",
);
visibility.setOwner({ room: "kitchen", focusLocked: true });
assert(
  visibility.intervene("block").interrupted,
  "focusLocked intervention lacked interrupted flag",
);

let invalidInputRejected = false;
try {
  visibility.advanceMinutes(Number.NaN);
} catch {
  invalidInputRejected = true;
}
assert(invalidInputRejected, "NaN minutes were accepted");

const roundtripSource = createSim(8101);
roundtripSource.feed(70);
roundtripSource.advanceMinutes(210);
const detachedSnapshot = roundtripSource.serialize();
detachedSnapshot.log.push({
  t: 0,
  type: "mutated-copy",
  room: "living",
  visibility: "seen",
  detail: {},
});
assert(
  !roundtripSource.getLog().some((event) => event.type === "mutated-copy"),
  "W3 serialize snapshot was not a deep copy",
);
const roundtripSnapshot = roundtripSource.serialize();
const roundtripRestored = createSim(999999);
roundtripRestored.restore(roundtripSnapshot);
roundtripSnapshot.owner.room = "toilet";
roundtripSnapshot.stats.thirst = 0;
assert(
  roundtripRestored.serialize().owner.room !== "toilet" &&
    roundtripRestored.serialize().stats.thirst !== 0,
  "W3 restore retained an alias to its input",
);
roundtripSource.intervene("toyLure");
roundtripRestored.intervene("toyLure");
roundtripSource.advanceMinutes(180);
roundtripRestored.advanceMinutes(180);
assert(
  JSON.stringify(roundtripSource.getLog()) ===
    JSON.stringify(roundtripRestored.getLog()),
  "W3 serialize restore log trace lost determinism",
);
assert(
  JSON.stringify(roundtripSource.serialize()) ===
    JSON.stringify(roundtripRestored.serialize()),
  "W3 serialize restore state or RNG continuation differs",
);

const largeMealSource = createSim(8103);
largeMealSource.feed(150);
const largeMealSnapshot = largeMealSource.serialize();
assert(
  largeMealSnapshot.digestionQueue.length === 1 &&
    largeMealSnapshot.digestionQueue[0].volume === 100,
  "W3 large feed snapshot did not preserve the 100-volume clamp",
);
const largeMealRestored = createSim(0);
largeMealRestored.restore(largeMealSnapshot);
assert(
  JSON.stringify(largeMealRestored.serialize()) ===
    JSON.stringify(largeMealSource.serialize()),
  "W3 clamped large feed snapshot failed restore roundtrip",
);

const atomicRestore = createSim(8102);
atomicRestore.feed(70);
const beforeInvalidRestore = atomicRestore.serialize();
const malformedSnapshot: WaitdogSnapshot = {
  ...beforeInvalidRestore,
  absoluteMinute: beforeInvalidRestore.absoluteMinute + 1,
};
let malformedRejected = false;
try {
  atomicRestore.restore(malformedSnapshot);
} catch {
  malformedRejected = true;
}
assert(malformedRejected, "W3 malformed snapshot was accepted");
assert(
  JSON.stringify(atomicRestore.serialize()) === JSON.stringify(beforeInvalidRestore),
  "W3 malformed restore partially polluted live state",
);

const curriculumPrediction = {
  start: 3 * BALANCE.TIME.DAY_LENGTH + 600,
  end: 3 * BALANCE.TIME.DAY_LENGTH + 780,
  confidence: 20,
};
const curriculumA = Array.from({ length: 7 }, (_, index) =>
  generateDaySchedule(index + 1, 4242, curriculumPrediction)
);
const curriculumB = Array.from({ length: 7 }, (_, index) =>
  generateDaySchedule(index + 1, 4242, curriculumPrediction)
);
assert(
  JSON.stringify(curriculumA) === JSON.stringify(curriculumB),
  "W3 same seed campaign schedule differs",
);
const dayFourFocus = curriculumA[3].filter((item) => item.focusLock);
assert(dayFourFocus.length === 2, "W3 D4 did not contain exactly two meetings");
assert(
  dayFourFocus.every((item) =>
    item.startMinute <= 780 && item.endMinute >= 600
  ),
  "W3 D4 meeting did not overlap the predicted poop window",
);
const daySevenAway = curriculumA[6].find((item) => item.away);
assert(
  daySevenAway?.startMinute === 720 && daySevenAway.endMinute === 900,
  "W3 D7 away window was not exactly 12:00-15:00",
);

const resourcesHigh = updateOwnerResources(
  { energy: 95, focus: 99, workScore: 100 },
  { energy: 80, focus: 1, workScore: 1000 },
);
assert(
  Object.values(resourcesHigh).every((value) => value === 100),
  "W3 owner resources did not clamp the upper bound",
);
const resourcesLow = updateOwnerResources(
  { energy: 3, focus: 2, workScore: 1 },
  { energy: -80, focus: -3, workScore: -1000 },
);
assert(
  Object.values(resourcesLow).every((value) => value === 0),
  "W3 owner resources did not clamp the lower bound",
);
const resourceShape = createOwnerResources();
assert(
  Object.keys(resourceShape).sort().join(",") ===
    ["energy", "focus", "workScore"].sort().join(","),
  "W3 owner resource shape was not exact",
);
assert(
  updateOwnerResources(resourceShape, { energy: Number.NaN }).energy === 0,
  "W3 NaN owner resource was not clamped safely",
);

const memoryStorage = (() => {
  let stored: string | null = null;
  return {
    getItem: (key: string) => key === WAITDOG_PROFILE_KEY ? stored : null,
    setItem: (key: string, value: string) => {
      if (key !== WAITDOG_PROFILE_KEY) throw new Error("wrong storage key");
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
    raw: () => stored,
  };
})();
const saveResult = saveProfile(memoryStorage, {
  day: roundtripSource.serialize().day,
  phase: "morning",
  simSnapshot: roundtripSource.serialize(),
  ownerResources: { energy: 50, focus: 60, workScore: 70 },
  hypotheses: ["관심"],
  settings: createCampaignSettings(4242),
});
assert(saveResult.ok, "W3 profile save failed through the exact storage key");
const storedProfile = JSON.parse(memoryStorage.raw() ?? "null") as Record<
  string,
  unknown
>;
assert(
  Object.keys(storedProfile).sort().join(",") ===
    ["day", "phase", "simSnapshot", "ownerResources", "hypotheses", "settings"]
      .sort().join(","),
  "W3 profile top-level shape was not exact",
);
assert(loadProfile(memoryStorage).ok, "W3 saved profile did not load");

const throwingStorage: StorageAdapter = {
  getItem: () => {
    throw new Error("storage unavailable");
  },
  setItem: () => {
    throw new Error("storage unavailable");
  },
};
const typedStoredProfile = JSON.parse(
  memoryStorage.raw() ?? "null",
) as WaitdogProfile;
assert(
  !saveProfile(throwingStorage, typedStoredProfile).ok,
  "W3 storage write failure was silently ignored",
);
assert(
  !loadProfile(throwingStorage).ok,
  "W3 storage read failure was silently ignored",
);

const narrativeMorning = createSim(8201).serialize();
const narrativeEvening = JSON.parse(
  JSON.stringify(narrativeMorning),
) as WaitdogSnapshot;
narrativeEvening.log.push(
  {
    t: 800,
    type: "poop",
    room: "toilet",
    visibility: "hidden",
    detail: { secret: 314159 },
  },
  {
    t: 801,
    type: "poop",
    room: "toilet",
    visibility: "heard",
    detail: { secret: 271828 },
  },
);
const narrative = buildDayNarrative(narrativeMorning, narrativeEvening);
assert(
  narrative.learning.length >= 2 && narrative.learning.length <= 4,
  "W3 learning narrative was not two to four sentences",
);
assert(
  narrative.learning.every((sentence) => !/[0-9%]/.test(sentence)),
  "W3 learning narrative exposed a raw number",
);
const redactedTimeline = filteredTimeline(narrativeEvening);
assert(
  redactedTimeline.length === 2 &&
    redactedTimeline.every((item) => !item.sentence.includes("314159")) &&
    redactedTimeline.some((item) =>
      item.sentence === "어딘가에서 작은 소리가 들렸습니다."
    ),
  "W3 timeline leaked hidden or heard details",
);

assert(assertionCount >= 25, "contract contains fewer than 25 assertions");

console.log(`CONTRACT OK ${assertionCount} assertions`);
