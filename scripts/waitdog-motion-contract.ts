import { BALANCE } from "../src/waitdog/constants/balance";
import {
  createSim,
  WORLD_STATIONS,
  type WaitdogSnapshot,
  type WaitdogUiSim,
} from "../src/waitdog/services/waitdogSim";
import {
  ENCOUNTER_DEFINITIONS,
} from "../src/waitdog/services/encounters";
import type { WaitdogFullState } from "../src/waitdog/types";
import {
  ownerDogFootprintSeparation,
} from "../src/waitdog/services/economy";
import {
  closeEnough,
  createContractAssert,
} from "./waitdog-contract-shared";

let assertionCount = 0;

const assert = createContractAssert(() => {
  assertionCount += 1;
});

const directContractAssertionStart = assertionCount;
// HouseCanvas 의 실제 그리기 크기에서 유도한다. 2026-07-30 축소:
// 보호자 h145(폭 122) → h110(폭 93), 강아지 폭 110 → 85.
// 방(부엌 travel 폭 233px)에 두 캐릭터가 나란히 설 수 있게 하려는 변경이다.
const OWNER_DOG_SPRITE_HORIZONTAL_HALF_SUM_PX = (93 + 85) / 2;
const OWNER_DOG_SPRITE_VERTICAL_CLEARANCE_PX = 110;
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

// 2026-07-30 설계 변경(사용자 결정): "스프라이트가 시각적으로 겹치지 않는다" 불변식은 유지하되,
// 스프라이트를 방 크기에 맞게 줄여 그 불변식과 자유로운 이동이 동시에 성립하게 한다.
// 종전에는 보호자 122px + 강아지 110px = 232px 가 부엌 travel 폭 233px 과 거의 같아
// 두 캐릭터가 나란히 설 수 없었고, 그래서 통행금지 영역이 방보다 넓어지는 결과가 됐다.
// 축소 후: 보호자 h145→110(폭 93), 강아지 폭 110→85 → 가로 반합 89px(부엌 폭의 38%).
// 충돌 상수는 새 스프라이트 경계에 맞춘다(가로 반합 89 바로 위, 세로 보호자 높이 110 바로 위).
assert(
  BALANCE.LIFESTYLE.OWNER.INTERACTION_RADIUS === 0.12 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .HORIZONTAL_CLEARANCE_PX >= 88 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .HORIZONTAL_CLEARANCE_PX <= 100 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .VERTICAL_CLEARANCE_PX >= 108 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .VERTICAL_CLEARANCE_PX <= 120 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT
        .SUPERELLIPSE_EXPONENT >= 8 &&
    BALANCE.LIFESTYLE.OWNER.VISUAL_FOOTPRINT.ENCOUNTER_SCALE > 1,
  "C4 encounter proximity did not keep sprite-sized visual clearance",
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

console.log(`MOTION CONTRACT OK ${assertionCount} assertions`);
