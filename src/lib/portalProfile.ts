import { getApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import {
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  update,
  type DatabaseReference,
  type OnDisconnect,
} from 'firebase/database';
import {
  initPortalAuth,
  subscribePortalAuth,
  type PortalAuthState,
} from './portalAuth';

export interface PortalProfile {
  nickname: string | null;
  updatedAt: number | null;
}

type NicknameResult = 'ok' | 'taken' | 'invalid' | 'error';
interface ProfileLock {
  disconnect: OnDisconnect;
  reference: DatabaseReference;
  uid: string;
}

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const RESERVED_NICKNAMES = new Set(['admin', '운영자', '관리자', '한판', 'hanpan']);
const PROFILE_LOCK_WAIT_MS = 8_000;
const PROFILE_LOCK_RETRY_MS = 120;

function normalizeNickname(nickname: string): string | null {
  if (nickname !== nickname.trim() || !NICKNAME_PATTERN.test(nickname)) {
    return null;
  }

  const nicknameLower = nickname.toLowerCase();
  return RESERVED_NICKNAMES.has(nicknameLower) ? null : nicknameLower;
}

function getCurrentUser(): User | null {
  initPortalAuth();

  try {
    return getAuth(getApp()).currentUser;
  } catch {
    return null;
  }
}

function readProfile(value: unknown): PortalProfile {
  if (typeof value !== 'object' || value === null) {
    return { nickname: null, updatedAt: null };
  }

  const record = value as { nickname?: unknown; updatedAt?: unknown };
  const nickname = typeof record.nickname === 'string' && normalizeNickname(record.nickname)
    ? record.nickname
    : null;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : null;

  return { nickname, updatedAt };
}

function profileLockKey(uid: string): string {
  const encodedUid = encodeURIComponent(uid).replace(/\./g, '%2E');
  // The prefix alone exceeds the 12-character nickname limit, so this
  // transient coordination key cannot collide with a valid public nickname.
  return `__profile_lock_${encodedUid}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function removeOwnedLock(reference: DatabaseReference, uid: string): Promise<void> {
  try {
    await runTransaction(
      reference,
      currentOwner => currentOwner === uid ? null : undefined,
      { applyLocally: false },
    );
  } catch {
    // A failed cleanup leaves the lock closed rather than risking concurrent writers.
  }
}

async function acquireProfileLock(
  database: ReturnType<typeof getDatabase>,
  uid: string,
): Promise<ProfileLock | null> {
  const reference = ref(database, `portal/nicknames/${profileLockKey(uid)}`);
  const deadline = Date.now() + PROFILE_LOCK_WAIT_MS;

  while (true) {
    const result = await runTransaction(
      reference,
      currentOwner => currentOwner === null ? uid : undefined,
      { applyLocally: false },
    );

    if (result.committed) {
      const disconnect = onDisconnect(reference);
      try {
        // Register only after acquisition: a losing same-uid client must never
        // queue removal of the active holder's canonical lock.
        await disconnect.remove();
        return { disconnect, reference, uid };
      } catch {
        await removeOwnedLock(reference, uid);
        return null;
      }
    }

    if (Date.now() >= deadline) {
      // Never steal: without a rules-enforced fencing token, stealing could let
      // a paused holder overwrite a newer commit after it resumes.
      return null;
    }

    await wait(PROFILE_LOCK_RETRY_MS);
  }
}

async function releaseProfileLock(lock: ProfileLock): Promise<void> {
  try {
    // Cancel must be acknowledged before deletion. Otherwise this connection's
    // delayed onDisconnect could remove a later holder's same-uid lock.
    await lock.disconnect.cancel();
  } catch {
    return;
  }

  await removeOwnedLock(lock.reference, lock.uid);
}

export function subscribeProfile(
  listener: (p: PortalProfile | null) => void,
): () => void {
  let profileUnsubscribe: (() => void) | null = null;
  let activeUid: string | null = null;
  let subscriptionGeneration = 0;

  const detachProfile = (): void => {
    profileUnsubscribe?.();
    profileUnsubscribe = null;
    activeUid = null;
    subscriptionGeneration += 1;
  };

  const handleAuthState = (authState: PortalAuthState): void => {
    if (authState.status !== 'guest' && authState.status !== 'google') {
      detachProfile();
      listener(null);
      return;
    }

    const uid = authState.user.uid;
    if (activeUid === uid && profileUnsubscribe) {
      return;
    }

    detachProfile();
    listener(null);
    activeUid = uid;
    const generation = subscriptionGeneration;

    try {
      const profileRef = ref(getDatabase(getApp()), `portal/users/${uid}`);
      profileUnsubscribe = onValue(
        profileRef,
        snapshot => {
          if (generation === subscriptionGeneration) {
            listener(readProfile(snapshot.val()));
          }
        },
        () => {
          if (generation === subscriptionGeneration) {
            listener(null);
          }
        },
      );
    } catch {
      activeUid = null;
      listener(null);
    }
  };

  const authUnsubscribe = subscribePortalAuth(handleAuthState);
  initPortalAuth();

  return () => {
    authUnsubscribe();
    detachProfile();
  };
}

export async function checkNicknameAvailable(nickname: string): Promise<NicknameResult> {
  const nicknameLower = normalizeNickname(nickname);
  if (!nicknameLower) {
    return 'invalid';
  }

  const user = getCurrentUser();
  if (!user) {
    return 'error';
  }

  try {
    const nicknameRef = ref(getDatabase(getApp()), `portal/nicknames/${nicknameLower}`);
    const snapshot = await get(nicknameRef);
    if (!snapshot.exists() || snapshot.val() === user.uid) {
      return 'ok';
    }

    return 'taken';
  } catch {
    return 'error';
  }
}

export async function setNickname(
  nickname: string,
): Promise<'ok' | 'taken' | 'invalid' | 'unauthenticated' | 'error'> {
  const nicknameLower = normalizeNickname(nickname);
  if (!nicknameLower) {
    return 'invalid';
  }

  const user = getCurrentUser();
  if (!user) {
    return 'unauthenticated';
  }

  try {
    const database = getDatabase(getApp());
    let profileLock: ProfileLock | null = null;
    try {
      profileLock = await acquireProfileLock(database, user.uid);
      if (!profileLock) {
        return 'error';
      }

      const profileSnapshot = await get(ref(database, `portal/users/${user.uid}`));
      const currentProfile = readProfile(profileSnapshot.val());
      const oldNicknameLower = currentProfile.nickname
        ? normalizeNickname(currentProfile.nickname)
        : null;
      const updates: Record<string, unknown> = {
        [`portal/users/${user.uid}`]: {
          nickname,
          nicknameLower,
          updatedAt: serverTimestamp(),
        },
        [`portal/nicknames/${nicknameLower}`]: user.uid,
      };

      if (oldNicknameLower && oldNicknameLower !== nicknameLower) {
        updates[`portal/nicknames/${oldNicknameLower}`] = null;
      }

      try {
        const lockSnapshot = await get(profileLock.reference);
        if (lockSnapshot.val() !== user.uid) {
          return 'error';
        }

        // The canonical per-uid lock serializes every tab/device. While held,
        // this single root update commits the profile, reserves the new index,
        // and removes the commit-time old index as one server operation.
        await update(ref(database), updates);
        return 'ok';
      } catch {
        try {
          const ownerSnapshot = await get(
            ref(database, `portal/nicknames/${nicknameLower}`),
          );
          const owner = ownerSnapshot.val();
          return typeof owner === 'string' && owner !== user.uid ? 'taken' : 'error';
        } catch {
          return 'error';
        }
      }
    } finally {
      if (profileLock) {
        await releaseProfileLock(profileLock);
      }
    }
  } catch {
    return 'error';
  }
}
