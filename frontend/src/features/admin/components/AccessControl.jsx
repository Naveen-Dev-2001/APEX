import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import addIcon from '../../../assets/admin-icons/add-icon.png';
import useAdminStore from '../../../store/useAdminStore';
import useToastStore from '../../../store/useToastStore';
import TableSkeleton from '../../../components/ui/TableSkeleton';

const AccessControl = ({ roles, navigation, onAdd, onEdit, loading = false }) => {
    const { removeRole, isUpdating } = useAdminStore();
    const { showConfirm } = useToastStore();

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-left">
                <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
                    <div className="h-5 w-48 bg-gray-100 animate-pulse rounded"></div>
                </div>
                <TableSkeleton rowCount={3} columnCount={3} />
            </div>
        );
    }

    const handleRemove = async (role) => {
        if (role === 'admin') {
            showConfirm({
                message: 'Action Not Allowed',
                subMessage: 'Admin role cannot be removed.',
                confirmLabel: 'OK',
                showCancel: false,
                variant: 'warning'
            });
            return;
        }
        
        showConfirm({
            message: 'Remove Role?',
            subMessage: `Are you sure you want to remove the role "${role}"?`,
            confirmLabel: 'Remove',
            variant: 'danger',
            onConfirm: () => removeRole(role)
        });
    };

    const getRoleAccess = (roleName) => {
        const lowerRole = roleName.toLowerCase();
        return navigation
            .filter(nav => nav.roles.includes('all') || nav.roles.includes(lowerRole))
            .map(nav => nav.label);
    };

    const getRoleStyles = (role) => {
        switch (role?.toLowerCase()) {
            case 'admin': return 'border-[#4ade80] text-[#4ade80] bg-[#4ade80]/5';
            case 'coder': return 'border-[#2dd4bf] text-[#2dd4bf] bg-[#2dd4bf]/5';
            case 'approver': return 'border-[#c084fc] text-[#c084fc] bg-[#c084fc]/5';
            default: return 'border-gray-300 text-gray-500 bg-gray-50';
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-left">
            <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
                <h3 className="text-[15px] font-medium text-[#444444]">Navigation & Access Control</h3>
                <button 
                    onClick={onAdd}
                    className="bg-[#24a0ed] hover:bg-[#1c8ad1] text-white px-4 py-1.5 rounded-[4px] flex items-center gap-1.5 text-xs font-semibold transition-colors"
                >
                    <img src={addIcon} alt="Add" className="w-[14px]" /> Add
                </button>
            </div>
            
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left">
                    <thead className="bg-[#106fa4] text-white text-[13px] font-medium">
                        <tr>
                            <th className="px-6 py-2.5 w-[20%] border-r border-white/20">Role</th>
                            <th className="px-6 py-2.5 w-[65%] border-r border-white/20">Accessible Labels</th>
                            <th className="px-6 py-2.5 w-[15%] text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {roles.map((role) => (
                            <tr key={role} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 align-top">
                                    <span className={`px-3 py-1 rounded-full border text-[11px] font-medium capitalize ${getRoleStyles(role)}`}>
                                        {role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="flex flex-wrap gap-2">
                                        {getRoleAccess(role).map(label => (
                                            <span key={label} className="px-3 py-0.5 rounded-full border border-[#8dc3e3] bg-[#f0f9ff] text-[#0070ad] text-[11px] font-medium">
                                                {label}
                                            </span>
                                        ))}
                                        {getRoleAccess(role).length === 0 && (
                                            <span className="text-gray-400 italic text-[11px]">No access configured</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="flex items-center justify-center gap-4">
                                        <button 
                                            onClick={() => onEdit(role)}
                                            className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                                            title="Edit access"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleRemove(role)}
                                            disabled={isUpdating || role === 'admin'}
                                            className={`transition-colors p-1 ${role === 'admin' ? 'text-gray-300 cursor-not-allowed' : 'text-[#ff4d4f] hover:text-[#d32f2f]'}`}
                                            title="Delete role"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AccessControl;
