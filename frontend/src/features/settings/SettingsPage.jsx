import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'antd';
import { Plus, Search, Pencil, Trash2, AlertCircle } from 'lucide-react';
import SearchInput from '../../shared/components/SearchInput';
import useWorkflowStore from '../../store/workflow.store';
import { useAuthStore } from '../../store/authStore';
import useToastStore from '../../store/useToastStore';
import toast from '../../utils/toast';
import DataTable from '../../components/ui/DataTable';
import VendorWorkflowModal from './VendorWorkflowModal';
import CodificationWorkflowModal from './CodificationWorkflowModal';
import RuleModal from './RuleModal';
import RefreshButton from '../../shared/components/RefreshButton';
import { formatCurrency } from '../../utils/formatters';
import ExportButton from '../../shared/components/ExportButton';
import { REQUIRED_FIELD } from '../../config/constants';
import { getERPSystem } from '../../utils/envHelper';
import useAdminStore from '../../store/useAdminStore';

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
    const isReadOnly = ['coder', 'scanner'].includes(activeRole?.toLowerCase());

    const { showConfirm } = useToastStore();
    const [modalState, setModalState] = useState({ open: false, mode: 'add', rowData: null });

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);

    // Sorting State
    const [sortConfig, setSortConfig] = useState({ key: 'vendor_id', direction: 'asc' });

    const handleSort = (key, direction) => {
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        setCurrentPage(1); // Reset page on tab change
        if (activeTab === 'Vendor Based Workflow') {
            fetchVendorWorkflows();
            fetchVendorMetadata();
            setSortConfig({ key: 'vendor_id', direction: 'asc' });
        } else if (activeTab === 'Codification Based Workflow') {
            fetchCodificationWorkflows();
            fetchCodificationMetadata();
            setSortConfig({ key: 'lob', direction: 'asc' });
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

    const getApproverText = useCallback((email, isFinance = false) => {
        if (isFinance) return "Finance Team";
        if (!email) return "";
        if (Array.isArray(email)) return email.join(", ");
        return email;
    }, []);

    const handleDelete = (row) => {
        showConfirm({
            message: 'Delete Workflow Rule?',
            subMessage: `Are you sure you want to delete the workflow rule for "${row.vendor_id ? row.vendor_id + ' - ' : ''}${row.vendor_name || row.lob + ' - ' + row.department_id}"?`,
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
            header: 'Vendor ID',
            accessor: 'vendor_id',
            sortable: true,
            filterable: true,
            render: (val) => (
                <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                    {val}
                </span>
            )
        },
        {
            header: 'Vendor Name',
            accessor: 'vendor_name',
            sortable: true,
            filterable: true,
            render: (val) => <span className="font-medium text-gray-700">{val}</span>
        },
        {
            header: 'Approvers',
            accessor: 'approver_count',
            sortable: true,
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
            sortable: true,
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
            getFilterValue: (row) => getApproverText(row.mandatory_approver_1, row?.approver_flags?.['1'] || row?.approver_flags?.[1]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['1'] || row?.approver_flags?.[1])
        },
        {
            header: 'Approver 2',
            accessor: 'mandatory_approver_2',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_2, row?.approver_flags?.['2'] || row?.approver_flags?.[2]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['2'] || row?.approver_flags?.[2])
        },
        {
            header: 'Approver 3',
            accessor: 'mandatory_approver_3',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_3, row?.approver_flags?.['3'] || row?.approver_flags?.[3]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['3'] || row?.approver_flags?.[3])
        },
        {
            header: 'Approver 4',
            accessor: 'mandatory_approver_4',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_4, row?.approver_flags?.['4'] || row?.approver_flags?.[4]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['4'] || row?.approver_flags?.[4])
        },
        {
            header: 'Approver 5',
            accessor: 'mandatory_approver_5',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_5, row?.approver_flags?.['5'] || row?.approver_flags?.[5]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['5'] || row?.approver_flags?.[5])
        },
        {
            header: 'Threshold Approver',
            accessor: 'threshold_approver',
            getFilterValue: (row) => getApproverText(row.threshold_approver),
            render: (val) => getApproverName(val)
        },
        {
            header: 'Amount Threshold',
            accessor: 'amount_threshold',
            sortable: true,
            render: (val) => formatCurrency(val)
        },
        // {
        //     header: 'Posting Approver',
        //     accessor: 'posting_approver',
        //     sortable: true,
        //     render: (val) => getApproverName(val)
        // },
        ...(!isReadOnly ? [{
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
            sortable: true,
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
            sortable: true,
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
            sortable: true,
            render: (val) => (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {val}
                </span>
            )
            // },
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
            getFilterValue: (row) => getApproverText(row.mandatory_approver_1, row?.approver_flags?.['1'] || row?.approver_flags?.[1]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['1'] || row?.approver_flags?.[1])
        },
        {
            header: 'Approver 2',
            accessor: 'mandatory_approver_2',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_2, row?.approver_flags?.['2'] || row?.approver_flags?.[2]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['2'] || row?.approver_flags?.[2])
        },
        {
            header: 'Approver 3',
            accessor: 'mandatory_approver_3',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_3, row?.approver_flags?.['3'] || row?.approver_flags?.[3]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['3'] || row?.approver_flags?.[3])
        },
        {
            header: 'Approver 4',
            accessor: 'mandatory_approver_4',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_4, row?.approver_flags?.['4'] || row?.approver_flags?.[4]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['4'] || row?.approver_flags?.[4])
        },
        {
            header: 'Approver 5',
            accessor: 'mandatory_approver_5',
            getFilterValue: (row) => getApproverText(row.mandatory_approver_5, row?.approver_flags?.['5'] || row?.approver_flags?.[5]),
            render: (val, row) => getApproverName(val, row?.approver_flags?.['5'] || row?.approver_flags?.[5])
        },
        {
            header: 'Threshold Approver',
            accessor: 'threshold_approver',
            getFilterValue: (row) => getApproverText(row.threshold_approver),
            render: (val) => getApproverName(val)
        },
        {
            header: 'Amount Threshold',
            accessor: 'amount_threshold',
            sortable: true,
            render: (val) => formatCurrency(val)
        },
        // {
        //     header: 'Posting Approver',
        //     accessor: 'posting_approver',
        //     getFilterValue: (row) => getApproverText(row.posting_approver),
        //     render: (val) => getApproverName(val)
        // },
        ...(!isReadOnly ? [{
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
    ]
    const erpSystem = getERPSystem();
    const tabs = REQUIRED_FIELD[erpSystem]?.["Settings"] || [];

    // Ensure activeTab is valid
    useEffect(() => {
        if (tabs.length > 0 && !tabs.includes(activeTab)) {
            setActiveTab(tabs[0]);
        }
    }, [activeTab, tabs, setActiveTab]);

    const renderTabContent = () => {
        const columns = activeTab === 'Vendor Based Workflow' ? vendorColumns : codificationColumns;
        const loading = activeTab === 'Vendor Based Workflow' ? vendorLoading : codificationLoading;
        const error = activeTab === 'Vendor Based Workflow' ? vendorError : codificationError;

        let data = [...filteredData]; // Create a copy for sorting

        // Apply Sorting
        if (sortConfig.key) {
            const col = columns.find(c => c.accessor === sortConfig.key);
            data.sort((a, b) => {
                let aVal = col?.getFilterValue ? col.getFilterValue(a) : a[sortConfig.key];
                let bVal = col?.getFilterValue ? col.getFilterValue(b) : b[sortConfig.key];

                // Handle nulls
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                // String comparison
                if (typeof aVal === 'string') {
                    return sortConfig.direction === 'asc'
                        ? aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
                        : bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
                }

                // Number comparison
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }

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

        if (activeTab === 'Reminder Settings') {
            return <ReminderSettingsForm />;
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
                sortColumn={sortConfig.key}
                sortDirection={sortConfig.direction}
                onSort={handleSort}
                maxHeight="calc(100vh - 320px)"
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
                            className={`px-4 h-full text-[13px] ${activeTab === tab ? 'font-bold' : 'font-medium'} transition-colors duration-150 whitespace-nowrap
                                ${index !== tabs.length - 1 ? 'border-r border-gray-200' : ''}
                                ${activeTab === tab
                                    ? 'bg-[#BAE7FF] text-[#333333]'
                                    : 'bg-white text-gray-400 hover:bg-gray-50'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex-1" />

                {activeTab !== 'Reminder Settings' && (
                    <>
                        {/* Search */}
                        <SearchInput
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onClear={() => setSearchQuery('')}
                            width="220px"
                        />

                        {/* Add Rule Button */}
                        {!isReadOnly && (
                            <button
                                onClick={openAdd}
                                className="bg-[#24A1DD] hover:bg-[#1c8ad1] text-white px-4 h-[40px] min-w-[110px] rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors whitespace-nowrap"
                            >
                                <Plus size={16} className="flex-shrink-0" /> Add Rule
                            </button>
                        )}

                        {/* Refresh Button */}
                        <RefreshButton
                            onClick={() => activeTab === 'Vendor Based Workflow' ? fetchVendorWorkflows() : fetchCodificationWorkflows()}
                            loading={activeTab === 'Vendor Based Workflow' ? vendorLoading : codificationLoading}
                            height="h-[36px]"
                            className="!w-auto !min-w-[110px] !text-[13px] !font-medium"
                        />

                        <ExportButton
                            data={filteredData}
                            columns={activeTab === 'Vendor Based Workflow' ? vendorColumns : codificationColumns}
                            fileName={activeTab === 'Vendor Based Workflow' ? "vendor_workflows" : "codification_workflows"}
                            variant="primary"
                            className="!bg-[#24A1DD] hover:!bg-[#1c8ad1] !w-auto !min-w-[110px] h-[36px] !text-[13px] !font-medium"
                        />
                    </>
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

const ReminderSettingsForm = () => {
    const { reminderDays, updateReminderDays, fetchSettings, loading, isUpdating } = useAdminStore();
    const [inputValue, setInputValue] = useState(reminderDays);
    const { activeRole } = useAuthStore();
    const isReadOnly = ['coder', 'scanner'].includes(activeRole?.toLowerCase());

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        setInputValue(reminderDays);
    }, [reminderDays]);

    const handleSave = async () => {
        const days = parseFloat(inputValue);
        if (isNaN(days) || days <= 0) {
            toast.error("Please enter a valid number of days (greater than 0)");
            return;
        }
        const success = await updateReminderDays(days);
        if (success) {
            fetchSettings();
        }
    };

    return (
        <div className="max-w-xl mx-auto my-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Approval Reminder Configuration</h2>
            <p className="text-sm text-gray-505 mb-6">
                Configure the number of days after which an invoice pending approval triggers an email notification to the assigned approver.
            </p>
            <div className="space-y-4">
                <div className="flex flex-col gap-2">
                    <label htmlFor="reminderDaysInput" className="text-sm font-semibold text-gray-700">Reminder Days</label>
                    <input
                        id="reminderDaysInput"
                        type="number"
                        min="0.1"
                        step="0.1"
                        disabled={isReadOnly || loading || isUpdating}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#24A1DD] focus:border-transparent disabled:bg-gray-100 text-sm w-full max-w-[200px]"
                    />
                </div>
                {!isReadOnly && (
                    <button
                        onClick={handleSave}
                        disabled={loading || isUpdating}
                        className="bg-[#24A1DD] hover:bg-[#1c8ad1] text-white px-5 h-[38px] rounded-md flex items-center justify-center text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        {isUpdating ? "Saving..." : "Save Settings"}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SettingsPage;
