import { create } from 'zustand';
import { adminService } from '../features/admin/adminService';

const useAdminStore = create((set, get) => ({
    users: [],
    roles: [],
    navigation: [],
    loading: false,
    error: null,
    totalUsers: 0,
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,
    sortColumn: 'username',
    sortDirection: 'asc',
    isUpdating: false,
    delegations: [],

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
            const data = await adminService.getSettings();
            set({ 
                roles: data.roles || [], 
                statuses: data.statuses || [],
                navigation: data.navigation || []
            });
        } catch (error) {
            console.error("Failed to fetch settings", error);
        }
    },

    updateSettings: async (newSettings) => {
        set({ isUpdating: true });
        try {
            await adminService.updateSettings(newSettings);
            set({ 
                roles: newSettings.roles, 
                statuses: newSettings.statuses,
                navigation: newSettings.navigation 
            });
            return true;
        } catch (error) {
            console.error("Failed to update settings", error);
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    addStatus: async (statusName) => {
        const { statuses, roles, navigation } = get();
        if (statuses.includes(statusName)) return false;
        const newSettings = {
            roles,
            statuses: [...statuses, statusName],
            navigation
        };
        return await get().updateSettings(newSettings);
    },

    removeStatus: async (statusName) => {
        const { statuses, roles, navigation } = get();
        const newSettings = {
            roles,
            statuses: statuses.filter(s => s !== statusName),
            navigation
        };
        return await get().updateSettings(newSettings);
    },

    addRole: async (roleName) => {
        const { statuses, roles, navigation } = get();
        const lowerRole = roleName.toLowerCase();
        if (roles.includes(lowerRole)) return false;
        
        const newSettings = {
            roles: [...roles, lowerRole],
            statuses,
            navigation: [...navigation, { label: roleName, path: `/${lowerRole}`, roles: [lowerRole] }]
        };
        return await get().updateSettings(newSettings);
    },

    removeRole: async (roleName) => {
        const { statuses, roles, navigation } = get();
        const lowerRole = roleName.toLowerCase();
        const newSettings = {
            roles: roles.filter(r => r !== lowerRole),
            statuses,
            navigation: navigation.map(nav => ({
                ...nav,
                roles: nav.roles.filter(r => r !== lowerRole)
            })).filter(nav => nav.roles.length > 0 || nav.roles.includes('all'))
        };
        return await get().updateSettings(newSettings);
    },

    updateRoleAccess: async (roleName, accessibleLabels) => {
        const { statuses, roles, navigation } = get();
        const lowerRole = roleName.toLowerCase();
        
        // Navigation in settings is Label -> Roles
        // We need to update navigation to ensure for each label, roleName is in roles if label in accessibleLabels
        const newNavigation = navigation.map(nav => {
            const hasAccess = accessibleLabels.includes(nav.label);
            let updatedRoles = [...nav.roles];
            
            if (hasAccess && !updatedRoles.includes(lowerRole)) {
                updatedRoles.push(lowerRole);
            } else if (!hasAccess && updatedRoles.includes(lowerRole)) {
                updatedRoles = updatedRoles.filter(r => r !== lowerRole);
            }
            
            return { ...nav, roles: updatedRoles };
        });

        const newSettings = {
            roles,
            statuses,
            navigation: newNavigation
        };
        return await get().updateSettings(newSettings);
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
    },

    fetchDelegations: async () => {
        set({ loading: true, error: null });
        try {
            const data = await adminService.getDelegations();
            set({ delegations: data, loading: false });
        } catch (error) {
            set({ error: error.message || 'Failed to fetch delegations', loading: false });
        }
    },

    addDelegation: async (payload) => {
        set({ isUpdating: true });
        try {
            await adminService.createDelegation(payload);
            await get().fetchDelegations();
            return true;
        } catch (error) {
            console.error("Failed to add delegation", error);
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    removeDelegation: async (id) => {
        try {
            await adminService.deleteDelegation(id);
            await get().fetchDelegations();
            return true;
        } catch (error) {
            console.error("Failed to remove delegation", error);
            return false;
        }
    }
}));

export default useAdminStore;
