import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, getToken, setAuthToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!getToken());

  // Restore session
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .me()
      .then(({ data }) => setUser(data))
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  const accept = useCallback(({ data }) => {
    setAuthToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => accept(await authApi.login({ email, password })), [accept]);
  const register = useCallback(
    async (full_name, email, password) => accept(await authApi.register({ full_name, email, password })),
    [accept]
  );
  const loginWithGoogle = useCallback(async (credential) => accept(await authApi.google(credential)), [accept]);

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout }),
    [user, loading, login, register, loginWithGoogle, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
