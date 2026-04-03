import API from '../services/api';

// Admin service methods
export const adminService = {
  async getAllUsers(params = {}) {
    const response = await API.get('/users/', { params });
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
  },

  // Delegation methods
  async getDelegations(params = {}) {
    const response = await API.get('/delegations/', { params });
    return response.data;
  },

  async createDelegation(payload) {
    const response = await API.post('/delegations/', payload);
    return response.data;
  },

  async deleteDelegation(id) {
    const response = await API.delete(`/delegations/${id}`);
    return response.data;
  }
};
