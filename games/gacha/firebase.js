import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  push,
  remove,
  query,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCc4Gjh0N3wzCxqAEEQkrsX8AlI7UNBGR0",
  authDomain: "webgames-66ccf.firebaseapp.com",
  databaseURL: "https://webgames-66ccf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webgames-66ccf",
  storageBucket: "webgames-66ccf.firebasestorage.app",
  messagingSenderId: "539839465670",
  appId: "1:539839465670:web:b6bdf12a8d14d067e2efc7",
  measurementId: "G-94XVFXT33H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const functions = getFunctions(app, 'asia-southeast1');

export {
  app,
  auth,
  db,
  functions,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  ref,
  get,
  set,
  update,
  onValue,
  push,
  remove,
  query,
  limitToLast,
  httpsCallable
};
