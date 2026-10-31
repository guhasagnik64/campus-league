import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Unique Siliguri hub configuration[cite: 21]
const firebaseConfig = {
  apiKey: "AIzaSyBJU_pSEsR-44WsaelEbXroZBoqcWVfjWM",
  authDomain: "campus-league-5cac1.firebaseapp.com",
  projectId: "campus-league-5cac1",
  storageBucket: "campus-league-5cac1.firebasestorage.app",
  messagingSenderId: "831540710409",
  appId: "1:831540710409:web:d99a33e24bf0dbb0913cd8"
};

// Initialize Firebase App[cite: 21]
const app = initializeApp(firebaseConfig);

// Initialize Firestore with explicit long-polling and multi-tab persistent cache
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Storage Export[cite: 21]
export const storage = getStorage(app);