import API from '../services/api';

// Admin service methods
export const adminService = {
  async getAllUsers() {
    // Modify URL if your backend changed
    const response = await API.get('/users/');
    return response.data;
  },

  async updateUserRole(userId, role, status) {
    const response = await API.put(`/users/${userId}/role`, { role, status });
    return response.data;
  },

  async getSettings() {
    const response = await API.get('/settings/');
    return response.data;
  },

  async updateSettings(settings) {
    const response = await API.put('/settings/', settings);
    return response.data;
  }
};
