import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  token: sessionStorage.getItem('access_token') || null,
  user: JSON.parse(sessionStorage.getItem('user') || 'null'),
  activeRole: sessionStorage.getItem('active_role') || null,
  
  setAuth: (token, user) => {
    sessionStorage.setItem('access_token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
    
    // Initialize activeRole if not already set or if explicitly provided in context
    const firstRole = user?.role ? user.role.split(',')[0].trim() : null;
    const currentActive = sessionStorage.getItem('active_role') || firstRole;
    
    if (currentActive) {
      sessionStorage.setItem('active_role', currentActive);
    }
    
    set({ token, user, activeRole: currentActive });
  },

  setActiveRole: (role) => {
    sessionStorage.setItem('active_role', role);
    set({ activeRole: role });
  },

  logout: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('active_role');
    set({ token: null, user: null, activeRole: null });
  }
}));
