import { create } from 'zustand';
import { adminService } from '../features/admin/adminService';

const useAdminStore = create((set, get) => ({
    users: [],
    roles: [],
    statuses: [],
    loading: false,
    error: null,
    totalUsers: 0,
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,
    sortColumn: 'username',
    sortDirection: 'asc',
    isUpdating: false,

    setSearchQuery: (query) => set({ searchQuery: query }),
    setCurrentPage: (page) => set({ currentPage: page }),
    setItemsPerPage: (items) => set({ itemsPerPage: items, currentPage: 1 }),
    setSort: (column) => {
        const currentColumn = get().sortColumn;
        const currentDirection = get().sortDirection;
        if (currentColumn === column) {
            set({ sortDirection: currentDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            set({ sortColumn: column, sortDirection: 'asc' });
        }
    },

    fetchSettings: async () => {
        try {
            const response = await API.get('/settings/');
            set({ roles: response.data.roles, statuses: response.data.statuses });
        } catch (error) {
            console.error("Failed to fetch settings", error);
        }
    },

    fetchUsers: async () => {
        set({ loading: true, error: null });
        try {
            const data = await adminService.getAllUsers();
            set({ users: data, totalUsers: data.length, loading: false });
        } catch (error) {
            set({ error: error.message || 'Failed to fetch users', loading: false });
        }
    },

    addUser: async (userData) => {
        set({ isUpdating: true });
        try {
            await API.post('/auth/register', userData);
            await get().fetchUsers();
            return true;
        } catch (error) {
            console.error("Failed to add user", error);
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    deleteUser: async (userId) => {
        try {
            await API.delete(`/users/${userId}/`);
            get().fetchUsers();
            return true;
        } catch (error) {
            console.error("Failed to delete user", error);
            return false;
        }
    },

    updateUserRole: async (userId, role, status) => {
        set({ isUpdating: true });
        try {
            await adminService.updateUserRole(userId, role, status);
            await get().fetchUsers();
            return true;
        } catch (error) {
            console.error("Failed to update user", error);
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    updateUserStatus: async (userId, newStatus) => {
        try {
            const oldUsers = get().users;
            const user = oldUsers.find(u => u.id === userId);
            if (user) {
                // Optimistic update
                set({ 
                    users: oldUsers.map(u => u.id === userId ? { ...u, status: newStatus } : u) 
                });
                await adminService.updateUserRole(userId, user.role, newStatus);
            }
        } catch (error) {
            console.error("Failed to update status", error);
            get().fetchUsers();
        }
    }
}));

export default useAdminStore;
