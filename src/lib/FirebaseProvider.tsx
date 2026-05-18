import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { normalizeUserRole, type UserRole } from './authorization';

interface AppUserProfile {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
}

interface FirebaseContextType {
  user: User | null;
  userProfile: AppUserProfile | null;
  role: UserRole;
  loading: boolean;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeUserProfile) {
        unsubscribeUserProfile();
        unsubscribeUserProfile = null;
      }

      if (user) {
        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              id: user.uid,
              email: user.email,
              name: user.displayName || 'Anonymous User',
              role: 'user',
              createdAt: serverTimestamp(),
            });
          }

          unsubscribeUserProfile = onSnapshot(userRef, (snapshot) => {
            const data = snapshot.data();
            setUserProfile({
              id: user.uid,
              email: data?.email || user.email,
              name: data?.name || user.displayName || 'Anonymous User',
              role: normalizeUserRole(data?.role),
            });
          }, () => {
            setUserProfile({
              id: user.uid,
              email: user.email,
              name: user.displayName || 'Anonymous User',
              role: 'user',
            });
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          setUserProfile({
            id: user.uid,
            email: user.email,
            name: user.displayName || 'Anonymous User',
            role: 'user',
          });
        }
      } else {
        setUserProfile(null);
      }
      setUser(user);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubscribeUserProfile) unsubscribeUserProfile();
    };
  }, []);

  const [authLoading, setAuthLoading] = useState(false);

  const signInWithGoogle = async () => {
    if (authLoading) return;
    
    setAuthLoading(true);
    const provider = new GoogleAuthProvider();
    // Force select_account to avoid issues with remembered sessions in iframe
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Don't log expected cancel errors as severe
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.warn('Google sign-in was cancelled or interrupted.');
      } else {
        console.error('Error signing in with Google:', error);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, userProfile, role: userProfile?.role || 'user', loading, authLoading, signInWithGoogle, logout }}>
      {!loading && children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
