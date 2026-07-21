import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebaseConfig";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTutor, setIsTutor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setRole(null);
        setIsAdmin(false);
        setIsTutor(false);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await u.getIdTokenResult(true);
        const claimRole = tokenResult?.claims?.role || null;
        setRole(claimRole);
        setIsAdmin(claimRole === "admin");
        setIsTutor(claimRole === "tutor");
      } catch (e) {
        console.error(e);
        setRole(null);
        setIsAdmin(false);
        setIsTutor(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo(() => {
    return {
      user,
      role,
      isAdmin,
      isTutor,
      isStaff: isAdmin || isTutor,
      loading,
      async login(email, password) {
        if (!auth) {
          throw new Error(
            "Firebase is not configured. Check your VITE_FIREBASE_* env vars."
          );
        }
        return signInWithEmailAndPassword(auth, email, password);
      },
      async logout() {
        if (!auth) return;
        return signOut(auth);
      },
    };
  }, [user, role, isAdmin, isTutor, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
