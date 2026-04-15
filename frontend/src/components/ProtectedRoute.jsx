import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import useAdminStore from '../store/useAdminStore';

const ProtectedRoute = () => {
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const activeRole = useAuthStore((state) => state.activeRole);
    const { navigation, fetchSettings } = useAdminStore();
    const location = useLocation();

    useEffect(() => {
        if (token && navigation.length === 0) {
            fetchSettings();
        }
    }, [token, navigation.length, fetchSettings]);

    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Role-based route protection
    // If navigation is loaded, check if current path is allowed for user role
    const currentPath = location.pathname;
    
    // Skip protection for main entry points or if navigation hasn't loaded yet
    if (navigation.length > 0 && currentPath !== '/select-entity') {
        // Use activeRole if available, otherwise fallback to first role from user.role string
        const userActiveRole = activeRole ? activeRole.toLowerCase() : (user?.role?.split(',')[0]?.trim()?.toLowerCase() || '');
        const userDept = user?.department?.toLowerCase() || '';

        // Specific block: non-finance approvers cannot see dashboard
        if (currentPath === '/dashboard' && userActiveRole === 'approver' && userDept === 'non-finance') {
            return <Navigate to="/invoices" replace />;
        }
        
        // Find if this path requires specific roles
        const navItem = navigation.find(nav => 
            currentPath === nav.path || (nav.path !== '/' && currentPath.startsWith(nav.path))
        );
        
        if (navItem) {
            const allowedRoles = navItem.roles || [];
            const hasAccess = allowedRoles.some(r => 
                r.toLowerCase() === 'all' || r.toLowerCase() === userActiveRole
            );
            
            if (!hasAccess) {
                // If user doesn't have access, redirect to appropriate default route
                if (currentPath !== '/dashboard') {
                    if (userActiveRole === 'approver' && userDept === 'non-finance') {
                        return <Navigate to="/invoices" replace />;
                    }
                    return <Navigate to="/dashboard" replace />;
                }
            }
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
