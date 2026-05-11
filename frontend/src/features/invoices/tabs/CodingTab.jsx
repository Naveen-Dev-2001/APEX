import { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import {
    PlusOutlined,
    DownloadOutlined,
    UploadOutlined,
    CaretUpOutlined,
    DeleteOutlined
} from "@ant-design/icons";
// import { Trash2 } from "lucide-react";
import { Modal } from "antd";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useAuthStore } from "../../../store/authStore";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import QuickViewTab from "./QuickViewTab";

import CustomInput from "../../../shared/components/CustomInput";
import CustomDropdown from "../../../shared/components/CustomDropdown";
import AlertModal from "../../../shared/components/AlertModal";
import {
    useRemoteMasterData
} from "../../hooks/useRemoteMasterData";
import { fetchCodingSuggestions } from "../../../api/invoiceApi";
import { useWorkflowDataSync } from "../../hooks/useWorkflow";
import { useQueryClient } from "@tanstack/react-query";

const LINE_TYPE_OPTIONS = [
    { label: "Expense", value: "Expense" },
    { label: "Liability", value: "Liability" },
    { label: "Asset", value: "Asset" },
];

// ─────────────────────────────────────────────────────────────────────────────
// EditableCell — local state with debounced propagation.
// Only syncs from outside when user is NOT actively typing.
// ─────────────────────────────────────────────────────────────────────────────
const EditableCell = memo(({ value, onChange, placeholder, type = "text", disabled = false }) => {
    const [local, setLocal] = useState(value ?? "");
    const debounceRef = useRef(null);
    const isEditingRef = useRef(false);

    useEffect(() => {
        if (!isEditingRef.current) {
            setLocal(value ?? "");
        }
    }, [value]);

    const handleChange = (e) => {
        const v = e.target.value;
        isEditingRef.current = true;
        setLocal(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            isEditingRef.current = false;
            onChange(v);
        }, 300);
    };

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    return (
        <CustomInput
            value={local}
            title={local}
            onChange={handleChange}
            placeholder={placeholder}
            className="mb-0 w-full"
            height="32px"
            type={type}
            disabled={disabled}
        />
    );
},
    (prev, next) =>
        prev.value === next.value &&
        prev.type === next.type &&
        prev.placeholder === next.placeholder &&
        prev.disabled === next.disabled &&
        prev.onChange === next.onChange
);

const DropdownCell = memo(({ value, onChange, options, isLoading, filterOption, onSearch, onOpen, disabled = false }) => (
    <div style={{ width: "100%" }} title={value}>
        <CustomDropdown
            value={value}
            onChange={onChange}
            options={options}
            loading={isLoading}
            disabled={disabled}
            className="mb-0"
            showSearch
            onSearch={onSearch}
            onDropdownVisibleChange={onOpen}
            filterOption={onSearch ? false : filterOption} // Disable local filter if remote searching
            placeholder="Select"
            size="small"
            style={{ width: "100%", height: "32px", fontSize: "13px", display: "block" }}
            popupMatchSelectWidth={false}
        />
    </div>
),
    (prev, next) =>
        prev.value === next.value &&
        prev.isLoading === next.isLoading &&
        prev.options === next.options &&
        prev.onSearch === next.onSearch &&
        prev.onOpen === next.onOpen &&
        prev.onChange === next.onChange
);

EditableCell.displayName = "EditableCell";
DropdownCell.displayName = "DropdownCell";

// ─────────────────────────────────────────────────────────────────────────────
// Custom Checkbox — polished UI with checkmark + indeterminate state
// ─────────────────────────────────────────────────────────────────────────────
const Checkbox = memo(({ checked, indeterminate, onChange, title, disabled = false }) => {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) ref.current.indeterminate = !!indeterminate;
    }, [indeterminate]);

    return (
        <label
            title={title}
            className="inline-flex items-center justify-center cursor-pointer select-none"
            style={{ width: 18, height: 18 }}
        >
            <input
                ref={ref}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className="sr-only"
                disabled={disabled}
            />
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: checked || indeterminate ? "2px solid #2F5D7C" : "2px solid #cbd5e1",
                    background: checked || indeterminate ? "#2F5D7C" : "#ffffff",
                    transition: "border-color 0.15s ease, background 0.15s ease",
                    flexShrink: 0,
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                }}
            >
                {indeterminate && !checked ? (
                    <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
                        <rect width="8" height="2" rx="1" fill="white" />
                    </svg>
                ) : checked ? (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path
                            d="M1 3.5L3.5 6L8 1"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                ) : null}
            </span>
        </label>
    );
});
Checkbox.displayName = "Checkbox";

