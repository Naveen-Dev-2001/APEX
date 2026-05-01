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
import RefreshButton from '../../shared/components/RefreshButton';
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
    const [activeTab, setActiveTab] = useState('1'); // 1: Unapproved Invoices, 2: Change Approver

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

            const getUsernameByEmail = (email, approversList) => {
                const found = (approversList || []).find(a => a.value?.toLowerCase() === email?.toLowerCase());
                if (found) {
                    // Label format is "Username (email)", extract Username
                    return found.label.split(' (')[0];
                }
                return email;
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
                        ? stageEmails.map(email => getUsernameByEmail(email, approverData)).join(", ")
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
        <div className="p-0 bg-[#f8fafc] min-h-screen">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px", background: "#F7F7F7", borderBottom: "1px solid #E5E7EB", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", border: "1px solid #D9D9D9", borderRadius: "4px", overflow: "hidden", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                    {[
                        { key: '1', label: 'Unapproved Invoices' },
                        { key: '2', label: 'Change Approver (Delegation)' },
                    ].map(({ key, label }, index, arr) => {
                        const isActive = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                style={{
                                    padding: "8px 24px",
                                    fontSize: 14,
                                    fontWeight: isActive ? 700 : 500,
                                    color: "black",
                                    background: isActive ? "#BAE7FF" : "#FFFFFF",
                                    border: "none",
                                    borderRight: index < arr.length - 1 ? "1px solid #D9D9D9" : "none",
                                    cursor: "pointer",
                                    transition: "background-color 0.2s, color 0.2s",
                                    outline: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: "120px"
                                }}
                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#FAFAFA"; }}
                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#FFFFFF"; }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-[120px]">
                        <RefreshButton
                            onClick={fetchData}
                            loading={loading}
                            className="!h-[40px] w-full"
                        />
                    </div>
                    <div className="w-[120px]">
                        <ExportButton
                            data={invoices}
                            columns={columnDefs}
                            fileName="Approvals.xlsx"
                        />
                    </div>
                </div>
            </div>

            <div className="p-4">
                {activeTab === '1' ? (
                    <div className="bg-white rounded-xl shadow-sm p-2">
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
                            maxHeight="calc(100vh - 250px)"
                            stickyHeader={true}
                            enableColumnFilters={true}
                        />
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm p-4">
                        <DelegationManager
                            isAdmin={activeRole?.toLowerCase() === 'admin'}
                            onUpdate={fetchData}
                            approvers={approvers}
                            loading={loading}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApprovalsPage;
