import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  token: sessionStorage.getItem('access_token') || null,
  user: JSON.parse(sessionStorage.getItem('user') || 'null'),
  
  setAuth: (token, user) => {
    sessionStorage.setItem('access_token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user');
    set({ token: null, user: null });
  }
}));
