import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import config from "../firebase-applet-config.json";

const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app, config.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
