import { useEffect, useRef, useState } from 'react';
import { createCloudSave, type CloudSaveRecord, type CloudSaveState } from '../lib/cloudSave';
import { subscribePortalAuth } from '../lib/portalAuth';
import type { Rng } from './core/rng';
import { BattleScreen } from './components/BattleScreen';
import {
  CloudSavePanel,
  CloudStatusBadge,
  type CloudGateState,
} from './components/CloudSavePanel';
import { DeckEditor } from './components/DeckEditor';
import { EndScreen } from './components/EndScreen';
import { HomeScreen } from './components/HomeScreen';
import { RewardScreen } from './components/RewardScreen';
import {
  applyCloudProfile,
  classifyOwner,
  readLocalProfileSnapshot,
  recoverFromJournal,
  replaceProfileRecord,
  summarizeProfile,
  type CloudStorageAdapter,
  type LocalProfileRecord,
  type ProfileMeta,
  type ReplaceProfileOptions,
} from './services/cloudProfile';
import {
  authAccessFromPortal,
  authAccessPolicy,
  canOpenLocalAfterCloudFailure,
  canPushProfile,
  createProfileDeviceId,
  createProfileMeta,
  decideCloudMerge,
  isCurrentSyncAttempt,
  syncSessionAction,
  type BonpuriAuthAccess,
} from './services/cloudSync';
import {
  calculateCompletedProfile,
  createDefaultProfile,
  type BonpuriProfile,
  type SaveProfileResult,
} from './services/profile';
import { chooseReward, endRunTurn, playRunCard, skipReward, startMiniRun, type MiniRunState } from './run/miniRun';

const bonpuriCloudSave = createCloudSave('bonpuri', 3);

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type Screen = 'home' | 'deck' | 'run' | 'result';
type ResultState = {
  won: boolean; acquired: string[]; pack: string[]; error?: string;
  ascension: number; ascensionUnlockedNow: boolean; unlockedAscension: number;
};

type LoadedLocal = {
  profile: BonpuriProfile | null;
  meta: ProfileMeta | null;
  migrated: boolean;
  needsMigration: boolean;
};

type PendingChoice = {
  kind: 'legacy' | 'account-changed' | 'diverged';
  auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>;
  local: LoadedLocal;
  cloud: BonpuriProfile | null;
  cloudRecord: CloudSaveRecord | null;
};

const storage: CloudStorageAdapter = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

function readLocalAfterAuth(): { ok: true; local: LoadedLocal } | { ok: false; error: string } {
  try {
    const recovered = recoverFromJournal(storage);
    if (recovered.kind === 'failed') return { ok: false, error: recovered.error };
    return readLocalProfileSnapshot(storage);
  } catch {
    return { ok: false, error: '이 기기의 본풀이 기록을 읽지 못했습니다.' };
  }
}

