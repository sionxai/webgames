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
  WORLD_STATIONS,
  type WaitdogSnapshot,
  type WaitdogSnapshotV1,
  type WaitdogSnapshotV2,
  type WaitdogSnapshotV3,
  type WaitdogUiSim,
} from "../src/waitdog/services/waitdogSim";
import {
  ENCOUNTER_DEFINITIONS,
  ENCOUNTER_IDS,
} from "../src/waitdog/services/encounters";
import {
  ownerDogFootprintSeparation,
} from "../src/waitdog/services/economy";
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
assert(
  Object.values(visibility.getDogView().spatial).every((value) =>
    value === null
  ),
  "hidden dog view leaked spatial state",
);
visibility.setOwner({ room: "living", focusLocked: false });
assert(
  visibility.getDogView().visibility === "heard" &&
    Object.values(visibility.getDogView().spatial).every((value) =>
      value === null
    ),
  "heard dog view leaked spatial state",
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

const initialSpatialView = createSim(7100);
const initialSpatialFull = initialSpatialView.getFullState().spatial;
const initialSpatialPublic = initialSpatialView.getDogView().spatial;
assert(
  initialSpatialPublic.room === initialSpatialFull.room &&
    initialSpatialPublic.x === initialSpatialFull.x &&
    initialSpatialPublic.y === initialSpatialFull.y &&
    initialSpatialPublic.targetRoom === initialSpatialFull.targetRoom &&
    initialSpatialPublic.targetX === initialSpatialFull.targetX &&
    initialSpatialPublic.targetY === initialSpatialFull.targetY &&
    initialSpatialPublic.activity === initialSpatialFull.activity &&
    initialSpatialPublic.moving === initialSpatialFull.moving,
  "seen UI spatial state differed from full state",
);

const spatialTrace = (seed: number) => {
  const sim = createSim(seed);
  const positions = [];
  for (let minute = 0; minute < 180; minute += 1) {
    sim.advanceMinutes(1);
    positions.push(sim.getFullState().spatial);
  }
  return {
    positions,
    ambient: sim.getLog().filter((event) => event.type === "ambientAction"),
    snapshot: sim.serialize(),
  };
};

const spatialA = spatialTrace(7101);
const spatialB = spatialTrace(7101);
assert(
  JSON.stringify(spatialA) === JSON.stringify(spatialB),
  "same seed spatial trace differs",
);
assert(
  spatialA.ambient.length > 0 &&
    spatialA.ambient[0].t - BALANCE.TIME.DAY_START <= 45,
  "ambient action did not occur within 45 minutes",
);
assert(
  spatialA.ambient.slice(1).every((event, index) =>
    event.t - spatialA.ambient[index].t >=
      BALANCE.SPATIAL.AMBIENT_MIN_INTERVAL_MINUTES
  ),
  "ambient actions violated the minimum interval",
);
const ambientDestinations = new Set(
  spatialA.ambient.map((event) =>
    `${String(event.detail.targetRoom)}:${String(event.detail.targetX)}:${
      String(event.detail.targetY)
    }`
  ),
);
assert(
  ambientDestinations.size >= 2,
  "180-minute ambient trace lacked distinct destinations",
);
assert(
  spatialA.positions.every((spatial) =>
    [spatial.x, spatial.y, spatial.targetX, spatial.targetY].every((value) =>
      value >= BALANCE.SPATIAL.MIN_COORDINATE &&
      value <= BALANCE.SPATIAL.MAX_COORDINATE
    )
  ),
  "spatial coordinate escaped the normalized room bounds",
);
assert(
  spatialA.positions.some((spatial, index) =>
    index > 0 &&
    (spatial.x !== spatialA.positions[index - 1].x ||
      spatial.y !== spatialA.positions[index - 1].y ||
      spatial.room !== spatialA.positions[index - 1].room)
  ),
  "dog position did not move during the 180-minute trace",
);
assert(
  spatialA.positions.every((spatial) =>
    !(
      (spatial.room === "kitchen" && spatial.targetRoom === "toilet") ||
      (spatial.room === "toilet" && spatial.targetRoom === "kitchen")
    )
  ),
  "spatial route attempted a direct kitchen-toilet transition",
);
assert(
  spatialA.ambient.every((event) =>
    event.detail.source === "ambient" &&
    event.type !== "wander"
  ),
  "ambient wander was indistinguishable from a poop signal",
);
assert(
  spatialA.ambient.some((event) =>
    event.detail.activity === "seekFood" &&
    event.detail.targetRoom === BALANCE.SPATIAL.TARGET.FOOD.room &&
    event.detail.targetX === BALANCE.SPATIAL.TARGET.FOOD.x &&
    event.detail.targetY === BALANCE.SPATIAL.TARGET.FOOD.y
  ),
  "rising hunger did not select the food destination",
);

const routedSpatial = createSim(7102, { dogRoom: "toilet" });
const routedSnapshot = routedSpatial.serialize();
routedSnapshot.stats.hunger = 100;
routedSnapshot.spatial.nextActivityAt = routedSnapshot.absoluteMinute + 1;
routedSpatial.restore(routedSnapshot);
routedSpatial.advanceMinutes(1);
const routedStart = routedSpatial.getFullState().spatial;
assert(
  routedStart.activity === "seekFood" &&
    routedStart.targetRoom === "living" &&
    routedStart.route.length === 1 &&
    routedStart.route[0].room === "kitchen",
  "toilet-to-kitchen goal did not route through living",
);
let routedThroughLiving = false;
for (let minute = 0; minute < 30; minute += 1) {
  routedSpatial.advanceMinutes(1);
  if (routedSpatial.getFullState().spatial.room === "living") {
    routedThroughLiving = true;
  }
}
assert(routedThroughLiving, "routed movement never entered living");
assert(
  routedSpatial.getFullState().spatial.room === "kitchen",
  "routed movement did not reach the kitchen destination",
);

const roundtripSource = createSim(8101);
roundtripSource.feed(70);
roundtripSource.advanceMinutes(210);
assert(roundtripSource.serialize().version === 4, "serialize did not emit v4");
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
assert(
  JSON.stringify(roundtripSource.getFullState().spatial) ===
    JSON.stringify(roundtripRestored.getFullState().spatial),
  "v4 roundtrip lost spatial continuation",
);

const v4ForMigration = createSim(8104).serialize();
const {
  version: _v4Version,
  ownerSpatial: _v3OwnerSpatial,
  encounterDirector: _v3EncounterDirector,
  economy: _v3Economy,
  work: _v3Work,
  environment: _v3Environment,
  ...v2Fields
} = v4ForMigration;
const {
  seated: _v4Seated,
  ...v3Work
} = v4ForMigration.work;
const {
  foodBowl: _v4FoodBowl,
  waterBowl: _v4WaterBowl,
  ...v3Environment
} = v4ForMigration.environment;
const v3ForMigration: WaitdogSnapshotV3 = {
  ...v2Fields,
  version: 3,
  ownerSpatial: v4ForMigration.ownerSpatial,
  encounterDirector: v4ForMigration.encounterDirector,
  economy: v4ForMigration.economy,
  work: v3Work,
  environment: v3Environment,
};
const v2ForMigration: WaitdogSnapshotV2 = {
  version: 2,
  ...v2Fields,
};
const {
  version: _v2Version,
  spatial: _v2Spatial,
  opportunityRevision: _v2OpportunityRevision,
  visibleOpportunityRevision: _v2VisibleOpportunityRevision,
  ...legacyFields
} = v2ForMigration;
const legacySnapshot: WaitdogSnapshotV1 = {
  version: 1,
  ...legacyFields,
};
const migratedV1 = createSim(0);
migratedV1.restore(legacySnapshot);
const migratedSnapshot = migratedV1.serialize();
assert(migratedSnapshot.version === 4, "v1 snapshot did not migrate to v4");
assert(
  migratedSnapshot.spatial.room === legacySnapshot.dogRoom &&
    migratedSnapshot.spatial.x ===
      BALANCE.SPATIAL.INITIAL[legacySnapshot.dogRoom].x &&
    migratedSnapshot.spatial.y ===
      BALANCE.SPATIAL.INITIAL[legacySnapshot.dogRoom].y,
  "v1 migration did not create the safe default spatial state",
);
const {
  version: _migratedVersion,
  ownerSpatial: _migratedOwnerSpatial,
  encounterDirector: _migratedEncounterDirector,
  economy: _migratedEconomy,
  work: _migratedWork,
  environment: _migratedEnvironment,
  spatial: _migratedSpatial,
  opportunityRevision: _migratedOpportunityRevision,
  visibleOpportunityRevision: _migratedVisibleOpportunityRevision,
  ...migratedLegacyFields
} = migratedSnapshot;
assert(
  JSON.stringify(migratedLegacyFields) === JSON.stringify(legacyFields),
  "v1 migration changed legacy simulation data",
);
const migratedV2 = createSim(2);
migratedV2.restore(v2ForMigration);
const migratedV2Snapshot = migratedV2.serialize();
const {
  version: _migratedV2Version,
  ownerSpatial: _migratedV2OwnerSpatial,
  encounterDirector: _migratedV2EncounterDirector,
  economy: _migratedV2Economy,
  work: _migratedV2Work,
  environment: _migratedV2Environment,
  ...migratedV2Legacy
} = migratedV2Snapshot;
assert(
  JSON.stringify(migratedV2Legacy) === JSON.stringify(v2Fields),
  "v2 migration changed legacy simulation data",
);
assert(
  migratedV2Snapshot.economy.money ===
      BALANCE.LIFESTYLE.ECONOMY.STARTER_MONEY &&
    migratedV2Snapshot.encounterDirector.active === null &&
    migratedV2Snapshot.work.progress === 0,
  "v2 migration did not create v4 lifestyle defaults",
);
assert(
  !migratedV2.getFullState().ownerDogOverlap,
  "v2 migration created overlapping owner and dog footprints",
);
const migratedContinuation = createSim(1);
migratedContinuation.restore(legacySnapshot);
migratedV1.advanceMinutes(90);
migratedContinuation.advanceMinutes(90);
assert(
  JSON.stringify(migratedV1.serialize()) ===
    JSON.stringify(migratedContinuation.serialize()),
  "v1 migration continuation was not deterministic",
);

const migratedV3 = createSim(3);
migratedV3.restore(v3ForMigration);
const migratedV3Snapshot = migratedV3.serialize();
const {
  version: _migratedV3Version,
  work: migratedV3Work,
  environment: migratedV3Environment,
  ...migratedV3Legacy
} = migratedV3Snapshot;
const {
  seated: _migratedV3Seated,
  ...migratedV3LegacyWork
} = migratedV3Work;
const {
  foodBowl: _migratedV3FoodBowl,
  waterBowl: _migratedV3WaterBowl,
  ...migratedV3LegacyEnvironment
} = migratedV3Environment;
const {
  version: _legacyV3Version,
  work: legacyV3Work,
  environment: legacyV3Environment,
  ...legacyV3Fields
} = v3ForMigration;
assert(
  JSON.stringify(migratedV3Legacy) === JSON.stringify(legacyV3Fields) &&
    JSON.stringify(migratedV3LegacyWork) === JSON.stringify(legacyV3Work) &&
    JSON.stringify(migratedV3LegacyEnvironment) ===
      JSON.stringify(legacyV3Environment) &&
    migratedV3Work.seated === false &&
    migratedV3Environment.foodBowl.itemId === null &&
    migratedV3Environment.foodBowl.level === 0 &&
    migratedV3Environment.waterBowl.level === 0 &&
    migratedV3Environment.waterBowl.clean,
  "v3 migration changed legacy data or missed v4 world defaults",
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
const malformedSpatial = {
  ...beforeInvalidRestore,
  spatial: {
    ...beforeInvalidRestore.spatial,
    targetX: BALANCE.SPATIAL.MAX_COORDINATE + 1,
  },
};
let malformedSpatialRejected = false;
try {
  atomicRestore.restore(malformedSpatial);
} catch {
  malformedSpatialRejected = true;
}
assert(malformedSpatialRejected, "malformed v3 spatial state was accepted");
assert(
  JSON.stringify(atomicRestore.serialize()) === JSON.stringify(beforeInvalidRestore),
  "malformed spatial restore partially polluted live state",
);
let extraV2Rejected = false;
try {
  atomicRestore.restore({ ...v2ForMigration, unexpected: true });
} catch {
  extraV2Rejected = true;
}
assert(extraV2Rejected, "v2 snapshot with an extra key was accepted");
assert(
  JSON.stringify(atomicRestore.serialize()) === JSON.stringify(beforeInvalidRestore),
  "extra-key v2 restore partially polluted live state",
);
let malformedEconomyRejected = false;
try {
  atomicRestore.restore({
    ...beforeInvalidRestore,
    economy: { ...beforeInvalidRestore.economy, money: -1 },
  });
} catch {
  malformedEconomyRejected = true;
}
assert(malformedEconomyRejected, "negative v3 economy state was accepted");
assert(
  JSON.stringify(atomicRestore.serialize()) === JSON.stringify(beforeInvalidRestore),
  "malformed economy restore partially polluted live state",
);
let extraV1Rejected = false;
try {
  atomicRestore.restore({ ...legacySnapshot, unexpected: true });
} catch {
  extraV1Rejected = true;
}
assert(extraV1Rejected, "v1 snapshot with an extra key was accepted");
assert(
  JSON.stringify(atomicRestore.serialize()) === JSON.stringify(beforeInvalidRestore),
  "extra-key v1 restore partially polluted live state",
);

const seenOpportunity = createSim(8106);
const seenOpportunitySnapshot = seenOpportunity.serialize();
seenOpportunitySnapshot.spatial.nextActivityAt = BALANCE.TIME.DAY_END;
seenOpportunity.restore(seenOpportunitySnapshot);
seenOpportunity.feed(100);
poopEvent(seenOpportunity, 360);
const seenImportantEvents = seenOpportunity.getLog().filter((event) =>
  ["sniffFloor", "circle", "wander", "poop"].includes(event.type) &&
  event.visibility === "seen"
);
assert(
  seenOpportunity.getDogView().opportunityRevision ===
    seenImportantEvents.length &&
    seenOpportunity.getDogView().opportunityRevision >= 3,
  "seen opportunities did not advance the UI revision",
);

const heardOpportunity = createSim(8108, { dogRoom: "toilet" });
heardOpportunity.setOwner({ room: "living", focusLocked: false });
const heardOpportunitySnapshot = heardOpportunity.serialize();
heardOpportunitySnapshot.spatial.nextActivityAt = BALANCE.TIME.DAY_END;
heardOpportunity.restore(heardOpportunitySnapshot);
heardOpportunity.feed(100);
poopEvent(heardOpportunity, 360);
const heardImportantEvents = heardOpportunity.getLog().filter((event) =>
  ["sniffFloor", "circle", "wander", "poop"].includes(event.type)
);
assert(
  heardImportantEvents.length >= 4 &&
    heardImportantEvents.every((event) => event.visibility === "heard"),
  "heard opportunity scenario did not stay heard",
);
assert(
  heardOpportunity.getDogView().opportunityRevision ===
      heardImportantEvents.length &&
    heardOpportunity.getDogView().opportunityRevision >= 4,
  "heard opportunities did not advance the observable UI revision",
);

const matSpatial = createSim(8107);
let matSpatialSuccess = false;
for (let attempt = 0; attempt < 12 && !matSpatialSuccess; attempt += 1) {
  matSpatialSuccess = matSpatial.intervene("matCommand").success;
}
const matSpatialState = matSpatial.getFullState().spatial;
assert(matSpatialSuccess, "spatial mat command never succeeded");
assert(
  matSpatialState.activity === "moveToMat" &&
    matSpatialState.targetRoom === matSpatialState.room &&
    matSpatialState.targetX ===
      BALANCE.SPATIAL.TARGET.MAT[matSpatialState.room].x &&
    matSpatialState.targetY ===
      BALANCE.SPATIAL.TARGET.MAT[matSpatialState.room].y,
  "mat command did not target the room mat",
);

const hiddenOpportunity = createSim(8105);
hiddenOpportunity.setOwner({
  room: "living",
  focusLocked: false,
  away: true,
});
hiddenOpportunity.feed(100);
poopEvent(hiddenOpportunity, 360);
const hiddenOpportunityState = hiddenOpportunity.getFullState();
const hiddenOpportunityView = hiddenOpportunity.getDogView();
const hiddenImportantEvents = hiddenOpportunity.getLog().filter((event) =>
  ["sniffFloor", "circle", "wander", "poop"].includes(event.type)
);
assert(
  hiddenOpportunityState.opportunityRevision === hiddenImportantEvents.length &&
    hiddenOpportunityState.opportunityRevision >= 4,
  "important signals did not increment the full opportunity revision",
);
assert(
  hiddenOpportunityView.opportunityRevision === 0,
  "hidden opportunity changed the observable UI revision",
);
assert(
  hiddenImportantEvents.every((event) => event.visibility === "hidden"),
  "away-owner opportunity unexpectedly became observable",
);
assert(
  hiddenImportantEvents
    .filter((event) => event.type === "wander")
    .every((event) => event.detail.source === "poopSignal"),
  "poop-signal wander lacked a distinguishing source",
);

const solveActiveEncounter = (sim: WaitdogUiSim) => {
  let encounter = sim.getDogView().activeEncounter;
  assert(encounter !== null, "encounter solver received no active encounter");
  const definition = ENCOUNTER_DEFINITIONS.find((candidate) =>
    candidate.id === encounter?.kind
  );
  if (definition === undefined) {
    throw new Error("CONTRACT FAIL: encounter solver lacked a definition");
  }
  for (const cause of definition.causes) {
    sim.selectEncounterCause(cause.id);
    if (sim.getDogView().activeEncounter?.stage === "response") break;
  }
  encounter = sim.getDogView().activeEncounter;
  assert(
    encounter?.stage === "response",
    "encounter did not advance from cause to response",
  );
  for (const option of encounter.responseChoices) {
    sim.selectEncounterResponse(option.id);
    const stage = sim.getDogView().activeEncounter?.stage;
    if (stage === "reinforcement" || stage === "outcome") break;
  }
  encounter = sim.getDogView().activeEncounter;
  if (encounter?.stage === "reinforcement") {
    for (const option of encounter.reinforcementChoices) {
      sim.selectEncounterReinforcement(option.id);
      if (sim.getDogView().activeEncounter?.stage === "outcome") break;
    }
  }
  encounter = sim.getDogView().activeEncounter;
  assert(
    encounter?.stage === "outcome" &&
      encounter.outcome?.success === true,
    "encounter did not produce a successful outcome",
  );
  return encounter;
};

const advanceActiveEncounterToReinforcement = (sim: WaitdogUiSim) => {
  let encounter = sim.getDogView().activeEncounter;
  assert(encounter !== null, "reinforcement solver received no active encounter");
  const definition = ENCOUNTER_DEFINITIONS.find((candidate) =>
    candidate.id === encounter?.kind
  );
  if (definition === undefined) {
    throw new Error("CONTRACT FAIL: reinforcement solver lacked a definition");
  }
  for (const cause of definition.causes) {
    sim.selectEncounterCause(cause.id);
    if (sim.getDogView().activeEncounter?.stage === "response") break;
  }
  encounter = sim.getDogView().activeEncounter;
  assert(
    encounter?.stage === "response",
    "reinforcement solver did not reach the response stage",
  );
  for (const option of encounter.responseChoices) {
    sim.selectEncounterResponse(option.id);
    if (sim.getDogView().activeEncounter?.stage === "reinforcement") break;
  }
  encounter = sim.getDogView().activeEncounter;
  assert(
    encounter?.stage === "reinforcement",
    "reinforcement solver did not reach the reinforcement stage",
  );
  return encounter;
};

assert(
  ENCOUNTER_IDS.length === 9 &&
    new Set(ENCOUNTER_IDS).size === 9,
  "encounter director did not define exactly nine unique encounters",
);
assert(
  ENCOUNTER_DEFINITIONS.every((definition) =>
    definition.causes.length === 3 &&
    definition.responses.length === 3 &&
    new Set(definition.causes.map((cause) => cause.cues.join("|"))).size ===
      3 &&
    definition.causes.every((cause) =>
      definition.responses.some((response) =>
        response.id === cause.correctResponseId && response.safe
      )
    )
  ),
  "an encounter lacked distinct clues or a safe best response",
);
const highRiskDefinitions = ENCOUNTER_DEFINITIONS.filter((definition) =>
  definition.id === "anxiety" || definition.id === "biteWarning"
);
assert(
  highRiskDefinitions.every((definition) =>
    definition.safetyLevel === "high" &&
    definition.causes.every((cause) => {
      const response = definition.responses.find((candidate) =>
        candidate.id === cause.correctResponseId
      );
      return response?.safe === true &&
        !/(벌|제압|진단)/.test(response.label);
    })
  ),
  "high-risk encounter selected punishment, restraint, or diagnosis",
);

const encounterDeterministicA = createSim(9101);
const encounterDeterministicB = createSim(9101);
assert(
  encounterDeterministicA.startNextEncounter().ok &&
    encounterDeterministicB.startNextEncounter().ok,
  "first tutorial encounter did not start immediately",
);
const firstEncounterView = encounterDeterministicA.getDogView().activeEncounter;
assert(
  JSON.stringify(firstEncounterView) ===
    JSON.stringify(encounterDeterministicB.getDogView().activeEncounter),
  "same seed encounter was not deterministic",
);
assert(
  firstEncounterView?.kind === "potty" &&
    firstEncounterView.causeChoices.length === 0 &&
    firstEncounterView.responseChoices.length === 0 &&
    firstEncounterView.inferredCause === null &&
    firstEncounterView.contextActions.length === 0,
  "first tutorial exposed choices or an inferred cause before observation",
);
assert(
  !JSON.stringify(firstEncounterView).includes("hiddenCauseId") &&
    !JSON.stringify(firstEncounterView).includes("correctResponseId"),
  "public encounter view leaked a hidden answer",
);
const activeEncounterReload = createSim(1);
activeEncounterReload.restore(encounterDeterministicB.serialize());
assert(
  JSON.stringify(activeEncounterReload.getDogView().activeEncounter) ===
      JSON.stringify(encounterDeterministicB.getDogView().activeEncounter) &&
    activeEncounterReload.getDogView().pausedForEncounter,
  "active encounter did not survive a v4 reload",
);
const pausedAt = encounterDeterministicA.getFullState().absoluteMinute;
encounterDeterministicA.advanceMinutes(30);
assert(
  encounterDeterministicA.getFullState().absoluteMinute === pausedAt,
  "active encounter did not pause game time",
);
const firstOutcome = solveActiveEncounter(encounterDeterministicA);
assert(
  firstOutcome.outcome?.carePointsAwarded === 1 &&
    firstOutcome.outcome.firstReward,
  "first encounter did not award its first daily care point",
);
assert(
  encounterDeterministicA.dismissEncounterOutcome().ok,
  "settled encounter outcome could not be dismissed",
);
const carePointsAfterFirst =
  encounterDeterministicA.getFullState().economy.carePoints;
assert(
  encounterDeterministicA.startEncounter("potty").ok,
  "same-day repeat encounter did not start",
);
const repeatOutcome = solveActiveEncounter(encounterDeterministicA);
assert(
  repeatOutcome.outcome?.carePointsAwarded === 0 &&
    !repeatOutcome.outcome.firstReward &&
    encounterDeterministicA.getFullState().economy.carePoints ===
      carePointsAfterFirst,
  "same-day encounter paid its first reward twice",
);
encounterDeterministicA.dismissEncounterOutcome();

for (const encounterId of ENCOUNTER_IDS) {
  const sim = createSim(9200 + ENCOUNTER_IDS.indexOf(encounterId));
  assert(
    sim.startEncounter(encounterId).ok,
    `${encounterId} encounter did not start`,
  );
  const outcome = solveActiveEncounter(sim);
  assert(
    outcome.kind === encounterId,
    `${encounterId} encounter resolved as another kind`,
  );
}

const treatItemIds = [
  "treat-mini",
  "treat-basic",
  "treat-lick",
] as const;
const emptyTreatRecall = createSim(9250);
assert(
  emptyTreatRecall.useItem(
    "treat-basic",
    BALANCE.LIFESTYLE.ECONOMY.STARTER_INVENTORY["treat-basic"],
    "empty-recall-treats",
  ).ok &&
    treatItemIds.every((itemId) =>
      emptyTreatRecall.getFullState().economy.inventory[itemId] === 0
    ),
  "recall fallback setup did not empty every treat inventory",
);
assert(
  emptyTreatRecall.startEncounter("recall").ok,
  "zero-treat recall encounter did not start",
);
advanceActiveEncounterToReinforcement(emptyTreatRecall);
const unavailableTreat = emptyTreatRecall.selectEncounterReinforcement("treat");
assert(
  !unavailableTreat.ok &&
    unavailableTreat.reason?.includes("재고") === true &&
    emptyTreatRecall.getDogView().activeEncounter?.stage === "reinforcement",
  "zero-treat recall did not reject the unavailable precise treat",
);
const beforeFallback = emptyTreatRecall.getFullState();
const fallbackResult =
  emptyTreatRecall.selectEncounterReinforcement("praise");
const fallbackView = emptyTreatRecall.getDogView();
const afterFallback = emptyTreatRecall.getFullState();
assert(
  fallbackResult.ok &&
    fallbackView.activeEncounter?.stage === "outcome" &&
    fallbackView.activeEncounter.outcome?.success === true &&
    fallbackView.activeEncounter.outcome.message.includes("간식 재고") &&
    fallbackView.activeEncounter.outcome.message.includes("칭찬"),
  "stock-free praise did not resolve recall with an explanatory outcome",
);
assert(
  !JSON.stringify(fallbackView.activeEncounter).includes("hiddenCauseId") &&
    !JSON.stringify(fallbackView.activeEncounter).includes(
      "correctResponseId",
    ),
  "stock-free praise outcome leaked a hidden encounter answer",
);
assert(
  afterFallback.economy.carePoints ===
      beforeFallback.economy.carePoints + 1 &&
    afterFallback.memory.recallTrust ===
      beforeFallback.memory.recallTrust + 3 &&
    afterFallback.economy.ledger.filter((entry) =>
      entry.id === "care:day:1:encounter:recall"
    ).length === 1,
  "stock-free praise duplicated or skipped recall completion effects",
);
assert(
  treatItemIds.every((itemId) => {
    const economy = afterFallback.economy;
    const ledgerQuantity = economy.ledger.reduce(
      (sum, entry) =>
        sum + (entry.itemId === itemId ? entry.quantityDelta : 0),
      0,
    );
    return economy.inventory[itemId] >= 0 &&
      economy.inventory[itemId] ===
        BALANCE.LIFESTYLE.ECONOMY.STARTER_INVENTORY[itemId] +
          ledgerQuantity;
  }),
  "stock-free praise made treat inventory or its ledger inconsistent",
);
const fallbackCompletionCount = emptyTreatRecall.getLog().filter((event) =>
  event.type === "encounterComplete" &&
  event.detail.encounterId === "recall"
).length;
assert(
  !emptyTreatRecall.selectEncounterReinforcement("praise").ok &&
    emptyTreatRecall.getFullState().economy.carePoints ===
      afterFallback.economy.carePoints &&
    emptyTreatRecall.getLog().filter((event) =>
      event.type === "encounterComplete" &&
      event.detail.encounterId === "recall"
    ).length === fallbackCompletionCount,
  "repeated stock-free praise applied recall completion twice",
);
assert(
  emptyTreatRecall.dismissEncounterOutcome().ok &&
    !emptyTreatRecall.getDogView().pausedForEncounter &&
    emptyTreatRecall.getDogView().activeEncounter === null,
  "stock-free praise outcome did not dismiss and resume the simulation",
);

const stockedTreatRecall = createSim(9251);
stockedTreatRecall.startEncounter("recall");
const stockedReinforcement =
  advanceActiveEncounterToReinforcement(stockedTreatRecall);
const stockedBefore = stockedTreatRecall.getFullState().economy;
assert(
  !stockedTreatRecall.selectEncounterReinforcement("praise").ok &&
    stockedTreatRecall.getDogView().activeEncounter?.stage ===
      "reinforcement" &&
    JSON.stringify(stockedTreatRecall.getFullState().economy.inventory) ===
      JSON.stringify(stockedBefore.inventory),
  "stocked treat-required recall accepted the praise fallback",
);
assert(
  stockedTreatRecall.selectEncounterReinforcement("treat").ok,
  "stocked recall rejected its precise treat reinforcement",
);
const stockedAfter = stockedTreatRecall.getFullState().economy;
const stockedOutcome = stockedTreatRecall.getDogView().activeEncounter?.outcome;
assert(
  treatItemIds.reduce(
    (sum, itemId) =>
      sum + stockedBefore.inventory[itemId] - stockedAfter.inventory[itemId],
    0,
  ) === 1 &&
    stockedAfter.inventory["treat-basic"] ===
      stockedBefore.inventory["treat-basic"] - 1 &&
    stockedAfter.ledger.filter((entry) =>
      entry.id ===
        `encounter-reward:${stockedReinforcement.instanceId}` &&
      entry.kind === "consume" &&
      entry.quantityDelta === -1
    ).length === 1 &&
    stockedOutcome?.inventoryDelta["treat-basic"] === -1,
  "stocked recall did not consume exactly one precise treat",
);
stockedTreatRecall.dismissEncounterOutcome();

const hintedEncounter = createSim(9301);
hintedEncounter.startNextEncounter();
assert(
  hintedEncounter.requestEncounterHint().ok &&
    hintedEncounter.getDogView().activeEncounter?.hint !== null,
  "first action-group hint was not available",
);
const sameStageHint = createSim(9300);
sameStageHint.startEncounter("overexcited");
sameStageHint.advanceEncounterInput(
  BALANCE.LIFESTYLE.ENCOUNTER.HINT_IDLE_SECONDS,
);
const sameStagePrivate = sameStageHint.serialize().encounterDirector.active;
const sameStagePublic = sameStageHint.getDogView().activeEncounter;
if (sameStagePrivate === null || sameStagePublic === null) {
  throw new Error("CONTRACT FAIL: same-stage hint encounter was not active");
}
const sameStageDefinition = ENCOUNTER_DEFINITIONS.find((definition) =>
  definition.id === sameStagePublic.kind
);
const wrongSameStageCause = sameStageDefinition?.causes.find((cause) =>
  cause.id !== sameStagePrivate.hiddenCauseId
);
if (wrongSameStageCause === undefined) {
  throw new Error("CONTRACT FAIL: same-stage hint lacked a wrong cause");
}
assert(
  !sameStageHint.selectEncounterCause(wrongSameStageCause.id).ok &&
    sameStageHint.getDogView().activeEncounter?.stage === "cause" &&
    sameStageHint.requestEncounterHint().ok,
  "rejected same-stage input reset the elapsed hint timer",
);
solveActiveEncounter(hintedEncounter);
hintedEncounter.dismissEncounterOutcome();
hintedEncounter.startNextEncounter();
hintedEncounter.advanceEncounterInput(
  BALANCE.LIFESTYLE.ENCOUNTER.HINT_IDLE_SECONDS,
);
assert(
  !hintedEncounter.requestEncounterHint().ok,
  "hint appeared in consecutive encounters",
);
const daySevenHint = createSim(9302);
for (let day = 1; day < 7; day += 1) daySevenHint.newDay();
daySevenHint.startNextEncounter();
daySevenHint.advanceEncounterInput(
  BALANCE.LIFESTYLE.ENCOUNTER.HINT_IDLE_SECONDS,
);
assert(
  !daySevenHint.requestEncounterHint().ok,
  "Day 7 exposed a general hint",
);

const workSim = createSim(9401);
const ownerStart = workSim.getFullState().ownerSpatial;
assert(
  workSim.moveOwnerTo({ hotspotId: "computer" }).ok,
  "computer move command failed",
);
for (
  let minute = 0;
  minute < 5 && workSim.getFullState().ownerSpatial.moving;
  minute += 1
) {
  workSim.advanceMinutes(1);
}
const ownerAtComputer = workSim.getDogView().ownerSpatial;
assert(
  !ownerAtComputer.moving &&
    (ownerAtComputer.x !== ownerStart.x ||
      ownerAtComputer.y !== ownerStart.y) &&
    workSim.getDogView().work.state === "ready",
  "owner did not physically arrive at the computer",
);
const moneyBeforeWork = workSim.getFullState().economy.money;
assert(
  workSim.performWorkBlock("contract-gig").ok &&
    workSim.getFullState().work.progress === 25,
  "first work block was not 15 minutes and 25 percent",
);
assert(
  workSim.performWorkBlock("contract-gig").ok &&
    workSim.getFullState().work.progress === 50 &&
    workSim.getDogView().work.alert !== null,
  "second work block did not pause on the public alert",
);
assert(
  workSim.resolveWorkAlert("continue").ok &&
    workSim.performWorkBlock("contract-gig").ok &&
    workSim.getFullState().work.progress === 75 &&
    workSim.performWorkBlock("contract-gig").ok &&
    workSim.getFullState().work.progress === 100,
  "work did not progress through 50, 75, and 100 percent",
);
assert(
  workSim.getFullState().economy.money ===
    moneyBeforeWork + BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY,
  "base salary was not paid exactly at completion",
);
const moneyAfterWork = workSim.getFullState().economy.money;
assert(
  !workSim.performWorkBlock("contract-gig").ok &&
    workSim.getFullState().economy.money === moneyAfterWork,
  "completed gig paid twice",
);

const interruptedWork = createSim(9402);
interruptedWork.moveOwnerTo({ hotspotId: "computer" });
interruptedWork.advanceMinutes(1);
interruptedWork.performWorkBlock("interrupted-gig");
interruptedWork.performWorkBlock("interrupted-gig");
assert(
  interruptedWork.resolveWorkAlert("interrupt").ok,
  "work alert could not be interrupted",
);
const interruptedCarePoints =
  interruptedWork.getFullState().economy.carePoints;
interruptedWork.performWorkBlock("interrupted-gig");
interruptedWork.performWorkBlock("interrupted-gig");
assert(
  interruptedWork.getFullState().work.progress === 100 &&
    interruptedWork.getFullState().economy.carePoints ===
      interruptedCarePoints,
  "interrupted work incorrectly received a continuity reward",
);

const reloadedWork = createSim(9403);
reloadedWork.moveOwnerTo({ hotspotId: "computer" });
reloadedWork.advanceMinutes(1);
reloadedWork.performWorkBlock("reload-gig");
reloadedWork.performWorkBlock("reload-gig");
const workAlertSnapshot = reloadedWork.serialize();
const workAlertRestored = createSim(0);
workAlertRestored.restore(workAlertSnapshot);
assert(
  workAlertRestored.getDogView().work.state === "alert" &&
    workAlertRestored.getFullState().work.progress === 50,
  "work alert did not survive a v4 reload",
);
workAlertRestored.resolveWorkAlert("continue");
workAlertRestored.performWorkBlock("reload-gig");
workAlertRestored.performWorkBlock("reload-gig");
const paidReloadSnapshot = workAlertRestored.serialize();
const paidReloadRestored = createSim(0);
paidReloadRestored.restore(paidReloadSnapshot);
const paidReloadMoney = paidReloadRestored.getFullState().economy.money;
assert(
  !paidReloadRestored.performWorkBlock("reload-gig").ok &&
    paidReloadRestored.getFullState().economy.money === paidReloadMoney,
  "reloaded completed work paid salary twice",
);

for (const encounterId of ENCOUNTER_IDS) {
  workSim.startEncounter(encounterId);
  solveActiveEncounter(workSim);
  workSim.dismissEncounterOutcome();
}
assert(
  workSim.buyUpgrade("salary-routine").ok &&
    workSim.buyUpgrade("salary-portfolio").ok &&
    workSim.buyUpgrade("salary-specialist").ok &&
    workSim.getDogView().economy.salaryBonusPercent === 45,
  "salary upgrades did not reach the fixed 45 percent cap",
);
const moneyBeforeBonusGig = workSim.getFullState().economy.money;
workSim.performWorkBlock("bonus-gig");
workSim.performWorkBlock("bonus-gig");
workSim.resolveWorkAlert("continue");
workSim.performWorkBlock("bonus-gig");
workSim.performWorkBlock("bonus-gig");
assert(
  workSim.getFullState().economy.money - moneyBeforeBonusGig ===
    Math.round(
      BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY * 1.45,
    ),
  "salary bonus was not capped and paid at 45 percent",
);
const canonicalSalarySnapshot = workSim.serialize();
const canonicalSalaryEntries = canonicalSalarySnapshot.economy.ledger.filter(
  (entry) => entry.kind === "salary",
);
assert(
  canonicalSalaryEntries.length === 2 &&
    canonicalSalaryEntries[0].moneyDelta ===
      BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY &&
    canonicalSalaryEntries[1].moneyDelta === Math.round(
      BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY * 1.45,
    ),
  "salary ledger did not preserve canonical before/after-upgrade payouts",
);
const canonicalSalaryRestored = createSim(0);
canonicalSalaryRestored.restore(canonicalSalarySnapshot);
assert(
  JSON.stringify(canonicalSalaryRestored.serialize()) ===
    JSON.stringify(canonicalSalarySnapshot),
  "canonical before/after-upgrade salary snapshot did not roundtrip",
);
const forgedSalarySnapshot = JSON.parse(
  JSON.stringify(canonicalSalarySnapshot),
) as WaitdogSnapshot;
const forgedSalaryEntry = forgedSalarySnapshot.economy.ledger.find((entry) =>
  entry.kind === "salary" && entry.id === "salary:bonus-gig"
);
if (forgedSalaryEntry === undefined) {
  throw new Error("CONTRACT FAIL: missing salary entry for forgery regression");
}
const forgedSalaryDelta = 999_000 - forgedSalaryEntry.moneyDelta;
forgedSalaryEntry.moneyDelta = 999_000;
forgedSalarySnapshot.economy.money += forgedSalaryDelta;
const forgedSalaryRestore = createSim(9404);
const beforeForgedSalaryRestore = forgedSalaryRestore.serialize();
let forgedSalaryRejected = false;
try {
  forgedSalaryRestore.restore(forgedSalarySnapshot);
} catch {
  forgedSalaryRejected = true;
}
assert(
  forgedSalaryRejected,
  "forged salary ledger and matching money total were accepted",
);
assert(
  JSON.stringify(forgedSalaryRestore.serialize()) ===
    JSON.stringify(beforeForgedSalaryRestore),
  "forged salary restore partially polluted live state",
);

const prefixLedgerSource = createSim(9405);
for (const encounterId of ENCOUNTER_IDS.slice(0, 2)) {
  prefixLedgerSource.startEncounter(encounterId);
  solveActiveEncounter(prefixLedgerSource);
  prefixLedgerSource.dismissEncounterOutcome();
}
assert(
  prefixLedgerSource.buyUpgrade("salary-routine").ok,
  "prefix-ledger regression could not buy its earned upgrade",
);
const validPrefixLedgerSnapshot = prefixLedgerSource.serialize();
const validPrefixLedgerRestored = createSim(0);
validPrefixLedgerRestored.restore(validPrefixLedgerSnapshot);
assert(
  JSON.stringify(validPrefixLedgerRestored.serialize()) ===
    JSON.stringify(validPrefixLedgerSnapshot),
  "valid earned-upgrade ledger did not roundtrip",
);
const negativePrefixSnapshot = JSON.parse(
  JSON.stringify(validPrefixLedgerSnapshot),
) as WaitdogSnapshot;
const upgradeEntryIndex = negativePrefixSnapshot.economy.ledger.findIndex(
  (entry) => entry.kind === "upgrade" && entry.id === "upgrade:salary-routine",
);
if (upgradeEntryIndex < 0) {
  throw new Error("CONTRACT FAIL: prefix-ledger upgrade entry was missing");
}
const [earlyUpgradeEntry] = negativePrefixSnapshot.economy.ledger.splice(
  upgradeEntryIndex,
  1,
);
negativePrefixSnapshot.economy.ledger.unshift(earlyUpgradeEntry);
negativePrefixSnapshot.economy.ledger.forEach((entry, index) => {
  entry.revision = index + 1;
});
assert(
  negativePrefixSnapshot.economy.ledger[0].carePointDelta === -2 &&
    negativePrefixSnapshot.economy.carePoints ===
      validPrefixLedgerSnapshot.economy.carePoints,
  "prefix-ledger forgery did not preserve final totals with an early deficit",
);
const negativePrefixRestore = createSim(9406);
const beforeNegativePrefixRestore = negativePrefixRestore.serialize();
let negativePrefixRejected = false;
try {
  negativePrefixRestore.restore(negativePrefixSnapshot);
} catch {
  negativePrefixRejected = true;
}
assert(
  negativePrefixRejected,
  "ledger with a negative care-point prefix was accepted",
);
assert(
  JSON.stringify(negativePrefixRestore.serialize()) ===
    JSON.stringify(beforeNegativePrefixRestore),
  "negative-prefix restore partially polluted live state",
);

const inventoryBeforePurchase =
  workSim.getFullState().economy.inventory["food-basic"];
const moneyBeforePurchase = workSim.getFullState().economy.money;
assert(
  workSim.purchaseItem("food-basic", 1, "contract-purchase").ok,
  "valid catalog purchase failed",
);
const afterPurchase = workSim.getFullState().economy;
assert(
  afterPurchase.inventory["food-basic"] === inventoryBeforePurchase + 1 &&
    afterPurchase.money < moneyBeforePurchase,
  "purchase did not atomically update money and inventory",
);
assert(
  !workSim.purchaseItem("food-basic", 1, "contract-purchase").ok &&
    JSON.stringify(workSim.getFullState().economy) ===
      JSON.stringify(afterPurchase),
  "duplicate purchase transaction changed economy state",
);
assert(
  !workSim.purchaseItem("food-basic", 0, "zero-purchase").ok &&
    workSim.getFullState().economy.money >= 0,
  "invalid purchase quantity made the ledger negative",
);

const clinicSim = createSim(9501);
clinicSim.newDay();
const clinicMoney = clinicSim.getFullState().economy.money;
assert(
  clinicSim.getDogView().clinic.couponAvailable &&
    clinicSim.scheduleClinic("day-two-clinic").ok,
  "Day 2 preventive-care coupon was not usable",
);
assert(
  clinicSim.getFullState().economy.money === clinicMoney &&
    clinicSim.getDogView().clinic.preventiveVisitCompleted &&
    !clinicSim.scheduleClinic("duplicate-clinic").ok,
  "clinic coupon charged money or allowed a duplicate visit",
);

const placementSim = createSim(9601);
placementSim.startEncounter("potty");
solveActiveEncounter(placementSim);
placementSim.dismissEncounterOutcome();
assert(
  placementSim.placeItem(
    "pad-paper",
    { room: "living", x: 0.2, y: 0.7 },
    "place-paper-pad",
  ).ok,
  "valid pad placement failed",
);
const placementOwner = placementSim.getFullState().ownerSpatial;
assert(
  !placementSim.placeItem(
    "pad-paper",
    {
      room: placementOwner.room,
      x: placementOwner.x,
      y: placementOwner.y,
    },
    "pad-on-owner",
  ).ok,
  "pad placement on the owner was accepted",
);
assert(
  placementSim.purchaseItem(
    "barrier-1-panel",
    2,
    "purchase-contract-barriers",
  ).ok,
  "unlocked barrier purchase failed",
);
assert(
  placementSim.placeItem(
    "barrier-1-panel",
    {
      room: "living",
      x: 0.3,
      y: 0.3,
      width: 0.1,
      height: 0.3,
      placementId: "safe-barrier",
    },
    "place-safe-barrier",
  ).ok,
  "valid barrier placement failed",
);
assert(
  !placementSim.placeItem(
    "barrier-1-panel",
    {
      room: "living",
      x: 0.93,
      y: 0.25,
      width: 0.1,
      height: 0.1,
      placementId: "door-barrier",
    },
    "place-door-barrier",
  ).ok,
  "door-blocking barrier placement was accepted",
);
assert(
  !placementSim.placeItem(
    "barrier-4-panel",
    {
      room: "kitchen",
      x: 0.5,
      y: 0.5,
      width: 0.1,
      height: 0.1,
      placementId: "tiny-enclosure",
    },
    "place-tiny-enclosure",
  ).ok,
  "unsafe four-panel enclosure was accepted",
);
const placementSnapshot = placementSim.serialize();
const placementRestored = createSim(0);
placementRestored.restore(placementSnapshot);
assert(
  JSON.stringify(placementRestored.serialize()) ===
    JSON.stringify(placementSnapshot),
  "environment placement and inventory ledger did not survive reload",
);
const ownerOnPadSnapshot = JSON.parse(
  JSON.stringify(placementSnapshot),
) as WaitdogSnapshot;
if (ownerOnPadSnapshot.environment.padPlacement === null) {
  throw new Error("CONTRACT FAIL: placement snapshot lacked its pad");
}
ownerOnPadSnapshot.environment.padPlacement = {
  ...ownerOnPadSnapshot.environment.padPlacement,
  room: ownerOnPadSnapshot.ownerSpatial.room,
  x: ownerOnPadSnapshot.ownerSpatial.x,
  y: ownerOnPadSnapshot.ownerSpatial.y,
};
const ownerOnPadRestored = createSim(0);
ownerOnPadRestored.restore(ownerOnPadSnapshot);
assert(
  JSON.stringify(ownerOnPadRestored.serialize()) ===
    JSON.stringify(ownerOnPadSnapshot),
  "reachable owner-on-pad snapshot did not roundtrip",
);
const dogOnPadSnapshot = JSON.parse(
  JSON.stringify(placementSnapshot),
) as WaitdogSnapshot;
if (dogOnPadSnapshot.environment.padPlacement === null) {
  throw new Error("CONTRACT FAIL: placement snapshot lacked its pad");
}
dogOnPadSnapshot.environment.padPlacement = {
  ...dogOnPadSnapshot.environment.padPlacement,
  room: dogOnPadSnapshot.spatial.room,
  x: dogOnPadSnapshot.spatial.x,
  y: dogOnPadSnapshot.spatial.y,
};
const dogOnPadRestored = createSim(0);
dogOnPadRestored.restore(dogOnPadSnapshot);
assert(
  JSON.stringify(dogOnPadRestored.serialize()) ===
    JSON.stringify(dogOnPadSnapshot),
  "reachable dog-on-pad snapshot did not roundtrip",
);

const assertPlacementRestoreRejectedAtomically = (
  candidate: WaitdogSnapshot,
  label: string,
  seed: number,
) => {
  const target = createSim(seed);
  const before = target.serialize();
  let rejected = false;
  try {
    target.restore(candidate);
  } catch {
    rejected = true;
  }
  assert(rejected, `${label} placement snapshot was accepted`);
  assert(
    JSON.stringify(target.serialize()) === JSON.stringify(before),
    `${label} placement restore partially polluted live state`,
  );
};

const unpaidBarrierSnapshot = JSON.parse(
  JSON.stringify(placementSnapshot),
) as WaitdogSnapshot;
const paidBarrier = unpaidBarrierSnapshot.environment.barriers[0];
if (paidBarrier === undefined) {
  throw new Error("CONTRACT FAIL: placement snapshot lacked its barrier");
}
unpaidBarrierSnapshot.environment.barriers.push({
  ...paidBarrier,
  id: "unpaid-clone",
  x: 0.5,
});
assertPlacementRestoreRejectedAtomically(
  unpaidBarrierSnapshot,
  "unpaid barrier clone",
  9602,
);

const doorBarrierSnapshot = JSON.parse(
  JSON.stringify(placementSnapshot),
) as WaitdogSnapshot;
doorBarrierSnapshot.environment.barriers[0] = {
  ...doorBarrierSnapshot.environment.barriers[0],
  x: 0.93,
  y: 0.25,
  width: 0.1,
  height: 0.1,
};
assertPlacementRestoreRejectedAtomically(
  doorBarrierSnapshot,
  "door-blocking barrier",
  9603,
);

const createBarrierEffectSim = (
  seed: number,
  itemId: "barrier-1-panel" | "barrier-4-panel",
): WaitdogUiSim => {
  const sim = createSim(seed);
  const rewardsNeeded = itemId === "barrier-4-panel" ? 6 : 1;
  for (const encounterId of ENCOUNTER_IDS.slice(0, rewardsNeeded)) {
    sim.startEncounter(encounterId);
    solveActiveEncounter(sim);
    sim.dismissEncounterOutcome();
  }
  assert(
    sim.purchaseItem(itemId, 1, `purchase-effect-${itemId}`).ok,
    `${itemId} effect-test purchase failed`,
  );
  const size = itemId === "barrier-4-panel"
    ? { width: 0.5, height: 0.42 }
    : { width: 0.28, height: 0.08 };
  assert(
    sim.placeItem(
      itemId,
      {
        room: "toilet",
        x: 0.55,
        y: 0.72,
        ...size,
        placementId: `effect-${itemId}`,
      },
      `place-effect-${itemId}`,
    ).ok,
    `${itemId} effect-test placement failed`,
  );
  assert(
    !sim.getFullState().blocked,
    `${itemId} globally blocked an unrelated room immediately after placement`,
  );
  return sim;
};

const withPendingCornerEat = (
  source: WaitdogSnapshot,
  room: "kitchen" | "toilet",
): WaitdogSnapshot => {
  const snapshot = JSON.parse(JSON.stringify(source)) as WaitdogSnapshot;
  snapshot.dogRoom = room;
  snapshot.spatial = {
    ...snapshot.spatial,
    room,
    x: 0.86,
    y: 0.3,
    targetRoom: room,
    targetX: 0.86,
    targetY: 0.3,
    route: [],
    activity: "eatPoop",
    moving: false,
  };
  snapshot.currentAction = "eatPoop";
  snapshot.actionStartedAt = snapshot.absoluteMinute;
  snapshot.activePoop = {
    room,
    createdAt: snapshot.absoluteMinute,
    location: "corner",
  };
  snapshot.pendingEatAt = snapshot.absoluteMinute + 1;
  return snapshot;
};

const onePanelEffectSim = createBarrierEffectSim(9610, "barrier-1-panel");
const onePanelBoundarySnapshot = withPendingCornerEat(
  onePanelEffectSim.serialize(),
  "toilet",
);
const onePanelBoundaryRestored = createSim(0);
onePanelBoundaryRestored.restore(onePanelBoundarySnapshot);
assert(
  !onePanelBoundaryRestored.getFullState().blocked,
  "one-panel barrier blocked beyond its room footprint",
);
onePanelBoundaryRestored.advanceMinutes(1);
assert(
  onePanelBoundaryRestored.getFullState().activePoop === null &&
    onePanelBoundaryRestored.getLog().some((event) =>
      event.type === "eatPoop"
    ),
  "one-panel barrier blocked eating outside its covered boundary",
);

const fourPanelEffectSim = createBarrierEffectSim(9611, "barrier-4-panel");
const fourPanelBoundarySnapshot = withPendingCornerEat(
  fourPanelEffectSim.serialize(),
  "toilet",
);
const fourPanelBoundaryRestored = createSim(0);
fourPanelBoundaryRestored.restore(fourPanelBoundarySnapshot);
assert(
  fourPanelBoundaryRestored.getFullState().blocked &&
    JSON.stringify(fourPanelBoundaryRestored.serialize()) ===
      JSON.stringify(fourPanelBoundarySnapshot),
  "four-panel covered block was not recomputed consistently after restore",
);
fourPanelBoundaryRestored.advanceMinutes(1);
assert(
  fourPanelBoundaryRestored.getFullState().activePoop !== null &&
    !fourPanelBoundaryRestored.getLog().some((event) =>
      event.type === "eatPoop"
    ),
  "four-panel barrier did not block eating inside its covered footprint",
);

const unrelatedRoomSnapshot = withPendingCornerEat(
  fourPanelEffectSim.serialize(),
  "kitchen",
);
const unrelatedRoomRestored = createSim(0);
unrelatedRoomRestored.restore(unrelatedRoomSnapshot);
assert(
  !unrelatedRoomRestored.getFullState().blocked,
  "toilet barrier globally blocked a kitchen dog or poop",
);
unrelatedRoomRestored.advanceMinutes(1);
assert(
  unrelatedRoomRestored.getFullState().activePoop === null &&
    unrelatedRoomRestored.getLog().some((event) =>
      event.type === "eatPoop"
    ),
  "unrelated-room barrier prevented kitchen eating",
);

const overlapSim = createSim(9701);
for (const room of ["living", "kitchen", "toilet"] as const) {
  overlapSim.setOwner({ room, focusLocked: false });
  assert(
    !overlapSim.getFullState().ownerDogOverlap,
    `${room} owner relocation overlapped the dog`,
  );
}
overlapSim.moveOwnerTo({ room: "living", x: 0.5, y: 0.56 });
for (let minute = 0; minute < 12; minute += 1) {
  overlapSim.advanceMinutes(1);
  assert(
    !overlapSim.getFullState().ownerDogOverlap,
    "owner and dog footprints overlapped during movement",
  );
}

const overlapRestore = createSim(9702);
const beforeOverlapRestore = overlapRestore.serialize();
const overlappingSnapshot: WaitdogSnapshot = {
  ...beforeOverlapRestore,
  owner: { ...beforeOverlapRestore.owner, room: beforeOverlapRestore.dogRoom },
  ownerSpatial: {
    room: beforeOverlapRestore.dogRoom,
    x: beforeOverlapRestore.spatial.x,
    y: beforeOverlapRestore.spatial.y,
    targetRoom: beforeOverlapRestore.dogRoom,
    targetX: beforeOverlapRestore.spatial.x,
    targetY: beforeOverlapRestore.spatial.y,
    route: [],
    activity: "idle",
    destinationActivity: "idle",
    moving: false,
    collisionRadius: BALANCE.LIFESTYLE.OWNER.COLLISION_RADIUS,
  },
};
let overlapRestoreRejected = false;
try {
  overlapRestore.restore(overlappingSnapshot);
} catch {
  overlapRestoreRejected = true;
}
assert(overlapRestoreRejected, "overlapping v3 snapshot was accepted");
assert(
  JSON.stringify(overlapRestore.serialize()) ===
    JSON.stringify(beforeOverlapRestore),
  "overlapping snapshot partially polluted live state",
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
const storedProfileV3 = memoryStorage.raw();
const settingsV3 = storedProfile.settings as Record<string, unknown>;
const {
  lifestyle: _legacyLifestyle,
  version: _legacySettingsVersion,
  ...legacySettingsFields
} = settingsV3;
memoryStorage.setItem(
  WAITDOG_PROFILE_KEY,
  JSON.stringify({
    ...storedProfile,
    settings: {
      ...legacySettingsFields,
      version: 2,
    },
  }),
);
const migratedProfileV2 = loadProfile(memoryStorage);
assert(
  migratedProfileV2.ok &&
    migratedProfileV2.profile?.settings.version === 3 &&
    migratedProfileV2.profile.settings.lifestyle.selectedStoreCategory ===
      "treat",
  "campaign settings v2 did not migrate to v3 lifestyle defaults",
);
if (storedProfileV3 !== null) {
  memoryStorage.setItem(WAITDOG_PROFILE_KEY, storedProfileV3);
}

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

const directContractAssertionStart = assertionCount;
const closeEnough = (
  first: number,
  second: number,
  tolerance = 1e-9,
): boolean => Math.abs(first - second) <= tolerance;
const OWNER_DOG_SPRITE_HORIZONTAL_HALF_SUM_PX = (122 + 110) / 2;
const OWNER_DOG_SPRITE_VERTICAL_CLEARANCE_PX = 145;
const ownerDogSpriteBoundsSeparated = (
  state: Pick<WaitdogFullState, "ownerSpatial" | "spatial">,
): boolean => {
  if (state.ownerSpatial.room !== state.spatial.room) return true;
  const travel =
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ROOM_TRAVEL_PX[
      state.ownerSpatial.room
    ];
  const horizontalDistancePx =
    Math.abs(state.ownerSpatial.x - state.spatial.x) * travel.x;
  const verticalDistancePx =
    Math.abs(state.ownerSpatial.y - state.spatial.y) * travel.y;
  return horizontalDistancePx >= OWNER_DOG_SPRITE_HORIZONTAL_HALF_SUM_PX ||
    verticalDistancePx >= OWNER_DOG_SPRITE_VERTICAL_CLEARANCE_PX;
};

// C1: fixed axis/diagonal steps and invalid/opposite input rejection.
const directAxis = createSim(10_001);
const directAxisStart = directAxis.getFullState().ownerSpatial;
assert(
  directAxis.moveOwnerBy({ dx: 1, dy: 0 }).ok,
  "C1 positive axis direct step was rejected",
);
const directAxisAfter = directAxis.getFullState().ownerSpatial;
assert(
  closeEnough(
      Math.hypot(
        directAxisAfter.x - directAxisStart.x,
        directAxisAfter.y - directAxisStart.y,
      ),
      BALANCE.LIFESTYLE.OWNER.DIRECT_STEP_DISTANCE,
    ) &&
    directAxisAfter.y === directAxisStart.y,
  "C1 axis direct step did not use the fixed balance distance",
);
assert(
  directAxis.moveOwnerBy({ dx: -1, dy: 0 }).ok &&
    closeEnough(
      directAxis.getFullState().ownerSpatial.x,
      directAxisStart.x,
    ),
  "C1 opposite axis step did not deterministically return to the start",
);

const directDiagonal = createSim(10_002);
const directDiagonalStart = directDiagonal.getFullState().ownerSpatial;
assert(
  directDiagonal.moveOwnerBy({ dx: 1, dy: 1 }).ok,
  "C1 diagonal direct step was rejected",
);
const directDiagonalAfter = directDiagonal.getFullState().ownerSpatial;
const directDiagonalDeltaX =
  directDiagonalAfter.x - directDiagonalStart.x;
const directDiagonalDeltaY =
  directDiagonalAfter.y - directDiagonalStart.y;
assert(
  closeEnough(
      Math.hypot(directDiagonalDeltaX, directDiagonalDeltaY),
      BALANCE.LIFESTYLE.OWNER.DIRECT_STEP_DISTANCE,
    ) &&
    closeEnough(directDiagonalDeltaX, directDiagonalDeltaY),
  "C1 diagonal input was not normalized to the fixed step distance",
);
const beforeZeroVector = directDiagonal.serialize();
assert(
  !directDiagonal.moveOwnerBy({ dx: 0, dy: 0 }).ok &&
    JSON.stringify(directDiagonal.serialize()) ===
      JSON.stringify(beforeZeroVector),
  "C1 canceled opposite inputs did not reject as an atomic zero vector",
);
assert(
  !directDiagonal.moveOwnerBy({ dx: Number.NaN, dy: 0 }).ok &&
    !directDiagonal.moveOwnerBy({ dx: 1.01, dy: 0 }).ok &&
    !directDiagonal.moveOwnerBy({ dx: 0, dy: -1.01 }).ok,
  "C1 non-finite or out-of-range direct input was accepted",
);
const subnormalDiagonal = createSim(10_003);
const subnormalStart = subnormalDiagonal.getFullState().ownerSpatial;
assert(
  subnormalDiagonal.moveOwnerBy({
    dx: Number.MIN_VALUE,
    dy: Number.MIN_VALUE,
  }).ok &&
    closeEnough(
      Math.hypot(
        subnormalDiagonal.getFullState().ownerSpatial.x - subnormalStart.x,
        subnormalDiagonal.getFullState().ownerSpatial.y - subnormalStart.y,
      ),
      BALANCE.LIFESTYLE.OWNER.DIRECT_STEP_DISTANCE,
    ),
  "C1 subnormal finite diagonal input escaped normalization",
);

// C2: room bounds, doorway roundtrip, and deterministic direct traces.
const wallBounded = createSim(10_101, { dogRoom: "toilet" });
for (let step = 0; step < 10; step += 1) {
  if (!wallBounded.moveOwnerBy({ dx: 0, dy: 1 }).ok) {
    throw new Error("CONTRACT FAIL: C2 setup could not reach a non-door wall");
  }
}
let wallTransitioned = false;
for (let step = 0; step < 30; step += 1) {
  if (!wallBounded.moveOwnerBy({ dx: 1, dy: 0 }).ok) {
    break;
  }
  if (wallBounded.getFullState().ownerSpatial.room !== "living") {
    wallTransitioned = true;
    break;
  }
}
const wallPosition = wallBounded.getFullState().ownerSpatial;
const wallTransition = wallPosition.room === "kitchen"
  ? BALANCE.SPATIAL.TRANSITION.living.kitchen
  : BALANCE.SPATIAL.TRANSITION.living.toilet;
assert(
  wallTransitioned &&
    (wallPosition.room === "kitchen" ||
      wallPosition.room === "toilet") &&
    wallPosition.x === wallTransition.entry.x &&
    wallPosition.y === wallTransition.entry.y,
  "C2 soft doorway approach did not snap to the nearest valid door",
);
const wallStableBefore = wallBounded.serialize();
assert(
  wallBounded.moveOwnerBy({ dx: 1, dy: 0 }).ok &&
    wallBounded.getFullState().ownerSpatial.room ===
      wallStableBefore.ownerSpatial.room &&
    wallBounded.getFullState().ownerSpatial.x >= 0 &&
    wallBounded.getFullState().ownerSpatial.x <= 1 &&
    wallBounded.getFullState().ownerSpatial.y >= 0 &&
    wallBounded.getFullState().ownerSpatial.y <= 1,
  "C2 post-door movement escaped coordinate bounds or changed rooms",
);

const doorRoundtrip = createSim(10_102);
for (
  let step = 0;
  step < 30 && doorRoundtrip.getFullState().ownerSpatial.room === "living";
  step += 1
) {
  if (!doorRoundtrip.moveOwnerBy({ dx: 1, dy: 0 }).ok) {
    throw new Error("CONTRACT FAIL: C2 direct doorway approach was blocked");
  }
}
const kitchenEntry = BALANCE.SPATIAL.TRANSITION.living.kitchen.entry;
assert(
  doorRoundtrip.getFullState().ownerSpatial.room === "kitchen" &&
    doorRoundtrip.getFullState().ownerSpatial.x === kitchenEntry.x &&
    doorRoundtrip.getFullState().ownerSpatial.y === kitchenEntry.y,
  "C2 living-to-kitchen direct movement did not reuse the doorway entry",
);
const livingEntry = BALANCE.SPATIAL.TRANSITION.kitchen.living.entry;
assert(
  doorRoundtrip.moveOwnerBy({ dx: -1, dy: 0 }).ok &&
    doorRoundtrip.getFullState().ownerSpatial.room === "living" &&
    doorRoundtrip.getFullState().ownerSpatial.x === livingEntry.x &&
    doorRoundtrip.getFullState().ownerSpatial.y === livingEntry.y,
  "C2 kitchen-to-living direct doorway roundtrip failed",
);

const directTraceA = createSim(10_103);
const directTraceB = createSim(10_103);
const deterministicDirectInputs = [
  { dx: -0.4, dy: 0.8 },
  { dx: 1, dy: 0 },
  { dx: 0.25, dy: -0.75 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: 1 },
];
for (const input of deterministicDirectInputs) {
  directTraceA.moveOwnerBy(input);
  directTraceB.moveOwnerBy(input);
}
assert(
  JSON.stringify(directTraceA.serialize()) ===
    JSON.stringify(directTraceB.serialize()),
  "C2 identical direct input traces were not deterministic",
);

// C3: encounter-time direct movement remains enabled without advancing time.
const encounterDirect = createSim(10_201);
assert(
  encounterDirect.startEncounter("potty").ok,
  "C3 encounter setup failed",
);
const encounterDirectStartedAt =
  encounterDirect.getFullState().absoluteMinute;
const encounterDirectOwnerBefore =
  encounterDirect.getFullState().ownerSpatial;
assert(
  encounterDirect.getDogView().interaction.directControlEnabled &&
    encounterDirect.moveOwnerBy({ dx: -1, dy: 0 }).ok,
  "C3 active encounter disabled direct axis movement",
);
const encounterDirectAfterAxis = encounterDirect.getFullState();
assert(
  encounterDirectAfterAxis.absoluteMinute === encounterDirectStartedAt &&
    encounterDirectAfterAxis.ownerSpatial.x <
      encounterDirectOwnerBefore.x &&
    encounterDirectAfterAxis.ownerSpatial.activity === "responding" &&
    !encounterDirectAfterAxis.ownerSpatial.moving,
  "C3 direct encounter step advanced time or left an invalid activity",
);
assert(
  encounterDirect.stepOwnerToward({
    room: "living",
    x: 0.7,
    y: 0.72,
  }).ok &&
    encounterDirect.getFullState().absoluteMinute ===
      encounterDirectStartedAt &&
    encounterDirect.getFullState().ownerSpatial.activity === "responding",
  "C3 encounter click step advanced game time or lost responding state",
);

// C4: proximity gates encounter actions atomically and progresses in range.
const proximityEncounter = createSim(10_301);
assert(
  proximityEncounter.startEncounter("potty").ok,
  "C4 proximity encounter setup failed",
);
const publicBeforeObserve = proximityEncounter.getDogView();
assert(
  !publicBeforeObserve.interaction.encounterReady &&
    publicBeforeObserve.interaction.encounterDistance !== null &&
    publicBeforeObserve.interaction.encounterDistance >
      BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS &&
    publicBeforeObserve.interaction.nearbyTarget === null,
  "C4 out-of-range encounter interaction was reported ready",
);
assert(
  Object.keys(publicBeforeObserve.interaction).sort().join(",") ===
    [
      "directControlEnabled",
      "encounterDistance",
      "encounterReady",
      "nearbyTarget",
      "targets",
      "contextActions",
    ].sort().join(",") &&
    !("hiddenCauseId" in publicBeforeObserve.activeEncounter!) &&
    publicBeforeObserve.activeEncounter?.inferredCause === null &&
    publicBeforeObserve.activeEncounter?.responseChoices.length === 0 &&
    publicBeforeObserve.activeEncounter?.contextActions.length === 0,
  "C4 public interaction shape changed or exposed a hidden cause field",
);
const outsideActionBefore = proximityEncounter.serialize();
const outsideAction = proximityEncounter.performEncounterAction({
  type: "observe",
});
assert(
  !outsideAction.ok &&
    outsideAction.reason !== null &&
    JSON.stringify(proximityEncounter.serialize()) ===
      JSON.stringify(outsideActionBefore),
  "C4 out-of-range encounter action was not an atomic rejection",
);

const proximityCue = proximityEncounter.getDogView().activeEncounter?.cue;
if (proximityCue?.anchor === null || proximityCue === undefined) {
  throw new Error("CONTRACT FAIL: C4 setup lacked an anchored cue");
}
let proximitySteps = 0;
while (
  !proximityEncounter.getDogView().interaction.encounterReady &&
  proximitySteps < 100
) {
  const result = proximityEncounter.stepOwnerToward({
    room: proximityCue.room,
    x: proximityCue.anchor.x,
    y: proximityCue.anchor.y,
  });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: C4 cue approach failed: ${result.reason}`);
  }
  proximitySteps += 1;
}
const readyInteraction = proximityEncounter.getDogView().interaction;
const proximityReadyState = proximityEncounter.getFullState();
const proximityCueSeparation = ownerDogFootprintSeparation(
  proximityReadyState.ownerSpatial,
  { room: proximityCue.room, ...proximityCue.anchor },
);
assert(
  proximitySteps > 0 &&
    readyInteraction.encounterReady &&
    readyInteraction.encounterDistance !== null &&
    (
      readyInteraction.encounterDistance <=
          BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS ||
        proximityCueSeparation <=
          BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE
    ) &&
    readyInteraction.nearbyTarget === "cue" &&
    proximityReadyState.absoluteMinute ===
      outsideActionBefore.absoluteMinute,
  "C4 fixed click steps did not reach the cue with frozen game time",
);
const privateEncounter =
  proximityEncounter.serialize().encounterDirector.active;
if (privateEncounter === null) {
  throw new Error("CONTRACT FAIL: C4 active encounter disappeared");
}
const proximityDefinition = ENCOUNTER_DEFINITIONS.find((definition) =>
  definition.id === privateEncounter.encounterId
);
const correctCause = proximityDefinition?.causes.find((cause) =>
  cause.id === privateEncounter.hiddenCauseId
);
if (correctCause === undefined) {
  throw new Error("CONTRACT FAIL: C4 hidden cause lacked a response");
}
assert(
  proximityEncounter.performEncounterAction({ type: "observe" }).ok &&
    proximityEncounter.getDogView().activeEncounter?.stage === "response",
  "C4 in-range observe did not internally confirm the hidden cause",
);
assert(
  proximityEncounter.performEncounterAction({
    type: "response",
    choiceId: correctCause.correctResponseId,
  }).ok &&
    proximityEncounter.getDogView().activeEncounter?.stage ===
      "reinforcement",
  "C4 in-range response did not advance to reinforcement",
);
const economyBeforeReinforcement =
  proximityEncounter.getFullState().economy;
assert(
  proximityEncounter.performEncounterAction({
    type: "reinforcement",
    choiceId: "praise",
  }).ok &&
    proximityEncounter.getDogView().activeEncounter?.stage === "outcome" &&
    proximityEncounter.getFullState().economy.carePoints ===
      economyBeforeReinforcement.carePoints + 1,
  "C4 in-range reinforcement did not complete the encounter economy",
);

assert(
  BALANCE.LIFESTYLE.OWNER.INTERACTION_RADIUS === 0.12 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .HORIZONTAL_CLEARANCE_PX >= 120 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .VERTICAL_CLEARANCE_PX >= 150 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .SUPERELLIPSE_EXPONENT >= 8 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE > 1,
  "C4 encounter proximity did not preserve sprite-sized visual clearance",
);

const whineProximity = createSim(10_302);
assert(
  whineProximity.startEncounter("whine").ok &&
    whineProximity.getDogView().activeEncounter?.cue.anchor === null &&
    !whineProximity.getDogView().interaction.encounterReady,
  "C4 null-anchor whine did not start outside interaction range",
);
let whineApproachSteps = 0;
while (
  !whineProximity.getDogView().interaction.encounterReady &&
  whineApproachSteps < 100
) {
  const state = whineProximity.getFullState();
  const result = whineProximity.stepOwnerToward({
    room: state.spatial.room,
    x: state.spatial.x,
    y: state.spatial.y,
  });
  if (!result.ok) {
    throw new Error(
      `CONTRACT FAIL: C4 whine approach failed: ${result.reason}`,
    );
  }
  if (whineProximity.getFullState().ownerDogOverlap) {
    throw new Error(
      "CONTRACT FAIL: C4 whine approach overlapped owner and dog",
    );
  }
  whineApproachSteps += 1;
}
const whineReadyView = whineProximity.getDogView();
const whineReadyState = whineProximity.getFullState();
const whineOwnerDogDistance = Math.hypot(
  whineReadyState.ownerSpatial.x - whineReadyState.spatial.x,
  whineReadyState.ownerSpatial.y - whineReadyState.spatial.y,
);
const whineOwnerDogSeparation = ownerDogFootprintSeparation(
  whineReadyState.ownerSpatial,
  whineReadyState.spatial,
);
assert(
  whineApproachSteps > 0 &&
    whineReadyView.interaction.encounterReady &&
    whineReadyView.interaction.encounterDistance !== null &&
    closeEnough(
      whineReadyView.interaction.encounterDistance,
      whineOwnerDogDistance,
    ) &&
    whineOwnerDogSeparation >= 1 - 1e-9 &&
    (
      whineOwnerDogDistance <=
          BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS ||
        whineOwnerDogSeparation <=
          BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE
    ) &&
    !whineReadyState.ownerDogOverlap,
  "C4 whine could not become ready while preserving owner/dog safety",
);
assert(
  whineProximity.performEncounterAction({ type: "observe" }).ok &&
    whineProximity.getDogView().activeEncounter?.stage === "response",
  "C4 ready null-anchor whine did not advance observe to response",
);

// C5: every successful direct step preserves owner/dog separation.
const directOverlap = createSim(10_401);
let collisionConstrained = false;
for (let step = 0; step < 24; step += 1) {
  const state = directOverlap.getFullState();
  const dogBeforeStep = state.spatial;
  const result = directOverlap.moveOwnerBy({
    dx: state.spatial.x - state.ownerSpatial.x,
    dy: state.spatial.y - state.ownerSpatial.y,
  });
  const separation = ownerDogFootprintSeparation(
    directOverlap.getFullState().ownerSpatial,
    directOverlap.getFullState().spatial,
  );
  if (!result.ok || separation <= 1.05) collisionConstrained = true;
  assert(
    !directOverlap.getFullState().ownerDogOverlap &&
      !directOverlap.getDogView().ownerDogOverlap &&
      ownerDogFootprintSeparation(
        directOverlap.getFullState().ownerSpatial,
        directOverlap.getFullState().spatial,
      ) >= 1 - 1e-9 &&
      JSON.stringify(directOverlap.getFullState().spatial) ===
        JSON.stringify(dogBeforeStep),
    `C5 owner/dog footprints overlapped or dog moved after step ${step + 1}`,
  );
}
assert(
  collisionConstrained,
  "C5 owner movement never reached or respected the dog collision boundary",
);

const initialSpriteSeparation = createSim(10_402).getFullState();
assert(
  !initialSpriteSeparation.ownerDogOverlap &&
    ownerDogSpriteBoundsSeparated(initialSpriteSeparation),
  "C5 fresh living-room spawn visually overlapped the dog sprites",
);

const horizontalApproach = createSim(10_403);
const horizontalSnapshot = horizontalApproach.serialize();
horizontalSnapshot.dogRoom = "living";
horizontalSnapshot.spatial = {
  ...horizontalSnapshot.spatial,
  room: "living",
  x: 0.5,
  y: 0.5,
  targetRoom: "living",
  targetX: 0.5,
  targetY: 0.5,
  route: [],
  activity: "idle",
  moving: false,
};
horizontalSnapshot.ownerSpatial = {
  ...horizontalSnapshot.ownerSpatial,
  room: "living",
  x: 0.9,
  y: 0.5,
  targetRoom: "living",
  targetX: 0.9,
  targetY: 0.5,
  route: [],
  activity: "idle",
  destinationActivity: "idle",
  moving: false,
};
horizontalApproach.restore(horizontalSnapshot);
const horizontalDogBefore = horizontalApproach.getFullState().spatial;
for (let step = 0; step < 40; step += 1) {
  const state = horizontalApproach.getFullState();
  const result = horizontalApproach.moveOwnerBy({ dx: -1, dy: 0 });
  assert(
    !horizontalApproach.getFullState().ownerDogOverlap &&
      ownerDogSpriteBoundsSeparated(horizontalApproach.getFullState()) &&
      JSON.stringify(horizontalApproach.getFullState().spatial) ===
        JSON.stringify(horizontalDogBefore),
    `C5 horizontal approach violated sprite separation at step ${step + 1}`,
  );
  if (
    !result.ok ||
    ownerDogFootprintSeparation(
        horizontalApproach.getFullState().ownerSpatial,
        horizontalApproach.getFullState().spatial,
      ) <= 1.05
  ) {
    break;
  }
  assert(
    horizontalApproach.getFullState().ownerSpatial.x < state.ownerSpatial.x,
    `C5 horizontal approach stalled before the boundary at step ${step + 1}`,
  );
}
assert(
  ownerDogFootprintSeparation(
      horizontalApproach.getFullState().ownerSpatial,
      horizontalApproach.getFullState().spatial,
    ) <= 1.05 &&
    ownerDogSpriteBoundsSeparated(horizontalApproach.getFullState()),
  "C5 horizontal approach did not reach a visibly separated boundary",
);

const diagonalApproach = createSim(10_404);
const diagonalSnapshot = diagonalApproach.serialize();
diagonalSnapshot.dogRoom = "living";
diagonalSnapshot.spatial = {
  ...diagonalSnapshot.spatial,
  room: "living",
  x: 0.5,
  y: 0.5,
  targetRoom: "living",
  targetX: 0.5,
  targetY: 0.5,
  route: [],
  activity: "idle",
  moving: false,
};
diagonalSnapshot.ownerSpatial = {
  ...diagonalSnapshot.ownerSpatial,
  room: "living",
  x: 0.9,
  y: 0.7,
  targetRoom: "living",
  targetX: 0.9,
  targetY: 0.7,
  route: [],
  activity: "idle",
  destinationActivity: "idle",
  moving: false,
};
diagonalApproach.restore(diagonalSnapshot);
const diagonalDogBefore = diagonalApproach.getFullState().spatial;
let diagonalBoundaryReached = false;
for (let step = 0; step < 40; step += 1) {
  const result = diagonalApproach.stepOwnerToward({
    room: "living",
    x: diagonalDogBefore.x,
    y: diagonalDogBefore.y,
  });
  const state = diagonalApproach.getFullState();
  const separation = ownerDogFootprintSeparation(
    state.ownerSpatial,
    state.spatial,
  );
  assert(
    !state.ownerDogOverlap &&
      ownerDogSpriteBoundsSeparated(state) &&
      JSON.stringify(state.spatial) === JSON.stringify(diagonalDogBefore),
    `C5 diagonal approach violated sprite separation at step ${step + 1}`,
  );
  if (!result.ok || separation <= 1.05) {
    diagonalBoundaryReached = true;
    break;
  }
}
assert(
  diagonalBoundaryReached &&
    ownerDogSpriteBoundsSeparated(diagonalApproach.getFullState()),
  "C5 diagonal approach did not reach a visibly separated boundary",
);

// C6: click stepping follows the existing toilet-living-kitchen route.
const clickRoute = createSim(10_501, {
  owner: { room: "toilet", focusLocked: false },
});
const clickTarget = { room: "kitchen" as const, x: 0.4, y: 0.4 };
const clickStartedAt = clickRoute.getFullState().absoluteMinute;
const clickFirstBefore = clickRoute.getFullState().ownerSpatial;
assert(
  clickRoute.stepOwnerToward(clickTarget).ok,
  "C6 first click step was rejected",
);
const clickFirstAfter = clickRoute.getFullState().ownerSpatial;
assert(
  closeEnough(
    Math.hypot(
      clickFirstAfter.x - clickFirstBefore.x,
      clickFirstAfter.y - clickFirstBefore.y,
    ),
    BALANCE.LIFESTYLE.OWNER.DIRECT_STEP_DISTANCE,
  ),
  "C6 click movement did not use the fixed direct step",
);
const clickRoomTrace = ["toilet"];
let clickRouteSteps = 1;
while (clickRouteSteps < 180) {
  const ownerSpatial = clickRoute.getFullState().ownerSpatial;
  if (
    ownerSpatial.room === clickTarget.room &&
    ownerSpatial.x === clickTarget.x &&
    ownerSpatial.y === clickTarget.y
  ) {
    break;
  }
  const result = clickRoute.stepOwnerToward(clickTarget);
  if (!result.ok) {
    throw new Error(
      `CONTRACT FAIL: C6 routed click step failed: ${result.reason}`,
    );
  }
  const room = clickRoute.getFullState().ownerSpatial.room;
  if (clickRoomTrace[clickRoomTrace.length - 1] !== room) {
    clickRoomTrace.push(room);
  }
  clickRouteSteps += 1;
}
const clickRouteFinal = clickRoute.getFullState();
assert(
  clickRoomTrace.join(",") === "toilet,living,kitchen" &&
    clickRouteFinal.ownerSpatial.room === clickTarget.room &&
    clickRouteFinal.ownerSpatial.x === clickTarget.x &&
    clickRouteFinal.ownerSpatial.y === clickTarget.y,
  "C6 click stepping bypassed the living-room transition route",
);
assert(
  clickRouteFinal.absoluteMinute === clickStartedAt &&
    clickRouteFinal.ownerSpatial.activity === "idle" &&
    !clickRouteFinal.ownerSpatial.moving &&
    !clickRouteFinal.ownerDogOverlap,
  "C6 click route advanced time or left an invalid final owner state",
);

// C7: nearby work snaps to the exact hotspot and retains block invariants.
const nearbyWork = createSim(10_601);
const farWorkBefore = nearbyWork.serialize();
assert(
  !nearbyWork.performWorkBlock("direct-work").ok &&
    JSON.stringify(nearbyWork.serialize()) === JSON.stringify(farWorkBefore),
  "C7 work started outside the computer interaction radius",
);
for (
  let step = 0;
  step < 20 &&
  nearbyWork.getDogView().interaction.nearbyTarget !== "computer";
  step += 1
) {
  const owner = nearbyWork.getFullState().ownerSpatial;
  const computer = BALANCE.LIFESTYLE.OWNER.HOTSPOT.computer;
  nearbyWork.moveOwnerBy({
    dx: computer.x - owner.x,
    dy: computer.y - owner.y,
  });
}
assert(
  nearbyWork.getDogView().interaction.nearbyTarget === "computer" &&
    nearbyWork.getDogView().work.state === "ready",
  "C7 direct movement did not expose the nearby computer target",
);
const nearbyWorkStartedAt = nearbyWork.getFullState().absoluteMinute;
const nearbyWorkMoney = nearbyWork.getFullState().economy.money;
assert(
  nearbyWork.performWorkBlock("direct-work").ok,
  "C7 nearby computer work block was rejected",
);
const nearbyWorkAfterBlock = nearbyWork.getFullState();
const computerHotspot = BALANCE.LIFESTYLE.OWNER.HOTSPOT.computer;
assert(
  nearbyWorkAfterBlock.ownerSpatial.room === computerHotspot.room &&
    nearbyWorkAfterBlock.ownerSpatial.x === computerHotspot.x &&
    nearbyWorkAfterBlock.ownerSpatial.y === computerHotspot.y &&
    nearbyWorkAfterBlock.ownerSpatial.activity === "working",
  "C7 work did not snap the owner to the exact computer hotspot",
);
assert(
  nearbyWorkAfterBlock.work.progress === 25 &&
    nearbyWorkAfterBlock.absoluteMinute ===
      nearbyWorkStartedAt +
        BALANCE.LIFESTYLE.ECONOMY.WORK.BLOCK_MINUTES &&
    nearbyWorkAfterBlock.economy.money === nearbyWorkMoney,
  "C7 first nearby work block changed the 25 percent/time/pay invariant",
);
const activeWorkBeforeDirect = nearbyWork.serialize();
assert(
  nearbyWork.moveOwnerBy({ dx: 1, dy: 0 }).ok &&
    nearbyWork.getDogView().interaction.directControlEnabled &&
    !nearbyWork.getFullState().work.active &&
    !nearbyWork.getFullState().work.seated &&
    nearbyWork.getFullState().work.progress ===
      activeWorkBeforeDirect.work.progress &&
    JSON.stringify(nearbyWork.getFullState().spatial) ===
      JSON.stringify(activeWorkBeforeDirect.spatial),
  "C7 direct movement did not leave the seat or moved the dog/work progress",
);
assert(
  nearbyWork.performWorkBlock("direct-work").ok &&
    nearbyWork.getFullState().work.progress === 50 &&
    nearbyWork.getFullState().work.alert !== null,
  "C7 second block did not preserve the existing work alert",
);
const alertWorkBeforeDirect = nearbyWork.serialize();
assert(
  !nearbyWork.stepOwnerToward({
    room: "living",
    x: 0.5,
    y: 0.5,
  }).ok &&
    !nearbyWork.getDogView().interaction.directControlEnabled &&
    JSON.stringify(nearbyWork.serialize()) ===
      JSON.stringify(alertWorkBeforeDirect),
  "C7 click movement mutated a pending work alert",
);

// C8: direct state roundtrips without adding held input or derived view data.
const directSnapshot = clickRoute.serialize();
const directSnapshotRecord =
  directSnapshot as unknown as Record<string, unknown>;
assert(
  directSnapshot.version === 4 &&
    !("interaction" in directSnapshotRecord) &&
    !("heldInput" in directSnapshotRecord) &&
    !("directControlEnabled" in directSnapshotRecord),
  "C8 snapshot persisted direct input or derived interaction state",
);
const directRestored = createSim(0);
directRestored.restore(directSnapshot);
assert(
  JSON.stringify(directRestored.serialize()) ===
    JSON.stringify(directSnapshot) &&
    JSON.stringify(directRestored.getDogView().interaction) ===
      JSON.stringify(clickRoute.getDogView().interaction),
  "C8 routed direct-control snapshot did not restore identically",
);
const activeDirectSnapshot = encounterDirect.serialize();
const activeDirectRestored = createSim(1);
activeDirectRestored.restore(activeDirectSnapshot);
assert(
  JSON.stringify(activeDirectRestored.serialize()) ===
      JSON.stringify(activeDirectSnapshot) &&
    JSON.stringify(activeDirectRestored.getDogView().interaction) ===
      JSON.stringify(encounterDirect.getDogView().interaction) &&
    activeDirectRestored.getFullState().ownerSpatial.activity ===
      "responding",
  "C8 active-encounter direct state did not roundtrip identically",
);
assert(
  assertionCount - directContractAssertionStart >= 50,
  "C1-C8 direct-control contract contains fewer than 50 assertions",
);

const worldContractAssertionStart = assertionCount;

const moveOwnerNearWorldTarget = (
  sim: WaitdogUiSim,
  targetId: string,
  maxSteps = 180,
): void => {
  for (let step = 0; step < maxSteps; step += 1) {
    const target = sim.getDogView().interaction.targets.find((candidate) =>
      candidate.id === targetId
    );
    if (target === undefined) {
      throw new Error(`CONTRACT FAIL: missing world target ${targetId}`);
    }
    if (target.nearby) return;
    const result = sim.stepOwnerToward({
      room: target.room,
      x: target.x,
      y: target.y,
    });
    if (!result.ok) {
      throw new Error(
        `CONTRACT FAIL: could not approach ${targetId}: ${result.reason}`,
      );
    }
  }
  throw new Error(`CONTRACT FAIL: approach to ${targetId} exceeded step cap`);
};

// M1-M2: v4 state and public encounter redaction/reveal.
const automaticEncounter = createSim(11_001);
const automaticBefore = automaticEncounter.getDogView();
assert(
  automaticBefore.activeEncounter === null &&
    automaticBefore.interaction.targets.some((target) =>
      target.id === "computer" &&
      target.x === WORLD_STATIONS.computer.x &&
      target.y === WORLD_STATIONS.computer.y
    ) &&
    automaticBefore.interaction.targets.some((target) =>
      target.id === "foodBowl" &&
      target.x === WORLD_STATIONS.foodBowl.x &&
      target.y === WORLD_STATIONS.foodBowl.y
    ) &&
    automaticBefore.interaction.targets.some((target) =>
      target.id === "waterBowl" &&
      target.x === WORLD_STATIONS.waterBowl.x &&
      target.y === WORLD_STATIONS.waterBowl.y
    ) &&
    automaticBefore.interaction.targets.some((target) =>
      target.id === "bath" &&
      target.x === WORLD_STATIONS.bath.x &&
      target.y === WORLD_STATIONS.bath.y
    ),
  "M1 fresh public view missed static world stations",
);
assert(
  automaticEncounter.ensureFirstEncounter().ok &&
    automaticEncounter.getDogView().activeEncounter?.kind === "potty",
  "M2 first encounter API did not start the tutorial encounter",
);
const automaticStartedSnapshot = automaticEncounter.serialize();
assert(
  automaticEncounter.ensureFirstEncounter().ok &&
    JSON.stringify(automaticEncounter.serialize()) ===
      JSON.stringify(automaticStartedSnapshot),
  "M2 repeated first encounter API call was not idempotent",
);
const automaticRedacted = automaticEncounter.getDogView();
const automaticPublicJson = JSON.stringify(automaticRedacted.activeEncounter);
assert(
  automaticRedacted.activeEncounter?.inferredCause === null &&
    automaticRedacted.activeEncounter.responseChoices.length === 0 &&
    automaticRedacted.activeEncounter.contextActions.length === 0 &&
    !automaticPublicJson.includes("hiddenCauseId") &&
    !automaticPublicJson.includes("correctResponseId"),
  "M2 pre-observation public view exposed an inferred cause or answer",
);
assert(
  automaticRedacted.interaction.targets.some((target) =>
    target.id === "cue" &&
    target.actions.length === 1 &&
    target.actions[0].id === "encounter:observe"
  ),
  "M2 active encounter did not expose one nearby-observe world action",
);
moveOwnerNearWorldTarget(automaticEncounter, "cue");
assert(
  automaticEncounter.performWorldAction("encounter:observe").ok,
  "M2 nearby world observe action was rejected",
);
const automaticObserved = automaticEncounter.getDogView().activeEncounter;
assert(
  automaticObserved?.stage === "response" &&
    typeof automaticObserved.inferredCause === "string" &&
    automaticObserved.inferredCause.length > 0 &&
    automaticObserved.contextActions.length > 0 &&
    automaticObserved.contextActions.length <= 3 &&
    automaticObserved.responseChoices.length ===
      automaticObserved.contextActions.length,
  "M2 observation did not reveal one short cause and up to three actions",
);
assert(
  !JSON.stringify(automaticObserved).includes("hiddenCauseId") &&
    !JSON.stringify(automaticObserved).includes("correctResponseId"),
  "M2 observed public view exposed the stored hidden answer",
);

const firstMissionCollision = createSim(11_003);
const firstMissionSnapshot = firstMissionCollision.serialize();
firstMissionSnapshot.spatial.x = 0.7;
firstMissionSnapshot.spatial.y = 0.72;
firstMissionSnapshot.spatial.targetX = 0.7;
firstMissionSnapshot.spatial.targetY = 0.72;
firstMissionCollision.restore(firstMissionSnapshot);
assert(
  firstMissionCollision.ensureFirstEncounter().ok,
  "M2 visual collision setup could not start the first encounter",
);
const firstMissionDogBefore = JSON.stringify(
  firstMissionCollision.getFullState().spatial,
);
moveOwnerNearWorldTarget(firstMissionCollision, "cue");
const firstMissionReady = firstMissionCollision.getFullState();
const firstMissionReadyInteraction =
  firstMissionCollision.getDogView().interaction;
const firstMissionSeparation = ownerDogFootprintSeparation(
  firstMissionReady.ownerSpatial,
  firstMissionReady.spatial,
);
assert(
  firstMissionCollision.getDogView().interaction.nearbyTarget === "cue" &&
    firstMissionSeparation >= 1 - 1e-9 &&
    firstMissionReadyInteraction.encounterDistance !== null &&
    (
      firstMissionReadyInteraction.encounterDistance <=
          BALANCE.LIFESTYLE.OWNER.ENCOUNTER_INTERACTION_RADIUS ||
        firstMissionSeparation <=
          BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE
    ) &&
    !firstMissionReady.ownerDogOverlap &&
    JSON.stringify(firstMissionReady.spatial) === firstMissionDogBefore,
  "M2 first cue was not reachable with visual owner/dog clearance",
);
assert(
  firstMissionCollision.performWorldAction("encounter:observe").ok,
  "M2 visually separated first cue could not be observed",
);
const firstMissionInternal =
  firstMissionCollision.getFullState().encounterDirector.active;
const firstMissionDefinition = ENCOUNTER_DEFINITIONS.find((definition) =>
  definition.id === firstMissionInternal?.encounterId
);
const firstMissionCause = firstMissionDefinition?.causes.find((cause) =>
  cause.id === firstMissionInternal?.hiddenCauseId
);
if (firstMissionCause === undefined) {
  throw new Error("CONTRACT FAIL: M2 first cue cause setup was missing");
}
assert(
  firstMissionCollision.performWorldAction(
    `encounter:response:${firstMissionCause.correctResponseId}`,
  ).ok &&
    firstMissionCollision.performWorldAction(
      "encounter:reinforce:praise",
    ).ok,
  "M2 first cue could not advance through response and reinforcement",
);
const firstMissionOutcome = firstMissionCollision.getFullState();
assert(
  firstMissionCollision.getDogView().activeEncounter?.stage === "outcome" &&
    ownerDogFootprintSeparation(
        firstMissionOutcome.ownerSpatial,
        firstMissionOutcome.spatial,
      ) >= 1 - 1e-9 &&
    !firstMissionOutcome.ownerDogOverlap &&
    JSON.stringify(firstMissionOutcome.spatial) === firstMissionDogBefore,
  "M2 first mission outcome overlapped or moved the dog",
);

const malformedWorldRestore = createSim(11_002);
const malformedWorldBaseline = malformedWorldRestore.serialize();
const rejectMalformedWorldSnapshot = (
  mutate: (snapshot: WaitdogSnapshot) => void,
  label: string,
) => {
  const candidate = JSON.parse(
    JSON.stringify(malformedWorldBaseline),
  ) as WaitdogSnapshot;
  mutate(candidate);
  let rejected = false;
  try {
    malformedWorldRestore.restore(candidate);
  } catch {
    rejected = true;
  }
  assert(rejected, `M1 malformed ${label} snapshot was accepted`);
  assert(
    JSON.stringify(malformedWorldRestore.serialize()) ===
      JSON.stringify(malformedWorldBaseline),
    `M1 malformed ${label} restore partially changed live state`,
  );
};
rejectMalformedWorldSnapshot((snapshot) => {
  snapshot.environment.foodBowl = { itemId: null, level: 1 };
}, "food bowl");
rejectMalformedWorldSnapshot((snapshot) => {
  snapshot.environment.waterBowl.level = 101;
}, "water bowl");
rejectMalformedWorldSnapshot((snapshot) => {
  (snapshot.work as unknown as Record<string, unknown>).heldInput = true;
}, "held input");
rejectMalformedWorldSnapshot((snapshot) => {
  snapshot.work.seated = true;
}, "remote seated work");

// M3: delta-time movement, soft doors, room graph parity, and dog immutability.
const deltaFrame = createSim(11_101);
const deltaFrameStart = deltaFrame.getFullState().ownerSpatial;
assert(
  deltaFrame.moveOwnerBy({
    dx: 1,
    dy: 1,
    elapsedMs: BALANCE.LIFESTYLE.OWNER.DIRECT_REFERENCE_MS,
  }).ok,
  "M3 reference delta-time movement was rejected",
);
const deltaFrameAfter = deltaFrame.getFullState().ownerSpatial;
assert(
  closeEnough(
    Math.hypot(
      deltaFrameAfter.x - deltaFrameStart.x,
      deltaFrameAfter.y - deltaFrameStart.y,
    ),
    BALANCE.LIFESTYLE.OWNER.DIRECT_STEP_DISTANCE,
  ) &&
    closeEnough(
      deltaFrameAfter.x - deltaFrameStart.x,
      deltaFrameAfter.y - deltaFrameStart.y,
    ),
  "M3 reference delta-time diagonal was not normalized",
);
const deltaLong = createSim(11_102);
const deltaLongStart = deltaLong.getFullState().ownerSpatial;
assert(
  deltaLong.moveOwnerBy({ dx: 1, dy: 0, elapsedMs: 50 }).ok &&
    closeEnough(
      deltaLong.getFullState().ownerSpatial.x - deltaLongStart.x,
      BALANCE.LIFESTYLE.OWNER.DIRECT_SPEED_PER_SECOND * 0.05,
    ),
  "M3 elapsed milliseconds did not scale direct distance",
);
const invalidDeltaBefore = deltaLong.serialize();
assert(
  !deltaLong.moveOwnerBy({ dx: 1, dy: 0, elapsedMs: 0 }).ok &&
    !deltaLong.moveOwnerBy({
      dx: 1,
      dy: 0,
      elapsedMs: BALANCE.LIFESTYLE.OWNER.MAX_INPUT_DELTA_MS + 1,
    }).ok &&
    JSON.stringify(deltaLong.serialize()) ===
      JSON.stringify(invalidDeltaBefore),
  "M3 invalid delta-time input changed state",
);

for (const [index, y] of [0.12, 0.45, 0.88].entries()) {
  const softDoor = createSim(11_110 + index);
  const softDoorSnapshot = softDoor.serialize();
  softDoorSnapshot.ownerSpatial.x = 0.96;
  softDoorSnapshot.ownerSpatial.y = y;
  softDoorSnapshot.ownerSpatial.targetX = 0.96;
  softDoorSnapshot.ownerSpatial.targetY = y;
  softDoor.restore(softDoorSnapshot);
  assert(
    softDoor.moveOwnerBy({ dx: 1, dy: 0 }).ok,
    `M3 soft door rejected approach y=${y}`,
  );
  const softDoorOwner = softDoor.getFullState().ownerSpatial;
  const expectedRoom = y < 0.5 ? "kitchen" : "toilet";
  const expectedEntry =
    BALANCE.SPATIAL.TRANSITION.living[expectedRoom].entry;
  assert(
    softDoorOwner.room === expectedRoom &&
      softDoorOwner.x === expectedEntry.x &&
      softDoorOwner.y === expectedEntry.y,
    `M3 soft door did not auto-snap y=${y} to the nearest entry`,
  );
}

const wasdRoute = createSim(11_120, {
  owner: { room: "toilet", focusLocked: false },
});
const wasdRoomTrace = ["toilet"];
for (let step = 0; step < 80; step += 1) {
  const ownerSpatial = wasdRoute.getFullState().ownerSpatial;
  if (ownerSpatial.room === "living") break;
  const result = wasdRoute.moveOwnerBy({ dx: -1, dy: 0 });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: M3 toilet exit failed: ${result.reason}`);
  }
  if (wasdRoomTrace[wasdRoomTrace.length - 1] !==
      wasdRoute.getFullState().ownerSpatial.room) {
    wasdRoomTrace.push(wasdRoute.getFullState().ownerSpatial.room);
  }
}
for (let step = 0; step < 40; step += 1) {
  const ownerSpatial = wasdRoute.getFullState().ownerSpatial;
  if (ownerSpatial.y <= 0.4) break;
  const result = wasdRoute.moveOwnerBy({ dx: 0, dy: -1 });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: M3 living alignment failed: ${result.reason}`);
  }
}
for (let step = 0; step < 80; step += 1) {
  const ownerSpatial = wasdRoute.getFullState().ownerSpatial;
  if (ownerSpatial.room === "kitchen") break;
  const result = wasdRoute.moveOwnerBy({ dx: 1, dy: 0 });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: M3 kitchen entry failed: ${result.reason}`);
  }
  if (wasdRoomTrace[wasdRoomTrace.length - 1] !==
      wasdRoute.getFullState().ownerSpatial.room) {
    wasdRoomTrace.push(wasdRoute.getFullState().ownerSpatial.room);
  }
}
assert(
  wasdRoomTrace.join(",") === clickRoomTrace.join(",") &&
    wasdRoute.getFullState().ownerSpatial.room === "kitchen",
  "M3 WASD and click movement did not share the room graph",
);
assert(
  [wasdRoute, clickRoute].every((sim) => {
    const owner = sim.getFullState().ownerSpatial;
    return owner.x >= 0 && owner.x <= 1 && owner.y >= 0 && owner.y <= 1;
  }),
  "M3 click or WASD route escaped coordinate bounds",
);

