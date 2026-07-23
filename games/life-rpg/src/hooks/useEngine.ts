import { useRef } from "react";
import type { ActionId, LogEntry, RemoteTimerLock, StatKey } from "@/types/game";
import { ref } from "firebase/database";

export function useEngine() {
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decayAccumRef = useRef<Partial<Record<StatKey, number>>>({});
  const decaySecondsRef = useRef(0);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifyRef = useRef<Notification | null>(null);
  const localLoadedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerActiveRef = useRef(false);
  const healthRef = useRef(10);
  const authInitRef = useRef(false);
  const authRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabIdRef = useRef<string>("");
  const lockHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const timerOwnerRef = useRef(false);
  const logsDbRef = useRef<ReturnType<typeof ref> | null>(null);

  const activeLockInfoRef = useRef<RemoteTimerLock | null>(null);
  const actionCountsRef = useRef<Record<ActionId, number>>({} as Record<ActionId, number>);
  const recentLogsRef = useRef<LogEntry[]>([]);

  return {
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
    activeLockInfoRef,
    actionCountsRef,
    recentLogsRef,
  };
}
