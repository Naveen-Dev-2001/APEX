import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  token: sessionStorage.getItem('access_token') || null,
  refreshToken: sessionStorage.getItem('refresh_token') || null,
  user: JSON.parse(sessionStorage.getItem('user') || 'null'),
  activeRole: sessionStorage.getItem('active_role') || null,

  setAuth: (token, user, refreshToken) => {
    sessionStorage.setItem('access_token', token);
    if (refreshToken) {
      sessionStorage.setItem('refresh_token', refreshToken);
    }
    sessionStorage.setItem('user', JSON.stringify(user));

    // Initialize activeRole if not already set or if explicitly provided in context
    const firstRole = user?.role ? user.role.split(',')[0].trim() : null;
    const currentActive = sessionStorage.getItem('active_role') || firstRole;

    if (currentActive) {
      sessionStorage.setItem('active_role', currentActive);
    }

    set({ token, user, refreshToken: refreshToken || null, activeRole: currentActive });
  },

  setActiveRole: (role) => {
    sessionStorage.setItem('active_role', role);
    set({ activeRole: role });
  },

  logout: () => {
    import('../main').then(({ queryClient }) => {
      queryClient.clear();
    });
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('active_role');
    sessionStorage.removeItem('selected_entity');
    set({ token: null, user: null, refreshToken: null });
  },

  updateUser: (updatedUser) => {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const newUser = { ...user, ...updatedUser };
    sessionStorage.setItem('user', JSON.stringify(newUser));
    set({ user: newUser });
  }
}));