const clickCollision = createSim(11_130);
const clickCollisionDog = clickCollision.getFullState().spatial;
let clickCollisionConstrained = false;
for (let step = 0; step < 40; step += 1) {
  const result = clickCollision.stepOwnerToward({
    room: clickCollisionDog.room,
    x: clickCollisionDog.x,
    y: clickCollisionDog.y,
  });
  const separation = ownerDogFootprintSeparation(
    clickCollision.getFullState().ownerSpatial,
    clickCollision.getFullState().spatial,
  );
  assert(
    JSON.stringify(clickCollision.getFullState().spatial) ===
      JSON.stringify(clickCollisionDog) &&
      !clickCollision.getFullState().ownerDogOverlap &&
      separation >= 1 - 1e-9,
    `M3 click collision attempt ${step + 1} moved the dog`,
  );
  if (!result.ok || separation <= 1.05) clickCollisionConstrained = true;
}
assert(
  clickCollisionConstrained,
  "M3 click movement never reached or respected the dog collision boundary",
);

// M4-M5: world targets, remote no-ops, held work and one-time salary.
const poopTargetSim = createSim(11_201);
const poopTargetSnapshot = poopTargetSim.serialize();
poopTargetSnapshot.activePoop = {
  room: "living",
  createdAt: poopTargetSnapshot.absoluteMinute,
  location: "corner",
};
poopTargetSim.restore(poopTargetSnapshot);
assert(
  poopTargetSim.getDogView().interaction.targets.some((target) =>
    target.id === "activePoop" &&
    target.room === "living" &&
    target.actions[0]?.id === "poop:cleanup"
  ) &&
    poopTargetSim.getDogView().interaction.targets.some((target) =>
      target.kind === "door"
    ) &&
    poopTargetSim.getDogView().interaction.targets.some((target) =>
      target.id === "dog"
    ),
  "M4 public world targets omitted dog, poop, or doors",
);

