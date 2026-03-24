import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import useAdminStore from '../../store/useAdminStore';
import useToastStore from '../../store/useToastStore';
import toast from '../../utils/toast';
import Dropdown from '../../components/ui/Dropdown';
import DataTable from '../../components/ui/DataTable';
import CustomDatePicker from '../../components/ui/CustomDatePicker';

const DelegationsTab = () => {
    const {
        users, delegations, loading, isUpdating,
        fetchUsers, fetchDelegations, addDelegation, removeDelegation
    } = useAdminStore();
    const { showConfirm } = useToastStore();

    const [form, setForm] = useState({
        original_approver: '',
        substitute_approver: '',
        start_date: '',
        end_date: ''
    });

    // Pagination state (local for this tab)
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    useEffect(() => {
        fetchUsers();
        fetchDelegations();
    }, [fetchUsers, fetchDelegations]);

    const approvers = (users || []).filter(u => u.role?.toLowerCase() === 'approver');
    
    const approverOptions = [
        { label: 'Select Approver', value: '' },
        ...approvers.map(u => ({
            label: `${u.username} (${u.email})`,
            value: u.email
        }))
    ];

    const handleAdd = async () => {
        if (!form.original_approver || !form.substitute_approver || !form.start_date || !form.end_date) {
            toast.warning('Please fill all required fields');
            return;
        }
        if (form.original_approver === form.substitute_approver) {
            toast.warning('Original approver and substitute cannot be the same');
            return;
        }
        const success = await addDelegation(form);
        if (success) {
            setForm({
                original_approver: '',
                substitute_approver: '',
                start_date: '',
                end_date: ''
            });
        }
    };

    const getUsernameByEmail = (email) => {
        const user = (users || []).find(u => u.email?.toLowerCase() === email?.toLowerCase());
        return user ? user.username : email;
    };

    const columns = [
        {
            header: 'Original Approver',
            accessor: 'original_approver',
            render: (email) => (
                <span className="text-gray-700 font-medium whitespace-nowrap">
                    {getUsernameByEmail(email)}
                </span>
            )
        },
        {
            header: 'Substitute',
            accessor: 'substitute_approver',
            render: (email) => (
                <span className="text-gray-700 font-medium whitespace-nowrap">
                    {getUsernameByEmail(email)}
                </span>
            )
        },
        {
            header: 'Start Date',
            accessor: 'start_date',
            render: (date) => (
                <span className="text-gray-500 whitespace-nowrap">
                    {date ? new Date(date).toISOString().split('T')[0] : '-'}
                </span>
            )
        },
        {
            header: 'End Date',
            accessor: 'end_date',
            render: (date) => (
                <span className="text-gray-500 whitespace-nowrap">
                    {date ? new Date(date).toISOString().split('T')[0] : '-'}
                </span>
            )
        },
        {
            header: 'Status',
            accessor: 'id',
            render: (_, row) => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const start = new Date(row.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(row.end_date);
                end.setHours(23, 59, 59, 999);
                
                if (now >= start && now <= end) {
                    return (
                        <span className="px-2.5 py-0.5 rounded-[4px] bg-[#f0fdf4] text-[#22c55e] text-[12px] font-medium border border-[#dcfce7]">
                            Active
                        </span>
                    );
                }
                if (now < start) {
                    return (
                        <span className="px-2.5 py-0.5 rounded-[4px] bg-[#eff6ff] text-[#3b82f6] text-[12px] font-medium border border-[#dbeafe]">
                            Scheduled
                        </span>
                    );
                }
                return (
                    <span className="px-2.5 py-0.5 rounded-[4px] bg-gray-50 text-gray-400 text-[12px] font-medium border border-gray-100">
                        Expired
                    </span>
                );
            }
        },
        {
            header: 'Action',
            accessor: 'id',
            render: (id, row) => (
                <button 
                    onClick={() => showConfirm({
                        message: 'Revert Delegation?',
                        subMessage: `This will remove the delegation from ${getUsernameByEmail(row.original_approver)} to ${getUsernameByEmail(row.substitute_approver)}.`,
                        confirmLabel: 'Revert',
                        cancelLabel: 'Keep',
                        variant: 'danger',
                        onConfirm: () => removeDelegation(id),
                    })}
                    className="text-[#ef4444] hover:text-[#dc2626] text-[13px] font-medium transition-colors"
                >
                    Revert
                </button>
            )
        }
    ];

    const displayDelegations = delegations || [];
    const paginatedDelegations = displayDelegations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col gap-6 animate-fadeIn p-1">
            {/* Form Section */}
            <div className="flex flex-wrap items-end gap-5 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div className="w-[260px]">
                    <Dropdown
                        label="* From Approver"
                        value={form.original_approver}
                        options={approverOptions}
                        onChange={(val) => setForm({ ...form, original_approver: val })}
                    />
                </div>
                <div className="w-[260px]">
                    <Dropdown
                        label="* To Substitute"
                        value={form.substitute_approver}
                        options={approverOptions}
                        onChange={(val) => setForm({ ...form, substitute_approver: val })}
                    />
                </div>
                <div className="flex flex-col gap-1.5 min-w-[160px]">
                    <label className="text-[13px] font-medium text-gray-700">* Start Date</label>
                    <CustomDatePicker
                        value={form.start_date ? dayjs(form.start_date) : null}
                        onChange={(_, dateString) => setForm({ ...form, start_date: dateString })}
                        format="YYYY-MM-DD"
                        placeholder="Start Date"
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                    />
                </div>
                <div className="flex flex-col gap-1.5 min-w-[160px]">
                    <label className="text-[13px] font-medium text-gray-700">* End Date</label>
                    <CustomDatePicker
                        value={form.end_date ? dayjs(form.end_date) : null}
                        onChange={(_, dateString) => setForm({ ...form, end_date: dateString })}
                        format="YYYY-MM-DD"
                        placeholder="End Date"
                        disabledDate={(current) => current && form.start_date ? current < dayjs(form.start_date).startOf('day') : current < dayjs().startOf('day')}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    disabled={isUpdating}
                    className="h-[38px] px-6 bg-[#24a0ed] hover:bg-[#1c8ad1] text-white rounded-[4px] text-[13px] font-semibold transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 mb-[1px]"
                >
                    {isUpdating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {isUpdating ? 'Adding...' : 'Add Delegation'}
                </button>
            </div>

            {/* Table Section */}
            <div className="w-full">
                <DataTable
                    columns={columns}
                    data={paginatedDelegations}
                    totalItems={displayDelegations.length}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                />
            </div>
        </div>
    );
};

export default DelegationsTab;
