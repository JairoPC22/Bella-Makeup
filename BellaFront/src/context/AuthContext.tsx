import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import type { User } from "../types/api";
import * as authService from "../services/authService";
import { ApiError } from "../services/apiClient";

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

  const login = useCallback(async (username: string, password: string) => {
    const { user } = await authService.login(username, password);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  // Lets pages that mutate the current user (e.g. /perfil editing the
  // display name or avatar) push the fresh record back into the shared
  // session state, so chrome that reads from this context — like the
  // header's UserMenu avatar/name — updates immediately instead of staying
  // stale until the next full page reload re-runs the /auth/me effect.
  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}
