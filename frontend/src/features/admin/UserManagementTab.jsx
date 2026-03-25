import React, { useEffect } from 'react';
import { Pencil } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import useAdminStore from '../../store/useAdminStore';

// Assuming we have these in assets
import deleteIcon from '../../assets/admin-icons/delete-icon.png';

const UserManagementTab = ({ onEdit }) => {
    const {
        users, loading, currentPage, itemsPerPage, roles,
        fetchUsers, fetchSettings, setCurrentPage, setItemsPerPage, updateUserStatus,
        searchQuery, sortColumn, sortDirection, setSort, deleteUser
    } = useAdminStore();

    useEffect(() => {
        fetchUsers();
        fetchSettings();
    }, [fetchUsers, fetchSettings]);

    const safeUsers = users || [];

    // Filter and Sort
    const processedUsers = [...safeUsers]
        .filter(u =>
            u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.role?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            const valA = (a[sortColumn] || '').toString().toLowerCase();
            const valB = (b[sortColumn] || '').toString().toLowerCase();
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    const displayUsers = processedUsers;
    const paginatedUsers = displayUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const getRoleStyles = (role) => {
        switch (role?.toLowerCase()) {
            case 'admin': return 'border-[#4ade80] text-[#4ade80] bg-[#4ade80]/5';
            case 'coder': return 'border-[#2dd4bf] text-[#2dd4bf] bg-[#2dd4bf]/5';
            case 'approver': return 'border-[#c084fc] text-[#c084fc] bg-[#c084fc]/5';
            default: return 'border-gray-300 text-gray-500 bg-gray-50';
        }
    };

    const columns = [
        {
            header: 'User Name',
            accessor: 'username',
            sortable: true,
            onClick: () => setSort('username')
        },
        {
            header: 'Email',
            accessor: 'email',
            sortable: true,
            onClick: () => setSort('email')
        },
        {
            header: 'Role',
            accessor: 'role',
            sortable: true,
            onClick: () => setSort('role'),
            render: (role) => (
                <span className={`px-3 py-0.5 rounded-full border text-[11px] font-medium capitalize ${getRoleStyles(role)}`}>
                    {role}
                </span>
            )
        },
        {
            header: 'Status',
            accessor: 'status',
            sortable: true,
            onClick: () => setSort('status'),
            render: (status) => {
                const s = status?.toLowerCase();
                let colorClass = 'text-gray-500';
                if (s === 'active') colorClass = 'text-[#4ade80]';
                else if (s === 'pending') colorClass = 'text-[#f59e0b]';
                else if (s === 'rejected') colorClass = 'text-[#ef4444]';
                else if (s) colorClass = 'text-[#3b82f6]'; // Default color for new statuses

                return (
                    <span className={`text-[13px] font-semibold capitalize ${colorClass}`}>
                        {status || 'Pending'}
                    </span>
                );
            }
        },
        {
            header: 'Actions',
            accessor: 'actions',
            render: (_, row) => (
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onEdit && onEdit(row)}
                        className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                        title="Edit"
                    >
                        <Pencil size={18} />
                    </button>
                    {/* Delete icon removed as per request */}
                </div>
            )
        }
    ];

    return (
        <div className="w-full mt-2 animate-fadeIn">
            <DataTable
                columns={columns}
                data={paginatedUsers}
                loading={loading}
                totalItems={displayUsers.length}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                maxHeight="calc(100vh - 280px)"
                stickyHeader={true}
            />
        </div>
    );
};

export default UserManagementTab;
