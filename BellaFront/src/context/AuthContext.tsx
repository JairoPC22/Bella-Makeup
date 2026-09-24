import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types/api";
import * as authService from "../services/authService";
import { ApiError, setSessionExpiredHandler } from "../services/apiClient";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  // See apiClient.ts's setSessionExpiredHandler comment: any request whose
  // own refresh attempt genuinely fails (not just a transient 401) clears
  // `user` here, so ProtectedRoute's existing `!user` check redirects to
  // login instead of the admin panel silently limping along with a dead
  // session.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user } = await authService.login(username, password);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  // Permite que páginas que editan el usuario actual (ej. /perfil) actualicen
  // el estado compartido de sesión sin esperar a un recargue de página.
  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}
