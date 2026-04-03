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

    // ── Master Data Hooks ──
    const { data: glData, isLoading: glLoading } = useGLMasterSync();
    const { data: lobData, isLoading: lobLoading } = useLOBMasterSync();
    const { data: deptData, isLoading: deptLoading } = useDepartmentMasterSync();
    const { data: customerData, isLoading: customerLoading } = useCustomerMasterSync();
    const { data: itemData, isLoading: itemLoading } = useItemMasterSync();

    // ── Transform data for dropdowns (ID - Name) ──
    const glOptions = useMemo(() =>
        (glData || []).map(i => ({ label: `${i.account_number} - ${i.title}`, value: i.account_number })), [glData]);
    const lobOptions = useMemo(() =>
        (lobData || []).map(i => ({ label: `${i.lob_id} - ${i.name}`, value: i.lob_id })), [lobData]);
    const deptOptions = useMemo(() =>
        (deptData || []).map(i => ({ label: `${i.department_id} - ${i.department_name}`, value: i.department_id })), [deptData]);
    const customerOptions = useMemo(() =>
        (customerData || []).map(i => ({ label: `${i.customer_id} - ${i.customer_name}`, value: i.customer_id })), [customerData]);
    const itemOptions = useMemo(() =>
        (itemData || []).map(i => ({ label: `${i.item_id} - ${i.name}`, value: i.item_id })), [itemData]);

    const handleUpdate = useCallback((id, key, value) => {
        updateQuickViewLineItem(id, key, value);
    }, [updateQuickViewLineItem]);

    // Fuzzy search logic for dropdowns
    const filterOption = useCallback((input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase()), []);

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
                    <table className="w-full border-collapse border-spacing-0 min-w-[1400px]">
                        <thead className="bg-[#2F5D7C] text-white">
                            <tr>
                                <th className="p-2 text-center text-[12px] font-medium w-[50px] border-r border-[#ffffff1a]">S.No</th>
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
                            {rows.map((row, index) => (
                                <tr key={row.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="p-2 text-center text-[13px] text-gray-500 border-r border-gray-100">{index + 1}</td>
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
                            ))}
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