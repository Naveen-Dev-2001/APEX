import React, { useEffect } from 'react';
import DataTable from '../../components/ui/DataTable';
import useAdminStore from '../../store/useAdminStore';

// Assuming we have these in assets
import editIcon from '../../assets/admin-icons/edit-icon.png';
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
        switch(role?.toLowerCase()) {
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
            render: (status, row) => {
                const isActive = status === 'active';
                return (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => updateUserStatus(row.id, isActive ? 'inactive' : 'active')}
                            className={`w-9 h-[20px] rounded-full relative transition-colors duration-200 ${isActive ? 'bg-[#3b82f6]' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-[2px] left-[2px] w-4 h-4 bg-white rounded-full transition-transform duration-200 ${isActive ? 'translate-x-[16px]' : ''}`} />
                        </button>
                        <span className="text-[13px] text-gray-500 capitalize">{status || 'inactive'}</span>
                    </div>
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
                        className="hover:opacity-70 transition-opacity"
                    >
                        <img src={editIcon} alt="Edit" className="w-[14px]" />
                    </button>
                    <button 
                        onClick={() => {
                            if(window.confirm(`Are you sure you want to delete ${row.username}?`)) {
                                deleteUser(row.id);
                            }
                        }}
                        className="hover:opacity-70 transition-opacity"
                    >
                        <img src={deleteIcon} alt="Delete" className="w-[14px]" />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="w-full mt-2 animate-fadeIn">
            <DataTable 
                columns={columns} 
                data={paginatedUsers} 
                totalItems={displayUsers.length}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
            />
        </div>
    );
};

export default UserManagementTab;
