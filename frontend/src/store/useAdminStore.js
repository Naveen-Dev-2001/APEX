import { create } from 'zustand';
import { adminService } from '../features/admin/adminService';
import toast from '../utils/toast';

const useAdminStore = create((set, get) => ({
    users: [],
    roles: [],
    statuses: [],
    navigation: [],
    reminderDays: 3,
    loading: false,
    error: null,
    totalUsers: 0,
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,
    sortColumn: 'sno',
    sortDirection: 'desc',
    isUpdating: false,
    delegations: [],
    approvers: [],

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
        set({ loading: true });
        try {
            const data = await adminService.getSettings();
            set({ 
                roles: data.roles || [], 
                statuses: data.statuses || [],
                navigation: data.navigation || [],
                reminderDays: data.reminder_days !== undefined ? data.reminder_days : 3,
                loading: false
            });
        } catch (error) {
            console.error("Failed to fetch settings", error);
            set({ loading: false });
        }
    },

    updateSettings: async (newSettings) => {
        set({ isUpdating: true });
        try {
            await adminService.updateSettings(newSettings);
            set({ 
                roles: newSettings.roles, 
                statuses: newSettings.statuses,
                navigation: newSettings.navigation,
                reminderDays: newSettings.reminder_days !== undefined ? newSettings.reminder_days : get().reminderDays
            });
            toast.success('Settings saved successfully');
            return true;
        } catch (error) {
            console.error("Failed to update settings", error);
            toast.error(error.response?.data?.detail || 'Failed to save settings');
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
            navigation
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
            } else if (!hasAccess) {
                if (updatedRoles.includes(lowerRole)) {
                    updatedRoles = updatedRoles.filter(r => r !== lowerRole);
                } else if (updatedRoles.includes('all')) {
                    // Expand 'all' into explicit roles before removing this one
                    updatedRoles = roles.filter(r => r !== lowerRole);
                }
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

    updateReminderDays: async (days) => {
        const { roles, statuses, navigation } = get();
        const newSettings = {
            roles,
            statuses,
            navigation,
            reminder_days: days
        };
        return await get().updateSettings(newSettings);
    },

    fetchUsers: async () => {
        set({ loading: true, error: null });
        try {
            const { currentPage, itemsPerPage, searchQuery, sortColumn, sortDirection } = get();
            const response = await adminService.getAllUsers({
                skip: (currentPage - 1) * itemsPerPage,
                limit: itemsPerPage,
                search: searchQuery,
                sort_by: sortColumn === 'sno' ? 'id' : sortColumn,
                sort_dir: sortDirection
            });
            // response is { data, total, ... }
            set({ 
                users: response.data || [], 
                totalUsers: response.total || 0, 
                loading: false 
            });
        } catch (error) {
            const msg = error.message || 'Failed to fetch users';
            set({ error: msg, loading: false });
            toast.error(msg);
        }
    },

    addUser: async (userData) => {
        set({ isUpdating: true });
        try {
            await adminService.addUser(userData);
            // Reset to default sort, page 1 and clear search to show new user at top
            set({ 
                sortColumn: 'sno', 
                sortDirection: 'desc', 
                currentPage: 1,
                searchQuery: '' 
            });
            await get().fetchUsers();
            toast.success('User created successfully');
            return true;
        } catch (error) {
            console.error("Failed to add user", error);
            const errMsg = error.response?.data?.detail || 'Failed to create user';
            toast.error(errMsg);
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    deleteUser: async (userId) => {
        try {
            await adminService.deleteUser(userId);
            get().fetchUsers();
            return true;
        } catch (error) {
            console.error("Failed to delete user", error);
            return false;
        }
    },

    updateUserRole: async (userId, role, status, department) => {
        set({ isUpdating: true });
        try {
            await adminService.updateUserRole(userId, role, status, department);
            await get().fetchUsers();
            toast.success('User updated successfully');
            return true;
        } catch (error) {
            console.error("Failed to update user", error);
            toast.error(error.response?.data?.detail || 'Failed to update user');
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
                await adminService.updateUserRole(userId, user.role, newStatus, user.department);
                toast.success('User status updated');
            }
        } catch (error) {
            console.error("Failed to update status", error);
            toast.error('Failed to update user status');
            get().fetchUsers();
        }
    },

    fetchDelegations: async () => {
        set({ loading: true, error: null });
        try {
            const { currentPage, itemsPerPage, searchQuery, sortColumn, sortDirection } = get();
            const response = await adminService.getDelegations({
                skip: (currentPage - 1) * itemsPerPage,
                limit: itemsPerPage,
                search: searchQuery,
                sort_by: sortColumn,
                sort_dir: sortDirection
            });
            set({ 
                delegations: response.data || [], 
                totalDelegations: response.total || 0,
                loading: false 
            });
        } catch (error) {
            const msg = error.message || 'Failed to fetch delegations';
            set({ error: msg, loading: false });
            toast.error(msg);
        }
    },

    addDelegation: async (payload) => {
        set({ isUpdating: true });
        try {
            await adminService.createDelegation(payload);
            await get().fetchDelegations();
            toast.success('Delegation added successfully');
            return true;
        } catch (error) {
            console.error("Failed to add delegation", error);
            toast.error(error.response?.data?.detail || 'Failed to add delegation');
            return false;
        } finally {
            set({ isUpdating: false });
        }
    },

    removeDelegation: async (id) => {
        try {
            await adminService.deleteDelegation(id);
            await get().fetchDelegations();
            toast.success('Delegation removed');
            return true;
        } catch (error) {
            console.error("Failed to remove delegation", error);
            toast.error(error.response?.data?.detail || 'Failed to remove delegation');
            return false;
        }
    },

    fetchApprovers: async () => {
        try {
            const data = await adminService.getApprovers();
            set({ approvers: data || [] });
        } catch (error) {
            console.error("Failed to fetch approvers", error);
        }
    }
}));

export default useAdminStore;
