import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Tag, Space, Button, Modal } from 'antd';
import { EyeOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Trash2 } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import DelegationManager from './components/DelegationManager';
import { getUnapprovedInvoices, updateApprovalStatus } from '../../api/approvalApi';
import { getDelegations } from '../../api/delegationApi';
import { getApprovers } from '../../api/workflowConfigApi';
import { useAuthStore } from '../../store/authStore';
import toast from '../../utils/toast';
import ExportButton from '../../shared/components/ExportButton';
import CustomButton from '../../shared/components/CustomButton';
import { useCommonStore } from '../../store/common.store';

const { confirm } = Modal;

const ApprovalsPage = () => {
    const navigate = useNavigate();
    const { user, activeRole } = useAuthStore();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeDelegations, setActiveDelegations] = useState([]);
    const [approvers, setApprovers] = useState([]);

    // Pagination and Sorting State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [totalItems, setTotalItems] = useState(0);
    const [sortColumn, setSortColumn] = useState('uploaded_at');
    const [sortDirection, setSortDirection] = useState('desc');

    const fetchData = async () => {
        setLoading(true);
        try {
            const skip = (currentPage - 1) * itemsPerPage;
            
            // Fetch invoices, delegations, and approvers in parallel
            const [invoiceRes, delegationData, approverData] = await Promise.all([
                getUnapprovedInvoices({
                    skip,
                    limit: itemsPerPage,
                    sort_by: sortColumn,
                    sort_dir: sortDirection
                }),
                getDelegations(),
                getApprovers()
            ]);

            const invoiceData = invoiceRes?.data || [];
            setTotalItems(invoiceRes?.total || 0);

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            // Filter active delegations where the current user is the substitute
            const safeDelegations = Array.isArray(delegationData?.data) ? delegationData.data : (Array.isArray(delegationData) ? delegationData : []);
            
            const active = safeDelegations.filter(d => {
                const start = new Date(d.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(d.end_date);
                end.setHours(0, 0, 0, 0);

                return d.substitute_approver.toLowerCase() === user?.email?.toLowerCase() &&
                    now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
            }).map(d => d.original_approver.toLowerCase());

            setActiveDelegations(active);
            setApprovers(approverData);

            // Helper to get emails from a stage (handles string OR object formats OR plain array)
            const getStageEmails = (stage) => {
                if (!stage) return [];
                // New format: { emails: [...], is_finance: bool }
                if (stage?.emails != null) {
                    if (Array.isArray(stage.emails)) return stage.emails.map(e => String(e).toLowerCase());
                    if (typeof stage.emails === 'string') return [stage.emails.toLowerCase()];
                }
                // Plain array of email strings (legacy)
                if (Array.isArray(stage)) return stage.map(e => String(e).toLowerCase());
                // Single email string
                if (typeof stage === 'string') return [stage.toLowerCase()];
                return [];
            };

            // Transform invoices
            const transformed = invoiceData.map(inv => {
                const currentLevel = inv.current_approver_level || 1;
                const stage = inv.assigned_approvers?.[currentLevel - 1];
                const isFinanceLevel = stage?.is_finance === true;
                const stageEmails = getStageEmails(stage);

                // For finance-team levels show "Finance Team" instead of individual emails
                const approverLabel = isFinanceLevel
                    ? 'Finance Team'
                    : stageEmails.length > 0
                        ? stageEmails.join(", ")
                        : 'Pending';
                
                // Active delegation check for the label
                const isDelegated = !isFinanceLevel && stageEmails.some(e => active.includes(e));

                return {
                    ...inv,
                    vendor_name: inv.vendor_name || inv.extracted_data?.vendor_info?.name?.value || "N/A",
                    invoice_number: inv.invoice_number || inv.extracted_data?.invoice_details?.invoice_number?.value || "N/A",
                    total_amount: inv.extracted_data?.amounts?.total_invoice_amount?.value || "0.00",
                    approver_name: approverLabel + (isDelegated ? ' (Delegated)' : '')
                };
            });

            setInvoices(transformed);
        } catch (error) {
            console.error('Error fetching approval data:', error);
            toast.error('Failed to load approvals');
        } finally {
            setLoading(false);
        }
    };

    const entity = useCommonStore((state) => state.entity);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, currentPage, itemsPerPage, sortColumn, sortDirection, entity]);

    const handleView = (invoice) => {
        // Navigate to invoices page to show the invoices screen
        navigate('/invoices', { state: { viewInvoice: invoice, from: '/approvals' } });
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

    const handleSort = (column, direction) => {
        setSortColumn(column);
        setSortDirection(direction);
        setCurrentPage(1); // Reset to first page on sort
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
            filterable: true,
            onClick: () => handleSort("vendor_name")
        },
        {
            header: "Invoice ID",
            accessor: "invoice_number",
            sortable: true,
            filterable: true,
            onClick: () => handleSort("invoice_number")
        },
        {
            header: "Total Amount ($)",
            accessor: "total_amount",
            sortable: true,
            filterable: true,
            onClick: () => handleSort("total_amount"),
            render: (val) => `$ ${val}`
        },
        {
            header: "Updated By",
            accessor: "uploaded_by",
            sortable: true,
            filterable: true,
            onClick: () => handleSort("uploaded_by")
        },
        {
            header: "Status",
            accessor: "status",
            filterable: true,
            getFilterValue: (row) => "Waiting for Approval",
            render: (val, row) => (
                <div className="bg-orange-50 text-orange-500 px-3 py-1 rounded-full text-[12px] font-medium inline-block border border-orange-100">
                    Waiting for Approval {row.current_approver_level ? `(Level ${row.current_approver_level})` : ''}
                </div>
            )
        },
        {
            header: "Approver",
            accessor: "approver_name",
            sortable: true,
            filterable: true,
            onClick: () => handleSort("approver_name")
        },
        {
            header: "Actions",
            accessor: "actions",
            render: (val, row) => (
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => handleView(row)}
                        className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
                        title="View"
                    >
                        <EyeOutlined style={{ fontSize: 16 }} />
                    </button>
                    {/* <button
                        onClick={() => handleDelete(row)}
                        className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Delete"
                    >
                        <Trash2 size={16} />
                    </button> */}
                </div>
            )
        }
    ], [currentPage, itemsPerPage, sortColumn, sortDirection]);

    // Handled by backend now
    const displayInvoices = useMemo(() => {
        return invoices.map((item, index) => ({ ...item, index }));
    }, [invoices]);

    const items = [
        {
            key: '1',
            label: 'Unapproved Invoices',
            children: (
                <div className="pt-4">
                    <DataTable
                        columns={columnDefs}
                        data={displayInvoices}
                        loading={loading}
                        totalItems={totalItems}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(val) => {
                            setItemsPerPage(val);
                            setCurrentPage(1);
                        }}
                        onSort={handleSort}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        maxHeight="calc(100vh - 320px)"
                        stickyHeader={true}
                        enableColumnFilters={true}
                        transparent={true}
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
                        isAdmin={activeRole?.toLowerCase() === 'admin'}
                        onUpdate={fetchData}
                        approvers={approvers}
                        loading={loading}
                    />
                </div>
            ),
        },
    ];

    return (
        <div className="p-6 bg-[#f8fafc] min-h-screen pt-[10px]">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-extrabold custom-font-jura"> </h1>
                <div className="flex items-center gap-3">
                    <div className="w-[150px]">
                        <CustomButton 
                            variant="outline"
                            onClick={fetchData}
                            loading={loading}
                            className="!h-[42px] border-[#D9D9D9] !text-[#595959]"
                        >
                            <ReloadOutlined /> Refresh
                        </CustomButton>
                    </div>
                    <div className="w-[150px]">
                        <ExportButton 
                            data={invoices} 
                            columns={columnDefs} 
                            fileName="Approvals.xlsx" 
                        />
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
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