// ─────────────────────────────────────────────────────────────────────────────
// applyCalculation — unchanged from original
// ─────────────────────────────────────────────────────────────────────────────
const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const applyCalculation = (item, key, value) => {
    let updated = { ...item, [key]: value };
    if (key === "netAmount") {
        updated.isNetAmountOverridden = true;
        updated.netAmount = roundTo2(parseFloat(value) || 0);
    } else if (["qty", "unitPrice", "discount"].includes(key)) {
        updated.isNetAmountOverridden = false;
        const qty = parseFloat(updated.qty) || 0;
        const price = parseFloat(updated.unitPrice) || 0;
        const discount = parseFloat(updated.discount) || 0;
        updated.netAmount = roundTo2(qty * price - discount);
    }
    return updated;
};

const CodingTab = ({ isActive = false }) => {
    const { lineItems, setLineItems, viewInvoiceId, selectedVendorId, activeInvoiceData, entityMaster } = useInvoiceStore();
    const [modal, modalContextHolder] = Modal.useModal();
    const fileInputRef = useRef(null);

    const handleExportExcel = useCallback(() => {
        const dataToExport = (lineItems || [])
            .filter(item => !item.isSystemRow)
            .map((item, index) => ({
                "S.No": index + 1,
                "Description": item.description || "",
                "Qty": item.qty || 0,
                "Unit Price": item.unitPrice || 0,
                "Discount": item.discount || 0,
                "Net Amount": item.netAmount || 0,
                "Tax Amt": item.taxAmt || 0,
                "Line Type": item.lineType || "",
                "GL Code": item.glCode || "",
                "LOB": item.lob || "",
                "Department": item.department || "",
                "Customer": item.customer || "",
                "Item": item.item || "",
            }));

        if (dataToExport.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Line Items");
        XLSX.writeFile(workbook, `Invoice_Coding_${activeInvoiceData?.invoice_number || "LineItems"}_${dayjs().format("YYYYMMDD")}.xlsx`);
    }, [lineItems, activeInvoiceData]);

    const handleImportExcel = useCallback((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const newItems = json.map(row => ({
                id: Date.now() + Math.random(),
                description: row["Description"] || "",
                qty: parseFloat(row["Qty"]) || 0,
                unitPrice: parseFloat(row["Unit Price"]) || 0,
                discount: parseFloat(row["Discount"]) || 0,
                netAmount: parseFloat(row["Net Amount"]) || 0,
                taxAmt: parseFloat(row["Tax Amt"]) || 0,
                lineType: row["Line Type"] || "",
                glCode: row["GL Code"] || "",
                lob: row["LOB"] || "",
                department: row["Department"] || "",
                customer: row["Customer"] || "",
                item: row["Item"] || "",
                isSystemRow: false,
                isNetAmountOverridden: true
            }));

            setLineItems(prev => {
                const systemRows = prev.filter(r => r.isSystemRow);
                const regularRows = prev.filter(r => !r.isSystemRow);
                return [...regularRows, ...newItems, ...systemRows];
            });
        };
        reader.readAsArrayBuffer(file);
    }, [setLineItems]);

    const rows = lineItems;
    const queryClient = useQueryClient();

    const { user, activeRole } = useAuthStore();
    const userRole = (activeRole || user?.role || "").toLowerCase();

    const { workflowData } = useWorkflowDataSync(viewInvoiceId);

    const isViewOnly = useMemo(() => {
        if (activeInvoiceData?.is_archived) return true;
        const status = activeInvoiceData?.status?.toLowerCase();
        if (!status) return false;

        if (userRole === 'admin') return true;

        // ── Finance approver with editing enabled → allow editing ──
        const isMyEditingSession =
            activeInvoiceData?.is_editing_enabled === true &&
            activeInvoiceData?.editing_enabled_by?.toLowerCase() === user?.email?.toLowerCase();

        if (isMyEditingSession) return false; // unlock all fields

        if (userRole === 'scanner') {
            return status !== 'processed';
        }

        if (userRole === 'coder') {
            if (status === 'waiting_approval') return true;
            if (status === 'waiting_coding' || status === 'processed') return false;
            return true;
        }

        // Approvers always view-only UNLESS editing session active (handled above)
        if (userRole === 'approver') return true;

        const VIEW_ONLY_STATUSES = ["waiting_coding", "processed", "sage_posted"];
        return VIEW_ONLY_STATUSES.includes(status);
    }, [activeInvoiceData, userRole, user?.email]);

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [collapsed, setCollapsed] = useState(false);
    
    const [loadMasterData, setLoadMasterData] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    useEffect(() => {
        if (isActive && !loadMasterData) {
            setLoadMasterData(true);
        }
    }, [isActive, loadMasterData]);

    // ── Suggestions Logic ────────────────────────────────────────────────────
    // Check cache first (pre-seeded by useInvoicePreviewData parallel fetch).
    // Only fall back to a direct API call if cache is empty to avoid duplicate requests.
    useEffect(() => {
        if (!viewInvoiceId) return;

        const applySuggestions = async () => {
            try {
                // Try cache first — useInvoicePreviewData may have already fetched this
                const cached = queryClient.getQueryData(["coding-suggestions", viewInvoiceId, selectedVendorId]);
                const suggestions = cached ?? await fetchCodingSuggestions(viewInvoiceId, selectedVendorId);
                if (!suggestions?.length) return;

                // Build a map: normalised description → suggestion
                const suggestionMap = {};
                suggestions.forEach((s) => {
                    if (s.description) {
                        suggestionMap[s.description.trim().toLowerCase()] = s;
                    }
                });

                setLineItems(prev => prev.map((row, rowIndex) => {
                    if (row.glCode) return row; // skip already filled

                    const key = (row.description || "").trim().toLowerCase();

                    // 1) Try exact description match
                    let match = suggestionMap[key];

                    // 2) Positional fallback: use the suggestion at the same index
                    if (!match && rowIndex < suggestions.length) {
                        match = suggestions[rowIndex];
                    }

                    if (match) {
                        return {
                            ...row,
                            glCode: row.glCode || match.gl_code || "",
                            lob: row.lob || match.lob || "",
                            department: row.department || match.department || "",
                            customer: row.customer || match.customer || "",
                            item: row.item || match.item || "",
                            lineType: row.lineType || match.line_type || "Expense"
                        };
                    }
                    return row;
                }));
            } catch (err) {
                console.warn("[CodingTab] Failed to fetch suggestions:", err);
            }
        };

        applySuggestions();
    }, [viewInvoiceId, selectedVendorId, setLineItems, queryClient]);

    // FIX: only count non-system rows so GST/TDS rows don't break allSelected
    const selectableRows = useMemo(() => rows, [rows]);

    const allSelected = selectableRows.length > 0 && selectedIds.size === selectableRows.length;
    const someSelected = selectedIds.size > 0 && !allSelected;

    const toggleSelectAll = useCallback(() => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            // FIX: only select non-system rows
            setSelectedIds(new Set(selectableRows.map((r) => r.id)));
        }
    }, [allSelected, selectableRows]);

    const toggleSelectRow = useCallback((id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    useEffect(() => {
        const rowIds = new Set(rows.map((r) => r.id));
        setSelectedIds((prev) => {
            const next = new Set([...prev].filter((id) => rowIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [rows]);

    const initialGlValues = useMemo(
        () => Array.from(new Set((rows || []).map((r) => r.glCode).filter(Boolean))),
        [rows]
    );
    const initialLobValues = useMemo(
        () => Array.from(new Set((rows || []).map((r) => r.lob).filter(Boolean))),
        [rows]
    );
    const initialDepartmentValues = useMemo(
        () => Array.from(new Set((rows || []).map((r) => r.department).filter(Boolean))),
        [rows]
    );
    const initialCustomerValues = useMemo(
        () => Array.from(new Set((rows || []).map((r) => r.customer).filter(Boolean))),
        [rows]
    );
    const initialItemValues = useMemo(
        () => Array.from(new Set((rows || []).map((r) => r.item).filter(Boolean))),
        [rows]
    );

    // Remote Master Data Hooks
    const gl = useRemoteMasterData("GL", {
        mapOption: i => ({ label: `${i.account_number} - ${i.title}`, value: i.account_number }),
        enabled: loadMasterData,
        preload: true,
        initialValues: initialGlValues
    });
    const lob = useRemoteMasterData("LOB", {
        mapOption: i => ({ label: `${i.lob_id} - ${i.name}`, value: i.lob_id }),
        enabled: loadMasterData,
        preload: true,
        initialValues: initialLobValues
    });
    const dept = useRemoteMasterData("Department", {
        mapOption: i => ({ label: `${i.department_id} - ${i.department_name}`, value: i.department_id }),
        enabled: loadMasterData,
        preload: true,
        initialValues: initialDepartmentValues
    });
    const customer = useRemoteMasterData("Customer", {
        mapOption: i => ({ label: `${i.customer_id} - ${i.customer_name}`, value: i.customer_id }),
        enabled: loadMasterData,
        preload: true,
        initialValues: initialCustomerValues
    });
    const item = useRemoteMasterData("Item", {
        mapOption: i => ({ label: `${i.item_id} - ${i.name}`, value: i.item_id }),
        enabled: loadMasterData,
        preload: true,
        initialValues: initialItemValues
    });

    // selectedIds ref — avoids stale closure in handleUpdate
    const selectedIdsRef = useRef(selectedIds);
    useEffect(() => {
        selectedIdsRef.current = selectedIds;
    }, [selectedIds]);

    // ── handleUpdate — original logic, zero changes ───────────────────────────
    const handleUpdate = useCallback((id, key, value) => {
        const currentSelectedIds = selectedIdsRef.current;
        const isBulk = currentSelectedIds.has(id) && currentSelectedIds.size > 1;

        setLineItems(prev =>
            prev.map(item => {
                const isEditedRow = item.id === id;
                const isOtherSelectedRow = isBulk && currentSelectedIds.has(item.id);

                if (!isEditedRow && !isOtherSelectedRow) return item;

                return applyCalculation(item, key, value);
            })
        );
    }, [setLineItems]);

    // ── handleDelete ──────────────────────────────────────────────────────────
    const handleDelete = useCallback((id) => {
        setItemToDelete(id);
        setDeleteModalVisible(true);
    }, []);

    const confirmDelete = useCallback(() => {
        if (itemToDelete) {
            setLineItems(prev => prev.filter(item => item.id !== itemToDelete));
            setDeleteModalVisible(false);
            setItemToDelete(null);
        }
    }, [itemToDelete, setLineItems]);

    // ── handleAdd — original logic, zero changes ──────────────────────────────
    const handleAdd = useCallback(() => {
        const newItem = {
            id: Date.now(),
            description: "",
            qty: 0,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,
            isNetAmountOverridden: false,
            lineType: "",
            glCode: "",
            lob: "",
            department: "",
            customer: "",
            item: "",
        };
        setLineItems(prev => {
            const systemRows = prev.filter(r => r.isSystemRow);
            const normalRows = prev.filter(r => !r.isSystemRow);
            return [...normalRows, newItem, ...systemRows];
        });
    }, [setLineItems]);

    const filterOption = useCallback((input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase()), []);

    const stickyCheckbox = (bg = "#ffffff") => ({
        position: "sticky", left: 0, zIndex: 3, backgroundColor: bg, boxShadow: "none",
    });
    const stickySNo = (bg = "#ffffff") => ({
        position: "sticky", left: "44px", zIndex: 3, backgroundColor: bg,
        boxShadow: "2px 0 5px -1px rgba(0,0,0,0.10)",
    });

    return (
        <div className="flex flex-col gap-4">
            {modalContextHolder}
            <AlertModal
                isOpen={deleteModalVisible}
                onClose={() => setDeleteModalVisible(false)}
                onConfirm={confirmDelete}
                title="Delete Line Item?"
                message="Are you sure you want to delete this line item?"
                subMessage="This row will be removed from the invoice coding."
                confirmText="Delete Row"
                confirmBtnVariant="primary"
                type="info"
            />
            <QuickViewTab showOnlyHeader={true} />

            <div
                className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
                style={{ display: "flex", flexDirection: "column" }}
            >
                {/* ── Header bar ─────────────────────────────────────────── */}
                <div
                    className="flex items-center justify-between px-4 py-3 bg-[#f8fafc] flex-shrink-0 cursor-pointer select-none"
                    style={{ borderBottom: collapsed ? "none" : "1px solid #e5e7eb" }}
                    onClick={() => setCollapsed(c => !c)}
                >
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#2F5D7C]">
                        <CaretUpOutlined
                            className="text-[#2F5D7C] text-[11px]"
                            style={{
                                transition: "transform 0.2s ease",
                                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                                display: "inline-block",
                            }}
                        />
                        LINE ITEMS CODING
                        {selectedIds.size > 0 && !collapsed && (
                            <span className="ml-2 px-2 py-0.5 bg-[#2F5D7C]/10 text-[#2F5D7C] rounded-full text-[11px] font-medium">
                                {selectedIds.size} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={handleExportExcel}
                            className="flex items-center justify-center gap-1.5 w-[120px] py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors text-[12px] font-medium shadow-sm"
                        >
                            <DownloadOutlined style={{ fontSize: 12 }} /> Export
                        </button>
                        {userRole === "coder" && activeInvoiceData?.status?.toLowerCase() === "waiting_coding" && (
                            <>
                                <button
                                    onClick={() => fileInputRef.current.click()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors text-[12px] font-medium shadow-sm"
                                >
                                    <UploadOutlined style={{ fontSize: 12 }} /> Import from Excel
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".xlsx, .xls"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            handleImportExcel(e.target.files[0]);
                                            e.target.value = null;
                                        }
                                    }}
                                />
                            </>
                        )}
                    </div>

                </div>

                {/* ── Collapsible body: table + add button ────────────────── */}
                {!collapsed && (
                    <div style={{ display: "flex", flexDirection: "column" }}>

                        {/* ── Scrollable table: both horizontal & vertical ────────── */}
                        <div
                            style={{
                                overflowX: "auto",
                                overflowY: "auto",
                                maxHeight: "420px",
                                flex: 1,
                            }}
                        >
                            <table
                                className="border-collapse border-spacing-0"
                                style={{ width: "100%", minWidth: "max-content", tableLayout: "auto" }}
                            >
                                {/* Fixed column widths for standard fields, flexible for coding fields */}
                                <colgroup>
                                    <col style={{ width: 44 }} />    {/* checkbox */}
                                    <col style={{ width: 52 }} />    {/* S.No */}
                                    <col style={{ width: 220 }} />   {/* description */}
                                    <col style={{ width: 140 }} />   {/* line type */}
                                    <col style={{ width: 90 }} />    {/* qty */}
                                    <col style={{ width: 110 }} />   {/* unit price */}
                                    <col style={{ width: 120 }} />   {/* net amount */}
                                    <col />                          {/* GL code */}
                                    <col />                          {/* LOB */}
                                    <col />                          {/* department */}
                                    <col />                          {/* customer */}
                                    <col />                          {/* item */}
                                    <col style={{ width: 56 }} />    {/* action */}
                                </colgroup>

                                {/* Sticky thead stays visible on vertical scroll */}
                                <thead
                                    style={{ position: "sticky", top: 0, zIndex: 10 }}
                                    className="bg-[#2F5D7C] text-white"
                                >
                                    <tr>
                                        <th className="p-2 text-center text-[12px] font-medium" style={stickyCheckbox("#2F5D7C")}>
                                            <Checkbox
                                                checked={allSelected}
                                                indeterminate={someSelected}
                                                onChange={toggleSelectAll}
                                                title="Select all"
                                                disabled={isViewOnly}
                                            />
                                        </th>
                                        <th className="p-2 text-center text-[12px] font-medium border-r border-[#ffffff1a]" style={stickySNo("#2F5D7C")}>S.No</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]">Description</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]">Line Type</th>
                                        <th className="p-2 text-right text-[12px] font-medium border-r border-[#ffffff1a]">Qty</th>
                                        <th className="p-2 text-right text-[12px] font-medium border-r border-[#ffffff1a]">Unit Price</th>
                                        <th className="p-2 text-right text-[12px] font-medium border-r border-[#ffffff1a]">Net Amount</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]" style={{ minWidth: 280 }}>GL Code</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]" style={{ minWidth: 280 }}>LOB</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]" style={{ minWidth: 280 }}>Department</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]" style={{ minWidth: 280 }}>Customer</th>
                                        <th className="p-2 text-left text-[12px] font-medium border-r border-[#ffffff1a]" style={{ minWidth: 280 }}>Item</th>
                                        <th className="p-2 text-center text-[12px] font-medium">Action</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {lineItems.map((row, index) => {
                                        const isSelected = selectedIds.has(row.id);
                                        const isSystem = !!row.isSystemRow;
                                        const gstTaxLabel = entityMaster?.gst_applicable === true ? "Total GST" : "Total Tax";
                                        const rowLabel = row.type === "GST" ? gstTaxLabel : row.description;

                                        return (
                                            <tr
                                                key={row.id}
                                                className={`transition-colors group ${isSelected ? "bg-blue-50/60 hover:bg-blue-50/80" : "hover:bg-blue-50/30"}`}
                                            >
                                                {/* Checkbox hidden for system rows */}
                                                <td className="p-2 text-center border-r border-gray-100" style={stickyCheckbox(isSelected ? "#dbeafe" : "#ffffff")}>
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onChange={() => toggleSelectRow(row.id)}
                                                        disabled={isViewOnly}
                                                    />
                                                </td>
                                                <td className="p-2 text-center text-[13px] text-gray-500 border-r border-gray-100" style={stickySNo(isSelected ? "#dbeafe" : "#ffffff")}>
                                                    {index + 1}
                                                </td>

                                                <td className="p-2 border-r border-gray-100">
                                                    <EditableCell
                                                        disabled={isViewOnly || isSystem}
                                                        value={isSystem && row.type === "GST" ? rowLabel : row.description}
                                                        onChange={(v) => handleUpdate(row.id, "description", v)}
                                                        placeholder="Description"
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell disabled={isViewOnly} value={row.lineType} onChange={(v) => handleUpdate(row.id, "lineType", v)} options={LINE_TYPE_OPTIONS} filterOption={filterOption} />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <EditableCell disabled={isViewOnly} value={row.qty} onChange={(v) => handleUpdate(row.id, "qty", v)} type="number" />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <EditableCell disabled={isViewOnly} value={row.unitPrice} onChange={(v) => handleUpdate(row.id, "unitPrice", v)} type="number" />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <EditableCell disabled={isViewOnly} value={row.netAmount} onChange={(v) => handleUpdate(row.id, "netAmount", v)} type="number" />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell 
                                                        disabled={isViewOnly} 
                                                        value={row.glCode} 
                                                        onChange={(v) => handleUpdate(row.id, "glCode", v)} 
                                                        options={gl.options} 
                                                        isLoading={gl.loading} 
                                                        onSearch={gl.handleSearch} 
                                                        onOpen={gl.onDropdownOpen}
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell 
                                                        disabled={isViewOnly} 
                                                        value={row.lob} 
                                                        onChange={(v) => handleUpdate(row.id, "lob", v)} 
                                                        options={lob.options} 
                                                        isLoading={lob.loading} 
                                                        onSearch={lob.handleSearch} 
                                                        onOpen={lob.onDropdownOpen}
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell 
                                                        disabled={isViewOnly} 
                                                        value={row.department} 
                                                        onChange={(v) => handleUpdate(row.id, "department", v)} 
                                                        options={dept.options} 
                                                        isLoading={dept.loading} 
                                                        onSearch={dept.handleSearch} 
                                                        onOpen={dept.onDropdownOpen}
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell 
                                                        disabled={isViewOnly} 
                                                        value={row.customer} 
                                                        onChange={(v) => handleUpdate(row.id, "customer", v)} 
                                                        options={customer.options} 
                                                        isLoading={customer.loading} 
                                                        onSearch={customer.handleSearch} 
                                                        onOpen={customer.onDropdownOpen}
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-100">
                                                    <DropdownCell 
                                                        disabled={isViewOnly} 
                                                        value={row.item} 
                                                        onChange={(v) => handleUpdate(row.id, "item", v)} 
                                                        options={item.options} 
                                                        isLoading={item.loading} 
                                                        onSearch={item.handleSearch} 
                                                        onOpen={item.onDropdownOpen}
                                                    />
                                                </td>
                                                <td className="p-2 text-center" style={{ overflow: "visible" }}>
                                                    {!isViewOnly && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDelete(row.id);
                                                                }}
                                                                className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                title="Delete line item"
                                                                style={{ flexShrink: 0 }}
                                                            >
                                                                <DeleteOutlined style={{ fontSize: 18 }} />
                                                            </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Add row button — fixed footer, never scrolls horizontally ── */}
                        <div
                            className="flex-shrink-0 border-t border-gray-100 bg-white px-3 py-2"
                            style={{ position: "sticky", left: 0 }}
                        >
                            {!isViewOnly && (
                                <button
                                    onClick={handleAdd}
                                    className="flex items-center gap-1.5 text-[12px] font-medium text-[#2F5D7C] transition-all"
                                    style={{
                                        padding: "5px 12px",
                                        borderRadius: 6,
                                        border: "1.5px dashed #2F5D7C",
                                        background: "transparent",
                                        cursor: "pointer",
                                        letterSpacing: "0.01em",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "#f0f7ff"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                >
                                    <PlusOutlined style={{ fontSize: 11 }} />
                                    Add Line
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodingTab;
