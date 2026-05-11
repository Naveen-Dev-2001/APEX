import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import DataTable from '../../components/ui/DataTable';
import { getInvoices, getInvoiceFilterOptions } from '../../api/invoiceApi';
import { getWorkflowUsers } from './invoiceColumns';
import toast from '../../utils/toast';
import ExportButton from '../../shared/components/ExportButton';
import CustomButton from '../../shared/components/CustomButton';
import RefreshButton from '../../shared/components/RefreshButton';
import { useCommonStore } from '../../store/common.store';
import { formatCurrency, formatIST } from '../../utils/formatters';

const ACCESSOR_TO_DB_FIELD = {
    vendor_name: "vendor_name",
    vendor_id: "vendor_id",
    invoice_number: "invoice_number",
    uploaded_by: "uploaded_by",
    status: "status",
    total_amount: "total_amount",
    processed_at: "processed_at",
    uploaded_at: "uploaded_at"
};

const CodingPage = () => {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    // Sort and Filter state
    const [sortColumn, setSortColumn] = useState("uploaded_at");
    const [sortDirection, setSortDirection] = useState("desc");
    const [columnFilters, setColumnFilters] = useState({});

    const abortRef = useRef(null);
    const requestIdRef = useRef(0);

    const backendFilters = useMemo(() => {
        const filters = {
            coding_view: true
        };

        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;

            if (dbField === 'status') {
                if (value instanceof Set && value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (value instanceof Set) {
                if (value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (typeof value === 'object' && value.op && value.val !== "" && value.val !== undefined) {
                // Numeric condition filter
                filters[dbField] = {
                    op: value.op,
                    val: parseFloat(value.val)
                };
            }
        });
        return filters;
    }, [columnFilters]);

    const entity = useCommonStore((state) => state.entity);

    const fetchInvoices = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestId = ++requestIdRef.current;

        setLoading(true);
        try {
            const skip = (currentPage - 1) * itemsPerPage;
            const response = await getInvoices({
                skip,
                limit: itemsPerPage,
                sort_by: ACCESSOR_TO_DB_FIELD[sortColumn] || sortColumn,
                sort_dir: sortDirection,
                filters: backendFilters,
                show_all: false
            }, { signal: controller.signal });

            if (requestId !== requestIdRef.current) return;

            setInvoices(response.data || []);
            setTotal(response.total || 0);
        } catch (error) {
            if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || controller.signal.aborted) {
                return;
            }
            console.error('Error fetching invoices:', error);
            toast.error('Failed to load coding queue');
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [currentPage, itemsPerPage, sortColumn, sortDirection, backendFilters, entity]);

    useEffect(() => {
        fetchInvoices();
        return () => abortRef.current?.abort();
    }, [fetchInvoices]);

    const handleView = useCallback((invoice) => {
        navigate('/invoices', { state: { viewInvoice: invoice, from: '/coding' } });
    }, [navigate]);

    const columns = useMemo(() => [
        {
            header: "S.no",
            accessor: "s_no",
            width: 80,
            render: (_, row, idx) => (currentPage - 1) * itemsPerPage + idx + 1,
        },
        {
            header: "Vendor Name",
            accessor: "vendor_name",
            minWidth: 200,
            sortable: true,
            filterable: true,
            render: (val, row) => row.vendor_name || row.extracted_data?.vendor_info?.name?.value || "N/A",
            getFilterValue: (row) => row.vendor_name || row.extracted_data?.vendor_info?.name?.value || "N/A",
            valueGetter: (p) => p.data?.vendor_name || p.data?.extracted_data?.vendor_info?.name?.value || "N/A",
        },
        {
            header: "Vendor ID",
            accessor: "vendor_id",
            minWidth: 150,
            sortable: true,
            filterable: true,
        },
        {
            header: "Invoice Number",
            accessor: "invoice_number",
            minWidth: 150,
            sortable: true,
            filterable: true,
        },
        // {
        //     header: "Uploaded At",
        //     accessor: "uploaded_at",
        //     minWidth: 200,
        //     sortable: true,
        //     render: (val) => {
        //         if (!val) return "N/A";
        //         return new Date(val).toLocaleString('en-US', {
        //             month: '2-digit',
        //             day: '2-digit',
        //             year: 'numeric',
        //             hour: '2-digit',
        //             minute: '2-digit',
        //             hour12: true
        //         }).replace(',', ' -');
        //     }
        // },
        {
            header: "Total Amount",
            accessor: "total_amount",
            minWidth: 150,
            sortable: true,
            filterType: 'number',
            filterable: true,
            onGetOptions: async (accessor) => {
                const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters);
            },
            filterRender: (val) => formatCurrency(val),
            render: (_, row) => {
                const val = row.extracted_data?.amounts?.total_invoice_amount?.value;
                return formatCurrency(val);
            },
            valueGetter: (p) => p.data?.extracted_data?.amounts?.total_invoice_amount?.value || "0.00",
        },
        {
            header: "Action Time",
            accessor: "processed_at",
            minWidth: 220,
            sortable: true,
            render: (val, row) => formatIST(val || row.uploaded_at)
        },
        {
            header: "Updated By",
            accessor: "uploaded_by",
            minWidth: 180,
            sortable: true,
            filterable: true,
        },
        {
            header: "Status",
            accessor: "status",
            minWidth: 160,
            sortable: true,
            filterable: true,
            onGetOptions: (col) => getInvoiceFilterOptions(col, { coding_view: true }),
            render: (status, row) => {
                const colorMap = {
                    waiting_coding: "bg-orange-100 text-orange-600",
                    waiting_approval: "bg-blue-100 text-blue-600",
                    reworked: "bg-purple-100 text-purple-600",
                };

                let label = row.status_label;
                if (!label) {
                    const labelMap = {
                        waiting_coding: "Waiting For Coding",
                        waiting_approval: "Waiting approval",
                        reworked: "Reworked",
                    };
                    label = labelMap[status] ?? status;
                    if (status === 'waiting_approval' && row.current_approver_level) {
                        label += ` (Level ${row.current_approver_level})`;
                    }
                }

                const colorClass = colorMap[status] ?? "bg-gray-100 text-gray-600";

                return (
                    <div className={`px-3 py-1 rounded-full text-[12px] font-medium inline-block border border-current opacity-80 ${colorClass}`}>
                        {label}
                    </div>
                );
            },
            getFilterValue: (row) => row.status_label || row.status || '',
            filterRender: (val) => {
                const labelMap = {
                    waiting_coding: "Waiting For Coding",
                    waiting_approval: "Waiting approval",
                    reworked: "Reworked",
                };
                return labelMap[val] ?? val;
            },
        },
        {
            header: "Next Action By",
            accessor: "next_approver",
            minWidth: 200,
            filterable: true,
            getFilterValue: (row) => {
                const status = (row?.status || "").toLowerCase();
                if (status === 'sage_posted' || status === 'approved') return "Completed";
                if (status === 'rejected') return "Rejected";
                if (status === 'waiting_coding' || status === 'processed') return "Finance Team";

                const currentLevel = row?.current_approver_level || 1;
                const stage = row?.assigned_approvers?.[currentLevel - 1];
                if (!stage) return "-";
                if (stage.is_finance === true) return "Finance Team";

                const names = stage.names || stage.emails;
                if (Array.isArray(names)) {
                    return names.map(n => {
                        if (typeof n === 'string' && n.includes('@')) {
                            return n.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                        }
                        return n;
                    }).join(", ");
                }
                if (typeof names === 'string') {
                    if (names.includes('@')) {
                        return names.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                    }
                    return names;
                }
                return "-";
            },
            render: (_, row) => {
                const status = (row?.status || "").toLowerCase();
                if (status === 'sage_posted' || status === 'approved') return "Completed";
                if (status === 'rejected') return "Rejected";
                if (status === 'waiting_coding' || status === 'processed') return "Finance Team";

                const currentLevel = row?.current_approver_level || 1;
                const stage = row?.assigned_approvers?.[currentLevel - 1];

                if (!stage) return "-";

                if (stage.is_finance === true) return "Finance Team";

                const names = stage.names || stage.emails;
                if (Array.isArray(names)) {
                    return names.map(n => {
                        if (typeof n === 'string' && n.includes('@')) {
                            return n.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                        }
                        return n;
                    }).join(", ");
                }
                if (typeof names === 'string') {
                    if (names.includes('@')) {
                        return names.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                    }
                    return names;
                }

                return "-";
            }
        },
        {
            header: "Workflow Users",
            accessor: "workflow_users",
            minWidth: 200,
            filterable: true,
            getFilterValue: (row) => getWorkflowUsers(row),
            render: (_, row) => getWorkflowUsers(row),
        },
        {
            header: "Entity",
            accessor: "entity",
            minWidth: 120,
            filterable: true,
        },
        // {
        //     header: "Confidence Score",
        //     accessor: "confidence_score",
        //     render: (val) => val ? `${(parseFloat(val) * 100).toFixed(1)}%` : "-",
        // },
        {
            header: "Actions",
            accessor: "actions",
            width: 100,
            render: (_, row) => (
                <div className="flex items-center justify-center h-full">
                    <button
                        onClick={() => handleView(row)}
                        className="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        title="View"
                    >
                        <EyeOutlined style={{ fontSize: 18 }} />
                    </button>
                </div>
            )
        }
    ], [currentPage, itemsPerPage, handleView, backendFilters]);

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (size) => {
        setItemsPerPage(size);
        setCurrentPage(1);
    };

    const handleSort = (column, direction) => {
        setSortColumn(column);
        setSortDirection(direction);
        setCurrentPage(1);
    };

    return (
        <div className="p-6 bg-[#f8fafc] min-h-screen pt-[5px]">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-extrabold"></h2>
                    {/* <div className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                        {total}
                    </div> */}
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-[120px]">
                        <RefreshButton 
                            onClick={fetchInvoices}
                            loading={loading}
                            className="!h-[40px] w-full"
                        />
                    </div>
                    <div className="w-[120px]">
                        <ExportButton
                            data={invoices}
                            columns={columns}
                            fileName="CodingQueue.xlsx"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <DataTable
                    columns={columns}
                    data={invoices}
                    loading={loading}
                    totalItems={total}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    maxHeight="calc(100vh - 250px)"
                    stickyHeader={true}
                    enableColumnFilters={true}
                    columnFilters={columnFilters}
                    onColumnFiltersChange={(filters) => {
                        setColumnFilters(filters);
                        setCurrentPage(1);
                    }}
                    transparent={true}
                />
            </div>
        </div>
    );
};

export default CodingPage;
