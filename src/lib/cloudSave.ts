import { getApp } from 'firebase/app';
import { get, getDatabase, ref, serverTimestamp, set } from 'firebase/database';
import {
  initPortalAuth,
  subscribePortalAuth,
  type PortalAuthState,
} from './portalAuth';

export type CloudSaveState =
  | 'idle'
  | 'loading'
  | 'synced'
  | 'offline'
  | 'conflict'
  | 'error';

export interface CloudSaveRecord {
  payload: string;
  updatedAt: number;
  schema: number;
  device: string;
}

type GameId = 'forge' | 'waitdog';
type StateListener = (state: CloudSaveState) => void;

const SAVE_DEBOUNCE_MS = 3_000;
const MAX_PAYLOAD_LENGTH = 200_000;

function isCloudSaveRecord(value: unknown): value is CloudSaveRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Partial<CloudSaveRecord>;
  return (
    typeof record.payload === 'string' &&
    record.payload.length < MAX_PAYLOAD_LENGTH &&
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt) &&
    typeof record.schema === 'number' &&
    Number.isFinite(record.schema) &&
    typeof record.device === 'string' &&
    record.device.length === 8
  );
}

function failureState(): CloudSaveState {
  return typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'offline'
    : 'error';
}

function createDeviceId(): string {
  return globalThis.crypto.randomUUID().slice(0, 8);
}

