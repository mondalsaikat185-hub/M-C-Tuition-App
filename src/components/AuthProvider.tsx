import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';

export type UserRole = 'student' | 'admin';
export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: any;
  updatedAt: any;
  activeDevices?: string[];
  // Additional fields for student
  fullName?: string;
  address?: string;
  dob?: string;
  joinDate?: string;
  phone?: string;
  batchId?: string;
  isProfileComplete?: boolean;
  profilePhotoUrl?: string;
}

interface AuthContextType {
  fbUser: FirebaseUser | null;
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  fbUser: null,
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let docUnsubscribe: (() => void) | null = null;

    // Persist a unique device ID in localStorage to track this browser instance
    const currentDeviceId = localStorage.getItem('mc_local_device_id') || Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('mc_local_device_id', currentDeviceId);

    const unsubscribeFb = onAuthStateChanged(auth, async (firebaseUser) => {
      setFbUser(firebaseUser);
      
      if (docUnsubscribe) {
        docUnsubscribe();
        docUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        try {
          // Check if user is an admin by querying the 'admins' collection
          const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
          let isAdmin = adminDoc.exists();
          
          if (!isAdmin) {
             // Fallback for development: check if the user doc has role: 'admin'
             const tempUserDoc = await getDoc(userRef);
             if (tempUserDoc.exists() && tempUserDoc.data().role === 'admin') {
                isAdmin = true;
                // Auto-add to admins collection for future
                await setDoc(doc(db, 'admins', firebaseUser.uid), { email: firebaseUser.email, role: 'admin' });
             }
          }

          // Initialize if it doesn't exist
          const docSnap = await getDoc(userRef);
          
          let activeDevices = docSnap.exists() ? (docSnap.data().activeDevices || []) : [];
          let needsDeviceUpdate = false;
          
          if (!activeDevices.includes(currentDeviceId)) {
             activeDevices.push(currentDeviceId);
             if (activeDevices.length > 5) {
                 activeDevices = activeDevices.slice(activeDevices.length - 5); // Keep the last 5 devices
             }
             needsDeviceUpdate = true;
          }

          if (!docSnap.exists()) {
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || null,
              photoURL: firebaseUser.photoURL || null,
              role: isAdmin ? 'admin' : 'student',
              status: isAdmin ? 'active' : 'pending',
              activeDevices,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);
          } else {
            // Already exists, but we should make sure admin has admin role & update devices
            const data = docSnap.data();
            const updates: any = {};
            if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
              updates.role = 'admin';
              updates.status = 'active';
            }
            if (needsDeviceUpdate) {
              updates.activeDevices = activeDevices;
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = serverTimestamp();
              await updateDoc(userRef, updates);
            }
          }
        } catch (error) {
          console.error('AuthProvider setup error:', error);
        }

        // Listen for real-time updates
        docUnsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as AppUser;
            
            // Check max device limit (Auto-logout if bumped)
            const allowedDevices = data.activeDevices || [];
            if (allowedDevices.length > 0 && !allowedDevices.includes(currentDeviceId)) {
               // Silently do nothing instead of auto-logout due to high false-positives
               // firebaseSignOut(auth).then(() => { ... });
            }

            setUser(data);
          }
          setLoading(false);
        }, (error) => {
          console.error('User snapshot error:', error);
          setLoading(false);
        });

      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeFb();
      if (docUnsubscribe) {
        docUnsubscribe();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Sign in failed", error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/network-request-failed') {
        try {
           await signInWithRedirect(auth, provider);
        } catch (redirectError) {
           alert("Unable to sign in due to browser restrictions. Please open the app in a new tab by clicking ↗ or 'Share' in the top right.");
        }
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Safe to ignore, user just closed it
      } else {
        alert("Sign in error: " + error.message);
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ fbUser, user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
