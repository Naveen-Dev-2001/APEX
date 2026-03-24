import React, { useState } from 'react';
import useAdminStore from '../../../store/useAdminStore';

const AddRoleModal = ({ onClose }) => {
    const [roleName, setRoleName] = useState('');
    const { addRole, isUpdating } = useAdminStore();

    const handleSubmit = async () => {
        if (!roleName.trim()) return;
        const success = await addRole(roleName.trim());
        if (success) onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[3000] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">Add Role</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[13px] font-medium text-gray-700 block">
                            <span className="text-red-500">*</span> Role Name
                        </label>
                        <input
                            type="text"
                            autoFocus
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none"
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            placeholder="Enter role name"
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isUpdating || !roleName.trim()}
                        className={`px-8 py-2 text-sm font-medium bg-[#3b82f6] text-white hover:bg-blue-600 rounded shadow-sm transition-colors flex items-center gap-2 ${isUpdating || !roleName.trim() ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isUpdating ? 'Saving...' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddRoleModal;
