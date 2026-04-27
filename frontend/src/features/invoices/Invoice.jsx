import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomInput from "../../shared/components/CustomInput";
import { SearchOutlined, CloseCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, DeleteOutlined, InboxOutlined, CloseOutlined } from "@ant-design/icons";
import Dropdown from "../../components/ui/Dropdown";
import CustomButton from "../../shared/components/CustomButton";
import DataTable from "../../components/ui/DataTable";
import { Skeleton } from "antd";
import { useInvoiceData } from "../hooks/useInvoiceData";
import { getCondensedColumns, getFullColumns, VIEW_OPTIONS } from "./invoiceColumns";
import { useInvoiceStore } from "../../store/invoice.store";
import { v4 as uuidv4 } from 'uuid';
import AddInvoiceModal from "./AddInvoiceModel";
import { deleteInvoice, uploadInvoices, fetchEntityMaster, getInvoiceFilterOptions, archiveInvoice, bulkDeleteInvoices, bulkArchiveInvoices } from "../../api/invoiceApi";
import { Modal, Popconfirm } from "antd";
import toast from "../../utils/toast";
import API from "../../api/api";
import ViewInvoicePage from "./ViewInvoicePage";
import { useVendorDetailSync } from "../hooks/useInvoiceDetailSync";
import ExportButton from "../../shared/components/ExportButton";
import { useAuthStore } from "../../store/authStore";
import ArchivedInvoicesTab from "./ArchivedInvoicesTab";
import { useLocation, useNavigate } from "react-router-dom";
import AlertModal from "../../shared/components/AlertModal";

const ACCESSOR_TO_DB_FIELD = {
    vendor_name: "vendor_name",
    vendor_id: "vendor_id",
    invoice_number: "invoice_number",
    uploaded_by: "uploaded_by",
    status: "status",
    total_amount: "total_amount",
    amount_due: "amount_due",
};

