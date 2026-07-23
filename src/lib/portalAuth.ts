import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCc4Gjh0N3wzCxqAEEQkrsX8AlI7UNBGR0',
  authDomain: 'webgames-66ccf.firebaseapp.com',
  databaseURL: 'https://webgames-66ccf-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'webgames-66ccf',
  storageBucket: 'webgames-66ccf.firebasestorage.app',
  messagingSenderId: '539839465670',
  appId: '1:539839465670:web:b6bdf12a8d14d067e2efc7',
  measurementId: 'G-94XVFXT33H',
};

export type PortalAuthState =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: User }
  | { status: 'google'; user: User }
  | { status: 'setup-required'; user: null }
  | { status: 'error'; user: null };

type PortalAuthListener = (state: PortalAuthState) => void;

let authInstance: Auth | null = null;
let authObserver: Unsubscribe | null = null;
let anonymousSignIn: Promise<void> | null = null;
let googleLink: Promise<boolean> | null = null;
let anonymousProviderBlocked = false;
let analyticsInitializationStarted = false;
let currentState: PortalAuthState = { status: 'loading', user: null };
const listeners = new Set<PortalAuthListener>();

function setState(state: PortalAuthState): void {
  currentState = state;
  listeners.forEach(listener => listener(currentState));
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  return typeof error.code === 'string' ? error.code : null;
}

function isErrorCode(error: unknown, code: string): boolean {
  const errorCode = getErrorCode(error);
  return errorCode === code || errorCode === `auth/${code}`;
}

function ensureAnonymousAuth(auth: Auth): Promise<void> {
  if (anonymousProviderBlocked) {
    setState({ status: 'setup-required', user: null });
    return Promise.resolve();
  }

  if (anonymousSignIn) {
    return anonymousSignIn;
  }

  setState({ status: 'loading', user: null });
  const pending = signInAnonymously(auth)
    .then(() => undefined)
    .catch(error => {
      if (isErrorCode(error, 'operation-not-allowed')) {
        anonymousProviderBlocked = true;
        setState({ status: 'setup-required', user: null });
        return;
      }

      setState({ status: 'error', user: null });
    });

  anonymousSignIn = pending;
  void pending.then(() => {
    if (anonymousSignIn === pending) {
      anonymousSignIn = null;
    }
  });
  return pending;
}

function initializeAnalyticsSafely(app: FirebaseApp): void {
  if (analyticsInitializationStarted || typeof window === 'undefined') {
    return;
  }

  analyticsInitializationStarted = true;
  void (async () => {
    try {
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      if (await isSupported()) {
        getAnalytics(app);
      }
    } catch {
      // Analytics availability must never block portal authentication.
    }
  })();
}

export function initPortalAuth(): void {
  if (authObserver) {
    return;
  }

  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    authInstance = auth;
    authObserver = onAuthStateChanged(
      auth,
      user => {
        if (user) {
          setState({ status: user.isAnonymous ? 'guest' : 'google', user });
          return;
        }

        void ensureAnonymousAuth(auth);
      },
      () => {
        setState({ status: 'error', user: null });
      },
    );
    initializeAnalyticsSafely(app);
  } catch {
    setState({ status: 'error', user: null });
  }
}

export function subscribePortalAuth(listener: PortalAuthListener): Unsubscribe {
  listeners.add(listener);
  listener(currentState);

  return () => {
    listeners.delete(listener);
  };
}

export function linkGoogle(): Promise<boolean> {
  initPortalAuth();

  if (googleLink) {
    return googleLink;
  }

  const auth = authInstance;
  const user = auth?.currentUser;
  if (!auth || !user) {
    return Promise.resolve(false);
  }

  if (!user.isAnonymous) {
    return Promise.resolve(true);
  }

  const pending = (async () => {
    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(user, provider);
      return true;
    } catch (error) {
      if (!isErrorCode(error, 'credential-already-in-use')) {
        return false;
      }

      try {
        await signInWithPopup(auth, provider);
        return true;
      } catch {
        return false;
      }
    }
  })();

  googleLink = pending;
  void pending.then(() => {
    if (googleLink === pending) {
      googleLink = null;
    }
  });
  return pending;
}

export async function signOutPortal(): Promise<boolean> {
  initPortalAuth();

  if (!authInstance) {
    return false;
  }

  try {
    await signOut(authInstance);
    return true;
  } catch {
    return false;
  }
}
