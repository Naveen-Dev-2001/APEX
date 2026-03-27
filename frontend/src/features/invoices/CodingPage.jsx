import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOutlined } from '@ant-design/icons';
import ReusableDataTable from '../../shared/components/ReusableDataTable';
import { getInvoices } from '../../api/invoiceApi';
import toast from '../../utils/toast';

const CodingPage = () => {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            // Fetching a large batch to filter locally as the backend doesn't have a specific coding queue endpoint
            const data = await getInvoices({ skip: 0 });
            
            // Filter for coding related statuses
            // Based on InvoiceStatusEnum: waiting_coding, waiting_approval, reworked
            const codingStatuses = ['waiting_coding', 'waiting_approval', 'reworked'];
            const filtered = data.filter(inv => codingStatuses.includes(inv.status));
            
            setInvoices(filtered);
        } catch (error) {
            console.error('Error fetching invoices:', error);
            toast.error('Failed to load coding queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const handleView = (invoice) => {
        navigate('/coding/review', { state: { invoice } });
    };

    const columnDefs = useMemo(() => [
        {
            headerName: "S.no",
            valueGetter: "node.rowIndex + 1",
            width: 80,
            pinned: "left",
        },
        {
            headerName: "Vendor Name",
            field: "vendor_name",
            minWidth: 200,
            valueGetter: (p) => p.data?.vendor_name || p.data?.extracted_data?.vendor_info?.name?.value || "N/A",
        },
        {
            headerName: "Vendor ID",
            field: "vendor_id",
            minWidth: 150,
        },
        {
            headerName: "Invoice ID",
            field: "invoice_number",
            minWidth: 150,
        },
        {
            headerName: "Total Amount ($)",
            field: "total_amount",
            minWidth: 150,
            valueFormatter: (p) => {
                const val = p.data?.extracted_data?.amounts?.total_invoice_amount?.value || "0.00";
                return `$ ${val}`;
            }
        },
        {
            headerName: "Last Updated",
            field: "processed_at",
            minWidth: 220,
            valueFormatter: (p) => {
                const date = p.value || p.data?.uploaded_at;
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
            headerName: "Updated By",
            field: "uploaded_by",
            minWidth: 180,
        },
        {
            headerName: "Status",
            field: "status",
            minWidth: 160,
            cellRenderer: (p) => {
                const status = p.value;
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
            }
        },
        {
            headerName: "Actions",
            width: 100,
            pinned: "right",
            cellRenderer: (p) => (
                <div className="flex items-center justify-center h-full">
                    <button
                        onClick={() => handleView(p.data)}
                        className="text-gray-400 hover:text-[#1e9bd8] transition-colors cursor-pointer p-2"
                        title="View"
                    >
                        <EyeOutlined style={{ fontSize: 18 }} />
                    </button>
                </div>
            )
        }
    ], [navigate]);

    return (
        <div className="p-6 bg-[#f8fafc] min-h-screen pt-[84px]">
            <ReusableDataTable
                title="Coding"
                columnDefs={columnDefs}
                data={invoices}
                loading={loading}
                searchPlaceholder="Search"
                tableSearch={true}
                tableHeader={true}
                rowHeight={52}
                shouldUseFlex={true}
            />
        </div>
    );
};

export default CodingPage;
