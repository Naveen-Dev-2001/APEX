import React, { useState } from 'react';
import UserManagementTab from './UserManagementTab';
import useAdminStore from '../../store/useAdminStore';
import { useAuthStore } from '../../store/authStore';
import Dropdown from '../../components/ui/Dropdown';
import AddUserModal from './modals/AddUserModal';
import RefreshButton from '../../shared/components/RefreshButton';
import SearchInput from '../../shared/components/SearchInput';
import toast from '../../utils/toast';

const SuperAdminPage = () => {
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ role: [], status: '', department: '' });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const {
        searchQuery, setSearchQuery, setCurrentPage,
        updateUserRole, addUser, isUpdating,
        loading, fetchUsers, fetchSettings, roles, statuses
    } = useAdminStore();

    // Use dynamic options from store
    const roleOptions = roles?.map(r => ({ label: r.charAt(0).toUpperCase() + r.slice(1), value: r }));
    const statusOptions = statuses?.map(s => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: s }));

    const handleRoleLogic = (newSelectedRoles, previousRoles) => {
        const multiRoles = ['admin', 'approver'];
        if (newSelectedRoles.length < previousRoles.length) return newSelectedRoles;
        const addedRole = newSelectedRoles.find(r => !previousRoles.includes(r));
        if (!addedRole) return newSelectedRoles;
        if (multiRoles.includes(addedRole)) {
            return newSelectedRoles.filter(r => multiRoles.includes(r));
        } else {
            return [addedRole];
        }
    };

    const handleEditClick = (user) => {
        if (user.email?.toLowerCase() === 'admin@example.com') return;
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
            <div className="w-full px-2 py-4 flex flex-col relative text-left">
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

                <AddUserModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={handleAddUser}
                    roles={roles}
                    isUpdating={isUpdating}
                />

                <div className="flex flex-col sm:flex-row justify-between items-center mb-5 gap-3">
                    <div className="flex border border-gray-200 rounded-md overflow-x-auto h-[36px] w-full sm:w-auto no-scrollbar">
                        <button
                            className="px-5 py-0 text-[13px] font-bold transition-colors border-r border-gray-200 last:border-r-0 h-full flex items-center justify-center whitespace-nowrap bg-[#BAE7FF] text-black"
                        >
                            User Management
                        </button>
                    </div>

                    <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
                        <SearchInput
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            onClear={() => {
                                setSearchQuery('');
                                setCurrentPage(1);
                            }}
                            width="260px"
                        />

                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-[#24A1DD] hover:bg-[#1D71AB] text-white px-4 h-[40px] min-w-[110px] rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors whitespace-nowrap"
                        >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <span>Add User</span>
                        </button>

                        <RefreshButton
                            onClick={() => {
                                fetchUsers();
                                fetchSettings();
                            }}
                            loading={loading}
                            height="h-[36px]"
                            className="!w-auto !min-w-[110px] !text-[13px] !font-medium"
                        />
                    </div>
                </div>

                <div className="w-full">
                    <UserManagementTab onEdit={handleEditClick} />
                </div>
            </div>
        </div>
    );
};

export default SuperAdminPage;
