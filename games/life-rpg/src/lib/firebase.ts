"use client";

import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const getFirebaseConfig = (): FirebaseOptions => {
  const rawConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON;
  if (!rawConfig) {
    throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG_JSON is not defined. Please update .env.local.");
  }
  try {
    return JSON.parse(rawConfig) as FirebaseOptions;
  } catch {
    throw new Error("Failed to parse NEXT_PUBLIC_FIREBASE_CONFIG_JSON. Ensure it is valid JSON.");
  }
};

let firebaseAppInstance: FirebaseApp | null = null;

const getFirebaseApp = (): FirebaseApp => {
  if (firebaseAppInstance) {
    return firebaseAppInstance;
  }
  const apps = getApps();
  if (apps.length > 0) {
    firebaseAppInstance = getApp();
  } else {
    const config = getFirebaseConfig();
    firebaseAppInstance = initializeApp(config);
  }
  return firebaseAppInstance;
};

export const firebaseApp = getFirebaseApp();
export const auth = getAuth(firebaseApp);
export const database = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);
export const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "liferpg-v28-fix";
export const initialAuthToken = process.env.NEXT_PUBLIC_INITIAL_AUTH_TOKEN;
