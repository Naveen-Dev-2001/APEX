import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Tooltip } from 'antd';
import { Pencil, Trash2 } from 'lucide-react';
import ReusableDataTable from '../../shared/components/ReusableDataTable';
import CustomTabs from '../invoices/CustomTabs';
import CustomButton from '../../shared/components/CustomButton';
import RuleModal from './RuleModal';
import workflowAPI from '../../api/workflowAPI';
import toast from '../../utils/toast';
import { useSettingsStore } from '../../store/settings.store';
import { formatCurrency } from '../../utils/formatters';
import ExportButton from '../../shared/components/ExportButton';

const TABS = ['Vendor Based Workflow', 'Codification Based Workflow'];

// Helper: read approver_flags safely regardless of key type (number or string)
const getFinanceFlag = (data, index) =>
    data?.approver_flags?.[index] ?? data?.approver_flags?.[String(index)] ?? false;

const Settings = () => {
    const { activeSettingsTab, setActiveSettingsTab, addRule, setAddRule } = useSettingsStore();

    const [codificationData, setCodificationData] = useState([]);
    const [vendorData, setVendorData] = useState([]);
    const [loadingCodification, setLoadingCodification] = useState(false);
    const [loadingVendor, setLoadingVendor] = useState(false);
    const [editRecord, setEditRecord] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        fetchCodification();
        fetchVendor();
    }, []);

    const fetchCodification = async () => {
        try {
            setLoadingCodification(true);
            const response = await workflowAPI.getCodificationWorkflows();
            setCodificationData(response ?? []);
        } catch (error) {
            console.error("fetchCodification:", error);
            toast.error("Failed to load codification workflows");
        } finally {
            setLoadingCodification(false);
        }
    };

    const fetchVendor = async () => {
        try {
            setLoadingVendor(true);
            const response = await workflowAPI.getVendorWorkflows();
            setVendorData(response ?? []);
        } catch (error) {
            console.error("fetchVendor:", error);
            toast.error("Failed to load vendor workflows");
        } finally {
            setLoadingVendor(false);
        }
    };

    const handleEdit = (record) => {
        setEditRecord(record);
        setAddRule(true);
    };

    const handleDeleteConfirm = (record) => {
        setDeleteTarget(record);
    };

    const handleDeleteOk = async () => {
        if (!deleteTarget) return;
        try {
            setDeleteLoading(true);
            if (activeSettingsTab === 'Codification Based Workflow') {
                await workflowAPI.deleteCodificationWorkflow(deleteTarget.id);
                fetchCodification();
            } else {
                await workflowAPI.deleteVendorWorkflow(deleteTarget.id);
                fetchVendor();
            }
            toast.success("Workflow deleted successfully");
        } catch (error) {
            const detail = error?.response?.data?.detail;
            toast.error(typeof detail === "object" ? detail.message : detail ?? "Delete failed");
        } finally {
            setDeleteLoading(false);
            setDeleteTarget(null);
        }
    };

    const handleModalClose = () => {
        setAddRule(false);
        setEditRecord(null);
    };

    const handleSuccess = () => {
        if (activeSettingsTab === 'Codification Based Workflow') {
            fetchCodification();
        } else {
            fetchVendor();
        }
    };

    // ── Action cell renderer ──
    const ActionCell = useCallback(({ data }) => (
        <div className="flex items-center gap-3 h-full">
            <button
                onClick={() => handleEdit(data)}
                className="text-blue-500 hover:text-blue-700 transition-colors"
                title="Edit"
            >
                <Pencil size={15} />
            </button>
            <button
                onClick={() => handleDeleteConfirm(data)}
                className="text-red-400 hover:text-red-600 transition-colors"
                title="Delete"
            >
                <Trash2 size={15} />
            </button>
        </div>
    ), []);

    // ── Approver cell renderer ──
    const ApproverCell = ({ value, isFinance }) => {
        if (isFinance) {
            return (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200 whitespace-nowrap">
                    Finance Team
                </span>
            );
        }

        if (!value || value.length === 0) {
            return <span className="text-gray-300 text-xs">—</span>;
        }

        const displayName = value[0].split("@")[0];

        const tooltipContent = (
            <div className="flex flex-col gap-1 py-1">
                {value.map((email, i) => (
                    <span key={i} className="text-xs text-white">{email}</span>
                ))}
            </div>
        );

        return (
            <Tooltip title={tooltipContent} placement="top">
                <div className="flex items-center gap-1 cursor-default">
                    <span className="text-sm text-gray-700 truncate">{displayName}</span>
                    {value.length > 1 && (
                        <span className="text-[11px] text-blue-400 font-medium flex-shrink-0">
                            +{value.length - 1}
                        </span>
                    )}
                </div>
            </Tooltip>
        );
    };

    // ── Reusable approver column builder ──
    const makeApproverCol = (headerName, field, index) => ({
        headerName,
        field,
        width: 160,
        cellRenderer: ({ value, data }) => (
            <ApproverCell value={value} isFinance={getFinanceFlag(data, index)} />
        ),
        getFilterValue: (data) => {
            if (getFinanceFlag(data, index)) return "Finance Team";
            const val = data[field];
            if (!val || val.length === 0) return "";
            return Array.isArray(val) ? val.join(", ") : val;
        }
    });

    // ── Column defs — Codification ──
    const codificationColumns = [
        { headerName: "LOB", field: "lob", width: 100, cellStyle: { fontWeight: 500 } },
        { headerName: "Department", field: "department_id", width: 130 },
        {
            headerName: "Approvers",
            field: "approver_count",
            width: 100,
            cellRenderer: ({ value }) => (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {value}
                </span>
            ),
            getFilterValue: (data) => data.is_threshold_enabled ? "Yes" : "No"
        },
        makeApproverCol("Approver 1", "mandatory_approver_1", 1),
        makeApproverCol("Approver 2", "mandatory_approver_2", 2),
        makeApproverCol("Approver 3", "mandatory_approver_3", 3),
        makeApproverCol("Approver 4", "mandatory_approver_4", 4),
        makeApproverCol("Approver 5", "mandatory_approver_5", 5),
        {
            headerName: "Threshold",
            field: "is_threshold_enabled",
            width: 100,
            cellRenderer: ({ value }) => (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${value
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-gray-100 text-gray-400"
                    }`}>
                    {value ? "Yes" : "No"}
                </span>
            ),
            getFilterValue: (data) => data.is_threshold_enabled ? "Yes" : "No"
        },
        {
            headerName: "Threshold Amount",
            field: "amount_threshold",
            width: 150,
            cellRenderer: ({ value }) =>
                value
                    ? <span className="text-xs text-gray-700">{formatCurrency(value)}</span>
                    : <span className="text-gray-300 text-xs">—</span>,
        },
        {
            headerName: "Threshold Approver",
            field: "threshold_approver",
            width: 160,
            cellRenderer: ({ value }) => <ApproverCell value={value} isFinance={false} />,
            getFilterValue: (data) => Array.isArray(data.threshold_approver) ? data.threshold_approver.join(", ") : (data.threshold_approver || "")
        },
        {
            headerName: "Posting Approver",
            field: "posting_approver",
            width: 160,
            cellRenderer: ({ value }) =>
                value
                    ? <span className="text-xs text-gray-600 truncate" title={value}>{value.split("@")[0]}</span>
                    : <span className="text-gray-300 text-xs">—</span>,
        },
        {
            headerName: "Actions",
            field: "actions",
            width: 90,
            sortable: false,
            cellRenderer: ActionCell,
            pinned: "right",
        },
    ];

    // ── Column defs — Vendor ──
    const vendorColumns = [
        {
            headerName: "Vendor",
            field: "vendor_name",
            width: 200,
            cellStyle: { fontWeight: 500 },
            cellRenderer: ({ value, data }) => (
                <div className="flex flex-col justify-center leading-tight">
                    <span className="text-sm font-medium text-gray-800 truncate" title={value}>
                        {value || "—"}
                    </span>
                    {data?.vendor_id && (
                        <span className="text-xs text-gray-400 truncate" title={data.vendor_id}>
                            {data.vendor_id}
                        </span>
                    )}
                </div>
            ),
        },
        {
            headerName: "Approvers",
            field: "approver_count",
            width: 100,
            cellRenderer: ({ value }) => (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {value}
                </span>
            ),
            getFilterValue: (data) => data.is_threshold_enabled ? "Yes" : "No"
        },
        makeApproverCol("Approver 1", "mandatory_approver_1", 1),
        makeApproverCol("Approver 2", "mandatory_approver_2", 2),
        makeApproverCol("Approver 3", "mandatory_approver_3", 3),
        makeApproverCol("Approver 4", "mandatory_approver_4", 4),
        makeApproverCol("Approver 5", "mandatory_approver_5", 5),
        {
            headerName: "Threshold",
            field: "is_threshold_enabled",
            width: 100,
            cellRenderer: ({ value }) => (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${value
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-gray-100 text-gray-400"
                    }`}>
                    {value ? "Yes" : "No"}
                </span>
            ),
            getFilterValue: (data) => data.is_threshold_enabled ? "Yes" : "No"
        },
        {
            headerName: "Threshold Amount",
            field: "amount_threshold",
            width: 150,
            cellRenderer: ({ value }) =>
                value
                    ? <span className="text-xs text-gray-700">{formatCurrency(value)}</span>
                    : <span className="text-gray-300 text-xs">—</span>,
        },
        {
            headerName: "Threshold Approver",
            field: "threshold_approver",
            width: 160,
            cellRenderer: ({ value }) => <ApproverCell value={value} isFinance={false} />,
            getFilterValue: (data) => Array.isArray(data.threshold_approver) ? data.threshold_approver.join(", ") : (data.threshold_approver || "")
        },
        {
            headerName: "Posting Approver",
            field: "posting_approver",
            width: 160,
            cellRenderer: ({ value }) =>
                value
                    ? <span className="text-xs text-gray-600 truncate" title={value}>{value.split("@")[0]}</span>
                    : <span className="text-gray-300 text-xs">—</span>,
        },
        {
            headerName: "Actions",
            field: "actions",
            width: 90,
            sortable: false,
            cellRenderer: ActionCell,
            pinned: "right",
        },
    ];

    const isConfigTab = activeSettingsTab === 'Codification Based Workflow';

    return (
        <div className="h-screen flex flex-col bg-[#f8fafc] p-4">
            {/* HEADER */}
            <div className="bg-white rounded-md shadow-sm p-3 flex-shrink-0">
                <h1 className="text-2xl font-bold mb-3 custom-font-jura">
                    Approval Workflow Settings
                </h1>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-shrink-0">
                        <CustomTabs
                            tabs={TABS}
                            activeTab={activeSettingsTab}
                            onChange={setActiveSettingsTab}
                        />
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <div className="w-[140px]">
                            <CustomButton
                                className="w-full h-9 bg-blue-500 !text-white"
                                onClick={() => {
                                    setEditRecord(null);
                                    setAddRule(true);
                                }}
                            >
                                + Add Rule
                            </CustomButton>
                        </div>
                        <div className="w-[120px]">
                            <CustomButton
                                className="w-full h-9 border"
                                onClick={isConfigTab ? fetchCodification : fetchVendor}
                            >
                                Refresh
                            </CustomButton>
                        </div>
                        <div className="w-[120px]">
                            <ExportButton
                                data={activeSettingsTab === 'Vendor Based Workflow' ? vendorData : codificationData}
                                columns={activeSettingsTab === 'Vendor Based Workflow' ? vendorColumns : codificationColumns}
                                fileName={activeSettingsTab === 'Vendor Based Workflow' ? "vendor_workflows.xlsx" : "codification_workflows.xlsx"}
                                variant="outline"
                                className="w-full h-9"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* TAB BODY */}
            <div className="flex-1 bg-white rounded-md shadow-sm mt-3 overflow-hidden">
                <div className="h-full overflow-auto p-4">
                    {activeSettingsTab === 'Vendor Based Workflow' && (
                        <ReusableDataTable
                            title="Vendor Workflows"
                            columnDefs={vendorColumns}
                            data={vendorData}
                            loading={loadingVendor}
                            tableHeader={false}
                            rowHeight={52}
                        />
                    )}
                    {activeSettingsTab === 'Codification Based Workflow' && (
                        <ReusableDataTable
                            title="Codification Workflows"
                            columnDefs={codificationColumns}
                            data={codificationData}
                            loading={loadingCodification}
                            tableHeader={false}
                            rowHeight={52}
                        />
                    )}
                </div>
            </div>

            {/* Add / Edit Modal */}
            {addRule && (
                <RuleModal
                    open={addRule}
                    onCancel={handleModalClose}
                    mode={isConfigTab ? "codification" : "vendor"}
                    editData={editRecord}
                    onSuccess={handleSuccess}
                />
            )}

            {/* Delete Confirmation Modal */}
            <Modal
                open={!!deleteTarget}
                onCancel={() => setDeleteTarget(null)}
                onOk={handleDeleteOk}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true, loading: deleteLoading }}
                centered
                maskClosable={false}
                title={
                    <div className="flex items-center gap-2 text-red-500 p-3">
                        <Trash2 size={18} />
                        <span>Delete Workflow</span>
                    </div>
                }
            >
                <p className="text-gray-600 mt-2 mx-3">
                    Are you sure you want to delete this workflow?
                    {deleteTarget && (
                        <span className="block mt-1 text-sm text-gray-400">
                            {isConfigTab
                                ? `LOB: ${deleteTarget.lob} / Dept: ${deleteTarget.department_id}`
                                : `Vendor: ${deleteTarget.vendor_name}`}
                        </span>
                    )}
                </p>
                <p className="text-xs text-red-400 mt-3 mx-3">This action cannot be undone.</p>
            </Modal>
        </div>
    );
};

export default Settings;