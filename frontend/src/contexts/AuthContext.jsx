import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/authService';
import { isMockMode, SESSION_CHECK_EVENT } from '../services/apiClient';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const authVersion = useRef(0);

  const refreshUser = useCallback(async () => {
    const version = ++authVersion.current;
    try {
      const currentUser = await authService.getCurrentUser();
      if (version === authVersion.current) setUser(currentUser);
      return currentUser;
    } catch {
      return null;
    } finally {
      if (version === authVersion.current) setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let checking = false;
    async function checkSession() {
      if (checking) return;
      checking = true;
      const version = authVersion.current;
      try {
        const currentUser = await authService.getCurrentUser();
        if (active && version === authVersion.current && !currentUser) {
          setSessionExpired(true);
          setUser(null);
        }
      } catch {
        // A network error doesn't establish that this session has expired.
      } finally {
        checking = false;
      }
    }
    window.addEventListener(SESSION_CHECK_EVENT, checkSession);
    return () => {
      active = false;
      window.removeEventListener(SESSION_CHECK_EVENT, checkSession);
    };
  }, [user]);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    const loggedInUser = result?.user || result;
    ++authVersion.current;
    setSessionExpired(false);
    setIsInitializing(false);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const signup = useCallback(async (payload) => {
    return authService.signup(payload);
  }, []);

  const logout = useCallback(async () => {
    ++authVersion.current;
    try {
      await authService.logout();
    } finally {
      setSessionExpired(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      sessionExpired,
      isMockMode: isMockMode(),
      login,
      signup,
      logout,
      refreshUser,
    }),
    [user, isInitializing, sessionExpired, login, signup, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
