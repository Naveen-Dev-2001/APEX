import React, { useEffect, useState } from 'react';
import useAdminStore from '../../store/useAdminStore';
import StatusManagement from './components/StatusManagement';
import AccessControl from './components/AccessControl';
import AddStatusModal from './modals/AddStatusModal';
import AddRoleModal from './modals/AddRoleModal';
import EditAccessModal from './modals/EditAccessModal';

const GlobalConfigTab = () => {
    const { fetchSettings, statuses, roles, navigation, isUpdating, loading } = useAdminStore();
    const [modals, setModals] = useState({
        addStatus: false,
        addRole: false,
        editAccess: null // role name
    });

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const toggleModal = (type, value = true) => {
        setModals(prev => ({ ...prev, [type]: value }));
    };

    return (
        <div className="space-y-8 p-1 animate-fadeIn">
            {/* Status Management Section */}
            <StatusManagement 
                statuses={statuses} 
                loading={loading}
                onAdd={() => toggleModal('addStatus')} 
            />

            {/* Navigation & Access Control Section */}
            <AccessControl 
                roles={roles} 
                navigation={navigation} 
                loading={loading}
                onAdd={() => toggleModal('addRole')}
                onEdit={(role) => toggleModal('editAccess', role)}
            />

            {/* Modals */}
            {modals.addStatus && (
                <AddStatusModal onClose={() => toggleModal('addStatus', false)} />
            )}
            
            {modals.addRole && (
                <AddRoleModal onClose={() => toggleModal('addRole', false)} />
            )}

            {modals.editAccess && (
                <EditAccessModal 
                    roleName={modals.editAccess} 
                    onClose={() => toggleModal('editAccess', null)} 
                />
            )}
        </div>
    );
};

export default GlobalConfigTab;
