import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOutlined } from '@ant-design/icons';
import DataTable from '../../components/ui/DataTable';
import { getInvoices, getInvoiceFilterOptions } from '../../api/invoiceApi';
import toast from '../../utils/toast';
import ExportButton from '../../shared/components/ExportButton';

const CodingPage = () => {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    // Sort and Filter state
    const [sortColumn, setSortColumn] = useState("processed_at");
    const [sortDirection, setSortDirection] = useState("desc");
    const [columnFilters, setColumnFilters] = useState({});

    const accessorToDbField = {
        vendor_name: "vendor_name",
        vendor_id: "vendor_id",
        invoice_number: "invoice_number",
        uploaded_by: "uploaded_by",
        status: "status",
        total_amount: "total_amount",
        processed_at: "processed_at"
    };

    const backendFilters = useMemo(() => {
        const filters = {
            status: ['waiting_coding', 'waiting_approval', 'reworked']
        };

        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = accessorToDbField[accessor] || accessor;

            if (dbField === 'status') {
                // If user filters by status, we must ensure they only see coding-related statuses
                if (value instanceof Set && value.size > 0) {
                    const selected = Array.from(value);
                    const codingStatuses = ['waiting_coding', 'waiting_approval', 'reworked'];
                    const restricted = selected.filter(v => codingStatuses.includes(v));
                    filters[dbField] = restricted.length > 0 ? restricted : codingStatuses;
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

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const skip = (currentPage - 1) * itemsPerPage;
            const response = await getInvoices({
                skip,
                limit: itemsPerPage,
                sort_by: accessorToDbField[sortColumn] || sortColumn,
                sort_dir: sortDirection,
                filters: backendFilters
            });

            setInvoices(response.data || []);
            setTotal(response.total || 0);
        } catch (error) {
            console.error('Error fetching invoices:', error);
            toast.error('Failed to load coding queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, [currentPage, itemsPerPage, sortColumn, sortDirection, backendFilters]);

    const handleView = (invoice) => {
        navigate('/invoices', { state: { viewInvoice: invoice } });
    };

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
            valueGetter: (p) => p.data?.vendor_name || p.data?.extracted_data?.vendor_info?.name?.value || "N/A",
            onGetOptions: async (accessor) => {
                const dbField = accessorToDbField[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters);
            }
        },
        {
            header: "Vendor ID",
            accessor: "vendor_id",
            minWidth: 150,
            sortable: true,
            filterable: true,
            onGetOptions: async (accessor) => {
                const dbField = accessorToDbField[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters);
            }
        },
        {
            header: "Invoice ID",
            accessor: "invoice_number",
            minWidth: 150,
            sortable: true,
            filterable: true,
            onGetOptions: async (accessor) => {
                const dbField = accessorToDbField[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters);
            }
        },
        {
            header: "Total Amount ($)",
            accessor: "total_amount",
            minWidth: 150,
            sortable: true,
            filterType: 'number',
            filterable: true,
            render: (_, row) => {
                const val = row.extracted_data?.amounts?.total_invoice_amount?.value || "0.00";
                return `$ ${val}`;
            },
            valueGetter: (p) => p.data?.extracted_data?.amounts?.total_invoice_amount?.value || "0.00",
        },
        {
            header: "Last Updated",
            accessor: "processed_at",
            minWidth: 220,
            sortable: true,
            render: (val, row) => {
                const date = val || row.uploaded_at;
                if (!date) return "N/A";
                return new Date(date).toLocaleString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }).replace(',', ' -');
            }
        },
        {
            header: "Updated By",
            accessor: "uploaded_by",
            minWidth: 180,
            sortable: true,
            filterable: true,
            onGetOptions: async (accessor) => {
                const dbField = accessorToDbField[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters);
            }
        },
        {
            header: "Status",
            accessor: "status",
            minWidth: 160,
            sortable: true,
            filterable: true,
            render: (status) => {
                let colorClass = "bg-orange-100 text-orange-600";
                let label = "Waiting for coding";

                if (status === 'waiting_approval') {
                    colorClass = "bg-blue-100 text-blue-600";
                    label = "Waiting approval";
                } else if (status === 'reworked') {
                    colorClass = "bg-purple-100 text-purple-600";
                    label = "Reworked";
                }

                return (
                    <div className={`px-3 py-1 rounded-full text-[12px] font-medium inline-block border border-current opacity-80 ${colorClass}`}>
                        {label}
                    </div>
                );
            },
            onGetOptions: async () => {
                return ['waiting_coding', 'waiting_approval', 'reworked'];
            }
        },
        {
            header: "Actions",
            accessor: "actions",
            width: 100,
            render: (_, row) => (
                <div className="flex items-center justify-center h-full">
                    <button
                        onClick={() => handleView(row)}
                        className="text-gray-400 hover:text-[#1e9bd8] transition-colors cursor-pointer p-2"
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
                    <h2 className="text-xl font-bold">Coding</h2>
                    <div className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                        {total}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        data={invoices}
                        columns={columns}
                        fileName="CodingQueue.xlsx"
                    />
                </div>
            </div>

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
            />
        </div>
    );
};

export default CodingPage;