export function createCloudSave(gameId: GameId, schema: number): {
  subscribe(listener: StateListener): () => void;
  pull(): Promise<CloudSaveRecord | null>;
  push(payload: string): void;
  flush(): Promise<void>;
  resolveConflict(choice: 'local' | 'cloud'): void;
  getState(): CloudSaveState;
} {
  const listeners = new Set<StateListener>();
  const device = createDeviceId();
  let state: CloudSaveState = 'idle';
  let uid: string | null = null;
  let authUnsubscribe: (() => void) | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPayload: string | null = null;
  let lastSuccessfulPayload: string | null = null;
  let lastPulledRecord: CloudSaveRecord | null = null;
  let comparisonLoading = false;
  let comparisonPending = false;
  let requiresPull = false;
  let activeWrite: Promise<void> | null = null;
  let accountEpoch = 0;
  let pullGeneration = 0;

  function setState(nextState: CloudSaveState): void {
    if (state === nextState) {
      return;
    }

    state = nextState;
    listeners.forEach(listener => listener(state));
  }

  function clearTimer(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function resetForAccount(nextUid: string | null): void {
    clearTimer();
    accountEpoch += 1;
    pullGeneration += 1;
    uid = nextUid;
    pendingPayload = null;
    lastSuccessfulPayload = null;
    lastPulledRecord = null;
    comparisonLoading = false;
    comparisonPending = false;
    requiresPull = nextUid !== null;
    activeWrite = null;
  }

  function handleAuthState(authState: PortalAuthState): void {
    if (authState.status !== 'google') {
      if (uid !== null) {
        resetForAccount(null);
      }
      setState('idle');
      return;
    }

    const nextUid = authState.user.uid;
    if (uid !== nextUid) {
      resetForAccount(nextUid);
      setState('loading');
    }
  }

  function start(): void {
    if (authUnsubscribe) {
      return;
    }

    initPortalAuth();
    authUnsubscribe = subscribePortalAuth(handleAuthState);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', handlePageHide);
    }
  }

  function stop(): void {
    void flush();
    authUnsubscribe?.();
    authUnsubscribe = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    }
  }

  function saveRef(activeUid: string) {
    return ref(getDatabase(getApp()), `portal/saves/${activeUid}/${gameId}`);
  }

  async function writePending(): Promise<void> {
    if (!uid || state === 'conflict' || comparisonLoading || requiresPull) {
      return;
    }

    if (activeWrite) {
      await activeWrite;
      if (pendingPayload !== null && pendingPayload !== lastSuccessfulPayload) {
        await writePending();
      }
      return;
    }

    const activeUid = uid;
    const payload = pendingPayload;
    if (payload === null || payload === lastSuccessfulPayload) {
      if (payload === lastSuccessfulPayload) {
        pendingPayload = null;
        setState('synced');
      }
      return;
    }

    pendingPayload = null;
    setState('loading');
    const write = (async () => {
      try {
        const target = saveRef(activeUid);
        await set(target, {
          payload,
          updatedAt: serverTimestamp(),
          schema,
          device,
        });
        const snapshot = await get(target);
        const stored = snapshot.val() as unknown;
        if (!isCloudSaveRecord(stored) || stored.schema !== schema) {
          throw new Error('Cloud save response was invalid.');
        }
        if (uid !== activeUid) {
          return;
        }

        lastSuccessfulPayload = payload;
        lastPulledRecord = stored;
        setState('synced');
      } catch {
        if (uid === activeUid) {
          pendingPayload ??= payload;
          setState(failureState());
        }
      }
    })();

    activeWrite = write;
    await write;
    if (activeWrite === write) {
      activeWrite = null;
    }
  }

  function scheduleWrite(): void {
    clearTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void writePending();
    }, SAVE_DEBOUNCE_MS);
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void flush();
    }
  }

  function handlePageHide(): void {
    void flush();
  }

  async function pull(): Promise<CloudSaveRecord | null> {
    start();
    const activePullGeneration = ++pullGeneration;
    if (!uid) {
      setState('idle');
      return null;
    }

    const activeUid = uid;
    const activeAccountEpoch = accountEpoch;
    comparisonLoading = true;
    comparisonPending = false;
    requiresPull = true;
    lastPulledRecord = null;
    lastSuccessfulPayload = null;
    setState('loading');
    const isCurrentPull = (): boolean => (
      uid === activeUid
      && accountEpoch === activeAccountEpoch
      && pullGeneration === activePullGeneration
    );
    try {
      const snapshot = await get(saveRef(activeUid));
      if (!isCurrentPull()) {
        return null;
      }
      comparisonLoading = false;
      requiresPull = false;
      if (!snapshot.exists()) {
        lastPulledRecord = null;
        comparisonPending = true;
        return null;
      }

      const record = snapshot.val() as unknown;
      if (!isCloudSaveRecord(record) || record.schema !== schema) {
        comparisonPending = false;
        requiresPull = true;
        setState('error');
        return null;
      }

      lastPulledRecord = record;
      comparisonPending = true;
      return record;
    } catch {
      if (isCurrentPull()) {
        comparisonLoading = false;
        comparisonPending = false;
        requiresPull = true;
        setState(failureState());
      }
      return null;
    }
  }

  function push(payload: string): void {
    start();
    if (!uid) {
      setState('idle');
      return;
    }

    pendingPayload = payload;
    if (comparisonLoading || requiresPull) {
      clearTimer();
      return;
    }
    if (state === 'conflict') {
      clearTimer();
      return;
    }
    if (comparisonPending) {
      comparisonPending = false;
      if (lastPulledRecord?.payload === payload) {
        pendingPayload = null;
        lastSuccessfulPayload = payload;
        setState('synced');
        return;
      }
      if (lastPulledRecord !== null) {
        clearTimer();
        setState('conflict');
        return;
      }
    }

    if (payload === lastSuccessfulPayload) {
      pendingPayload = null;
      setState('synced');
      return;
    }
    scheduleWrite();
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (state === 'conflict') {
      return;
    }
    await writePending();
  }

  function resolveConflict(choice: 'local' | 'cloud'): void {
    if (state !== 'conflict') {
      return;
    }

    comparisonPending = false;
    if (choice === 'cloud') {
      pendingPayload = null;
      lastSuccessfulPayload = lastPulledRecord?.payload ?? null;
      setState('synced');
      return;
    }

    lastSuccessfulPayload = null;
    clearTimer();
    setState('loading');
    void writePending();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      start();
      listener(state);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop();
        }
      };
    },
    pull,
    push,
    flush,
    resolveConflict,
    getState: () => state,
  };
}
