import React, {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';
import {
  linkGoogle,
  signOutPortal,
  type PortalAuthState,
} from '../../lib/portalAuth';
import {
  setNickname,
  type PortalProfile,
} from '../../lib/portalProfile';

type ReadyAuthState = Extract<PortalAuthState, { status: 'guest' | 'google' }>;
type PendingAction = 'save' | 'link' | 'sign-out' | null;

interface AccountPanelProps {
  authState: ReadyAuthState;
  displayName: string;
  profile: PortalProfile | null;
  triggerRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
}

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const RESERVED_NICKNAMES = new Set(['admin', '운영자', '관리자', '한판', 'hanpan']);

function getNicknameError(nickname: string): string | null {
  if (nickname !== nickname.trim() || !NICKNAME_PATTERN.test(nickname)) {
    return '공백 없이 한글·영문·숫자·밑줄 2~12자로 입력해 주세요.';
  }

  if (RESERVED_NICKNAMES.has(nickname.toLowerCase())) {
    return '사용할 수 없는 예약 닉네임입니다.';
  }

  return null;
}

export function AccountPanel({
  authState,
  displayName,
  profile,
  triggerRef,
  onClose,
}: AccountPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [nickname, setNicknameInput] = useState(profile?.nickname ?? '');
  const [nicknameDirty, setNicknameDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionMessage, setActionMessage] = useState('');
  const nicknameError = getNicknameError(nickname);
  const actionDisabled = pendingAction !== null;

  useEffect(() => {
    if (!nicknameDirty) {
      setNicknameInput(profile?.nickname ?? '');
    }
  }, [nicknameDirty, profile?.nickname]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      triggerRef.current?.focus();
    };
  }, [onClose, triggerRef]);

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (actionDisabled || nicknameError) {
      return;
    }

    setPendingAction('save');
    setActionMessage('');
    const result = await setNickname(nickname);
    if (result === 'ok') {
      setActionMessage('저장되었습니다');
    } else if (result === 'taken') {
      setActionMessage('이미 사용 중인 닉네임입니다');
    } else if (result === 'invalid') {
      setActionMessage('닉네임 형식을 다시 확인해 주세요.');
    } else if (result === 'unauthenticated') {
      setActionMessage('계정 정보를 다시 확인한 뒤 시도해 주세요.');
    } else {
      setActionMessage('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    setPendingAction(null);
  };

  const handleGoogleLink = async (): Promise<void> => {
    if (actionDisabled) {
      return;
    }

    setPendingAction('link');
    setActionMessage('');
    const linked = await linkGoogle();
    setActionMessage(
      linked
        ? 'Google 계정에 연결되었습니다.'
        : 'Google 계정 연결에 실패했습니다. 다시 시도해 주세요.',
    );
    setPendingAction(null);
  };

  const handleSignOut = async (): Promise<void> => {
    if (actionDisabled || !window.confirm('로그아웃하시겠습니까?')) {
      return;
    }

    setPendingAction('sign-out');
    setActionMessage('');
    const signedOut = await signOutPortal();
    if (signedOut) {
      setPendingAction(null);
      onClose();
      return;
    }

    setActionMessage('로그아웃에 실패했습니다. 다시 시도해 주세요.');
    setPendingAction(null);
  };

  return (
    <div
      className="account-panel-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="account-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-panel-title"
        aria-busy={actionDisabled}
        tabIndex={-1}
      >
        <header className="account-panel__header">
          <div>
            <p className="account-panel__eyebrow">내 계정</p>
            <h2 id="account-panel-title">{displayName}</h2>
          </div>
          <button
            type="button"
            className="account-panel__close"
            onClick={onClose}
            aria-label="계정 패널 닫기"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="account-panel__account">
          <span className="account-panel__badge">
            {authState.status === 'guest' ? '게스트(이 기기 전용)' : 'Google 연결됨'}
          </span>
          {authState.status === 'google' && authState.user.email && (
            <span className="account-panel__email">{authState.user.email}</span>
          )}
        </div>

        <section className="account-panel__section" aria-labelledby="nickname-section-title">
          <div className="account-panel__section-heading">
            <h3 id="nickname-section-title">닉네임</h3>
            <span>언제든 변경 가능</span>
          </div>
          <form className="account-panel__nickname-form" onSubmit={handleSave}>
            <label htmlFor="portal-nickname">게임과 기록에 표시할 이름</label>
            <div className="account-panel__input-row">
              <input
                ref={inputRef}
                id="portal-nickname"
                type="text"
                value={nickname}
                onChange={event => {
                  setNicknameInput(event.target.value);
                  setNicknameDirty(true);
                  setActionMessage('');
                }}
                minLength={2}
                maxLength={12}
                autoComplete="off"
                aria-invalid={nicknameError !== null}
                aria-describedby="portal-nickname-help"
                disabled={actionDisabled}
              />
              <button type="submit" disabled={actionDisabled || nicknameError !== null}>
                {pendingAction === 'save' ? '저장 중…' : '저장'}
              </button>
            </div>
            <p
              id="portal-nickname-help"
              className={nicknameError ? 'account-panel__help account-panel__help--error' : 'account-panel__help'}
            >
              {nicknameError ?? '사용 가능한 형식입니다. 저장 시 중복 여부를 확인합니다.'}
            </p>
          </form>
        </section>

        <section className="account-panel__section account-panel__connection">
          {authState.status === 'guest' ? (
            <>
              <div>
                <h3>기기 간 이어하기</h3>
                <p>지금 연결하면 다른 기기에서도 이어서 플레이할 수 있어요</p>
              </div>
              <button
                type="button"
                className="account-panel__secondary-button"
                onClick={handleGoogleLink}
                disabled={actionDisabled}
              >
                {pendingAction === 'link' ? '연결 중…' : 'Google 연결'}
              </button>
            </>
          ) : (
            <>
              <div>
                <h3>계정 관리</h3>
                <p>현재 Google 계정으로 연결되어 있습니다.</p>
              </div>
              <button
                type="button"
                className="account-panel__danger-button"
                onClick={handleSignOut}
                disabled={actionDisabled}
              >
                {pendingAction === 'sign-out' ? '로그아웃 중…' : '로그아웃'}
              </button>
            </>
          )}
        </section>

        <p className="account-panel__status" role="status" aria-live="polite">
          {actionMessage}
        </p>
      </div>
    </div>
  );
}