const heldWork = createSim(11_301);
const remoteWorkBefore = heldWork.serialize();
assert(
  !heldWork.sitAtComputer("held-gig").ok &&
    !heldWork.advanceWorkHold(250).ok &&
    JSON.stringify(heldWork.serialize()) === JSON.stringify(remoteWorkBefore),
  "M5 remote work changed state",
);
moveOwnerNearWorldTarget(heldWork, "computer");
assert(
  heldWork.sitAtComputer("held-gig").ok &&
    heldWork.getFullState().work.seated &&
    heldWork.getFullState().work.active &&
    heldWork.getDogView().work.seated,
  "M5 nearby sit did not create the explicit seated state",
);
const seatedWorkSnapshot = heldWork.serialize();
assert(
  seatedWorkSnapshot.work.seated &&
    !("heldInput" in
      (seatedWorkSnapshot.work as unknown as Record<string, unknown>)) &&
    !("holding" in
      (seatedWorkSnapshot.work as unknown as Record<string, unknown>)),
  "M5 snapshot omitted seat state or persisted held input",
);
const heldMoneyBefore = heldWork.getFullState().economy.money;
const heldClockBefore = heldWork.getFullState().absoluteMinute;
assert(
  heldWork.advanceWorkHold(1_000).ok &&
    heldWork.getFullState().work.progress === 12.5 &&
    heldWork.getFullState().economy.money === heldMoneyBefore &&
    heldWork.getFullState().absoluteMinute === heldClockBefore,
  "M5 one-second hold did not add smooth proportional progress",
);
const releasedProgress = heldWork.getFullState().work.progress;
heldWork.advanceMinutes(2);
assert(
  heldWork.getFullState().work.progress === releasedProgress,
  "M5 work progressed after hold ticks stopped",
);
const partialWorkSnapshot = heldWork.serialize();
const partialWorkRestored = createSim(0);
partialWorkRestored.restore(partialWorkSnapshot);
assert(
  partialWorkRestored.getFullState().work.progress === 12.5 &&
    partialWorkRestored.getFullState().work.seated &&
    JSON.stringify(partialWorkRestored.serialize()) ===
      JSON.stringify(partialWorkSnapshot),
  "M5 partial held work or seat did not survive restore",
);
const workDogBeforeMove = heldWork.getFullState().spatial;
assert(
  heldWork.moveOwnerBy({ dx: -1, dy: 0 }).ok &&
    !heldWork.getFullState().work.seated &&
    !heldWork.getFullState().work.active &&
    heldWork.getFullState().work.progress === 12.5 &&
    JSON.stringify(heldWork.getFullState().spatial) ===
      JSON.stringify(workDogBeforeMove),
  "M5 movement did not unseat work atomically or moved the dog",
);
const unseatedWorkBeforeHold = heldWork.serialize();
assert(
  !heldWork.advanceWorkHold(250).ok &&
    JSON.stringify(heldWork.serialize()) ===
      JSON.stringify(unseatedWorkBeforeHold),
  "M5 unseated hold tick changed state",
);
moveOwnerNearWorldTarget(heldWork, "computer");
assert(
  heldWork.sitAtComputer("held-gig").ok &&
    heldWork.advanceWorkHold(3_000).ok &&
    heldWork.getFullState().work.progress === 50 &&
    heldWork.getFullState().work.alert !== null &&
    heldWork.getFullState().work.seated,
  "M5 resumed hold did not pause exactly at the midpoint alert",
);
assert(
  heldWork.resolveWorkAlert("continue").ok &&
    heldWork.advanceWorkHold(4_000).ok &&
    heldWork.getFullState().work.progress === 100,
  "M5 continued hold did not finish at 100 percent",
);
const paidHeldState = heldWork.getFullState();
const heldSalaryEntries = paidHeldState.economy.ledger.filter((entry) =>
  entry.id === "salary:held-gig"
);
assert(
  paidHeldState.economy.money ===
      heldMoneyBefore + BALANCE.LIFESTYLE.ECONOMY.WORK.BASE_SALARY &&
    heldSalaryEntries.length === 1 &&
    paidHeldState.work.paidGigIds.filter((id) => id === "held-gig").length === 1,
  "M5 held completion did not pay the canonical salary exactly once",
);
const paidHeldSnapshot = heldWork.serialize();
const paidHeldMoney = paidHeldState.economy.money;
assert(
  !heldWork.advanceWorkHold(1_000).ok &&
    heldWork.getFullState().economy.money === paidHeldMoney &&
    heldWork.getFullState().economy.ledger.filter((entry) =>
      entry.id === "salary:held-gig"
    ).length === 1,
  "M5 repeated hold tick paid a completed gig twice",
);
const paidHeldRestored = createSim(1);
paidHeldRestored.restore(paidHeldSnapshot);
assert(
  !paidHeldRestored.sitAtComputer("held-gig").ok &&
    !paidHeldRestored.advanceWorkHold(1_000).ok &&
    paidHeldRestored.getFullState().economy.money === paidHeldMoney &&
    paidHeldRestored.getFullState().economy.ledger.filter((entry) =>
      entry.id === "salary:held-gig"
    ).length === 1,
  "M5 restore allowed completed work to pay twice",
);

