import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Owner } from './api/client';

type AuthState = {
  owner: Owner | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .GET('/api/session')
      .then(({ data }) => setOwner(data?.owner ?? null))
      .catch(() => setOwner(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await api.POST('/api/session', { body: { email, password } });
    if (error) {
      return error.message || 'Не удалось войти';
    }
    setOwner(data.owner);
    return null;
  };

  const logout = async () => {
    await api.DELETE('/api/session');
    setOwner(null);
  };

  return (
    <AuthContext.Provider value={{ owner, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth используется вне AuthProvider');
  }
  return ctx;
}
