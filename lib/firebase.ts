import { initializeApp } from "firebase/app";
import { getMessaging, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDpj-5viH0tc53bdTc-Cso332pGc4xZQIc",
  authDomain: "adaidaita-2a42b.firebaseapp.com",
  projectId: "adaidaita-2a42b",
  storageBucket: "adaidaita-2a42b.firebasestorage.app",
  messagingSenderId: "989109823458",
  appId: "1:989109823458:web:12806be6da6bbc36f1fbbb",
  measurementId: "G-33M3D5NBSF"
};

const app = initializeApp(firebaseConfig);
export const messaging: Messaging = getMessaging(app);
export default app;