const Invoice = () => {
    const {
        invoiceSection, skip, limit, view, setView, setInvoiceSection,
        setIsModalOpen, isModalOpen, setFileName, setViewInvoiceId,
        selectedVendorId, setEntityMaster, setSearchQuery, searchQuery,
        sortColumn, sortDirection, setSort, setSkip, setLimit, entityMaster
    } = useInvoiceStore();

    const [localSearch, setLocalSearch] = useState(searchQuery);
    const [columnFilters, setColumnFilters] = useState({});
    const [pageTab, setPageTab] = useState("in_progress"); // in_progress | delete | posted_stage | archive
    const [archivedRecords, setArchivedRecords] = useState([]);
    const [openingInvoiceId, setOpeningInvoiceId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const openPreviewTimerRef = useRef(null);

    const location = useLocation();
    const navigate = useNavigate();

    const user = useAuthStore((state) => state.user);
    const userRole = user?.role?.toLowerCase();

    const backendFilters = useMemo(() => {
        const filters = {};
        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;

            if (value instanceof Set) {
                if (value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (typeof value === 'object' && value.op) {
                if (value.op === 'between') {
                    if (Array.isArray(value.val) && (value.val[0] || value.val[1])) {
                        filters[dbField] = { op: 'between', val: value.val };
                    }
                } else if (value.val !== "" && value.val !== undefined) {
                    filters[dbField] = { op: value.op, val: parseFloat(value.val) };
                }
            }
        });
        return filters;
    }, [columnFilters]);

    const { invoices, total, isLoading, refetch } = useInvoiceData({
        skip,
        limit,
        search: searchQuery,
        filters: backendFilters,
        sort_by: sortColumn,
        sort_dir: sortDirection,
        tab: (pageTab === "delete" || pageTab === "in_progress") ? undefined : pageTab
    });

    useEffect(() => {
        if (skip !== 0) setSkip(0);
        setSelectedInvoiceIds([]);
    }, [searchQuery, columnFilters, sortColumn, sortDirection, pageTab, limit]);

    useEffect(() => {
        setSelectedInvoiceIds([]);
    }, [skip]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) setSearchQuery(localSearch);
        }, 500);
        return () => clearTimeout(timer);
    }, [localSearch, searchQuery, setSearchQuery]);

    const [modal, modalContextHolder] = Modal.useModal();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    
    const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, data: null, loading: false });
    const [archiveModalState, setArchiveModalState] = useState({ isOpen: false, data: null, loading: false });

    useEffect(() => {
        fetchEntityMaster().then((res) => {
            const data = res.data || [];
            const selectedEntityId = sessionStorage.getItem('selected_entity');
            const selectedEntity = data.filter((item) => item.entity_id === selectedEntityId);
            setEntityMaster(selectedEntity?.[0] || {});
        }).catch((err) => console.error("Failed to fetch entity master", err));
    }, []);

    useEffect(() => {
        // Redundant refetch removed as useInvoiceData already watches pageTab
    }, [invoiceSection, pageTab]);

    const handleView = useCallback((data) => {
        const id = Number(data.id);
        if (!id) return;
        setOpeningInvoiceId(id);
        const { setInvoiceData, setFileName, setViewInvoiceId, setInvoiceSection, setInvoiceActiveTab, setIsPreviewLoading } = useInvoiceStore.getState();
        setIsPreviewLoading(true);
        setInvoiceSection(2);
        setViewInvoiceId(id);
        if (openPreviewTimerRef.current) clearTimeout(openPreviewTimerRef.current);
        openPreviewTimerRef.current = setTimeout(() => {
            try {
                setFileName(data.original_filename ?? "");
                setInvoiceData(data);
                const status = (data.status || "").toLowerCase();
                if (status === "processed") setInvoiceActiveTab("Quick View");
                else setInvoiceActiveTab("Coding");
            } finally {
                setIsPreviewLoading(false);
                setOpeningInvoiceId(null);
            }
        }, 0);
    }, []);

    useEffect(() => {
        if (location.state?.viewInvoice && handleView) {
            const { setNavigationOrigin } = useInvoiceStore.getState();
            if (location.state.from) setNavigationOrigin(location.state.from);
            handleView(location.state.viewInvoice);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state?.viewInvoice, handleView, navigate, location.pathname]);

    const handleDelete = useCallback((data) => {
        setDeleteModalState({ isOpen: true, data, loading: false });
    }, []);

    const confirmDelete = async () => {
        const { data } = deleteModalState;
        if (!data?.id) return;
        setDeleteModalState(prev => ({ ...prev, loading: true }));
        try {
            await deleteInvoice(data.id);
            toast.success("Invoice deleted successfully");
            refetch();
            setDeleteModalState({ isOpen: false, data: null, loading: false });
        } catch (err) {
            console.error("Delete invoice error:", err);
            toast.error("Failed to delete invoice");
            setDeleteModalState(prev => ({ ...prev, loading: false }));
        }
    };

    const handleArchive = useCallback((data) => {
        setArchiveModalState({ isOpen: true, data, loading: false });
    }, []);

    const confirmArchive = async () => {
        const { data } = archiveModalState;
        if (!data?.id) return;
        setArchiveModalState(prev => ({ ...prev, loading: true }));
        try {
            await archiveInvoice(data.id);
            toast.success("Invoice archived successfully");
            refetch();
            setArchiveModalState({ isOpen: false, data: null, loading: false });
        } catch (err) {
            console.error("Archive invoice error:", err);
            toast.error(err?.response?.data?.detail || "Failed to archive invoice");
            setArchiveModalState(prev => ({ ...prev, loading: false }));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedInvoiceIds.length === 0) return;
        setBulkActionLoading(true);
        try {
            const res = await bulkDeleteInvoices(selectedInvoiceIds);
            const successCount = res.success?.length || 0;
            const failedCount = res.failed?.length || 0;
            if (successCount > 0) toast.success(`Successfully deleted ${successCount} invoices`);
            if (failedCount > 0) toast.error(`Failed to delete ${failedCount} invoices`);
            setSelectedInvoiceIds([]);
            refetch();
        } catch (err) {
            console.error("Bulk delete error:", err);
            toast.error("Failed to perform bulk delete");
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleBulkArchive = async () => {
        if (selectedInvoiceIds.length === 0) return;
        setBulkActionLoading(true);
        try {
            const res = await bulkArchiveInvoices(selectedInvoiceIds);
            const successCount = res.success?.length || 0;
            const failedCount = res.failed?.length || 0;
            if (successCount > 0) toast.success(`Successfully archived ${successCount} invoices`);
            if (failedCount > 0) toast.error(`Failed to archive ${failedCount} invoices`);
            setSelectedInvoiceIds([]);
            refetch();
        } catch (err) {
            console.error("Bulk archive error:", err);
            toast.error("Failed to perform bulk archive");
        } finally {
            setBulkActionLoading(false);
        }
    };

    const columnDefs = useMemo(() => {
        const cols = view === "condensed"
            ? getCondensedColumns(handleView, handleDelete, handleArchive, userRole, openingInvoiceId, pageTab === "delete" || pageTab === "archive")
            : getFullColumns(handleView, handleDelete, handleArchive, userRole, openingInvoiceId, pageTab === "delete" || pageTab === "archive");

        return cols.map(col => ({
            ...col,
            onGetOptions: col.filterable ? async (accessor) => {
                const dbField = ACCESSOR_TO_DB_FIELD[accessor] || accessor;
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];
                return await getInvoiceFilterOptions(dbField, otherFilters, pageTab === "delete" ? undefined : pageTab);
            } : undefined
        }));
    }, [view, handleView, handleDelete, handleArchive, backendFilters, userRole, openingInvoiceId, pageTab]);

    const handleUpload = async (files) => {
        if (!files || files.length === 0) {
            toast.warning("Please select at least one file");
            return;
        }
        let eventSource = null;
        try {
            setUploadLoading(true);
            setUploadProgress(0);
            const taskId = uuidv4();
            const totalFiles = files.length;
            const formData = new FormData();
            files.forEach((f) => formData.append("files", f));
            const progressUrl = `${API.defaults.baseURL}/invoices/upload-progress/${taskId}`;
            eventSource = new EventSource(progressUrl);
            let completedFiles = 0;
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.progress !== undefined) {
                        if (data.progress >= 100) completedFiles += 1;
                        const processingRatio = (completedFiles + data.progress / 100) / totalFiles;
                        const mapped = 50 + Math.round(processingRatio * 49);
                        setUploadProgress(Math.min(mapped, 99));
                    }
                } catch (e) { console.warn("SSE parse error", e); }
            };
            const response = await uploadInvoices(formData, taskId, (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 50);
                    setUploadProgress(percent);
                }
            });
            setUploadProgress(100);
            toast.success(`${response?.data?.count ?? files.length} file(s) processed successfully!`);
            await refetch();
            if (files.length === 1 && response?.data?.invoices?.length > 0) handleView(response.data.invoices[0]);
            else setInvoiceSection(1);
            setIsModalOpen(false);
        } catch (error) {
            toast.error(error?.response?.data?.detail || "Upload failed");
            setUploadProgress(0);
        } finally {
            if (eventSource) eventSource.close();
            setUploadLoading(false);
            setTimeout(() => setUploadProgress(0), 400);
        }
    };

    return (
        <>
            {modalContextHolder}
            {invoiceSection === 1 && (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px", background: "#F7F7F7", borderBottom: "1px solid #E5E7EB", flexWrap: "wrap", gap: "12px" }}>
                        <div style={{ display: "flex", border: "1px solid #D9D9D9", borderRadius: "4px", overflow: "hidden", background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                            {[
                                { key: "in_progress", label: "In Progress" },
                                { key: "delete", label: "Delete" },
                                { key: "posted_stage", label: "Posted To Sage" },
                                { key: "archive", label: "Archive" },
                            ].map(({ key, label }, index, arr) => {
                                const isActive = pageTab === key;
                                return (
                                    <button key={key} onClick={() => setPageTab(key)} style={{ padding: "8px 24px", fontSize: 13, fontWeight: 500, color: isActive ? "#003A8C" : "#595959", background: isActive ? "#BAE7FF" : "#FFFFFF", border: "none", borderRight: index < arr.length - 1 ? "1px solid #D9D9D9" : "none", cursor: "pointer", transition: "all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)", outline: "none", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "120px" }} onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#FAFAFA"; }} onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#FFFFFF"; }}>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div style={{ width: 280 }}>
                                <CustomInput placeholder={pageTab === 'delete' ? "Search deleted..." : "Search invoices..."} value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} icon={<SearchOutlined />} rightIcon={localSearch && <CloseCircleOutlined />} onRightIconClick={() => setLocalSearch("")} className="mb-0" />
                            </div>
                            <div style={{ width: 200 }}>
                                <Dropdown options={VIEW_OPTIONS} placeholder="Select View" value={view} onChange={(val) => setView(val)} />
                            </div>
                            <div style={{ minWidth: 120 }}>
                                <ExportButton data={pageTab === 'delete' ? archivedRecords : invoices} columns={columnDefs} fileName={pageTab === 'delete' ? "Deleted_Invoices.xlsx" : `${pageTab.toUpperCase()}_Invoices.xlsx`} />
                            </div>
                            <div style={{ minWidth: 120 }}>
                                <CustomButton 
                                    variant="outline" 
                                    onClick={() => {
                                        if (pageTab === 'delete') {
                                            setRefreshKey(prev => prev + 1);
                                        } else {
                                            refetch();
                                        }
                                    }}
                                    className="!h-[42px] border-[#D9D9D9] !text-[#595959]"
                                >
                                    <ReloadOutlined /> Refresh
                                </CustomButton>
                            </div>
                            {userRole === 'scanner' && pageTab === 'in_progress' && (
                                <div style={{ minWidth: 160 }}>
                                    <CustomButton variant="primary" type="button" onClick={() => setIsModalOpen(true)}>Create Invoice</CustomButton>
                                </div>
                            )}
                        </div>
                    </div>

                    {pageTab !== "delete" ? (
                        <>
                            {selectedInvoiceIds.length > 0 && (
                                <div style={{ 
                                    position: "fixed",
                                    bottom: "40px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    zIndex: 1000,
                                    display: "flex", 
                                    alignItems: "center", 
                                    gap: "24px", 
                                    padding: "12px 28px", 
                                    background: "rgba(29, 113, 171, 0.95)", 
                                    backdropFilter: "blur(10px)",
                                    borderRadius: "100px",
                                    boxShadow: "0 12px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)",
                                    animation: "slideUp 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
                                    color: "white"
                                }}>
                                    <style>
                                        {`
                                            @keyframes slideUp {
                                                from { transform: translate(-50%, 100px); opacity: 0; }
                                                to { transform: translate(-50%, 0); opacity: 1; }
                                            }
                                        `}
                                    </style>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <div style={{ 
                                            background: "white", 
                                            color: "#1D71AB", 
                                            borderRadius: "50%", 
                                            width: "28px",
                                            height: "28px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "14px", 
                                            fontWeight: "bold",
                                        }}>
                                            {selectedInvoiceIds.length}
                                        </div>
                                        <span style={{ fontSize: "15px", fontWeight: 500, letterSpacing: "0.3px" }}>
                                            {selectedInvoiceIds.length === 1 ? "Invoice" : "Invoices"} Selected
                                        </span>
                                    </div>
                                    
                                    <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)" }} />

                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        {pageTab === 'in_progress' && ["scanner", "coder"].includes(userRole) && (
                                            <Popconfirm
                                                title="Delete Invoices"
                                                description={`Are you sure you want to delete ${selectedInvoiceIds.length} invoices?`}
                                                onConfirm={handleBulkDelete}
                                                okText="Delete"
                                                cancelText="Cancel"
                                                okButtonProps={{ danger: true, loading: bulkActionLoading }}
                                            >
                                                <button style={{ 
                                                    background: "#FF4D4F",
                                                    border: "none",
                                                    color: "white",
                                                    padding: "8px 20px",
                                                    borderRadius: "50px",
                                                    fontSize: "14px",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px",
                                                    transition: "all 0.2s"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                                                >
                                                    <DeleteOutlined /> Bulk Delete
                                                </button>
                                            </Popconfirm>
                                        )}
                                        {pageTab === 'posted_stage' && ["scanner", "coder"].includes(userRole) && (
                                            <Popconfirm
                                                title="Archive Invoices"
                                                description={`Are you sure you want to archive ${selectedInvoiceIds.length} invoices?`}
                                                onConfirm={handleBulkArchive}
                                                okText="Archive"
                                                cancelText="Cancel"
                                                okButtonProps={{ loading: bulkActionLoading }}
                                            >
                                                <button style={{ 
                                                    background: "#52C41A",
                                                    border: "none",
                                                    color: "white",
                                                    padding: "8px 20px",
                                                    borderRadius: "50px",
                                                    fontSize: "14px",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px",
                                                    transition: "all 0.2s"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                                                >
                                                    <InboxOutlined /> Bulk Archive
                                                </button>
                                            </Popconfirm>
                                        )}
                                        
                                        <button 
                                            onClick={() => setSelectedInvoiceIds([])}
                                            style={{ 
                                                background: "rgba(255,255,255,0.1)", 
                                                border: "1px solid rgba(255,255,255,0.2)", 
                                                color: "white", 
                                                cursor: "pointer", 
                                                padding: "8px 16px",
                                                borderRadius: "50px",
                                                fontSize: "14px",
                                                fontWeight: 500,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                transition: "all 0.2s"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                                            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                                        >
                                            <CloseOutlined style={{ fontSize: "12px" }} /> Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto w-full">
                                {isLoading ? <Skeleton height={400} borderRadius={16} /> : (
                                    <DataTable columns={columnDefs} data={invoices ?? []} loading={isLoading} totalItems={total} currentPage={(skip / limit) + 1} itemsPerPage={limit} onPageChange={(page) => setSkip((page - 1) * limit)} onItemsPerPageChange={(newLimit) => { setLimit(newLimit); setSkip(0); }} sortColumn={sortColumn} sortDirection={sortDirection} onSort={(col, dir) => setSort(col, dir)} maxHeight="calc(100vh - 250px)" stickyHeader={true} enableColumnFilters={true} onColumnFiltersChange={setColumnFilters} selectable={(pageTab === 'in_progress' || pageTab === 'posted_stage') && ["scanner", "coder"].includes(userRole)} selectedRows={selectedInvoiceIds} onSelectionChange={setSelectedInvoiceIds} />
                                )}
                            </div>
                        </>
                    ) : (
                        <ArchivedInvoicesTab key={`${entityMaster?.entity_id}-${refreshKey}`} onView={handleView} onDataChange={setArchivedRecords} externalSearch={searchQuery} userRole={userRole} view={view} />
                    )}

                    {(invoiceSection === 1 || isModalOpen) && pageTab === "in_progress" && (
                        <AddInvoiceModal open={isModalOpen} onCancel={() => { setIsModalOpen(false); setInvoiceSection(1); }} onUpload={handleUpload} uploadProgress={uploadProgress} confirmLoading={uploadLoading} />
                    )}
                </>
            )}
            {invoiceSection === 2 && <ViewInvoicePage />}
            <AlertModal isOpen={deleteModalState.isOpen} onClose={() => setDeleteModalState({ isOpen: false, data: null, loading: false })} onConfirm={confirmDelete} title="Delete Invoice?" message="Are you sure you want to delete this invoice?" confirmText="Delete Permanently" cancelText="Discard" type="danger" loading={deleteModalState.loading} confirmBtnVariant="primary" />
            <AlertModal isOpen={archiveModalState.isOpen} onClose={() => setArchiveModalState({ isOpen: false, data: null, loading: false })} onConfirm={confirmArchive} title="Archive Invoice?" message="Are you sure you want to archive this invoice?" confirmText="Archive" cancelText="Cancel" type="info" loading={archiveModalState.loading} confirmBtnVariant="primary" />
        </>
    );
};

export default Invoice;
