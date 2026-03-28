import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Tag, Space, Button, Modal } from 'antd';
import { EyeOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import DataTable from '../../components/ui/DataTable';
import DelegationManager from './components/DelegationManager';
import { getUnapprovedInvoices, updateApprovalStatus } from '../../api/approvalApi';
import { getDelegations } from '../../api/delegationApi';
import { getApprovers } from '../../api/workflowConfigApi';
import { useAuthStore } from '../../store/authStore';
import toast from '../../utils/toast';

const { confirm } = Modal;

const ApprovalsPage = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeDelegations, setActiveDelegations] = useState([]);
    const [approvers, setApprovers] = useState([]);
    
    // Pagination and Sorting State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch invoices, delegations, and approvers in parallel
            const [invoiceData, delegationData, approverData] = await Promise.all([
                getUnapprovedInvoices(),
                getDelegations(),
                getApprovers()
            ]);

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            // Filter active delegations where the current user is the substitute
            const active = delegationData.filter(d => {
                const start = new Date(d.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(d.end_date);
                end.setHours(0, 0, 0, 0);

                return d.substitute_approver.toLowerCase() === user?.email?.toLowerCase() &&
                    now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
            }).map(d => d.original_approver.toLowerCase());

            setActiveDelegations(active);
            setApprovers(approverData);

            // Transform and filter invoices
            const filtered = invoiceData.filter(inv => {
                const currentLevel = inv.current_approver_level || 1;
                const assignedApprovers = inv.assigned_approvers || [];
                const currentLevelEmail = (assignedApprovers[currentLevel - 1] || '').toLowerCase();
                
                const userEmail = (user?.email || '').toLowerCase();
                const isDesignatedApprover = userEmail === currentLevelEmail;
                const isActiveDelegate = active.includes(currentLevelEmail);

                // User can see the invoice if they are the designated approver or an active delegate
                return isDesignatedApprover || isActiveDelegate;
            }).map(inv => ({
                ...inv,
                vendor_name: inv.vendor_name || inv.extracted_data?.vendor_info?.name?.value || "N/A",
                invoice_number: inv.invoice_number || inv.extracted_data?.invoice_details?.invoice_number?.value || "N/A",
                total_amount: inv.extracted_data?.amounts?.total_invoice_amount?.value || "0.00",
                approver_name: (inv.assigned_approvers?.[inv.current_approver_level - 1] || 'Pending') + 
                               (active.includes((inv.assigned_approvers?.[inv.current_approver_level - 1] || '').toLowerCase()) ? ' (Delegated)' : '')
            }));

            setInvoices(filtered);
        } catch (error) {
            console.error('Error fetching approval data:', error);
            toast.error('Failed to load approvals');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const handleView = (invoice) => {
        // Navigate to review page with readOnly mode (similar to frontend_old)
        navigate('/invoices/review', { state: { invoice, readOnly: true } });
    };

    const handleDelete = (invoice) => {
        confirm({
            title: 'Are you sure you want to delete this invoice?',
            icon: <ExclamationCircleOutlined />,
            content: `Invoice ID: ${invoice.invoice_number}`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    // Logic to delete invoice if needed, or just remove from list if it's only status update
                    // For now, let's assume updateApprovalStatus with 'rejected' or similar if delete is not direct
                    toast.info('Delete functionality to be implemented if required by API');
                } catch (error) {
                    toast.error('Failed to delete invoice');
                }
            },
        });
    };

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const columnDefs = useMemo(() => [
        {
            header: "S.no",
            accessor: "s_no",
            width: "80px",
            render: (val, row, idx) => (currentPage - 1) * itemsPerPage + (row.index + 1)
        },
        {
            header: "Vendor Name",
            accessor: "vendor_name",
            sortable: true,
            onClick: () => handleSort("vendor_name")
        },
        {
            header: "Invoice ID",
            accessor: "invoice_number",
            sortable: true,
            onClick: () => handleSort("invoice_number")
        },
        {
            header: "Total Amount ($)",
            accessor: "total_amount",
            sortable: true,
            onClick: () => handleSort("total_amount"),
            render: (val) => `$ ${val}`
        },
        {
            header: "Updated By",
            accessor: "uploaded_by",
            sortable: true,
            onClick: () => handleSort("uploaded_by")
        },
        {
            header: "Status",
            accessor: "status",
            render: () => (
                <div className="bg-orange-50 text-orange-500 px-3 py-1 rounded-full text-[12px] font-medium inline-block border border-orange-100">
                    Waiting for Approval
                </div>
            )
        },
        {
            header: "Approver",
            accessor: "approver_name",
            sortable: true,
            onClick: () => handleSort("approver_name")
        },
        {
            header: "Actions",
            accessor: "actions",
            render: (val, row) => (
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => handleView(row)}
                        className="text-gray-400 hover:text-[#1e9bd8] transition-colors cursor-pointer"
                        title="View"
                    >
                        <EyeOutlined style={{ fontSize: 16 }} />
                    </button>
                    <button
                        onClick={() => handleDelete(row)}
                        className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Delete"
                    >
                        <DeleteOutlined style={{ fontSize: 16 }} />
                    </button>
                </div>
            )
        }
    ], [currentPage, itemsPerPage, sortColumn, sortDirection]);

    const sortedAndPaginatedInvoices = useMemo(() => {
        let result = [...invoices];
        
        // Sort
        if (sortColumn) {
            result.sort((a, b) => {
                const valA = a[sortColumn] || '';
                const valB = b[sortColumn] || '';
                if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Map with original index for S.no
        const withIndex = result.map((item, index) => ({ ...item, index }));

        // Paginate
        const start = (currentPage - 1) * itemsPerPage;
        return withIndex.slice(start, start + itemsPerPage);
    }, [invoices, currentPage, itemsPerPage, sortColumn, sortDirection]);

    const items = [
        {
            key: '1',
            label: 'Unapproved Invoices',
            children: (
                <div className="pt-4">
                    <DataTable
                        columns={columnDefs}
                        data={sortedAndPaginatedInvoices}
                        loading={loading}
                        totalItems={invoices.length}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={setItemsPerPage}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        maxHeight="calc(100vh - 320px)"
                        stickyHeader={true}
                    />
                </div>
            ),
        },
        {
            key: '2',
            label: 'Change Approver (Delegation)',
            children: (
                <div className="pt-4">
                    <DelegationManager 
                        isAdmin={user?.role === 'admin'} 
                        onUpdate={fetchData} 
                        approvers={approvers}
                    />
                </div>
            ),
        },
    ];

    return (
        <div className="p-6 bg-[#f8fafc] min-h-screen pt-[5px]">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Approvals</h1>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-2">
                <Tabs 
                    defaultActiveKey="1" 
                    items={items} 
                    className="approvals-tabs"
                    tabBarStyle={{ marginBottom: 0, paddingLeft: '1rem' }}
                />
            </div>
        </div>
    );
};

export default ApprovalsPage;
