import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-react';
import useWorkflowStore from '../../store/workflow.store';
import { useAuthStore } from '../../store/authStore';
import useToastStore from '../../store/useToastStore';
import toast from '../../utils/toast';
import DataTable from '../../components/ui/DataTable';
import VendorWorkflowModal from './VendorWorkflowModal';
import CodificationWorkflowModal from './CodificationWorkflowModal';
import RuleModal from './RuleModal';

const SettingsPage = () => {
    const {
        activeTab, setActiveTab,
        searchQuery, setSearchQuery,
        vendorWorkflows, vendorLoading, vendorError,
        codificationLoading, codificationError,
        fetchVendorWorkflows, fetchVendorMetadata,
        fetchCodificationWorkflows, fetchCodificationMetadata,
        deleteVendorWorkflow, deleteCodificationWorkflow,
        getFilteredData, approversList
    } = useWorkflowStore();

    const { user, activeRole } = useAuthStore();
    const isCoder = activeRole?.toLowerCase() === 'coder';

    const { showConfirm } = useToastStore();
    const [modalState, setModalState] = useState({ open: false, mode: 'add', rowData: null });

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    useEffect(() => {
        setCurrentPage(1); // Reset page on tab change
        if (activeTab === 'Vendor Based Workflow') {
            fetchVendorWorkflows();
            fetchVendorMetadata();
        } else if (activeTab === 'Codification Based Workflow') {
            fetchCodificationWorkflows();
            fetchCodificationMetadata();
        }
    }, [activeTab, fetchVendorWorkflows, fetchVendorMetadata, fetchCodificationWorkflows, fetchCodificationMetadata]);

    useEffect(() => {
        setCurrentPage(1); // Reset page on search
    }, [searchQuery]);

    const filteredData = getFilteredData();

    const openAdd = () => setModalState({ open: true, mode: 'add', rowData: null });
    const openEdit = (row) => setModalState({ open: true, mode: 'edit', rowData: row });
    const closeModal = () => setModalState({ open: false, mode: 'add', rowData: null });

    const getApproverName = useCallback((email, isFinance = false) => {
        if (isFinance) {
            return (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200 whitespace-nowrap">
                    Finance Team
                </span>
            );
        }

        if (!email) return <span className="text-gray-400">-</span>;

        const formatSingle = (e) => {
            const approver = (approversList || []).find(a => a.value === e);
            if (approver) return approver.label.split(' (')[0];
            return e;
        };

        if (Array.isArray(email)) {
            if (email.length === 0) return <span className="text-gray-400">-</span>;

            const tooltipContent = (
                <div className="flex flex-col gap-1 py-1">
                    {email.map((e, i) => (
                        <span key={i} className="text-[11px] text-white font-medium">{e}</span>
                    ))}
                </div>
            );

            return (
                <Tooltip title={tooltipContent} placement="top" mouseEnterDelay={0.3}>
                    <div className="flex flex-wrap gap-1 max-w-[200px] cursor-help">
                        {email.map((e, i) => (
                            <span key={i} className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] text-gray-600 border border-gray-200">
                                {formatSingle(e)}
                            </span>
                        ))}
                        {email.length > 1 && (
                            <span className="text-[10px] text-blue-500 font-bold ml-0.5">
                                +{email.length - 1}
                            </span>
                        )}
                    </div>
                </Tooltip>
            );
        }

        return (
            <Tooltip title={email} placement="top" mouseEnterDelay={0.3}>
                <span className="cursor-help">{formatSingle(email)}</span>
            </Tooltip>
        );
    }, [approversList]);

    const handleDelete = (row) => {
        showConfirm({
            message: 'Delete Workflow Rule?',
            subMessage: `Are you sure you want to delete the workflow rule for "${row.vendor_name || row.lob + ' - ' + row.department_id}"?`,
            confirmLabel: 'Delete',
            variant: 'danger',
            onConfirm: async () => {
                try {
                    if (activeTab === 'Vendor Based Workflow') {
                        await deleteVendorWorkflow(row.id);
                    } else {
                        await deleteCodificationWorkflow(row.id);
                    }
                    toast.success('Workflow rule deleted successfully');
                } catch (err) {
                    toast.error('Failed to delete: ' + (err.response?.data?.detail || err.message));
                }
            }
        });
    };

    const vendorColumns = [
        {
            header: 'Vendor Name',
            accessor: 'vendor_name',
            sortable: true,
            filterable: true
        },
        {
            header: 'Approvers',
            accessor: 'approver_count',
            render: (val) => (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {val}
                </span>
            )
        },
        // {
        //     header: 'Type',
        //     accessor: 'is_parallel',
        //     filterable: true,
        //     getFilterValue: (row) => row.is_parallel ? 'Parallel' : 'Sequential',
        //     render: (val) => (
        //         <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium border
        //             ${val
        //                 ? 'bg-blue-50 text-blue-600 border-blue-100'
        //                 : 'bg-gray-50 text-gray-600 border-gray-100'}`}>
        //             {val ? 'Parallel' : 'Sequential'}
        //         </span>
        //     )
        // },
        {
            header: 'Threshold',
            accessor: 'is_threshold_enabled',
            filterable: true,
            getFilterValue: (row) => row.is_threshold_enabled ? 'Yes' : 'No',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium border
                    ${val
                        ? 'bg-green-50 text-green-600 border-green-100'
                        : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                    {val ? 'Yes' : 'No'}
                </span>
            )
        },
        {
            header: 'Approver 1',
            accessor: 'mandatory_approver_1',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['1'] || row?.approver_flags?.[1])
        },
        {
            header: 'Approver 2',
            accessor: 'mandatory_approver_2',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['2'] || row?.approver_flags?.[2])
        },
        {
            header: 'Approver 3',
            accessor: 'mandatory_approver_3',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['3'] || row?.approver_flags?.[3])
        },
        {
            header: 'Approver 4',
            accessor: 'mandatory_approver_4',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['4'] || row?.approver_flags?.[4])
        },
        {
            header: 'Approver 5',
            accessor: 'mandatory_approver_5',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['5'] || row?.approver_flags?.[5])
        },
        {
            header: 'Threshold Approver',
            accessor: 'threshold_approver',
            render: (val) => getApproverName(val)
        },
        {
            header: 'Amount Threshold',
            accessor: 'amount_threshold',
            render: (val) => val ? `$${val.toLocaleString()}` : <span className="text-gray-400">-</span>
        },
        {
            header: 'Posting Approver',
            accessor: 'posting_approver',
            render: (val) => getApproverName(val)
        },
        ...(!isCoder ? [{
            header: 'Actions',
            accessor: 'actions',
            render: (_, row) => (
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => openEdit(row)}
                        className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                        title="Edit"
                    >
                        <Pencil size={18} />
                    </button>
                    <button
                        onClick={() => handleDelete(row)}
                        className="text-[#ff4d4f] hover:text-[#d32f2f] transition-colors p-1"
                        title="Delete"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            )
        }] : [])
    ];

    const codificationColumns = [
        {
            header: 'LOB',
            accessor: 'lob',
            filterable: true,
            getFilterValue: (row) => {
                const opt = useWorkflowStore.getState().lobsList.find(o => o.value === row.lob);
                return opt ? opt.label : row.lob;
            },
            render: (val) => {
                const opt = useWorkflowStore.getState().lobsList.find(o => o.value === val);
                return opt ? opt.label : val;
            }
        },
        {
            header: 'Dept ID',
            accessor: 'department_id',
            filterable: true,
            getFilterValue: (row) => {
                const opt = useWorkflowStore.getState().departmentsList.find(o => o.value === row.department_id);
                return opt ? opt.label : row.department_id;
            },
            render: (val) => {
                const opt = useWorkflowStore.getState().departmentsList.find(o => o.value === val);
                return opt ? opt.label : val;
            }
        },
        {
            header: 'Approvers',
            accessor: 'approver_count',
            render: (val) => (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {val}
                </span>
            )
        },
        {
            header: 'Type',
            accessor: 'is_parallel',
            filterable: true,
            getFilterValue: (row) => row.is_parallel ? 'Parallel' : 'Sequential',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium border
                    ${val
                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                    {val ? 'Parallel' : 'Sequential'}
                </span>
            )
        },
        {
            header: 'Threshold',
            accessor: 'is_threshold_enabled',
            filterable: true,
            getFilterValue: (row) => row.is_threshold_enabled ? 'Yes' : 'No',
            render: (val) => (
                <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-medium border
                    ${val
                        ? 'bg-green-50 text-green-600 border-green-100'
                        : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                    {val ? 'Yes' : 'No'}
                </span>
            )
        },
        {
            header: 'Approver 1',
            accessor: 'mandatory_approver_1',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['1'] || row?.approver_flags?.[1])
        },
        {
            header: 'Approver 2',
            accessor: 'mandatory_approver_2',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['2'] || row?.approver_flags?.[2])
        },
        {
            header: 'Approver 3',
            accessor: 'mandatory_approver_3',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['3'] || row?.approver_flags?.[3])
        },
        {
            header: 'Approver 4',
            accessor: 'mandatory_approver_4',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['4'] || row?.approver_flags?.[4])
        },
        {
            header: 'Approver 5',
            accessor: 'mandatory_approver_5',
            render: (val, row) => getApproverName(val, row?.approver_flags?.['5'] || row?.approver_flags?.[5])
        },
        {
            header: 'Threshold Approver',
            accessor: 'threshold_approver',
            render: (val) => getApproverName(val)
        },
        {
            header: 'Amount Threshold',
            accessor: 'amount_threshold',
            render: (val) => val ? `$${val.toLocaleString()}` : <span className="text-gray-400">-</span>
        },
        {
            header: 'Posting Approver',
            accessor: 'posting_approver',
            render: (val) => getApproverName(val)
        },
        ...(!isCoder ? [{
            header: 'Actions',
            accessor: 'actions',
            render: (_, row) => (
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => openEdit(row)}
                        className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                        title="Edit"
                    >
                        <Pencil size={18} />
                    </button>
                    <button
                        onClick={() => handleDelete(row)}
                        className="text-[#ff4d4f] hover:text-[#d32f2f] transition-colors p-1"
                        title="Delete"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            )
        }] : [])
    ];

    const tabs = ['Vendor Based Workflow', 'Codification Based Workflow'];

    const renderTabContent = () => {
        const columns = activeTab === 'Vendor Based Workflow' ? vendorColumns : codificationColumns;
        const loading = activeTab === 'Vendor Based Workflow' ? vendorLoading : codificationLoading;
        const error = activeTab === 'Vendor Based Workflow' ? vendorError : codificationError;
        const data = filteredData; // filteredData already handles activeTab internally

        if (error) {
            return (
                <div className="absolute inset-0 z-10 bg-white flex items-center justify-center p-6 text-center">
                    <div className="flex flex-col items-center gap-4 max-w-md">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                            <AlertCircle className="text-red-500" size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">Failed to load workflows</h3>
                            <p className="text-sm text-gray-500 mt-1">{error}</p>
                        </div>
                        <button
                            onClick={() => activeTab === 'Vendor Based Workflow' ? fetchVendorWorkflows() : fetchCodificationWorkflows()}
                            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-all"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <DataTable
                columns={columns}
                data={data}
                loading={loading}
                skeletonRows={itemsPerPage}
                totalItems={data.length}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                maxHeight="calc(100vh - 280px)"
                stickyHeader={true}
                isClientSide={true}
                enableColumnFilters={true}
            />
        );
    };

    return (
        <div className="p-4 flex flex-col gap-4 w-full bg-gray-50 min-h-0 h-full">
            {/* Header Area */}
            {/* <div className="flex flex-col gap-1">
                <h1 className="text-[28px] font-extrabold text-[#333333]">Approval Workflow Settings</h1>
            </div> */}

            {/* Controls Row */}
            <div className="flex items-center gap-3">
                {/* Tabs */}
                <div className="flex bg-white border border-gray-200 rounded-[4px] overflow-hidden h-[36px]">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 h-full text-[14px] ${activeTab === tab ? 'font-bold' : 'font-medium'} transition-colors duration-150 whitespace-nowrap
                                ${index !== tabs.length - 1 ? 'border-r border-gray-200' : ''}
                                ${activeTab === tab
                                    ? 'bg-[#9AD4EF] text-[#333333]'
                                    : 'bg-white text-gray-400 hover:bg-gray-50'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex-1" />

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                        type="text"
                        placeholder="Search"
                        className="pl-9 pr-4 h-[36px] w-[220px] border border-gray-200 rounded-[4px] text-[13px] outline-none focus:border-[#24A1DD] transition-all bg-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Add Action */}
                {!isCoder && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={openAdd}
                            className="bg-[#24a0ed] hover:bg-[#1c8ad1] text-white px-4 py-0 h-[34px] rounded-[4px] flex items-center gap-1.5 text-[13px] font-medium transition-colors"
                        >
                            <Plus size={16} /> Add Rule
                        </button>
                        <button
                            onClick={() => activeTab === 'Vendor Based Workflow' ? fetchVendorWorkflows() : fetchCodificationWorkflows()}
                            className="bg-[#2b3345] hover:bg-[#1a2235] text-white px-4 py-0 h-[34px] rounded-[4px] flex items-center gap-1.5 text-[13px] font-medium transition-colors"
                        >
                            Refresh
                        </button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-lg shadow-sm w-full p-4 border border-gray-200">
                {renderTabContent()}
            </div>

            {/* Modals */}
            {modalState.open && (
                <RuleModal
                    open={modalState.open}
                    mode={activeTab === 'Vendor Based Workflow' ? 'vendor' : 'codification'}
                    editData={modalState.rowData}
                    onCancel={closeModal}
                    onSuccess={() => {
                        if (activeTab === 'Vendor Based Workflow') {
                            fetchVendorWorkflows();
                        } else {
                            fetchCodificationWorkflows();
                        }
                    }}
                />
            )}
        </div>
    );
};

export default SettingsPage;
