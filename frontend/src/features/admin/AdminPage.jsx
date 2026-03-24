import React, { useState } from 'react';
import UserManagementTab from './UserManagementTab';
import useAdminStore from '../../store/useAdminStore';

const AdminPage = () => {
    const [activeTab, setActiveTab] = useState('User Management');
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ role: '', status: '' });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ username: '', email: '', password: '', role: 'approver' });
    
    const { 
        searchQuery, setSearchQuery, setCurrentPage,
        roles, statuses, updateUserRole, addUser
    } = useAdminStore();

    const tabs = ['User Management', 'Global Config', 'Delegations'];

    const handleEditClick = (user) => {
        setEditingUser(user);
        setEditForm({ role: user.role, status: user.status });
    };

    const handleSaveEdit = async () => {
        if (!editingUser) return;
        const success = await updateUserRole(editingUser.id, editForm.role, editForm.status);
        if (success) {
            setEditingUser(null);
        }
    };

    const handleAddUser = async () => {
        const success = await addUser(addForm);
        if (success) {
            setIsAddModalOpen(false);
            setAddForm({ username: '', email: '', password: '', role: 'approver' });
        }
    };

    return (
        <div className="pt-[100px] px-[30px] w-full h-full flex flex-col bg-[#f8f9fa] min-h-screen">
            <h1 className="text-3xl font-light mb-5 text-[#333333] tracking-wide text-left">
                Admin Dashboard
            </h1>
            
            <div className="bg-white rounded-[4px] shadow-sm w-full p-5 border border-gray-200 min-h-[600px] flex flex-col relative">
                
                {/* Edit Modal */}
                {editingUser && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[3000] p-4">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-800">Edit User</h3>
                                <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                            </div>
                            <div className="p-6 space-y-4 text-left">
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Role</label>
                                    <select 
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={editForm.role}
                                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                    >
                                        {roles.map(r => (
                                            <option key={r} value={r}>{r.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Status</label>
                                    <select 
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                    >
                                        {statuses.map(s => (
                                            <option key={s} value={s}>{s.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
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
                                    className="px-5 py-2 text-sm font-medium bg-[#3b82f6] text-white hover:bg-blue-600 rounded shadow-sm transition-colors"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[3000] p-4">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-800">Add New User</h3>
                                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                            </div>
                            <div className="p-6 space-y-4 text-left">
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Username</label>
                                    <input 
                                        type="text"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={addForm.username}
                                        onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                                        placeholder="Enter username"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Email Address</label>
                                    <input 
                                        type="email"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={addForm.email}
                                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                                        placeholder="user@example.com"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Password</label>
                                    <input 
                                        type="password"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={addForm.password}
                                        onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[13px] font-medium text-gray-700">Initial Role</label>
                                    <select 
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                                        value={addForm.role}
                                        onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                                    >
                                        {roles.map(r => (
                                            <option key={r} value={r}>{r.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                                <button 
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAddUser}
                                    className="px-5 py-2 text-sm font-medium bg-[#24a0ed] text-white hover:bg-[#1c8ad1] rounded shadow-sm transition-colors"
                                >
                                    Create User
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs & Top Actions */}
                <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-5 gap-4">
                    
                    {/* Tabs */}
                    <div className="flex border border-gray-200 rounded-md overflow-hidden h-[38px]">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-5 py-0 text-[13px] font-medium transition-colors border-r border-gray-200 last:border-r-0 h-full flex items-center justify-center ${
                                    activeTab === tab 
                                    ? 'bg-[#8dc3e3] text-gray-800' 
                                    : 'bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Right side actions - conditional on activeTab */}
                    {activeTab === 'User Management' && (
                        <div className="flex items-center gap-3">
                            {/* Search Input */}
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </span>
                                <input 
                                    type="text" 
                                    placeholder="Search" 
                                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-[4px] text-[13px] outline-none focus:border-[#3b82f6] w-[260px] h-[34px]"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                            
                            {/* Add Button */}
                            <button 
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-[#24a0ed] hover:bg-[#1c8ad1] text-white px-4 py-0 h-[34px] rounded-[4px] flex items-center gap-1.5 text-[13px] font-medium transition-colors"
                            >
                                <span className="text-base font-light leading-none mb-[2px]">+</span> Add
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 w-full">
                    {activeTab === 'User Management' && <UserManagementTab onEdit={handleEditClick} />}
                    {activeTab === 'Global Config' && <div className="p-4 text-gray-500 text-sm border rounded">Global Config Content</div>}
                    {activeTab === 'Delegations' && <div className="p-4 text-gray-500 text-sm border rounded">Delegations Content</div>}
                </div>

            </div>
        </div>
    );
};

export default AdminPage;
