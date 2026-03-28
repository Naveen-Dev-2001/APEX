import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import useAdminStore from '../../../store/useAdminStore';
import useToastStore from '../../../store/useToastStore';
import { useAuthStore } from '../../../store/authStore';
import toast from '../../../utils/toast';
import Dropdown from '../../../components/ui/Dropdown';
import DataTable from '../../../components/ui/DataTable';
import CustomDatePicker from '../../../components/ui/CustomDatePicker';
import Skeleton from '../../../components/ui/Skeleton';
import { ReloadOutlined } from '@ant-design/icons';

const DelegationManager = ({ isAdmin = false, onUpdate, loading: pageLoading = false, approvers: approversProp = [] }) => {
    const {
        users, delegations, loading: storeLoading, isUpdating,
        fetchUsers, fetchDelegations, addDelegation, removeDelegation,
        sortColumn, sortDirection, setSort
    } = useAdminStore();
    const { showConfirm } = useToastStore();
    const user = useAuthStore((state) => state.user);

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
        if (isAdmin) {
            fetchUsers();
        }
        fetchDelegations();
    }, [isAdmin, fetchUsers, fetchDelegations]);

    // Handle pre-filling for non-admins
    useEffect(() => {
        if (!isAdmin && user?.email) {
            setForm(prev => ({ ...prev, original_approver: user.email.toLowerCase() }));
        }
    }, [isAdmin, user?.email]);

    const approverOptions = isAdmin 
        ? [
            { label: 'Select Approver', value: '' },
            ...((users || []).filter(u => u.role?.toLowerCase() === 'approver')).map(u => ({
                label: `${u.username} (${u.email})`,
                value: u.email.toLowerCase()
            }))
        ]
        : [
            { label: 'Select Approver', value: '' },
            ...(approversProp || [])
        ];

    const handleAdd = async () => {
        if (!form.original_approver || !form.substitute_approver || !form.start_date || !form.end_date) {
            toast.warning('Please fill all required fields');
            return;
        }
        if (form.original_approver.toLowerCase() === form.substitute_approver.toLowerCase()) {
            toast.warning('Original approver and substitute cannot be the same');
            return;
        }
        const success = await addDelegation(form);
        if (success) {
            setForm({
                original_approver: isAdmin ? '' : (user?.email?.toLowerCase() || ''),
                substitute_approver: '',
                start_date: '',
                end_date: ''
            });
            if (onUpdate) onUpdate();
        }
    };

    const getUsernameByEmail = (email) => {
        if (isAdmin) {
            const found = (users || []).find(u => u.email?.toLowerCase() === email?.toLowerCase());
            return found ? found.username : email;
        } else {
            const found = (approversProp || []).find(a => a.value?.toLowerCase() === email?.toLowerCase());
            if (found) {
                // Label format is "Username (email)", extract Username
                return found.label.split(' (')[0];
            }
            return email;
        }
    };

    const columns = [
        {
            header: 'Original Approver',
            accessor: 'original_approver',
            sortable: true,
            onClick: () => setSort('original_approver'),
            render: (email) => (
                <span className="text-gray-700 font-medium whitespace-nowrap">
                    {getUsernameByEmail(email)}
                </span>
            )
        },
        {
            header: 'Substitute',
            accessor: 'substitute_approver',
            sortable: true,
            onClick: () => setSort('substitute_approver'),
            render: (email) => (
                <span className="text-gray-700 font-medium whitespace-nowrap">
                    {getUsernameByEmail(email)}
                </span>
            )
        },
        {
            header: 'Start Date',
            accessor: 'start_date',
            sortable: true,
            onClick: () => setSort('start_date'),
            render: (date) => (
                <span className="text-gray-500 whitespace-nowrap">
                    {date ? new Date(date).toISOString().split('T')[0] : '-'}
                </span>
            )
        },
        {
            header: 'End Date',
            accessor: 'end_date',
            sortable: true,
            onClick: () => setSort('end_date'),
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
                        onConfirm: async () => {
                            const success = await removeDelegation(id);
                            if (success && onUpdate) onUpdate();
                        },
                    })}
                    className="text-[#ef4444] hover:text-[#dc2626] text-[13px] font-medium transition-colors cursor-pointer"
                >
                    Revert
                </button>
            )
        }
    ];

    const displayDelegations = [...(delegations || [])].sort((a, b) => {
        if (!sortColumn) return 0;
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    const paginatedDelegations = displayDelegations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    
    const isLoading = storeLoading || pageLoading;
    // Form fields should only show skeletons on absolute initial load (when data is missing)
    const isInitialLoading = isLoading && (
        (isAdmin && (!users || users.length === 0)) || 
        (!isAdmin && (!user))
    );

    return (
        <div className="flex flex-col gap-6 animate-fadeIn p-1">
            {/* Form Section */}
            <div className="flex flex-wrap items-end gap-4 p-4 sm:p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div className="flex-1 min-w-[240px]">
                    {isInitialLoading ? (
                        <div className="flex flex-col gap-1.5">
                            <Skeleton variant="text" width="100px" className="mb-1" />
                            <Skeleton variant="rect" height="38px" className="w-full rounded-[4px]" />
                        </div>
                    ) : (
                        <Dropdown
                            label="* From Approver"
                            value={form.original_approver}
                            options={approverOptions}
                            onChange={(val) => setForm({ ...form, original_approver: val })}
                            disabled={!isAdmin}
                        />
                    )}
                </div>
                <div className="flex-1 min-w-[240px]">
                    {isInitialLoading ? (
                        <div className="flex flex-col gap-1.5">
                            <Skeleton variant="text" width="100px" className="mb-1" />
                            <Skeleton variant="rect" height="38px" className="w-full rounded-[4px]" />
                        </div>
                    ) : (
                        <Dropdown
                            label="* To Substitute"
                            value={form.substitute_approver}
                            options={approverOptions}
                            onChange={(val) => setForm({ ...form, substitute_approver: val })}
                        />
                    )}
                </div>
                <div className="flex flex-col gap-1.5 w-full sm:w-[180px]">
                    <label className="text-[13px] font-medium text-gray-700">* Start Date</label>
                    {isInitialLoading ? (
                        <Skeleton variant="rect" height="38px" className="w-full rounded-[4px]" />
                    ) : (
                        <CustomDatePicker
                            value={form.start_date ? dayjs(form.start_date) : null}
                            onChange={(_, dateString) => setForm({ ...form, start_date: dateString })}
                            format="YYYY-MM-DD"
                            placeholder="Start Date"
                            disabledDate={(current) => current && current < dayjs().startOf('day')}
                        />
                    )}
                </div>
                <div className="flex flex-col gap-1.5 w-full sm:w-[180px]">
                    <label className="text-[13px] font-medium text-gray-700">* End Date</label>
                    {isInitialLoading ? (
                        <Skeleton variant="rect" height="38px" className="w-full rounded-[4px]" />
                    ) : (
                        <CustomDatePicker
                            value={form.end_date ? dayjs(form.end_date) : null}
                            onChange={(_, dateString) => setForm({ ...form, end_date: dateString })}
                            format="YYYY-MM-DD"
                            placeholder="End Date"
                            disabledDate={(current) => current && form.start_date ? current < dayjs(form.start_date).startOf('day') : current < dayjs().startOf('day')}
                        />
                    )}
                </div>
                <div className="w-full sm:w-auto">
                    {isInitialLoading ? (
                        <Skeleton variant="rect" height="40px" width="140px" className="rounded-[4px]" />
                    ) : (
                        <button
                            onClick={handleAdd}
                            disabled={isUpdating}
                            className="h-[40px] px-6 bg-[#24a0ed] hover:bg-[#1c8ad1] text-white rounded-[4px] text-[13px] font-semibold transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer"
                        >
                            {isUpdating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                            {isUpdating ? 'Adding...' : 'Add Delegation'}
                        </button>
                    )}
                </div>
            </div>

            {/* Table Section */}
            <div className="w-full flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">Delegations</h3>
                    <button 
                        onClick={() => {
                            fetchDelegations();
                            // Removed global onUpdate() to prevent full page re-render and flickering
                        }}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors text-sm text-gray-600 disabled:opacity-50 cursor-pointer"
                    >
                        <ReloadOutlined spin={isLoading && storeLoading} />
                        <span>Refresh</span>
                    </button>
                </div>
                <DataTable
                    columns={columns}
                    data={paginatedDelegations}
                    loading={isLoading}
                    totalItems={displayDelegations.length}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    maxHeight="calc(100vh - 420px)"
                    stickyHeader={true}
                />
            </div>
        </div>
    );
};

export default DelegationManager;
