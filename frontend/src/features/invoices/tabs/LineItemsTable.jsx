import { useState } from "react";
import { DeleteOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, CaretUpOutlined, CaretDownOutlined } from "@ant-design/icons";
import ReusableDataTable from '../../../shared/components/ReusableDataTable' // adjust path

const LINE_TYPE_OPTIONS = ["Expense", "Revenue", "Asset", "Liability"];
const GL_CODE_OPTIONS = ["GL-001", "GL-002", "GL-003", "GL-004"];
const LOB_OPTIONS = ["LOB-A", "LOB-B", "LOB-C"];
const DEPARTMENT_OPTIONS = ["Finance", "Operations", "HR", "IT"];
const CUSTOMER_OPTIONS = ["Customer A", "Customer B", "Customer C"];
const ITEM_OPTIONS = ["Item 1", "Item 2", "Item 3"];

const defaultRow = () => ({
    id: Date.now(),
    description: "",
    lineType: "Expense",
    quantity: 0,
    unitPrice: 0,
    netAmount: 0,
    glCode: "",
    lob: "",
    department: "",
    customer: "",
    item: "",
});

/* ── Shared cell styles ── */
const inputCls =
    "w-full border border-gray-200 rounded px-2 py-1 text-[13px] text-gray-800 focus:outline-none focus:border-blue-400 bg-white";
const selectCls =
    "w-full border border-gray-200 rounded px-2 py-1 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 bg-white appearance-none cursor-pointer";

/* ── Editable cell renderers ── */
const TextCell = ({ value, onChange }) => (
    <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
    />
);

const NumberCell = ({ value, onChange, prefix }) => (
    <div className="flex items-center border border-gray-200 rounded overflow-hidden bg-white focus-within:border-blue-400">
        {prefix && (
            <span className="px-2 text-[13px] text-gray-500 border-r border-gray-200 bg-gray-50">
                {prefix}
            </span>
        )}
        <input
            type="number"
            className="w-full px-2 py-1 text-[13px] text-gray-800 focus:outline-none bg-transparent"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
    </div>
);

