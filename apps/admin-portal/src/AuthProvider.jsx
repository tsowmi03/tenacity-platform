import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebaseConfig";

const AuthContext = createContext(null);

// Portal admission. The admin portal is admin-only: tutors have their own
// application on their own origin, and identity is shared through the same
// Firebase project, so the role claim is what keeps them out of here.
//
// This is an application boundary, not a data boundary. A tutor's role claim
// still carries the Firestore/Storage access the mobile app depends on; what
// this prevents is an admin-portal session, not API access.
export const PORTAL_ALLOWED_ROLES = ["admin"];
export const PORTAL_ACCESS_DENIED_MESSAGE =
  "This account cannot access the admin portal. Sign in with a Tenacity admin account.";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setUser(u);

      if (!u) {
        setRole(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await u.getIdTokenResult(true);
        const claimRole = tokenResult?.claims?.role || null;

        if (!PORTAL_ALLOWED_ROLES.includes(claimRole)) {
          // Set the message before signing out. signOut re-enters this
          // listener with a null user, and that pass must not clear it —
          // otherwise the rejection reason disappears behind the login form
          // and the user simply loops.
          setAccessError(PORTAL_ACCESS_DENIED_MESSAGE);
          setRole(null);
          setIsAdmin(false);
          await signOut(auth);
          return;
        }

        setAccessError("");
        setRole(claimRole);
        setIsAdmin(true);
      } catch (e) {
        console.error(e);
        setRole(null);
        setIsAdmin(false);
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
      accessError,
      loading,
      async login(email, password) {
        if (!auth) {
          throw new Error(
            "Firebase is not configured. Check your VITE_FIREBASE_* env vars."
          );
        }
        setAccessError("");
        return signInWithEmailAndPassword(auth, email, password);
      },
      async logout() {
        if (!auth) return;
        setAccessError("");
        return signOut(auth);
      },
    };
  }, [user, role, isAdmin, accessError, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
