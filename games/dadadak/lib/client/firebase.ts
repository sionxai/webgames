"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  type User as FirebaseUser,
} from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCc4Gjh0N3wzCxqAEEQkrsX8AlI7UNBGR0",
  authDomain: "webgames-66ccf.firebaseapp.com",
  databaseURL:
    "https://webgames-66ccf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webgames-66ccf",
  storageBucket: "webgames-66ccf.firebasestorage.app",
  messagingSenderId: "539839465670",
  appId: "1:539839465670:web:b6bdf12a8d14d067e2efc7",
  measurementId: "G-94XVFXT33H",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const realtimeDb = getDatabase(firebaseApp);

let authenticationPromise: Promise<FirebaseUser | null> | null = null;

export function getAuthenticatedUser(): Promise<FirebaseUser | null> {
  if (!authenticationPromise) {
    authenticationPromise = (async () => {
      try {
        await auth.authStateReady();
        if (auth.currentUser) return auth.currentUser;
        return (await signInAnonymously(auth)).user;
      } catch {
        return null;
      }
    })();
  }
  return authenticationPromise;
}
