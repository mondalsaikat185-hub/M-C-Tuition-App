import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
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
          if (!docSnap.exists()) {
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || null,
              photoURL: firebaseUser.photoURL || null,
              role: isAdmin ? 'admin' : 'student',
              status: isAdmin ? 'active' : 'pending',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);
          } else {
            // Already exists, but we should make sure admin has admin role
            const data = docSnap.data();
            if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
              await setDoc(userRef, {
                ...data,
                role: 'admin',
                status: 'active',
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error('AuthProvider setup error:', error);
        }

        // Listen for real-time updates
        docUnsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUser(docSnap.data() as AppUser);
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
      if (error.code === 'auth/popup-blocked') {
        alert("Popup was blocked by your browser. Please allow popups or open this app in a new tab (click the ↗ icon in the top right).");
      } else if (error.code === 'auth/network-request-failed') {
        alert("Sign in failed: Network error. Since this app passes through an iframe, your browser might be blocking the login (especially in Safari, Brave, or Incognito). Please open the app in a NEW TAB (click the top-right ↗ icon) and try again.");
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