// M6: nearby food selection, inventory ledger, bowl state, and dog eating.
const foodBowlSim = createSim(11_401);
const remoteFoodBefore = foodBowlSim.serialize();
assert(
  !foodBowlSim.fillFoodBowl("food-basic").ok &&
    JSON.stringify(foodBowlSim.serialize()) === JSON.stringify(remoteFoodBefore),
  "M6 remote food fill changed state",
);
moveOwnerNearWorldTarget(foodBowlSim, "foodBowl");
const emptyComfortBefore = foodBowlSim.serialize();
assert(
  !foodBowlSim.fillFoodBowl("food-comfort").ok &&
    JSON.stringify(foodBowlSim.serialize()) ===
      JSON.stringify(emptyComfortBefore),
  "M6 empty food inventory changed state",
);
const basicFoodBefore =
  foodBowlSim.getFullState().economy.inventory["food-basic"];
const foodHungerBefore = foodBowlSim.getFullState().stats.hunger;
assert(
  foodBowlSim.fillFoodBowl("food-basic", "food-bowl:contract-basic").ok,
  "M6 nearby owned food could not fill the bowl",
);
const filledFoodState = foodBowlSim.getFullState();
assert(
  filledFoodState.economy.inventory["food-basic"] === basicFoodBefore - 1 &&
    filledFoodState.environment.foodBowl.itemId === "food-basic" &&
    filledFoodState.environment.foodBowl.level === 100 &&
    filledFoodState.economy.ledger.filter((entry) =>
      entry.id === "food-bowl:contract-basic" &&
      entry.kind === "consume" &&
      entry.itemId === "food-basic" &&
      entry.quantityDelta === -1
    ).length === 1,
  "M6 food inventory, bowl, and consume ledger diverged",
);
const alreadyFullFood = foodBowlSim.serialize();
assert(
  !foodBowlSim.fillFoodBowl("food-basic").ok &&
    JSON.stringify(foodBowlSim.serialize()) ===
      JSON.stringify(alreadyFullFood),
  "M6 full food bowl accepted another item",
);
for (let step = 0; step < 80; step += 1) {
  const owner = foodBowlSim.getFullState().ownerSpatial;
  if (owner.x >= 0.82 && owner.y >= 0.78) break;
  const result = foodBowlSim.stepOwnerToward({
    room: "kitchen",
    x: 0.84,
    y: 0.8,
  });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: M6 owner retreat failed: ${result.reason}`);
  }
}
for (
  let minute = 0;
  minute < 30 &&
  foodBowlSim.getFullState().environment.foodBowl.level > 0;
  minute += 1
) {
  foodBowlSim.advanceMinutes(1);
}
const eatenFoodState = foodBowlSim.getFullState();
assert(
  eatenFoodState.environment.foodBowl.itemId === null &&
    eatenFoodState.environment.foodBowl.level === 0 &&
    eatenFoodState.economy.inventory["food-basic"] === basicFoodBefore - 1 &&
    eatenFoodState.digestionQueue.length === 1 &&
    eatenFoodState.stats.hunger < foodHungerBefore,
  "M6 dog eating did not reconcile bowl level, inventory, digestion, or hunger",
);
assert(
  foodBowlSim.getLog().some((event) =>
    event.type === "foodBowlFilled" &&
    event.detail.itemId === "food-basic"
  ) &&
    foodBowlSim.getLog().some((event) =>
      event.type === "foodBowlEaten" &&
      event.detail.remainingLevel === 0
    ),
  "M6 food fill/eat log omitted the bowl transition",
);
const unpaidFoodBowlSim = createSim(11_402);
const unpaidFoodBowlSnapshot = unpaidFoodBowlSim.serialize();
unpaidFoodBowlSnapshot.environment.foodBowl = {
  itemId: "food-basic",
  level: 100,
};
let unpaidFoodBowlRejected = false;
try {
  unpaidFoodBowlSim.restore(unpaidFoodBowlSnapshot);
} catch {
  unpaidFoodBowlRejected = true;
}
assert(
  unpaidFoodBowlRejected,
  "M6 restore accepted a filled food bowl without a consume ledger",
);

// M7: nearby water fill/clean, persisted level, and dog drinking.
const waterBowlSim = createSim(11_501);
const remoteWaterBefore = waterBowlSim.serialize();
assert(
  !waterBowlSim.fillWaterBowl().ok &&
    !waterBowlSim.cleanWaterBowl().ok &&
    JSON.stringify(waterBowlSim.serialize()) ===
      JSON.stringify(remoteWaterBefore),
  "M7 remote water action changed state",
);
moveOwnerNearWorldTarget(waterBowlSim, "waterBowl");
assert(
  waterBowlSim.fillWaterBowl().ok &&
    waterBowlSim.getFullState().environment.waterBowl.level === 100 &&
    waterBowlSim.getFullState().environment.waterBowl.clean,
  "M7 nearby clean water bowl did not fill",
);
const fullWaterBefore = waterBowlSim.serialize();
assert(
  !waterBowlSim.fillWaterBowl().ok &&
    JSON.stringify(waterBowlSim.serialize()) ===
      JSON.stringify(fullWaterBefore),
  "M7 full water bowl accepted another fill",
);
for (let step = 0; step < 80; step += 1) {
  const owner = waterBowlSim.getFullState().ownerSpatial;
  if (owner.x >= 0.94 && owner.y >= 0.9) break;
  const result = waterBowlSim.stepOwnerToward({
    room: "kitchen",
    x: 0.96,
    y: 0.92,
  });
  if (!result.ok) {
    throw new Error(`CONTRACT FAIL: M7 owner retreat failed: ${result.reason}`);
  }
}
const firstDrink = waterBowlSim.serialize();
firstDrink.dogRoom = WORLD_STATIONS.waterBowl.room;
firstDrink.spatial = {
  room: WORLD_STATIONS.waterBowl.room,
  x: WORLD_STATIONS.waterBowl.x,
  y: WORLD_STATIONS.waterBowl.y,
  targetRoom: WORLD_STATIONS.waterBowl.room,
  targetX: WORLD_STATIONS.waterBowl.x,
  targetY: WORLD_STATIONS.waterBowl.y,
  route: [],
  activity: "seekWater",
  moving: false,
  nextActivityAt: firstDrink.spatial.nextActivityAt,
};
waterBowlSim.restore(firstDrink);
const thirstBeforeDrink = waterBowlSim.getFullState().stats.thirst;
waterBowlSim.advanceMinutes(1);
assert(
  waterBowlSim.getFullState().environment.waterBowl.level === 60 &&
    waterBowlSim.getFullState().environment.waterBowl.clean &&
    waterBowlSim.getFullState().stats.thirst < thirstBeforeDrink &&
    waterBowlSim.getLog().some((event) =>
      event.type === "waterBowlDrunk" &&
      event.detail.remainingLevel === 60
    ),
  "M7 first drink did not reduce clean water level and thirst consistently",
);
for (const expectedLevel of [20, 0]) {
  const drinkAgain = waterBowlSim.serialize();
  drinkAgain.dogRoom = WORLD_STATIONS.waterBowl.room;
  drinkAgain.spatial = {
    room: WORLD_STATIONS.waterBowl.room,
    x: WORLD_STATIONS.waterBowl.x,
    y: WORLD_STATIONS.waterBowl.y,
    targetRoom: WORLD_STATIONS.waterBowl.room,
    targetX: WORLD_STATIONS.waterBowl.x,
    targetY: WORLD_STATIONS.waterBowl.y,
    route: [],
    activity: "seekWater",
    moving: false,
    nextActivityAt: drinkAgain.spatial.nextActivityAt,
  };
  waterBowlSim.restore(drinkAgain);
  waterBowlSim.advanceMinutes(1);
  assert(
    waterBowlSim.getFullState().environment.waterBowl.level ===
      expectedLevel,
    `M7 repeated dog drink did not reach level ${expectedLevel}`,
  );
}
assert(
  !waterBowlSim.getFullState().environment.waterBowl.clean,
  "M7 emptied water bowl did not become dirty",
);
const remoteDirtyWater = waterBowlSim.serialize();
assert(
  !waterBowlSim.cleanWaterBowl().ok &&
    JSON.stringify(waterBowlSim.serialize()) ===
      JSON.stringify(remoteDirtyWater),
  "M7 remote dirty-bowl cleaning changed state",
);
waterBowlSim.advanceMinutes(4);
moveOwnerNearWorldTarget(waterBowlSim, "waterBowl");
assert(
  waterBowlSim.getDogView().interaction.contextActions.some((action) =>
    action.id === "water:clean"
  ) &&
    waterBowlSim.cleanWaterBowl().ok &&
    waterBowlSim.getFullState().environment.waterBowl.level === 0 &&
    waterBowlSim.getFullState().environment.waterBowl.clean,
  "M7 nearby dirty bowl did not expose and complete cleaning",
);
assert(
  waterBowlSim.fillWaterBowl().ok &&
    waterBowlSim.getFullState().environment.waterBowl.level === 100 &&
    waterBowlSim.getFullState().environment.waterBowl.clean,
  "M7 cleaned bowl could not be refilled",
);
const waterRoundtrip = waterBowlSim.serialize();
const waterRoundtripRestored = createSim(0);
waterRoundtripRestored.restore(waterRoundtrip);
assert(
  JSON.stringify(waterRoundtripRestored.serialize()) ===
    JSON.stringify(waterRoundtrip),
  "M7 water level/clean state did not survive v4 restore",
);
assert(
  !waterBowlSim.getLog().some((event) =>
    /진단|확정 질환/.test(JSON.stringify(event.detail))
  ),
  "M7 routine water messages asserted a diagnosis",
);

assert(
  assertionCount - worldContractAssertionStart >= 55,
  "M1-M7 world interaction contract contains fewer than 55 assertions",
);

assert(assertionCount >= 25, "contract contains fewer than 25 assertions");

console.log(`CONTRACT OK ${assertionCount} assertions`);
