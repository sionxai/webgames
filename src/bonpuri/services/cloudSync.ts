import type { CloudSaveRecord } from '../../lib/cloudSave';
import type { PortalAuthState } from '../../lib/portalAuth';
import {
  isSupportedEnvelope,
  parseCloudPayload,
  sameProfile,
  type OwnerRelation,
  type ProfileMeta,
  type ProfileOwner,
} from './cloudProfile';
import type { BonpuriProfile } from './profile';

export type BonpuriAuthAccess =
  | { kind: 'pending' }
  | { kind: 'blocked'; reason: 'setup-required' | 'error' }
  | { kind: 'guest'; uid: string }
  | { kind: 'google'; uid: string };

export function authAccessFromPortal(state: PortalAuthState): BonpuriAuthAccess {
  if (state.status === 'loading') return { kind: 'pending' };
  if (state.status === 'setup-required' || state.status === 'error') {
    return { kind: 'blocked', reason: state.status };
  }
  return { kind: state.status, uid: state.user.uid };
}

/** 인증 확인 전이나 인증 설정 오류 상태에서는 로컬 기록도 읽거나 표시하거나 쓰지 않는다. */
export function authAccessPolicy(auth: BonpuriAuthAccess): {
  canReadLocal: boolean;
  canDisplayProfile: boolean;
  canWriteLocal: boolean;
} {
  const resolved = auth.kind === 'guest' || auth.kind === 'google';
  return { canReadLocal: resolved, canDisplayProfile: resolved, canWriteLocal: resolved };
}

export function ownerForAuth(auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>): ProfileOwner {
  return { kind: auth.kind, uid: auth.uid };
}

export function createProfileMeta(
  auth: Extract<BonpuriAuthAccess, { kind: 'guest' | 'google' }>,
  savedAt: number,
  device: string,
): ProfileMeta {
  return { schemaVersion: 1, owner: ownerForAuth(auth), savedAt, device };
}

export function createProfileDeviceId(): string {
  return globalThis.crypto.randomUUID().slice(0, 8);
}

export type CloudMergeDecision =
  | { kind: 'empty' }
  | { kind: 'local-only'; local: BonpuriProfile }
  | { kind: 'cloud-only'; cloud: BonpuriProfile; record: CloudSaveRecord }
  | { kind: 'same'; local: BonpuriProfile; cloud: BonpuriProfile; record: CloudSaveRecord }
  | { kind: 'diverged'; local: BonpuriProfile; cloud: BonpuriProfile; record: CloudSaveRecord }
  | { kind: 'invalid-cloud'; error: string };

/** 네트워크 계층이 반환한 envelope와 payload를 다시 검증한 뒤 병합 종류만 판정한다. */
export function decideCloudMerge(
  local: BonpuriProfile | null,
  record: CloudSaveRecord | null,
): CloudMergeDecision {
  if (record === null) return local === null ? { kind: 'empty' } : { kind: 'local-only', local };
  if (!isSupportedEnvelope(record.schema)) {
    return { kind: 'invalid-cloud', error: '클라우드 기록의 버전을 확인할 수 없습니다.' };
  }
  const parsed = parseCloudPayload(record.payload);
  if (!parsed.ok) return { kind: 'invalid-cloud', error: parsed.error };
  if (local === null) return { kind: 'cloud-only', cloud: parsed.profile, record };
  return sameProfile(local, parsed.profile)
    ? { kind: 'same', local, cloud: parsed.profile, record }
    : { kind: 'diverged', local, cloud: parsed.profile, record };
}

/** 이전 계정의 진행 중 런/결과는 다음 UID가 확정되는 순간 폐기한다. */
export function shouldDiscardAccountSession(previousUid: string | null, next: BonpuriAuthAccess): boolean {
  if (previousUid === null) return false;
  return (next.kind !== 'guest' && next.kind !== 'google') || next.uid !== previousUid;
}

export type SyncSessionAction = 'keep' | 'hide' | 'discard';

/** 동일 UID retry는 화면만 gate로 가리고 run/result는 보존한다. UID/인증 경계만 폐기한다. */
export function syncSessionAction(
  previousUid: string | null,
  next: BonpuriAuthAccess,
  isRetry: boolean,
): SyncSessionAction {
  if (shouldDiscardAccountSession(previousUid, next)) return 'discard';
  return isRetry ? 'hide' : 'keep';
}

/** 늦게 끝난 pull이 현재 계정 화면을 덮지 못하게 하는 sequence + uid 이중 가드. */
export function isCurrentSyncAttempt(
  attempt: number,
  currentAttempt: number,
  expectedUid: string,
  currentAuth: BonpuriAuthAccess,
): boolean {
  return attempt === currentAttempt &&
    (currentAuth.kind === 'guest' || currentAuth.kind === 'google') &&
    currentAuth.uid === expectedUid;
}

/** 명시 선택이 끝난 동일 Google 소유 기록만 클라우드 push 후보가 된다. */
export function canPushProfile(
  auth: BonpuriAuthAccess,
  meta: ProfileMeta | null,
  syncReady: boolean,
  choicePending: boolean,
): boolean {
  return auth.kind === 'google' && syncReady && !choicePending && meta !== null &&
    meta.owner.kind === 'google' && meta.owner.uid === auth.uid;
}

/** pull 실패 시에도 명시적으로 같은 소유자라고 판정된 유효 로컬 기록만 열 수 있다. */
export function canOpenLocalAfterCloudFailure(
  relation: OwnerRelation,
  hasValidLocal: boolean,
  hasMeta: boolean,
): boolean {
  return relation.kind === 'same-owner' && hasValidLocal && hasMeta;
}
