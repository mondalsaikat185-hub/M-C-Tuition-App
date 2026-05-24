import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, updateDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';

export type UserRole = 'student' | 'admin';
export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected' | 'incomplete';

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
  monthlyFee?: number | null;
  pendingMonths?: number | null;
  showPaymentNudge?: boolean;
  exemptReason?: string | null;
}

interface AuthContextType {
  fbUser: FirebaseUser | null;
  user: AppUser | null;
  loading: boolean;
  quotaError: string | null;
  updateLocalUser: (updates: Partial<AppUser>) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  fbUser: null,
  user: null,
  loading: true,
  quotaError: null,
  updateLocalUser: () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const updateLocalUser = (updates: Partial<AppUser>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : null);
  };

  useEffect(() => {
    // Check for redirect results first
    getRedirectResult(auth).then((result) => {
       if (result) {
          console.log("Logged in via redirect", result.user.email);
       }
    }).catch((error) => {
       // Silently ignore - not a real error if no redirect happened
       console.warn("getRedirectResult (non-critical):", error.code);
    });

    const unsubscribeFb = onAuthStateChanged(auth, async (firebaseUser) => {
      setFbUser(firebaseUser);

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        try {
          // Fetch admins collection and user doc in parallel — saves 1 Firestore read per login
          const [adminDoc, docSnap] = await Promise.all([
            getDoc(doc(db, 'admins', firebaseUser.uid)),
            getDoc(userRef),
          ]);
          let isAdmin = adminDoc.exists();

          // Fallback: if not in admins collection, check role field in user doc (dev/migration)
          if (!isAdmin && docSnap.exists() && docSnap.data().role === 'admin') {
             isAdmin = true;
             // Auto-add to admins collection for future (fire-and-forget, non-blocking)
             setDoc(doc(db, 'admins', firebaseUser.uid), { email: firebaseUser.email, role: 'admin' }).catch(e =>
               console.log("Could not auto-add to admins", e)
             );
          }

          if (!docSnap.exists()) {
            let preCreatedData = null;
            let oldDocId = null;
            
            try {
                // Look for admin pre-created user by email
                const emailLower = (firebaseUser.email || '').toLowerCase();
                const q = query(collection(db, 'users'), where('email', '==', emailLower));
                const adminCreatedSnaps = await getDocs(q);
                if (!adminCreatedSnaps.empty) {
                   preCreatedData = adminCreatedSnaps.docs[0].data();
                   oldDocId = adminCreatedSnaps.docs[0].id;
                }
            } catch (e) {
                console.warn("Could not query pre-existing users", e);
            }

            const newUser = {
              uid: firebaseUser.uid,
              email: (firebaseUser.email || '').toLowerCase(),
              displayName: firebaseUser.displayName || null,
              photoURL: firebaseUser.photoURL || null,
              role: isAdmin ? 'admin' : (preCreatedData?.role || 'student'),
              status: isAdmin ? 'active' : (preCreatedData?.status || 'incomplete'),
              batchId: preCreatedData?.batchId || null,
              phone: preCreatedData?.phone || null,
              fullName: preCreatedData?.fullName || null,
              monthlyFee: preCreatedData?.monthlyFee !== undefined && preCreatedData.monthlyFee !== null ? preCreatedData.monthlyFee : 500,
              pendingMonths: preCreatedData?.pendingMonths || 0,
              isProfileComplete: preCreatedData?.isProfileComplete || false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);

            if (oldDocId) {
               try {
                   await deleteDoc(doc(db, 'users', oldDocId));
               } catch (e) {
                   console.error("Failed to delete orphaned user doc", e);
               }
            }

            // Use local newUser object — no extra getDoc read needed after setDoc
            setUser({ ...newUser, createdAt: new Date(), updatedAt: new Date() } as any);
          } else {
            // Already exists
            const data = docSnap.data();
            const updates: any = {};
            if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
              updates.role = 'admin';
              updates.status = 'active';
            }
            if (Object.keys(updates).length > 0) {
              updates.updatedAt = serverTimestamp();
              try {
                 await updateDoc(userRef, updates);
              } catch (e: any) {
                 console.warn("Non-fatal error updating user", e);
              }
            }
            // Use the already-fetched docSnap — NO extra read needed
            setUser({ ...data, ...updates } as AppUser);
          }
          setLoading(false);
        } catch (error: any) {
          if (error?.message?.includes('Quota') || error?.code === 'resource-exhausted') {
             console.error('AuthProvider setup error:', error);
             setQuotaError('ডেটাবেস এর আজকের ফ্রি লিমিট শেষ (Quota Exceeded)। দয়া করে আবার চেষ্টা করুন বা কালকের জন্য অপেক্ষা করুন।');
          } else if (error?.message?.includes('offline') || error?.code === 'unavailable' || error?.message?.includes('network')) {
             console.log('Client offline, initial setup failed.', error);
             setQuotaError('লগইন সফল হয়েছে, কিন্তু ডেটাবেসের সাথে কানেক্ট করা যাচ্ছে না (Network/Offline Error)। আপনার ব্রাউজারের ক্যাশ (Cache) ক্লিয়ার করে আবার চেষ্টা করুন। (' + error.message + ')');
          } else {
             console.error('AuthProvider setup error:', error);
             setQuotaError('Setup Error: ' + error.message);
          }
          setLoading(false);
          return;
        }

      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeFb();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    setQuotaError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Sign in failed", error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/network-request-failed' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        try {
           setQuotaError("লগইন পপআপ কাজ করছে না। Redirect Login শুরু হচ্ছে...");
           await signInWithRedirect(auth, provider);
        } catch (redirectError: any) {
           console.error("Redirect also failed", redirectError);
           setQuotaError("redirect failed: " + redirectError.message);
        }
      } else {
        setQuotaError("Sign in error: " + error.message + "\n\nদয়া করে আবার চেষ্টা করুন।");
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ fbUser, user, loading, quotaError, updateLocalUser, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
