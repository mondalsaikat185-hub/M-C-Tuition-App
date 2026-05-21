import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Enable persistent offline cache (IndexedDB)
// This means Firestore reads come from local cache first,
// only fetching from server when data is stale or missing.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
}, (firebaseConfig as any).firestoreDatabaseId);

export const auth = getAuth(app);
