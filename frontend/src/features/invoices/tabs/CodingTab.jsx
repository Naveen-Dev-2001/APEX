import { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import {
    DeleteOutlined,
    PlusOutlined,
    DownloadOutlined,
    UploadOutlined,
    CaretUpOutlined
} from "@ant-design/icons";
import { useInvoiceStore } from "../../../store/invoice.store";
import QuickViewTab from "./QuickViewTab";
import CustomInput from "../../../shared/components/CustomInput";
import CustomDropdown from "../../../shared/components/CustomDropdown";
import {
    useGLMasterSync,
    useLOBMasterSync,
    useDepartmentMasterSync,
    useCustomerMasterSync,
    useItemMasterSync
} from "../../hooks/useMasterDataSync";

// ─────────────────────────────────────────────────────────────────────────────
// Line Type Options
// ─────────────────────────────────────────────────────────────────────────────
const LINE_TYPE_OPTIONS = [
    { label: "Expense", value: "Expense" },
    { label: "Liability", value: "Liability" },
    { label: "Asset", value: "Asset" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Isolated cell components for performance
// ─────────────────────────────────────────────────────────────────────────────
const EditableCell = memo(({ value, onChange, placeholder, type = "text" }) => {
    const [local, setLocal] = useState(value ?? "");
    const debounceRef = useRef(null);

    useEffect(() => { setLocal(value ?? ""); }, [value]);

    const handleChange = (e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onChange(v), 300);
    };

    return (
        <CustomInput
            value={local}
            onChange={handleChange}
            placeholder={placeholder}
            className="mb-0 w-full"
            height="32px"
            type={type}
        />
    );
});

const DropdownCell = memo(({ value, onChange, options, isLoading, filterOption }) => (
    <CustomDropdown
        value={value}
        onChange={onChange}
        options={options}
        loading={isLoading}
        className="mb-0 w-full"
        showSearch
        filterOption={filterOption}
        placeholder="Select"
        size="small"
        style={{ height: "32px", fontSize: "13px" }}
    />
));

EditableCell.displayName = "EditableCell";
DropdownCell.displayName = "DropdownCell";

// ─────────────────────────────────────────────────────────────────────────────
// Coding Tab Component
// ─────────────────────────────────────────────────────────────────────────────
const CodingTab = () => {
    const {
        quickViewLineItems: rows,
        updateQuickViewLineItem,
        deleteQuickViewLineItem,
        addQuickViewLineItem
    } = useInvoiceStore();

    useEffect(() => {
        console.log("rows", rows);
    }, [rows]);

    console.log("rows==============>", rows);


    // ── Selection state ──
    const [selectedIds, setSelectedIds] = useState(new Set());

    const allSelected = rows.length > 0 && selectedIds.size === rows.length;
    const someSelected = selectedIds.size > 0 && !allSelected;

    const toggleSelectAll = useCallback(() => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(rows.map((r) => r.id)));
        }
    }, [allSelected, rows]);

    const toggleSelectRow = useCallback((id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Clean up stale selected IDs when rows change (e.g. after delete)
    useEffect(() => {
        const rowIds = new Set(rows.map((r) => r.id));
        setSelectedIds((prev) => {
            const next = new Set([...prev].filter((id) => rowIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [rows]);

    // ── Master Data Hooks ──
    const { data: glData, isLoading: glLoading } = useGLMasterSync();
    const { data: lobData, isLoading: lobLoading } = useLOBMasterSync();
    const { data: deptData, isLoading: deptLoading } = useDepartmentMasterSync();
    const { data: customerData, isLoading: customerLoading } = useCustomerMasterSync();
    const { data: itemData, isLoading: itemLoading } = useItemMasterSync();

    // ── Transform data for dropdowns (ID - Name) ──
    const glOptions = useMemo(() =>
        (glData?.data || glData || []).map(i => ({ label: `${i.account_number} - ${i.title}`, value: i.account_number })), [glData]);
    const lobOptions = useMemo(() =>
        (lobData?.data || lobData || []).map(i => ({ label: `${i.lob_id} - ${i.name}`, value: i.lob_id })), [lobData]);
    const deptOptions = useMemo(() =>
        (deptData?.data || deptData || []).map(i => ({ label: `${i.department_id} - ${i.department_name}`, value: i.department_id })), [deptData]);
    const customerOptions = useMemo(() =>
        (customerData?.data || customerData || []).map(i => ({ label: `${i.customer_id} - ${i.customer_name}`, value: i.customer_id })), [customerData]);
    const itemOptions = useMemo(() =>
        (itemData?.data || itemData || []).map(i => ({ label: `${i.item_id} - ${i.name}`, value: i.item_id })), [itemData]);

    /**
     * handleUpdate — if the row being changed is selected AND there are other
     * selected rows, propagate the new value to all selected rows for that key.
     * If the row is NOT selected, just update that one row normally.
     */
    const handleUpdate = useCallback((id, key, value) => {
        // Always update the row that triggered the change
        updateQuickViewLineItem(id, key, value);

        // If this row is selected, bulk-update all OTHER selected rows for the same column
        if (selectedIds.has(id) && selectedIds.size > 1) {
            selectedIds.forEach((selectedId) => {
                if (selectedId !== id) {
                    updateQuickViewLineItem(selectedId, key, value);
                }
            });
        }
    }, [updateQuickViewLineItem, selectedIds]);

    // Fuzzy search logic for dropdowns
    const filterOption = useCallback((input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase()), []);

    // ── Sticky column style helpers ──
    // background must be explicit (never "inherit") so cells don't bleed through on scroll
    const stickyCheckbox = (bg = "#ffffff") => ({
        position: "sticky",
        left: 0,
        zIndex: 3,
        backgroundColor: bg,
        boxShadow: "none",
    });

    const stickySNo = (bg = "#ffffff") => ({
        position: "sticky",
        left: "44px",   // exact width of checkbox column
        zIndex: 3,
        backgroundColor: bg,
        // subtle right shadow to visually separate sticky area from scrolling columns
        boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)",
    });

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header Summary (Reused from QuickView) ── */}
            <QuickViewTab showOnlyHeader={true} />

            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                {/* ── Section header ── */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f8fafc]">
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#2F5D7C]">
                        <CaretUpOutlined className="text-[#2F5D7C] text-[11px]" />
                        LINE ITEMS CODING
                        {selectedIds.size > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-[#2F5D7C]/10 text-[#2F5D7C] rounded-full text-[11px] font-medium">
                                {selectedIds.size} selected
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors font-medium">
                            <DownloadOutlined style={{ fontSize: 12 }} />
                            Export
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors font-medium">
                            <UploadOutlined style={{ fontSize: 12 }} />
                            Import
                        </button>
                    </div>
                </div>

                {/* ── Table Container ── */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border-spacing-0 min-w-[1460px]">
                        <thead className="bg-[#2F5D7C] text-white">
                            <tr>
                                {/* ── Checkbox Header (sticky) ── */}
                                <th
                                    className="p-2 text-center text-[12px] font-medium w-[44px] border-none border-[#ffffff1a]"
                                    style={stickyCheckbox("#2F5D7C")}
                                >
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => {
                                            if (el) el.indeterminate = someSelected;
                                        }}
                                        onChange={toggleSelectAll}
                                        className="w-[14px] h-[14px] rounded cursor-pointer accent-white"
                                        title="Select all"
                                    />
                                </th>

                                {/* ── S.No Header (sticky) ── */}
                                <th
                                    className="p-2 text-center text-[12px] font-medium w-[50px] border-r border-[#ffffff1a]"
                                    style={stickySNo("#2F5D7C")}
                                >
                                    S.No
                                </th>

                                <th className="p-2 text-left text-[12px] font-medium min-w-[200px] border-r border-[#ffffff1a]">Description</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[130px] border-r border-[#ffffff1a]">Line Type</th>
                                <th className="p-2 text-right text-[12px] font-medium w-[80px] border-r border-[#ffffff1a]">Qty</th>
                                <th className="p-2 text-right text-[12px] font-medium w-[100px] border-r border-[#ffffff1a]">Unit Price</th>
                                <th className="p-2 text-right text-[12px] font-medium w-[110px] border-r border-[#ffffff1a]">Net Amount</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[150px] border-r border-[#ffffff1a]">GL Code</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[120px] border-r border-[#ffffff1a]">LOB</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[140px] border-r border-[#ffffff1a]">Department</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[140px] border-r border-[#ffffff1a]">Customer</th>
                                <th className="p-2 text-left text-[12px] font-medium w-[130px] border-r border-[#ffffff1a]">Item</th>
                                <th className="p-2 text-center text-[12px] font-medium w-[60px]">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map((row, index) => {
                                const isSelected = selectedIds.has(row.id);
                                return (
                                    <tr
                                        key={row.id}
                                        className={`transition-colors group ${isSelected
                                            ? "bg-blue-50/60 hover:bg-blue-50/80"
                                            : "hover:bg-blue-50/30"
                                            }`}
                                    >
                                        {/* ── Checkbox Cell (sticky) ── */}
                                        <td
                                            className="p-2 text-center border-r border-gray-100"
                                            style={stickyCheckbox(isSelected ? "#dbeafe" : "#ffffff")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectRow(row.id)}
                                                className="w-[14px] h-[14px] rounded cursor-pointer accent-[#2F5D7C]"
                                            />
                                        </td>

                                        {/* ── S.No Cell (sticky) ── */}
                                        <td
                                            className="p-2 text-center text-[13px] text-gray-500 border-r border-gray-100"
                                            style={stickySNo(isSelected ? "#dbeafe" : "#ffffff")}
                                        >
                                            {index + 1}
                                        </td>

                                        <td className="p-2 border-r border-gray-100">
                                            <EditableCell
                                                value={row.description}
                                                onChange={(v) => handleUpdate(row.id, "description", v)}
                                                placeholder="Description"
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.lineType}
                                                onChange={(v) => handleUpdate(row.id, "lineType", v)}
                                                options={LINE_TYPE_OPTIONS}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <EditableCell
                                                value={row.qty}
                                                onChange={(v) => handleUpdate(row.id, "qty", v)}
                                                type="number"
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <EditableCell
                                                value={row.unitPrice}
                                                onChange={(v) => handleUpdate(row.id, "unitPrice", v)}
                                                type="number"
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <EditableCell
                                                value={row.netAmount}
                                                onChange={(v) => handleUpdate(row.id, "netAmount", v)}
                                                type="number"
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.glCode}
                                                onChange={(v) => handleUpdate(row.id, "glCode", v)}
                                                options={glOptions}
                                                isLoading={glLoading}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.lob}
                                                onChange={(v) => handleUpdate(row.id, "lob", v)}
                                                options={lobOptions}
                                                isLoading={lobLoading}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.department}
                                                onChange={(v) => handleUpdate(row.id, "department", v)}
                                                options={deptOptions}
                                                isLoading={deptLoading}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.customer}
                                                onChange={(v) => handleUpdate(row.id, "customer", v)}
                                                options={customerOptions}
                                                isLoading={customerLoading}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-gray-100">
                                            <DropdownCell
                                                value={row.item}
                                                onChange={(v) => handleUpdate(row.id, "item", v)}
                                                options={itemOptions}
                                                isLoading={itemLoading}
                                                filterOption={filterOption}
                                            />
                                        </td>
                                        <td className="p-2 text-center group-hover:bg-red-50/50">
                                            <button
                                                onClick={() => deleteQuickViewLineItem(row.id)}
                                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                            >
                                                <DeleteOutlined style={{ fontSize: 13 }} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Add Line Item footer ── */}
                <button
                    onClick={addQuickViewLineItem}
                    className="w-full flex items-center justify-center gap-2 py-3 border-t border-gray-100 text-[13px] text-[#2F5D7C] hover:bg-[#f1f5f9] transition-all font-medium"
                >
                    <PlusOutlined style={{ fontSize: 13 }} />
                    ADD NEW CODING LINE
                </button>
            </div>
        </div>
    );
};

export default CodingTab;