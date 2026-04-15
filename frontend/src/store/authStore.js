import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  token: sessionStorage.getItem('access_token') || null,
  refreshToken: sessionStorage.getItem('refresh_token') || null,
  user: JSON.parse(sessionStorage.getItem('user') || 'null'),
  
  setAuth: (token, user, refreshToken) => {
    sessionStorage.setItem('access_token', token);
    if (refreshToken) {
      sessionStorage.setItem('refresh_token', refreshToken);
    }
    sessionStorage.setItem('user', JSON.stringify(user));
    set({ token, user, refreshToken: refreshToken || sessionStorage.getItem('refresh_token') });
  },

  logout: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('selected_entity');
    sessionStorage.removeItem('active_role');
    set({ token: null, user: null, refreshToken: null });
  }
}));
