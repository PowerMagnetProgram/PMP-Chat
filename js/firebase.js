import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Replace these values with your Firebase web app config.
const firebaseConfig = {
   apiKey: "AIzaSyBFVe-8wGFdwJ48FllRp_L4bWzCRZeSmTQ",
  authDomain: "pmp-chat-521f5.firebaseapp.com",
  projectId: "pmp-chat-521f5",
  storageBucket: "pmp-chat-521f5.firebasestorage.app",
  messagingSenderId: "14259201231",
  appId: "1:14259201231:web:57b8d13032da05d53c43ba",
  measurementId: "G-KVD576VPC4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, serverTimestamp };

export const persistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Unable to set auth persistence", error);
});