export default function App() {
  const rng = useRef<Rng>(Math.random).current;
  const deviceRef = useRef<string | null>(null);
  if (deviceRef.current === null) deviceRef.current = createProfileDeviceId();

  const [profile, setProfile] = useState<BonpuriProfile | null>(null);
  const [notice, setNotice] = useState('');
  const [gate, setGate] = useState<CloudGateState | null>({ kind: 'auth-loading' });
  const [cloudState, setCloudState] = useState<CloudSaveState>(() => bonpuriCloudSave.getState());
  const [authAccess, setAuthAccess] = useState<BonpuriAuthAccess>({ kind: 'pending' });
  const [screen, setScreen] = useState<Screen>('home');
  const [run, setRun] = useState<MiniRunState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  const profileRef = useRef<BonpuriProfile | null>(null);
  const metaRef = useRef<ProfileMeta | null>(null);
  const authRef = useRef<BonpuriAuthAccess>({ kind: 'pending' });
  const currentUidRef = useRef<string | null>(null);
  const syncReadyRef = useRef(false);
  const syncAttemptRef = useRef(0);
  const pendingChoiceRef = useRef<PendingChoice | null>(null);
  const retrySyncRef = useRef<() => void>(() => undefined);
  const finalized = useRef<MiniRunState | null>(null);

  const hideProfile = (discardRun: boolean) => {
    profileRef.current = null;
    metaRef.current = null;
    syncReadyRef.current = false;
    pendingChoiceRef.current = null;
    setProfile(null);
    if (discardRun) {
      finalized.current = null;
      setRun(null);
      setResult(null);
      setScreen('home');
    }
  };

  const activateProfile = (
    nextProfile: BonpuriProfile,
    nextMeta: ProfileMeta,
    auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
    cloudReady: boolean,
  ) => {
    if (authRef.current.kind !== auth.kind || authRef.current.uid !== auth.uid) return;
    profileRef.current = nextProfile;
    metaRef.current = nextMeta;
    syncReadyRef.current = cloudReady;
    pendingChoiceRef.current = null;
    setProfile(nextProfile);
    setGate({ kind: 'sync-loading' });
  };

  const replaceForAuth = (
    candidate: BonpuriProfile,
    auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
    current: LoadedLocal | LocalProfileRecord | null,
    options: ReplaceProfileOptions = {},
  ) => {
    const now = Date.now();
    const nextMeta = createProfileMeta(auth, now, current?.meta?.device ?? deviceRef.current!);
    return replaceProfileRecord(storage, { profile: candidate, meta: nextMeta },
      current?.profile ? { profile: current.profile, meta: current.meta } : null, now, options);
  };

  const finishReady = (
    nextProfile: BonpuriProfile,
    nextMeta: ProfileMeta,
    auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
    cloudReady: boolean,
    migrated = false,
  ) => {
    activateProfile(nextProfile, nextMeta, auth, cloudReady);
    setNotice(migrated
      ? '덱 규격이 50장으로 바뀌어 시작 덱을 기본값으로 되돌렸습니다. 보관함은 그대로입니다.'
      : '');
    setGate(null);
  };

  const persist = (candidate: BonpuriProfile): SaveProfileResult => {
    const auth = authRef.current;
    const current = profileRef.current;
    const meta = metaRef.current;
    if ((auth.kind !== 'guest' && auth.kind !== 'google') || current === null || meta === null ||
      (meta.owner.kind !== 'guest' && meta.owner.kind !== 'google') || meta.owner.uid !== auth.uid) {
      return { ok: false, error: '계정 확인이 끝나지 않아 기록을 저장하지 않았습니다.' };
    }
    const replaced = replaceForAuth(candidate, auth,
      { profile: current, meta, migrated: false, needsMigration: false },
      { backupPrevious: false });
    if (!replaced.ok) {
      syncReadyRef.current = false;
      setGate({ kind: 'sync-error', message: replaced.error });
      return replaced;
    }
    profileRef.current = replaced.profile;
    metaRef.current = replaced.meta;
    setProfile(replaced.profile);
    setNotice('');
    if (canPushProfile(auth, replaced.meta, syncReadyRef.current, pendingChoiceRef.current !== null)) {
      bonpuriCloudSave.push(JSON.stringify(replaced.profile));
    }
    return { ok: true };
  };

  useEffect(() => {
    let disposed = false;

    const failGate = (message: string) => {
      if (disposed) return;
      hideProfile(false);
      setGate({ kind: 'sync-error', message });
    };

    const openOwnedLocal = (
      auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
      local: LoadedLocal,
      cloudReady: boolean,
    ): boolean => {
      if (!local.profile || !local.meta) return false;
      const ownerKindChanged = local.meta.owner.kind !== auth.kind;
      if (local.needsMigration || ownerKindChanged) {
        const replaced = replaceForAuth(local.profile, auth, local, { backupPrevious: false });
        if (!replaced.ok) { failGate(replaced.error); return false; }
        finishReady(replaced.profile, replaced.meta, auth, cloudReady, local.migrated);
        return true;
      }
      finishReady(local.profile, local.meta, auth, cloudReady, local.migrated);
      return true;
    };

    const makeNewRecord = (
      auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
      local: LoadedLocal,
    ) => {
      const created = createDefaultProfile();
      const replaced = replaceForAuth(created, auth, local);
      if (!replaced.ok) { failGate(replaced.error); return; }
      finishReady(replaced.profile, replaced.meta, auth, auth.kind === 'google');
      if (auth.kind === 'google') bonpuriCloudSave.push(JSON.stringify(replaced.profile));
    };

    const processGuest = (
      auth: Extract<BonpuriAuthAccess, { kind: 'guest' }>,
      local: LoadedLocal,
    ) => {
      const relation = classifyOwner(local.meta, local.profile !== null, { kind: 'signed-in', uid: auth.uid });
      if (relation.kind === 'no-local-record') { makeNewRecord(auth, local); return; }
      if (relation.kind === 'same-owner' && local.profile && local.meta) {
        openOwnedLocal(auth, local, false);
        return;
      }
      if (relation.kind === 'legacy-local' && local.profile) {
        pendingChoiceRef.current = { kind: 'legacy', auth, local, cloud: null, cloudRecord: null };
        setGate({ kind: 'legacy-choice', local: summarizeProfile(local.profile, 'local', local.meta?.savedAt ?? null), cloud: null });
        return;
      }
      pendingChoiceRef.current = { kind: 'account-changed', auth, local, cloud: null, cloudRecord: null };
      setGate({ kind: 'account-changed', cloud: null });
    };

    const processGoogle = async (
      auth: Extract<BonpuriAuthAccess, { kind: 'google' }>,
      local: LoadedLocal,
      attempt: number,
    ) => {
      const relation = classifyOwner(local.meta, local.profile !== null, { kind: 'signed-in', uid: auth.uid });
      const record = await bonpuriCloudSave.pull();
      if (disposed || !isCurrentSyncAttempt(attempt, syncAttemptRef.current, auth.uid, authRef.current)) return;
      if (record === null && (bonpuriCloudSave.getState() === 'offline' || bonpuriCloudSave.getState() === 'error')) {
        if (canOpenLocalAfterCloudFailure(relation, local.profile !== null, local.meta !== null)) {
          openOwnedLocal(auth, local, false);
          return;
        }
        failGate(bonpuriCloudSave.getState() === 'offline'
          ? '오프라인 상태입니다. 이 기기 기록은 그대로 보존했습니다.'
          : '클라우드 응답을 확인할 수 없습니다. 이 기기 기록은 그대로 보존했습니다.');
        return;
      }

      if (relation.kind === 'legacy-local' && local.profile) {
        const merge = decideCloudMerge(local.profile, record);
        if (merge.kind === 'invalid-cloud') { failGate(merge.error); return; }
        const cloud = merge.kind === 'cloud-only' || merge.kind === 'same' || merge.kind === 'diverged'
          ? merge.cloud : null;
        pendingChoiceRef.current = { kind: 'legacy', auth, local, cloud, cloudRecord: record };
        setGate({
          kind: 'legacy-choice',
          local: summarizeProfile(local.profile, 'local', local.meta?.savedAt ?? null),
          cloud: cloud ? summarizeProfile(cloud, 'cloud', record?.updatedAt ?? null) : null,
        });
        return;
      }

      if (relation.kind === 'account-changed') {
        const merge = decideCloudMerge(null, record);
        if (merge.kind === 'invalid-cloud') { failGate(merge.error); return; }
        const cloud = merge.kind === 'cloud-only' ? merge.cloud : null;
        pendingChoiceRef.current = { kind: 'account-changed', auth, local, cloud, cloudRecord: record };
        setGate({ kind: 'account-changed', cloud: cloud ? summarizeProfile(cloud, 'cloud', record?.updatedAt ?? null) : null });
        return;
      }

      const merge = decideCloudMerge(local.profile, record);
      if (merge.kind === 'invalid-cloud') { failGate(merge.error); return; }
      if (merge.kind === 'empty') { makeNewRecord(auth, local); return; }
      if (merge.kind === 'cloud-only') {
        const applied = applyCloudProfile(merge.cloud, null);
        const replaced = replaceForAuth(applied, auth, local);
        if (!replaced.ok) { failGate(replaced.error); return; }
        finishReady(replaced.profile, replaced.meta, auth, true);
        bonpuriCloudSave.push(merge.record.payload);
        return;
      }
      if (merge.kind === 'local-only') {
        if (!openOwnedLocal(auth, local, true)) return;
        bonpuriCloudSave.push(JSON.stringify(merge.local));
        return;
      }
      if (merge.kind === 'same') {
        if (!openOwnedLocal(auth, local, true)) return;
        // exact pulled payload로 비교를 닫는다. rulesPanelOpen은 기기값이라 로컬 화면은 유지한다.
        bonpuriCloudSave.push(merge.record.payload);
        return;
      }

      pendingChoiceRef.current = {
        kind: 'diverged', auth, local, cloud: merge.cloud, cloudRecord: merge.record,
      };
      setGate({
        kind: 'diverged',
        local: summarizeProfile(merge.local, 'local', local.meta?.savedAt ?? null),
        cloud: summarizeProfile(merge.cloud, 'cloud', merge.record.updatedAt),
      });
    };

    const processAccess = async (access: BonpuriAuthAccess, isRetry = false) => {
      const attempt = ++syncAttemptRef.current;
      const previousUid = currentUidRef.current;
      authRef.current = access;
      setAuthAccess(access);
      const sessionAction = syncSessionAction(previousUid, access, isRetry);
      if (sessionAction === 'discard') hideProfile(true);
      else if (sessionAction === 'hide') hideProfile(false);
      if (access.kind !== 'guest' && access.kind !== 'google') {
        currentUidRef.current = null;
        hideProfile(false);
        setGate(access.kind === 'pending'
          ? { kind: 'auth-loading' }
          : access.reason === 'setup-required' ? { kind: 'setup-required' } : { kind: 'auth-error' });
        return;
      }

      if (!authAccessPolicy(access).canReadLocal) return;

      currentUidRef.current = access.uid;
      setGate({ kind: 'sync-loading' });
      const loaded = readLocalAfterAuth();
      if (!loaded.ok) { failGate(loaded.error); return; }
      if (access.kind === 'guest') processGuest(access, loaded.local);
      else await processGoogle(access, loaded.local, attempt);
    };

    retrySyncRef.current = () => { void processAccess(authRef.current, true); };
    const unsubscribeCloud = bonpuriCloudSave.subscribe((state) => {
      if (!disposed) setCloudState(state);
    });
    const unsubscribeAuth = subscribePortalAuth((state) => { void processAccess(authAccessFromPortal(state)); });
    return () => {
      disposed = true;
      syncAttemptRef.current += 1;
      retrySyncRef.current = () => undefined;
      unsubscribeAuth();
      unsubscribeCloud();
    };
  }, []);

  useEffect(() => {
    if (!run || !profile || (run.phase !== 'won' && run.phase !== 'lost') || finalized.current === run) return;
    finalized.current = run;
    const completed = calculateCompletedProfile(profile, run.acquiredCardIds, run.phase === 'won', rng, run.ascension);
    const saved = persist(completed.profile);
    if (saved.ok) {
      setResult({
        won: run.phase === 'won', acquired: run.acquiredCardIds, pack: completed.pack,
        ascension: run.ascension,
        ascensionUnlockedNow: completed.ascensionUnlockedNow,
        unlockedAscension: completed.profile.ascensionUnlocked,
      });
    } else {
      setResult({
        won: run.phase === 'won',
        acquired: run.acquiredCardIds,
        pack: [],
        ascension: run.ascension,
        ascensionUnlockedNow: false,
        unlockedAscension: profile.ascensionUnlocked,
        error: '기록을 저장하지 못했습니다. 획득 카드가 보관되지 않았습니다.',
      });
    }
    setScreen('result');
  }, [profile, rng, run]);

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      mode: profile === null || gate !== null ? 'account-gate' : screen,
      cloud: cloudState,
      ...(gate === null ? {
        runPhase: run?.phase,
        battle: run?.battleNumber,
        hp: run?.playerHp,
        hand: run?.battle?.hand.map((card, index) => ({ index, name: card.name, cost: card.cost })),
        rewards: run?.rewards.map((card, index) => ({ index, name: card.name })),
      } : {}),
      coordinateSystem: 'DOM flow; top to bottom',
    });
    window.advanceTime = () => undefined;
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [cloudState, gate, profile, run, screen]);

  const usePendingLocal = () => {
    const pending = pendingChoiceRef.current;
    if (!pending || !pending.local.profile || authRef.current.kind !== pending.auth.kind || authRef.current.uid !== pending.auth.uid) return;
    const cloudBackup = pending.auth.kind === 'google' && pending.cloud && pending.cloudRecord
      ? {
        profile: pending.cloud,
        meta: createProfileMeta(pending.auth, pending.cloudRecord.updatedAt, pending.cloudRecord.device),
      }
      : null;
    const replaced = replaceForAuth(pending.local.profile, pending.auth, pending.local,
      cloudBackup ? { backupRecord: cloudBackup, previousSource: 'cloud' } : {});
    if (!replaced.ok) { setGate({ kind: 'sync-error', message: replaced.error }); return; }
    finishReady(replaced.profile, replaced.meta, pending.auth, pending.auth.kind === 'google', pending.local.migrated);
    if (pending.auth.kind === 'google') {
      bonpuriCloudSave.push(JSON.stringify(replaced.profile));
      if (bonpuriCloudSave.getState() === 'conflict') bonpuriCloudSave.resolveConflict('local');
    }
  };

  const usePendingCloud = () => {
    const pending = pendingChoiceRef.current;
    if (!pending || pending.auth.kind !== 'google' || !pending.cloud || !pending.cloudRecord ||
      authRef.current.kind !== 'google' || authRef.current.uid !== pending.auth.uid) return;
    const applied = applyCloudProfile(pending.cloud, pending.local.profile);
    const replaced = replaceForAuth(applied, pending.auth, pending.local);
    if (!replaced.ok) { setGate({ kind: 'sync-error', message: replaced.error }); return; }
    finalized.current = null;
    setRun(null);
    setResult(null);
    setScreen('home');
    finishReady(replaced.profile, replaced.meta, pending.auth, true);
    bonpuriCloudSave.push(pending.cloudRecord.payload);
  };

  const startPendingNew = () => {
    const pending = pendingChoiceRef.current;
    if (!pending || authRef.current.kind !== pending.auth.kind || authRef.current.uid !== pending.auth.uid) return;
    const replaced = replaceForAuth(createDefaultProfile(), pending.auth, pending.local);
    if (!replaced.ok) { setGate({ kind: 'sync-error', message: replaced.error }); return; }
    finalized.current = null;
    setRun(null);
    setResult(null);
    setScreen('home');
    finishReady(replaced.profile, replaced.meta, pending.auth, pending.auth.kind === 'google');
    if (pending.auth.kind === 'google') bonpuriCloudSave.push(JSON.stringify(replaced.profile));
  };

  const retry = () => {
    if (authAccess.kind === 'pending' || authAccess.kind === 'blocked') window.location.reload();
    else retrySyncRef.current();
  };

  if (profile === null || gate !== null) return <CloudSavePanel gate={gate ?? { kind: 'auth-loading' }} onUseLocal={usePendingLocal}
    onUseCloud={usePendingCloud} onUseNew={startPendingNew} onRetry={retry} />;

  const start = (deck = profile.startingDeck) => {
    const ascension = Math.max(0, Math.min(profile.ascensionSelected, profile.ascensionUnlocked));
    setRun(startMiniRun(rng, deck, ascension));
    setResult(null);
    setScreen('run');
  };
  const selectAscension = (ascension: number) => {
    const clamped = Math.max(0, Math.min(ascension, profile.ascensionUnlocked));
    const saved = persist({ ...profile, ascensionSelected: clamped });
    if (!saved.ok) setNotice(saved.error);
  };
  const status = <CloudStatusBadge state={cloudState} google={authAccess.kind === 'google'} onRetry={retry} />;
  if (screen === 'home') return <>{status}<HomeScreen profile={profile} notice={notice} onStart={() => start()}
    onEdit={() => setScreen('deck')} onSelectAscension={selectAscension} /></>;
  if (screen === 'deck') return <>{status}<DeckEditor profile={profile} onBack={() => setScreen('home')}
    onSave={(deck) => persist({ ...profile, startingDeck: deck })} onStart={start} /></>;
  if (screen === 'result' && result) return <>{status}<EndScreen won={result.won} acquiredCardIds={result.acquired}
    ascension={result.ascension} ascensionUnlockedNow={result.ascensionUnlockedNow}
    unlockedAscension={result.unlockedAscension}
    pack={result.pack} saveError={result.error} onHome={() => { setRun(null); setScreen('home'); }} /></>;
  if (!run) return null;
  if (run.phase === 'reward') return <>{status}<RewardScreen rewards={run.rewards} hp={run.playerHp}
    onChoose={(index) => setRun((state) => state ? chooseReward(state, index, rng) : state)}
    onSkip={() => setRun((state) => state ? skipReward(state, rng) : state)} /></>;
  if (!run.battle) return null;
  const toggleRules = () => {
    const candidate = { ...profile, rulesPanelOpen: !profile.rulesPanelOpen };
    const saved = persist(candidate);
    if (!saved.ok) setNotice(saved.error);
  };
  return <>{status}<BattleScreen battle={run.battle} battleNumber={run.battleNumber}
    rulesPanelOpen={profile.rulesPanelOpen} onToggleRules={toggleRules}
    onPlay={(index) => setRun((state) => state ? playRunCard(state, index, rng) : state)}
    onEndTurn={() => setRun((state) => state ? endRunTurn(state, rng) : state)} /></>;
}
