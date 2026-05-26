import React, { useEffect, useState } from 'react';
import useAdminStore from '../../store/useAdminStore';
import AccessControl from './components/AccessControl';
import CronjobConfig from './components/CronjobConfig';
import AddRoleModal from './modals/AddRoleModal';
import EditAccessModal from './modals/EditAccessModal';

const GlobalConfigTab = () => {
    const { fetchSettings, roles, navigation, loading } = useAdminStore();
    const [modals, setModals] = useState({
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
            {/* Navigation & Access Control Section */}
            <AccessControl 
                roles={roles} 
                navigation={navigation} 
                loading={loading}
                onAdd={() => toggleModal('addRole')}
                onEdit={(role) => toggleModal('editAccess', role)}
            />

            {/* Cronjob Config Section */}
            {!loading && <CronjobConfig />}

            {/* Modals */}
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
