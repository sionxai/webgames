import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dice5 } from 'lucide-react';
import {
  initPortalAuth,
  subscribePortalAuth,
  type PortalAuthState,
} from '../../lib/portalAuth';
import {
  subscribeProfile,
  type PortalProfile,
} from '../../lib/portalProfile';
import { AccountPanel } from './AccountPanel';

const initialState: PortalAuthState = { status: 'loading', user: null };

export function AccountWidget() {
  const [authState, setAuthState] = useState<PortalAuthState>(initialState);
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unsubscribeAuth = subscribePortalAuth(setAuthState);
    const unsubscribeProfile = subscribeProfile(setProfile);
    initPortalAuth();
    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

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

  const fallbackName = authState.status === 'guest'
    ? `게스트-${authState.user.uid.slice(0, 4)}`
    : authState.user.displayName?.trim()
      || authState.user.email?.split('@')[0]
      || '연결된 계정';
  const displayName = profile?.nickname || fallbackName;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="account-widget account-widget--trigger"
        onClick={() => setPanelOpen(true)}
        aria-label={`${displayName} 계정 메뉴 열기`}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        title={displayName}
      >
        <span className="account-widget__identity">
          {authState.status === 'guest' && (
            <Dice5 size={16} aria-hidden="true" />
          )}
          <span className="account-widget__name">{displayName}</span>
        </span>
        <span className="account-widget__chevron" aria-hidden="true">▾</span>
      </button>

      {panelOpen && (
        <AccountPanel
          authState={authState}
          displayName={displayName}
          profile={profile}
          triggerRef={triggerRef}
          onClose={closePanel}
        />
      )}
    </>
  );
}
