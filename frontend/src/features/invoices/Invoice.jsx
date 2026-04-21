import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomInput from "../../shared/components/CustomInput";
import { SearchOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import Dropdown from "../../components/ui/Dropdown";
import CustomButton from "../../shared/components/CustomButton";
import DataTable from "../../components/ui/DataTable";
import { Skeleton } from "antd";
// import DataTable from "../../components/ui/DataTable";
import { useInvoiceData } from "../hooks/useInvoiceData";
import { getCondensedColumns, getFullColumns, VIEW_OPTIONS } from "./invoiceColumns";
import { useInvoiceStore } from "../../store/invoice.store";
import { v4 as uuidv4 } from 'uuid';
import AddInvoiceModal from "./AddInvoiceModel";
import { deleteInvoice, uploadInvoices, fetchEntityMaster, getInvoiceFilterOptions } from "../../api/invoiceApi";
import { message, Modal } from "antd";
import API from "../../api/api";
import ViewInvoicePage from "./ViewInvoicePage";
import { useVendorDetailSync } from "../hooks/useInvoiceDetailSync";
import ExportButton from "../../shared/components/ExportButton";
import { useAuthStore } from "../../store/authStore";
import ArchivedInvoicesTab, { ARCHIVE_COLUMNS } from "./ArchivedInvoicesTab";
import { useLocation, useNavigate } from "react-router-dom";
import AlertModal from "../../shared/components/AlertModal";

const Invoice = () => {
    const {
        invoiceSection, skip, limit, view, setView, setInvoiceSection,
        setIsModalOpen, isModalOpen, setFileName, setViewInvoiceId,
        viewInvoiceId, quickViewFormData, setQuickViewFormData,
        selectedVendorId, setSelectedVendorId, setQuickViewLineItems,
        setEntityMaster, setActiveInvoiceData,
        searchQuery, setSearchQuery, sortColumn, sortDirection, setSort, setSkip, setLimit
    } = useInvoiceStore();

    const [localSearch, setLocalSearch] = useState(searchQuery);
    // const [pageTab, setPageTab] = useState("invoices"); // "invoices" | "archive"
    // const [archivedRecords, setArchivedRecords] = useState([]);

    // const user = useAuthStore((state) => state.user);
    // const userRole = user?.role?.toLowerCase();

    const [columnFilters, setColumnFilters] = useState({});
    const [pageTab, setPageTab] = useState("invoices"); // "invoices" | "archive"
    const [archivedRecords, setArchivedRecords] = useState([]);

    const location = useLocation();
    const navigate = useNavigate();

    const user = useAuthStore((state) => state.user);
    const userRole = user?.role?.toLowerCase();

    const accessorToDbField = {
        vendor_name: "vendor_name",
        vendor_id: "vendor_id",
        invoice_number: "invoice_number",
        uploaded_by: "uploaded_by",
        status: "status",
        total_amount: "total_amount",
        amount_due: "amount_due",
    };

    const backendFilters = useMemo(() => {
        const filters = {};
        Object.entries(columnFilters).forEach(([accessor, value]) => {
            if (!value) return;
            const dbField = accessorToDbField[accessor] || accessor;

            if (value instanceof Set) {
                if (value.size > 0) {
                    filters[dbField] = Array.from(value);
                }
            } else if (typeof value === 'object' && value.op) {
                if (value.op === 'between') {
                    // Date range filter: value.val is [from, to]
                    if (Array.isArray(value.val) && (value.val[0] || value.val[1])) {
                        filters[dbField] = {
                            op: 'between',
                            val: value.val
                        };
                    }
                } else if (value.val !== "" && value.val !== undefined) {
                    // Numeric condition filter
                    filters[dbField] = {
                        op: value.op,
                        val: parseFloat(value.val)
                    };
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
        sort_dir: sortDirection
    });

    // Reset pagination when search or filters change
    useEffect(() => {
        setSkip(0);
    }, [searchQuery, columnFilters, sortColumn, sortDirection, setSkip]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(localSearch);
        }, 500);
        return () => clearTimeout(timer);
    }, [localSearch, setSearchQuery]);

    const [messageApi, messageContextHolder] = message.useMessage();
    const [modal, modalContextHolder] = Modal.useModal();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const { isLoadingVendorDetail, vendor } = useVendorDetailSync(selectedVendorId);
    
    // AlertModal state for deletion
    const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, data: null, loading: false });

    useEffect(() => {
        fetchEntityMaster().then((res) => {
            const data = res.data || [];
            const selectedEntityId = sessionStorage.getItem('selected_entity');
            const selectedEntity = data.filter((item) => item.entity_id === selectedEntityId);
            setEntityMaster(selectedEntity?.[0] || {});
        }).catch((err) => {
            console.error("Failed to fetch entity master", err);
        });
    }, []);

    useEffect(() => {
        if (invoiceSection === 1) {
            refetch();
        }
    }, [invoiceSection]);

    const handleView = useCallback((data) => {
        const id = Number(data.id);
        if (!id) return;

        const { setInvoiceData, setFileName, setViewInvoiceId, setSelectedVendorId, setInvoiceSection, setInvoiceActiveTab } = useInvoiceStore.getState();

        setFileName(data.original_filename ?? "");
        setInvoiceData(data);
        setViewInvoiceId(id);
        setSelectedVendorId(data.vendor_id);

        const status = (data.status || "").toLowerCase();
        if (status === "processed") {
            setInvoiceActiveTab("Quick View");
        } else {
            setInvoiceActiveTab("Coding");
        }

        setInvoiceSection(2);
    }, []);


    useEffect(() => {
        if (location.state?.viewInvoice && handleView) {
            const { setNavigationOrigin } = useInvoiceStore.getState();
            if (location.state.from) {
                setNavigationOrigin(location.state.from);
            }
            handleView(location.state.viewInvoice);
            // Clear state so it doesn't reopen on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state?.viewInvoice, handleView, navigate, location.pathname]);

    const handleDelete = useCallback((data) => {
        console.log("handleDelete triggered for invoice:", data);
        setDeleteModalState({ isOpen: true, data, loading: false });
    }, []);

    const confirmDelete = async () => {
        const { data } = deleteModalState;
        if (!data?.id) return;
        
        setDeleteModalState(prev => ({ ...prev, loading: true }));
        try {
            await deleteInvoice(data.id);
            messageApi.success("Invoice deleted successfully");
            refetch();
            setDeleteModalState({ isOpen: false, data: null, loading: false });
        } catch (err) {
            console.error("Delete invoice error:", err);
            messageApi.error("Failed to delete invoice");
            setDeleteModalState(prev => ({ ...prev, loading: false }));
        }
    };

    const handleResetAll = useCallback(() => {
        setSearchQuery("");
        setLocalSearch("");
        setColumnFilters({});
        setSkip(0);
    }, [setSearchQuery, setSkip]);

    const hasColumnFilters = Object.values(columnFilters).some(s => s && s.size > 0);
    const isFilterApplied = (searchQuery && searchQuery.trim().length > 0) || hasColumnFilters;

    const columnDefs = useMemo(() => {
        const cols = view === "condensed"
            ? getCondensedColumns(handleView, handleDelete)
            : getFullColumns(handleView, handleDelete);

        return cols.map(col => ({
            ...col,
            onGetOptions: col.filterable ? async (accessor) => {
                const dbField = accessorToDbField[accessor] || accessor;

                // For hierarchical filtering: 
                // Exclude the current column's filter so the user can still see other options in that column
                const otherFilters = { ...backendFilters };
                delete otherFilters[dbField];

                return await getInvoiceFilterOptions(dbField, otherFilters);
            } : undefined
        }));
    }, [view, handleView, handleDelete, backendFilters, accessorToDbField]);

    const handleCreateInvoice = () => {
        setIsModalOpen(true);
    };

    const handleUpload = async (files) => {
        if (!files || files.length === 0) {
            messageApi.warning("Please select at least one file");
            return;
        }

        let eventSource = null;

        try {
            setUploadLoading(true);
            setUploadProgress(0);

            const taskId = uuidv4();
            const startTime = Date.now();
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
                } catch (e) {
                    console.warn("SSE parse error", e);
                }
            };

            eventSource.onerror = () => {
                console.warn("SSE connection error");
            };

            const response = await uploadInvoices(formData, taskId, (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 50);
                    setUploadProgress(percent);
                }
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            setUploadProgress(100);

            messageApi.success(
                `${response?.data?.count ?? files.length} file(s) processed successfully! (${duration}s)`
            );

            await refetch();
            await new Promise((res) => setTimeout(res, 700));

            if (files.length === 1 && response?.data?.invoices?.length > 0) {
                handleView(response.data.invoices[0]);
            } else {
                setInvoiceSection(1);
            }
            setIsModalOpen(false);

        } catch (error) {
            const err = error?.response?.data?.detail || "Upload failed";
            messageApi.error(err);
            setUploadProgress(0);
        } finally {
            if (eventSource) eventSource.close();
            setUploadLoading(false);
            setTimeout(() => setUploadProgress(0), 400);
        }
    };

    return (
        <>
            {messageContextHolder}
            {modalContextHolder}
            {invoiceSection === 1 && (
                <>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "16px 16px",
                            background: "#F7F7F7",
                            borderBottom: "1px solid #E5E7EB",
                            flexWrap: "wrap",
                            gap: "12px"
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                border: "1px solid #D9D9D9",
                                borderRadius: "4px",
                                overflow: "hidden",
                                background: "#FFFFFF",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                            }}
                        >
                            {[
                                { key: "invoices", label: "Invoices" },
                                { key: "archive", label: "Archive" },
                            ].map(({ key, label }, index, arr) => {
                                const isActive = pageTab === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setPageTab(key)}
                                        style={{
                                            padding: "8px 24px",
                                            fontSize: 13,
                                            fontWeight: 500,
                                            color: isActive ? "#003A8C" : "#595959",
                                            background: isActive ? "#BAE7FF" : "#FFFFFF",
                                            border: "none",
                                            borderRight: index < arr.length - 1 ? "1px solid #D9D9D9" : "none",
                                            cursor: "pointer",
                                            transition: "all 0.2s cubic-bezier(0.645, 0.045, 0.355, 1)",
                                            outline: "none",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            minWidth: "120px",
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) e.currentTarget.style.background = "#FAFAFA";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) e.currentTarget.style.background = "#FFFFFF";
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <div style={{ width: 280 }}>
                                <CustomInput
                                    placeholder={pageTab === 'archive' ? "Search archive..." : "Search invoices..."}
                                    value={localSearch}
                                    onChange={(e) => setLocalSearch(e.target.value)}
                                    icon={<SearchOutlined />}
                                    rightIcon={localSearch && <CloseCircleOutlined />}
                                    onRightIconClick={() => setLocalSearch("")}
                                    className="mb-0"
                                />
                            </div>
                            {pageTab === 'invoices' && (
                                <div style={{ width: 200 }}>
                                    <Dropdown
                                        options={VIEW_OPTIONS}
                                        placeholder="Select View"
                                        value={view}
                                        onChange={(val) => setView(val)}
                                    />
                                </div>
                            )}
                            <div style={{ minWidth: 120 }}>
                                <ExportButton
                                    data={pageTab === 'archive' ? archivedRecords : invoices}
                                    columns={pageTab === 'archive' ? ARCHIVE_COLUMNS : columnDefs}
                                    fileName={pageTab === 'archive' ? "Archived_Invoices.xlsx" : "Invoices.xlsx"}
                                />
                            </div>
                            {/* {isFilterApplied && pageTab === 'invoices' && (
                                <div style={{ minWidth: 100 }}>
                                    <CustomButton 
                                        variant="outline" 
                                        onClick={handleResetAll}
                                        style={{ height: '36px', fontSize: '12px' }}
                                    >
                                        Reset All
                                    </CustomButton>
                                </div>
                            )} */}
                            {userRole === 'scanner' && pageTab === 'invoices' && (
                                <div style={{ minWidth: 160 }}>
                                    <CustomButton variant="primary" type="button" onClick={handleCreateInvoice}>
                                        Create Invoice
                                    </CustomButton>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Invoices Tab ── */}
                    {pageTab === "invoices" && (
                        <>
                            <div className="overflow-x-auto w-full">
                                {isLoading ? (
                                    <Skeleton height={400} borderRadius={16} />
                                ) : (
                                    <DataTable
                                        columns={columnDefs}
                                        data={invoices ?? []}
                                        loading={isLoading}
                                        totalItems={total}
                                        currentPage={(skip / limit) + 1}
                                        itemsPerPage={limit}
                                        onPageChange={(page) => setSkip((page - 1) * limit)}
                                        onItemsPerPageChange={(newLimit) => {
                                            setLimit(newLimit);
                                            setSkip(0);
                                        }}
                                        sortColumn={sortColumn}
                                        sortDirection={sortDirection}
                                        onSort={(col, dir) => setSort(col, dir)}
                                        maxHeight="calc(100vh - 250px)"
                                        stickyHeader={true}
                                        enableColumnFilters={true}
                                        columnFilters={columnFilters}
                                        onColumnFiltersChange={setColumnFilters}
                                    />
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Archive Tab ── */}
                    {pageTab === "archive" && (
                        <ArchivedInvoicesTab
                            onView={handleView}
                            onDataChange={setArchivedRecords}
                            externalSearch={searchQuery}
                        />
                    )}

                    {/* ── Upload Modal (only in invoices tab) ── */}
                    {(invoiceSection === 1 || isModalOpen) && pageTab === "invoices" && (
                        <AddInvoiceModal
                            open={isModalOpen}
                            onCancel={() => {
                                setIsModalOpen(false);
                                setInvoiceSection(1);
                            }}
                            onUpload={handleUpload}
                            uploadProgress={uploadProgress}
                            confirmLoading={uploadLoading}
                        />
                    )}
                </>
            )}

            {invoiceSection === 2 && <ViewInvoicePage />}
            
            <AlertModal
                isOpen={deleteModalState.isOpen}
                onClose={() => setDeleteModalState({ isOpen: false, data: null, loading: false })}
                onConfirm={confirmDelete}
                title="Delete Invoice?"
                message="Are you sure you want to delete this invoice?"
                confirmText="Delete Permanently"
                cancelText="Discard"
                type="danger"
                loading={deleteModalState.loading}
            />
        </>
    );
};

export default Invoice;

