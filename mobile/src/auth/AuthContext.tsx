import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_STORAGE_KEY } from '../config/env';
import { setAuthToken as setClientAuthToken, ApiError } from '../api/client';
import { loginRequest, fetchCurrentUser, logoutRequest } from '../api/authApi';
import { exchangeFollowUpAccessToken } from '../api/followUpApi';
import { CurrentUser } from '../types/api';

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: CurrentUser | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Phase 2: secure BM access handoff (spec section 15). Exchanges a
  // one-time opaque token from a follow-up message for a real,
  // short-lived session — same resulting shape as a normal login, so
  // every screen downstream (BMHomeScreen, etc.) needs no special-casing.
  loginWithAccessToken: (rawToken: string) => Promise<void>;
  // Called by other parts of the app (e.g. the API client, indirectly)
  // when an authenticated request comes back 401 — clears the invalid
  // session and returns the app to the login screen (spec section 13).
  handleSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const clearSession = useCallback(async () => {
    setClientAuthToken(null);
    await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    setState({ status: 'unauthenticated', user: null });
  }, []);

  // On app start: determine authentication state by checking for a
  // stored token and validating it against the backend (spec section 13
  // — "Determine authentication state" before showing any screen).
  useEffect(() => {
    (async () => {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!storedToken) {
        setState({ status: 'unauthenticated', user: null });
        return;
      }
      setClientAuthToken(storedToken);
      try {
        const user = await fetchCurrentUser();
        setState({ status: 'authenticated', user });
      } catch (err) {
        // Stored token is invalid/expired — clear it rather than getting
        // stuck, and don't surface this as an error toast on cold start.
        await clearSession();
      }
    })();
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password);
    setClientAuthToken(result.token);
    await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, result.token);
    const user = await fetchCurrentUser();
    setState({ status: 'authenticated', user });
  }, []);

  const loginWithAccessToken = useCallback(async (rawToken: string) => {
    const result = await exchangeFollowUpAccessToken(rawToken);
    setClientAuthToken(result.token);
    await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, result.token);
    // The access-exchange response already has everything BMHomeScreen
    // needs; re-fetching /auth/me would be redundant, but doing it anyway
    // keeps this path's resulting CurrentUser shape byte-for-byte
    // identical to the normal login path rather than hand-assembling a
    // slightly different object here.
    const user = await fetchCurrentUser();
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the network call fails, still clear local session state —
      // logout must always succeed from the user's point of view.
    }
    await clearSession();
  }, [clearSession]);

  const handleSessionExpired = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, loginWithAccessToken, handleSessionExpired }),
    [state, login, logout, loginWithAccessToken, handleSessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

// Exported so screens can distinguish "wrong password" from "network
// down" from "something else" without re-deriving ApiError checks
// themselves.
export { ApiError };
