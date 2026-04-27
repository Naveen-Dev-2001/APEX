import React, { useState } from 'react';
import UserManagementTab from './UserManagementTab';
import useAdminStore from '../../store/useAdminStore';
import Dropdown from '../../components/ui/Dropdown';
import GlobalConfigTab from './GlobalConfigTab';
import DelegationsTab from './DelegationsTab';
import AddUserModal from './modals/AddUserModal';
import CustomButton from '../../shared/components/CustomButton';
import toast from '../../utils/toast';

const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('User Management');
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ role: [], status: '', department: '' });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ username: '', email: '', password: '', role: ['approver'], department: '' });

    const {
        searchQuery, setSearchQuery, setCurrentPage,
        updateUserRole, addUser, isUpdating,
        loading, fetchUsers, fetchSettings, roles, statuses, fetchDelegations
    } = useAdminStore();

    // Use dynamic options from store
    const roleOptions = roles?.map(r => ({ label: r.charAt(0).toUpperCase() + r.slice(1), value: r }));
    const statusOptions = statuses?.map(s => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: s }));

    const tabs = ['User Management', 'Global Config', 'Delegations'];

    const handleRoleLogic = (newSelectedRoles, previousRoles) => {
        const multiRoles = ['admin', 'approver'];

        // If a role was removed, just return the new list
        if (newSelectedRoles.length < previousRoles.length) {
            return newSelectedRoles;
        }

        // Find the newly added role
        const addedRole = newSelectedRoles.find(r => !previousRoles.includes(r));
        if (!addedRole) return newSelectedRoles;

        // Logic check
        if (multiRoles.includes(addedRole)) {
            // If added role is admin or approver, keep only multiRoles
            return newSelectedRoles.filter(r => multiRoles.includes(r));
        } else {
            // If added role is any other, it becomes single-select
            return [addedRole];
        }
    };

    const handleEditClick = (user) => {
        if (user.email?.toLowerCase() === 'admin@example.com') {
            return;
        }
        setEditingUser(user);
        const userRoles = user.role ? user.role.split(',') : [];
        setEditForm({ role: userRoles, status: user.status, department: user.department || '' });
    };

    const handleSaveEdit = async () => {
        if (!editingUser) return;
        const roleString = Array.isArray(editForm.role) ? editForm.role.join(',') : editForm.role;
        const success = await updateUserRole(editingUser.id, roleString, editForm.status, editForm.department);
        if (success) {
            setEditingUser(null);
        } else {
            toast.error('Failed to update user. Please try again.');
        }
    };

    const handleAddUser = async (userData) => {
        const success = await addUser(userData);
        if (success) {
            setIsAddModalOpen(false);
        } else {
            toast.error('Failed to create user. Please try again.');
        }
    };

    return (
        <div className="p-2 sm:p-4 flex flex-col gap-4 sm:gap-5 w-full bg-gray-50 min-h-0">
            {/* <h1 className="text-2xl font-extrabold mb-2 text-[#333333] text-left">
                Admin Dashboard
            </h1> */}

            <div className="bg-white rounded-[4px] shadow-sm w-full p-5 border border-gray-200 min-h-[200px] flex flex-col relative text-left">

                {/* Edit Modal */}
                {editingUser && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[3000] p-4">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-visible animate-scaleIn">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-800">Edit User</h3>
                                <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                            </div>
                            <div className="p-6 space-y-5">
                                <Dropdown
                                    label="Role"
                                    mode="multiple"
                                    value={editForm.role}
                                    options={roleOptions}
                                    onChange={(val) => setEditForm({ ...editForm, role: handleRoleLogic(val, editForm.role || []) })}
                                />
                                <Dropdown
                                    label="Status"
                                    value={editForm.status}
                                    options={statusOptions}
                                    onChange={(val) => setEditForm({ ...editForm, status: val })}
                                />
                                {editForm.role?.includes('approver') && (
                                    <Dropdown
                                        label="Department"
                                        value={editForm.department || ''}
                                        options={[
                                            { label: 'Finance Team', value: 'finance' },
                                            { label: 'Non-Finance Team', value: 'non-finance' }
                                        ]}
                                        placeholder="Select Department"
                                        onChange={(val) => setEditForm({ ...editForm, department: val })}
                                    />
                                )}
                            </div>
                            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={isUpdating}
                                    className={`px-5 py-2 text-sm font-medium bg-[#3b82f6] text-white hover:bg-blue-600 rounded shadow-sm transition-colors flex items-center gap-2 ${isUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isUpdating && <div className="loading-spinner"></div>}
                                    {isUpdating ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add User Modal Component */}
                <AddUserModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={handleAddUser}
                    roles={roles}
                    isUpdating={isUpdating}
                />

                {/* Tabs & Top Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-5 gap-4">

                    {/* Tabs */}
                    <div className="flex border border-gray-200 rounded-md overflow-x-auto h-[38px] w-full sm:w-auto no-scrollbar">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-5 py-0 text-[14px] ${isActive ? 'font-bold' : 'font-medium'} transition-colors border-r border-gray-200 last:border-r-0 h-full flex items-center justify-center whitespace-nowrap ${isActive
                                        ? 'bg-[#8dc3e3] text-gray-800'
                                        : 'bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {tab}
                                </button>
                            );
                        })}
                    </div>

                    {/* Right side actions - conditional on activeTab */}
                    {(activeTab === 'User Management' || activeTab === 'Delegations') && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                            {/* Search Input */}
                            <div className="relative w-full sm:w-auto">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search"
                                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-[4px] text-[13px] outline-none focus:border-[#3b82f6] w-full sm:w-[260px] h-[34px]"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                {/* Add User Button */}
                                {activeTab === 'User Management' && (
                                    <CustomButton
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="!h-[34px] !w-auto !px-4 !rounded-[4px] !text-[13px] font-medium"
                                    >
                                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                        Add User
                                    </CustomButton>
                                )}

                                {/* Refresh Button */}
                                <button
                                    onClick={() => {
                                        if (activeTab === 'User Management') {
                                            fetchUsers();
                                            fetchSettings();
                                        } else if (activeTab === 'Delegations') {
                                            fetchDelegations();
                                        }
                                    }}
                                    disabled={loading}
                                    title="Refresh data"
                                    className="bg-[#24a0ed] hover:bg-[#1c8ad1] text-white px-4 py-0 h-[34px] rounded-[4px] flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <div className="loading-spinner border-white/30 border-t-white"></div>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    )}
                                    <span>Refresh</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 w-full">
                    {activeTab === 'User Management' && <UserManagementTab onEdit={handleEditClick} />}
                    {activeTab === 'Global Config' && <GlobalConfigTab />}
                    {activeTab === 'Delegations' && <DelegationsTab />}
                </div>

            </div>
        </div>
    );
};

export default AdminPage;
