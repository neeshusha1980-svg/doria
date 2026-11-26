import { api } from './api';

export type SessionUser = {
  userId: string;
  name?: string;
  email?: string;
};

export type AuthModalMode = 'signin' | 'signup';

export const auth = {
  async getUser(): Promise<SessionUser | null> {
    try {
      const result = await api.get<{
        user?: { id: string; name?: string; email?: string };
      }>('/api/auth/get-session');
      if (!result.data?.user?.id) return null;
      return {
        userId: result.data.user.id,
        name: result.data.user.name,
        email: result.data.user.email,
      };
    } catch {
      return null;
    }
  },

  async signInWithEmail(email: string, password: string): Promise<void> {
    await api.post('/api/auth/sign-in/email', { email, password });
  },

  async signUpWithEmail(email: string, password: string, name: string): Promise<void> {
    await api.post('/api/auth/sign-up/email', { email, password, name });
  },

  async signInWithGoogle(): Promise<void> {
    const result = await api.post<{ url?: string }>('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: window.location.origin,
    });
    if (result.data?.url) {
      window.location.assign(result.data.url);
    }
  },

  async signInWithRedirect(mode: AuthModalMode = 'signin'): Promise<void> {
    window.dispatchEvent(new CustomEvent('doria-open-auth', { detail: { mode } }));
  },

  async signOut(): Promise<void> {
    await api.post('/api/auth/sign-out', {});
  },
};
