import React from 'react';
import addIcon from '../../../assets/admin-icons/add-icon.png';
import useAdminStore from '../../../store/useAdminStore';
import useToastStore from '../../../store/useToastStore';
import Skeleton from '../../../components/ui/Skeleton';

const StatusManagement = ({ statuses, onAdd, loading = false }) => {
    const { removeStatus, isUpdating } = useAdminStore();
    const { showConfirm } = useToastStore();

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-left">
                <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
                    <Skeleton variant="text" width="150px" className="h-5" />
                </div>

                <div className="p-6 flex flex-wrap gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} variant="rect" width="80px" height="28px" className="rounded-full" />
                    ))}
                </div>
            </div>
        );
    }

    const handleRemove = async (status) => {
        showConfirm({
            message: 'Remove Status?',
            subMessage: `Are you sure you want to remove the status "${status}"?`,
            confirmLabel: 'Remove',
            variant: 'danger',
            onConfirm: () => removeStatus(status)
        });
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-left">
            <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
                <h3 className="text-[15px] font-medium text-[#444444]">Status Management</h3>
                <button
                    onClick={onAdd}
                    className="bg-[#24a0ed] hover:bg-[#1c8ad1] text-white px-4 py-1.5 rounded-[4px] flex items-center gap-1.5 text-xs font-semibold transition-colors"
                >
                    <img src={addIcon} alt="Add" className="w-[14px]" /> Add
                </button>
            </div>

            <div className="p-0">

                <div className="p-6 flex flex-wrap gap-3">
                    {statuses?.map((status) => (
                        <div
                            key={status}
                            className="flex items-center gap-2 px-3 py-1 rounded-full border border-[#e8c05d] bg-[#fdfaf1] text-[#7a6a3b] text-xs font-medium group transition-all"
                        >
                            <span>{status}</span>
                            <button
                                onClick={() => handleRemove(status)}
                                disabled={isUpdating}
                                className="text-[#a1a1a1] hover:text-[#ef4444] transition-colors leading-none text-base"
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                    {statuses.length === 0 && (
                        <div className="text-gray-400 italic text-sm py-2">No statuses configured.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StatusManagement;