const SelectCell = ({ value, onChange, options }) => (
    <div className="relative">
        <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select</option>
            {options.map((o) => (
                <option key={o} value={o}>{o}</option>
            ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
    </div>
);

const LineItemsTable = () => {
    const [rows, setRows] = useState([
        { id: 1, description: "Innova - 56 trip", lineType: "Expense", quantity: 0, unitPrice: 0, netAmount: 0, glCode: "", lob: "", department: "", customer: "", item: "" },
        { id: 2, description: "Small car - (11am&12", lineType: "Expense", quantity: 0, unitPrice: 0, netAmount: 0, glCode: "", lob: "", department: "", customer: "", item: "" },
        { id: 3, description: "Extra kmtr - 999*13", lineType: "Expense", quantity: 0, unitPrice: 0, netAmount: 0, glCode: "", lob: "", department: "", customer: "", item: "" },
        { id: 4, description: "INNOVA-4TRIP", lineType: "Expense", quantity: 0, unitPrice: 0, netAmount: 0, glCode: "", lob: "", department: "", customer: "", item: "" },
        { id: 5, description: "SMALLCAR-1TRIP", lineType: "Expense", quantity: 0, unitPrice: 0, netAmount: 0, glCode: "", lob: "", department: "", customer: "", item: "" },
        { id: 6, description: "Total GST (Ineligible)", lineType: "Expense", quantity: 1, unitPrice: 31, netAmount: 31, glCode: "", lob: "", department: "", customer: "", item: "" },
    ]);

    const [selectedRows, setSelectedRows] = useState(new Set(rows.map((r) => r.id)));
    const [allChecked, setAllChecked] = useState(true);

    const updateRow = (id, field, value) => {
        setRows((prev) =>
            prev.map((row) => {
                if (row.id !== id) return row;
                const updated = { ...row, [field]: value };
                if (field === "quantity" || field === "unitPrice") {
                    updated.netAmount = updated.quantity * updated.unitPrice;
                }
                return updated;
            })
        );
    };

    const toggleRow = (id) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (allChecked) {
            setSelectedRows(new Set());
            setAllChecked(false);
        } else {
            setSelectedRows(new Set(rows.map((r) => r.id)));
            setAllChecked(true);
        }
    };

    const addRow = () => {
        const newRow = defaultRow();
        setRows((prev) => [...prev, newRow]);
        setSelectedRows((prev) => new Set([...prev, newRow.id]));
    };

    const deleteRow = (id) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setSelectedRows((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const AutocompleteCell = ({ value, onChange, options }) => {
        const [input, setInput] = useState(value);
        const [open, setOpen] = useState(false);
        const filtered = options.filter(o => o.toLowerCase().includes(input.toLowerCase()));
        return (
            <div style={{ position: "relative" }}>
                <input className={inputCls} value={input}
                    onChange={e => { setInput(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
                {open && filtered.length > 0 && (
                    <div className="ac-dropdown">
                        {filtered.map(o => (
                            <div key={o} onMouseDown={() => { setInput(o); onChange(o); setOpen(false); }}>{o}</div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    /* ── Column definitions for ReusableDataTable ── */
    const columnDefs = [
        {
            field: "checkbox",
            headerName: "",
            width: 48,
            headerComponent: () => (
                <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
            ),
            cellRenderer: ({ data }) => (
                <input
                    type="checkbox"
                    checked={selectedRows.has(data.id)}
                    onChange={() => toggleRow(data.id)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
            ),
            sortable: false,
        },
        {
            field: "sno",
            headerName: "S.No",
            width: 64,
            cellRenderer: ({ data }) => {
                const index = rows.findIndex(r => r.id === data.id);
                return <span>{index + 1}</span>;
            },
            sortable: false,
        },
        {
            field: "description",
            headerName: "Description",
            flex: 1,
            minWidth: 180,
            cellRenderer: ({ data }) => (
                <TextCell
                    value={data.description}
                    onChange={(v) => updateRow(data.id, "description", v)}
                />
            ),
        },
        {
            field: "lineType",
            headerName: "Line Type",
            width: 160,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.lineType}
                    onChange={(v) => updateRow(data.id, "lineType", v)}
                    options={LINE_TYPE_OPTIONS}
                />
            ),
        },
        {
            field: "quantity",
            headerName: "Quantity",
            width: 110,
            cellRenderer: ({ data }) => (
                <NumberCell
                    value={data.quantity}
                    onChange={(v) => updateRow(data.id, "quantity", v)}
                />
            ),
        },
        {
            field: "unitPrice",
            headerName: "Unit Price",
            width: 130,
            cellRenderer: ({ data }) => (
                <NumberCell
                    value={data.unitPrice}
                    onChange={(v) => updateRow(data.id, "unitPrice", v)}
                    prefix="$"
                />
            ),
        },
        {
            field: "netAmount",
            headerName: "Net Amount",
            width: 130,
            cellRenderer: ({ data }) => (
                <NumberCell
                    value={data.netAmount}
                    onChange={(v) => updateRow(data.id, "netAmount", v)}
                    prefix="$"
                />
            ),
        },
        {
            field: "glCode",
            headerName: "GL Code",
            width: 130,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.glCode}
                    onChange={(v) => updateRow(data.id, "glCode", v)}
                    options={GL_CODE_OPTIONS}
                />
            ),
        },
        {
            field: "lob",
            headerName: "LOB",
            width: 120,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.lob}
                    onChange={(v) => updateRow(data.id, "lob", v)}
                    options={LOB_OPTIONS}
                />
            ),
        },
        {
            field: "department",
            headerName: "Department",
            width: 140,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.department}
                    onChange={(v) => updateRow(data.id, "department", v)}
                    options={DEPARTMENT_OPTIONS}
                />
            ),
        },
        {
            field: "customer",
            headerName: "Customer",
            width: 140,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.customer}
                    onChange={(v) => updateRow(data.id, "customer", v)}
                    options={CUSTOMER_OPTIONS}
                />
            ),
        },
        {
            field: "item",
            headerName: "Item",
            width: 130,
            cellRenderer: ({ data }) => (
                <SelectCell
                    value={data.item}
                    onChange={(v) => updateRow(data.id, "item", v)}
                    options={ITEM_OPTIONS}
                />
            ),
        },
        {
            field: "action",
            headerName: "Action",
            width: 80,
            sortable: false,
            cellRenderer: ({ data }) => (
                <button
                    onClick={() => deleteRow(data.id)}
                    className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                >
                    <DeleteOutlined style={{ fontSize: 15 }} />
                </button>
            ),
        },
    ];

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">

            {/* ── Section header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2 text-[14px] font-medium text-gray-700 cursor-pointer">
                    <CaretUpOutlined className="text-gray-500 text-[11px]" />
                    Line Items
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors">
                        <DownloadOutlined style={{ fontSize: 13 }} />
                        Export to Excel
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors">
                        <UploadOutlined style={{ fontSize: 13 }} />
                        Import from Excel
                    </button>
                </div>
            </div>

            {/* ── Table ── */}
            <ReusableDataTable
                columnDefs={columnDefs}
                data={rows}
                searchText=""
                tableHeader={false}
                tableSearch={false}
                defaultPageSize={50}
                shouldUseFlex={false}
            />

            {/* ── Add Line Item footer ── */}
            <div
                onClick={addRow}
                className="flex items-center justify-center gap-2 py-3 border-t border-gray-200 text-[13px] text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
            >
                <PlusOutlined style={{ fontSize: 13 }} />
                Add Line Item
            </div>
        </div>
    );
};

export default LineItemsTable;