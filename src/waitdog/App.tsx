import { useEffect, useRef, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { HouseCanvas } from "./components/HouseCanvas";
import { ObservationPanel } from "./components/ObservationPanel";
import { TopBar, type GameSpeed } from "./components/TopBar";
import {
  createSim,
  type WaitdogUiSim,
  type WaitdogUiView,
} from "./services/waitdogSim";
import type { InterventionKind, InterventionResult, RoomId } from "./types";

const SIMULATION_SEED = 20260722;
const DAY_END_MINUTE = 23 * 60;
const GAME_MINUTES_PER_SECOND = 2;

interface InterventionMessage {
  id: number;
  text: string;
}

export default function App() {
  const simRef = useRef<WaitdogUiSim | null>(null);
  if (simRef.current === null) {
    simRef.current = createSim(SIMULATION_SEED);
  }
  const sim = simRef.current;

  const [view, setView] = useState<WaitdogUiView>(() => sim.getDogView());
  const [speed, setSpeed] = useState<GameSpeed>(1);
  const [lastSeenRoom, setLastSeenRoom] = useState<RoomId | null>(
    view.visibility === "seen" ? view.room : null,
  );
  const [interventionMessages, setInterventionMessages] = useState<InterventionMessage[]>([]);
  const messageIdRef = useRef(0);
  const ended = view.minuteOfDay >= DAY_END_MINUTE;

  useEffect(() => {
    if (view.visibility === "seen" && view.room !== null) {
      setLastSeenRoom(view.room);
    }
  }, [view.room, view.visibility]);

  useEffect(() => {
    if (speed === 0 || ended) return;

    const intervalId = window.setInterval(() => {
      let next = sim.getDogView();
      const previousPoopRevision = next.poopRevision;
      const ticks = GAME_MINUTES_PER_SECOND * speed;

      for (let minute = 0; minute < ticks; minute += 1) {
        sim.advanceMinutes(1);
        next = sim.getDogView();
        if (next.poopRevision !== previousPoopRevision) {
          setSpeed(1);
          break;
        }
        if (next.minuteOfDay >= DAY_END_MINUTE) break;
      }

      setView(next);
      if (next.minuteOfDay >= DAY_END_MINUTE) setSpeed(0);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [ended, sim, speed]);

  const appendMessage = (text: string) => {
    messageIdRef.current += 1;
    const message = { id: messageIdRef.current, text };
    setInterventionMessages((current) => [...current.slice(-5), message]);
  };

  const runCommand = <T,>(command: () => T): T => {
    const previousPoopRevision = sim.getDogView().poopRevision;
    const result = command();
    const next = sim.getDogView();
    setView(next);
    if (next.poopRevision !== previousPoopRevision) setSpeed(1);
    if (next.minuteOfDay >= DAY_END_MINUTE) setSpeed(0);
    return result;
  };

  const handleRoomSelect = (room: RoomId) => {
    runCommand(() => {
      const current = sim.getDogView();
      sim.setOwner({ room, focusLocked: current.owner.focusLocked });
    });
  };

  const handleFocusToggle = () => {
    runCommand(() => {
      const current = sim.getDogView();
      sim.setOwner({
        room: current.owner.room,
        focusLocked: !current.owner.focusLocked,
      });
    });
  };

  const handleIntervention = (kind: InterventionKind, label: string) => {
    const result: InterventionResult = runCommand(() => sim.intervene(kind));
    if (result.interrupted) {
      appendMessage(`${label}: 집중 업무 중 개입이 끼어들었습니다.`);
    } else if (result.success) {
      appendMessage(`${label} 개입에 강아지가 반응했습니다.`);
    } else {
      appendMessage(`${label} 개입에는 아직 반응이 없습니다.`);
    }
  };

  const handleNewDay = () => {
    sim.newDay();
    const next = sim.getDogView();
    setView(next);
    setSpeed(1);
    appendMessage("새 하루를 시작합니다.");
  };

  return (
    <main className="waitdog-page">
      <TopBar
        day={view.day}
        minuteOfDay={view.minuteOfDay}
        speed={speed}
        ownerRoom={view.owner.room}
        focusLocked={view.owner.focusLocked}
        ended={ended}
        onSpeedChange={setSpeed}
      />

      <div className="game-layout">
        <HouseCanvas
          view={view}
          lastSeenRoom={lastSeenRoom}
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
            disabled={ended}
            onIntervene={handleIntervention}
            onFocusToggle={handleFocusToggle}
            onWalk={() => runCommand(() => sim.walk(30))}
            onFeed={() => runCommand(() => sim.feed(70))}
            onWater={() => runCommand(() => sim.water())}
          />
        </aside>
      </div>

      {ended && (
        <div className="day-end-overlay" role="dialog" aria-modal="true" aria-labelledby="day-end-title">
          <div className="day-end-card">
            <span aria-hidden="true" className="day-end-mark">☀</span>
            <h2 id="day-end-title">Day {view.day} 종료 — 하루 평가는 다음 단계</h2>
            <p>오늘의 관찰은 여기까지입니다. 다음 날에도 천천히 살펴봐 주세요.</p>
            <button type="button" onClick={handleNewDay}>다음 날 시작</button>
          </div>
        </div>
      )}
    </main>
  );
}
