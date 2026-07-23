import React, { useEffect, useState } from 'react';
import { Dice5 } from 'lucide-react';
import {
  initPortalAuth,
  linkGoogle,
  signOutPortal,
  subscribePortalAuth,
  type PortalAuthState,
} from '../../lib/portalAuth';

const initialState: PortalAuthState = { status: 'loading', user: null };

export function AccountWidget() {
  const [authState, setAuthState] = useState<PortalAuthState>(initialState);
  const [pendingAction, setPendingAction] = useState<'link' | 'sign-out' | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribePortalAuth(setAuthState);
    initPortalAuth();
    return unsubscribe;
  }, []);

  const handleGoogleLink = async () => {
    if (pendingAction) {
      return;
    }

    setPendingAction('link');
    setActionMessage('');
    const linked = await linkGoogle();
    if (!linked) {
      setActionMessage('Google 계정 연결에 실패했습니다.');
    }
    setPendingAction(null);
  };

  const handleSignOut = async () => {
    if (pendingAction) {
      return;
    }

    setPendingAction('sign-out');
    setActionMessage('');
    const signedOut = await signOutPortal();
    if (!signedOut) {
      setActionMessage('로그아웃에 실패했습니다.');
    }
    setPendingAction(null);
  };

  if (authState.status === 'loading') {
    return (
      <div className="account-widget account-widget--loading" role="status" aria-label="계정 정보를 불러오는 중">
        <span className="account-widget__spinner" aria-hidden="true" />
      </div>
    );
  }

  if (authState.status === 'setup-required') {
    return (
      <div className="account-widget account-widget--badge" role="status">
        계정 준비 중
      </div>
    );
  }

  if (authState.status === 'error') {
    return (
      <div className="account-widget account-widget--badge" role="status">
        계정 확인 불가
      </div>
    );
  }

  if (authState.status === 'guest') {
    const guestName = `게스트-${authState.user.uid.slice(0, 4)}`;
    return (
      <div className="account-widget" aria-label="게스트 계정">
        <span className="account-widget__identity" title={guestName}>
          <Dice5 size={16} aria-hidden="true" />
          <span className="account-widget__name">{guestName}</span>
        </span>
        <button
          type="button"
          className="account-widget__button"
          onClick={handleGoogleLink}
          disabled={pendingAction !== null}
          aria-label={`${guestName} Google 계정 연결`}
        >
          Google 연결
        </button>
        <span className="account-widget__sr-only" role="status" aria-live="polite">
          {actionMessage}
        </span>
      </div>
    );
  }

  const accountName = authState.user.displayName?.trim()
    || authState.user.email?.split('@')[0]
    || '연결된 계정';

  return (
    <div className="account-widget" aria-label="Google 연결 계정">
      <span className="account-widget__identity" title={accountName}>
        <span className="account-widget__name">{accountName}</span>
      </span>
      <button
        type="button"
        className="account-widget__button account-widget__button--muted"
        onClick={handleSignOut}
        disabled={pendingAction !== null}
        aria-label={`${accountName} 로그아웃`}
      >
        로그아웃
      </button>
      <span className="account-widget__sr-only" role="status" aria-live="polite">
        {actionMessage}
      </span>
    </div>
  );
}
