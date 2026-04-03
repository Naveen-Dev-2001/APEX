import { Collapse } from "antd";
import { QUICK_VIEW_CONFIG } from "../Fields";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useVendersListSync, useVendorDetailSync } from "../../hooks/useInvoiceDetailSync";
import { useCallback, useEffect, useMemo, useState, useRef, memo } from "react";
import { AutoComplete } from "antd";
import CustomInput from "../../../shared/components/CustomInput";
import CustomDatePicker from "../../../shared/components/CustomDatePicker";
import CustomDropdown from "../../../shared/components/CustomDropdown";
import InvoiceCalculationModal from "./InvoiceCalculationModal";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

// ─────────────────────────────────────────────────────────────────────────────
// Isolated field component — only re-renders when ITS value changes
// ─────────────────────────────────────────────────────────────────────────────
const FieldRenderer = memo(({ field, storeValue, onCommit, vendorOptions, filterVendors, onVendorSelect, onHover, onLeave, isDuplicate, duplicateMessage, forceDisabled = false }) => {
    // Local state → instant feedback
    const [localValue, setLocalValue] = useState(storeValue ?? "");
    const debounceRef = useRef(null);

    // Sync when the store pushes a new value from outside (e.g. vendor sync)
    useEffect(() => {
        setLocalValue(storeValue ?? "");
    }, [storeValue]);

    const handleChange = useCallback((value) => {
        setLocalValue(value);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onCommit(field.key, value), 300);
    }, [field.key, onCommit]);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const commonProps = {
        label: field.label,
        value: localValue,
        disabled: forceDisabled || !field.editable,
        onMouseEnter: () => onHover(field.key),
        onMouseLeave: onLeave,
    };

    const fieldContent = (() => {
        if (field.key === "vendorId" || field.key === "vendorName") {
            return (
                <AutoComplete
                    value={localValue}
                    options={vendorOptions}
                    style={{ width: "100%", height: "40px" }}
                    disabled={commonProps.disabled}
                    filterOption={filterVendors}
                    onSelect={(val, option) => {
                        const name = option.label.split(" - ")[1];
                        setLocalValue(field.key === "vendorId" ? val : name);
                        onVendorSelect(val, name);
                    }}
                    onSearch={(val) => handleChange(val)}
                    placeholder="Search Vendor"
                />
            );
        }

        switch (field.type) {
            case "input":
                return (
                    <CustomInput
                        {...commonProps}
                        label={null} // label will be handled by the outer wrapper for hover
                        onChange={(e) => handleChange(e.target.value)}
                        height="40px"
                    />
                );

            case "dropdown":
                return (
                    <CustomDropdown
                        {...commonProps}
                        label={null}
                        options={field.options || []}
                        style={{ width: "100%", borderRadius: "8px", height: "40px" }}
                        onChange={(val) => handleChange(val)}
                        filterOption={filterVendors}
                        placement="bottomLeft"
                    />
                );

            case "date":
                return (
                    <CustomDatePicker
                        {...commonProps}
                        label={null}
                        value={localValue}
                        onChange={(_date, dateString) => handleChange(dateString)}
                    />
                );

            default:
                return null;
        }
    })();

    return (
        <div
            onMouseEnter={commonProps.onMouseEnter}
            onMouseLeave={commonProps.onMouseLeave}
            className="w-full"
        >
            {field.label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                </label>
            )}
            {fieldContent}
            {field.key === "invoiceNumber" && isDuplicate && duplicateMessage && (
                <div className="text-red-500 text-xs mt-1 font-medium italic">
                    ⚠️ {duplicateMessage}
                </div>
            )}
        </div>
    );
});

FieldRenderer.displayName = "FieldRenderer";

// ─────────────────────────────────────────────────────────────────────────────
// Line-item cell — isolated so only the changed cell re-renders
// ─────────────────────────────────────────────────────────────────────────────
const LineItemCell = memo(({ value, disabled, rowId, colKey, onUpdate, onHover, onLeave }) => {
    const [local, setLocal] = useState(value ?? "");
    const debounceRef = useRef(null);

    useEffect(() => { setLocal(value ?? ""); }, [value]);

    const handleChange = useCallback((e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onUpdate(rowId, colKey, v), 300);
    }, [rowId, colKey, onUpdate]);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    return (
        <div
            onMouseEnter={() => onHover(rowId, colKey)}
            onMouseLeave={onLeave}
            className="w-full h-full min-h-[40px] flex items-center"
        >
            <CustomInput
                value={local}
                disabled={disabled}
                onChange={handleChange}
                className="mb-0 w-full"
            />
        </div>
    );
});

LineItemCell.displayName = "LineItemCell";

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const QuickViewTab = ({ isAllFields = false, showOnlyHeader = false }) => {
    const {
        quickViewFormData,
        setQuickViewField,
        quickViewLineItems,
        updateQuickViewLineItem,
        deleteQuickViewLineItem,
        selectedVendorId,
        batchUpdateQuickViewFields,   // new batch action (add to store — see store patch)
        setQuickViewFormData,
        setSelectedVendorId,
        setHighlightedField,
        addQuickViewLineItem,
        entityMaster,
        isDuplicate,
        duplicateMessage
    } = useInvoiceStore();

    const { vendorsList } = useVendersListSync();
    const { vendor } = useVendorDetailSync(selectedVendorId);
    const [showCalcModal, setShowCalcModal] = useState(false);

    // Vendor sync — write once via batch to avoid multiple re-renders
    useEffect(() => {
        if (!vendor || !selectedVendorId) return;

        const TERMS = ['NET 7', 'NET 8', 'NET 12', 'NET 15', 'NET 20', 'NET 30', 'NET 45', 'NET 60', 'NET 90'];

        const getDueDate = (invoiceDate, payTerms) => {
            if (!invoiceDate || !payTerms) return "";
            const days = parseInt(payTerms.match(/\d+/)?.[0] || 0, 10);
            return dayjs(invoiceDate).add(days, "day").format("YYYY-MM-DD");
        };

        // Use functional update on setQuickViewFormData (or batchUpdate if added)
        setQuickViewFormData((prev) => {
            const extracted = prev?.paymentTerms;
            return {
                ...prev,
                gstEligibility: vendor?.gst_eligibility ? "Eligible" : "Ineligible",
                tdsApplicability: vendor?.tds_applicability ? "Yes" : "No",
                tdsRate: vendor?.tds_percentage ?? "NA",
                tdsSection: vendor?.tds_section_code ?? "NA",
                lineGrouping: vendor?.line_grouping ? "Yes" : "No",
                paymentTerms: TERMS.includes(extracted) ? extracted : vendor?.pay_terms || "",
                dueDate: getDueDate(prev?.invoiceDate, vendor?.pay_terms),
                gst_eligibility: vendor?.gst_eligibility,
            };
        });
    }, [vendor, selectedVendorId, setQuickViewFormData]);

    const vendorOptions = useMemo(() => {
        if (!vendorsList?.length) return [];
        return vendorsList.map(v => ({
            value: v.vendor_id,
            label: `${v.vendor_id} - ${v.vendor_name}`,
        }));
    }, [vendorsList]);

    // Stable commit callback — doesn't change between renders
    const handleCommit = useCallback((key, value) => {
        setQuickViewField(key, value);
    }, [setQuickViewField]);

    const filterVendors = useCallback((input, option) =>
        option?.label?.toLowerCase().includes(input.toLowerCase()), []);

    const handleVendorSelect = useCallback((vendorId, vendorName) => {
        setQuickViewField("vendorId", vendorId);
        setQuickViewField("vendorName", vendorName);
        setSelectedVendorId(vendorId);
    }, [setQuickViewField, setSelectedVendorId]);

    const handleUpdateLineItem = useCallback((id, key, value) => {
        updateQuickViewLineItem(id, key, value);
    }, [updateQuickViewLineItem]);

    const handleDeleteLineItem = useCallback((id) => {
        deleteQuickViewLineItem(id);
    }, [deleteQuickViewLineItem]);

    const handleHoverField = useCallback((key) => {
        setHighlightedField(key);
    }, [setHighlightedField]);

    const handleHoverLineItem = useCallback((rowId, colKey) => {
        // Find index of the row by internal ID
        const index = quickViewLineItems.findIndex(item => item.id === rowId);
        if (index !== -1) {
            setHighlightedField(`LineItem_${index}_${colKey}`);
        }
    }, [quickViewLineItems, setHighlightedField]);

    const handleLeaveField = useCallback(() => {
        setHighlightedField(null);
    }, [setHighlightedField]);

    // Derived line-item values (memoized so table doesn't recompute on every field change)
    const { processedItems, gstTaxLabel, gstTaxValue, tdsDeductionValue, totalAmountPayable } = useMemo(() => {
        const isGstEligible = entityMaster?.gst_applicable === true;
        const gstTaxLabel = isGstEligible ? "Total GST" : "Total Tax";
        const gstTaxValue = parseFloat(quickViewFormData?.total_tax_amount || 0);
        console.log("..........", gstTaxValue);
        const tdsRate = parseFloat(quickViewFormData?.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(quickViewFormData?.total_invoice_amount || 0);
        const tdsDeductionValue = -Math.abs(tdsRate * totalInvoiceAmount);

        const regularItems = quickViewLineItems.filter(
            row => row.description !== "Total GST" && row.description !== "Total Tax"
        );
        const isLineGrouped = quickViewFormData?.lineGrouping === "Yes";

        const processedItems = isLineGrouped
            ? (regularItems.length
                ? [regularItems.reduce((acc, row) => ({
                    id: 1,
                    description: regularItems[0].description,
                    qty: (acc.qty || 0) + (Number(row.qty) || 0),
                    unitPrice: (acc.unitPrice || 0) + (Number(row.unitPrice) || 0),
                    discount: (acc.discount || 0) + (Number(row.discount) || 0),
                    netAmount: (acc.netAmount || 0) + (Number(row.netAmount) || 0),
                    taxAmt: (acc.taxAmt || 0) + (Number(row.taxAmt) || 0),
                }), {})]
                : [])
            : regularItems;

        const totalAmountPayable = processedItems.reduce(
            (sum, row) => sum + parseFloat(row.netAmount || 0), 0
        ) + gstTaxValue + tdsDeductionValue;

        return { processedItems, gstTaxLabel, gstTaxValue, tdsDeductionValue, totalAmountPayable };
    }, [quickViewLineItems, quickViewFormData?.total_tax_amount, quickViewFormData?.tdsRate,
        quickViewFormData?.total_invoice_amount, quickViewFormData?.lineGrouping, entityMaster]);

    return (
        <div className="p-2">
            {QUICK_VIEW_CONFIG
                .filter(section => (showOnlyHeader ? section.section === "Header" : (isAllFields || !section.showInAllFields)))
                .map((section) => {
                    const content = (
                        <>
                            {/* ── FORM ── */}
                            {section.type === "form" && (
                                <div className="grid grid-cols-2 gap-4">
                                    {section.fields
                                        .filter(field => {
                                            if (!isAllFields && field.showInAllFields) return false;
                                            if (!field.visible) return true;
                                            return field.visible(quickViewFormData);
                                        })
                                        .map(field => (
                                            <div key={field.key} className="flex flex-col justify-start">
                                                <FieldRenderer
                                                    field={field}
                                                    storeValue={quickViewFormData?.[field.key] ?? ""}
                                                    onCommit={handleCommit}
                                                    vendorOptions={vendorOptions}
                                                    filterVendors={filterVendors}
                                                    onVendorSelect={handleVendorSelect}
                                                    onHover={handleHoverField}
                                                    onLeave={handleLeaveField}
                                                    isDuplicate={isDuplicate}
                                                    duplicateMessage={duplicateMessage}
                                                    forceDisabled={showOnlyHeader}
                                                />
                                            </div>
                                        ))}
                                </div>
                            )}

                            {/* ── TABLE ── */}
                            {section.type === "table" && (
                                <div className="w-full">
                                    <div className="overflow-x-auto">
                                        <div className="overflow-y-auto max-h-[300px]">
                                            <table className="w-full border-separate border-spacing-y-2" style={{ minWidth: "800px" }}>
                                                <thead className="bg-[#2F5D7C] text-white sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2 w-[60px]">S.No</th>
                                                        {section.columns.map(col => (
                                                            <th key={col.key} className="p-2 text-left min-w-[150px]">{col.label}</th>
                                                        ))}
                                                        <th className="p-2 w-[60px]">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {processedItems.map((row, index) => (
                                                        <tr key={row.id} className="bg-white shadow-sm">
                                                            <td className="p-2 text-center w-[60px]">{index + 1}</td>
                                                            {section.columns.map(col => (
                                                                <td key={col.key} className="p-2 min-w-[150px]">
                                                                    <LineItemCell
                                                                        value={row[col.key]}
                                                                        disabled={!col.editable}
                                                                        rowId={row.id}
                                                                        colKey={col.key}
                                                                        onUpdate={handleUpdateLineItem}
                                                                        onHover={handleHoverLineItem}
                                                                        onLeave={handleLeaveField}
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td
                                                                className="p-2 text-red-500 cursor-pointer text-center w-[60px]"
                                                                onClick={() => handleDeleteLineItem(row.id)}
                                                            >
                                                                🗑
                                                            </td>
                                                        </tr>
                                                    ))}

                                                    {/* Total GST / Tax row */}
                                                    <tr className="shadow-sm">
                                                        <td className="p-2 text-center w-[60px]">{processedItems.length + 1}</td>
                                                        {section.columns.map((col, colIndex) => (
                                                            <td key={col.key} className="p-2 min-w-[150px]">
                                                                <CustomInput
                                                                    value={
                                                                        colIndex === 0 ? gstTaxLabel
                                                                            : col.key === "qty" ? "1"
                                                                                : col.key === "unitPrice" ? gstTaxValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                                    : col.key === "discount" ? "0"
                                                                                        : col.key === "netAmount" ? gstTaxValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                                            : col.key === "taxAmt" ? "0"
                                                                                                : ""
                                                                    }
                                                                    disabled={false}
                                                                    onChange={() => { }}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="p-2 w-[60px]" />
                                                    </tr>

                                                    {/* TDS Deduction row */}
                                                    <tr className="shadow-sm">
                                                        <td className="p-2 text-center w-[60px]">{processedItems.length + 2}</td>
                                                        {section.columns.map((col, colIndex) => (
                                                            <td key={col.key} className="p-2 min-w-[150px]">
                                                                <CustomInput
                                                                    value={
                                                                        colIndex === 0 ? "TDS Deduction"
                                                                            : col.key === "qty" ? "1"
                                                                                : col.key === "unitPrice" ? tdsDeductionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                                    : col.key === "discount" ? "0"
                                                                                        : col.key === "netAmount" ? tdsDeductionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                                            : col.key === "taxAmt" ? "0"
                                                                                                : ""
                                                                    }
                                                                    disabled={false}
                                                                    onChange={() => { }}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="p-2 w-[60px]" />
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <button
                                        onClick={addQuickViewLineItem}
                                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 mb-4 border border-dashed border-[#2F5D7C] rounded-md text-[#2F5D7C] hover:bg-[#eaf2f8] transition-colors font-medium text-sm"
                                    >
                                        <span className="text-lg leading-none">+</span>
                                        Add Line Item
                                    </button>

                                    <div className="border-t border-gray-200 pt-3 space-y-2">
                                        <div className="flex justify-end items-center gap-4 pr-2">
                                            <span className="text-sm text-gray-500">
                                                Total Sum of Line Items <span className="text-xs">(Excl GST)</span> :
                                            </span>
                                            <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-right">
                                                $ {processedItems
                                                    .reduce((sum, row) => sum + parseFloat(row.netAmount || 0), 0)
                                                    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-end items-center gap-4 pr-2 pb-2">
                                            <span className="text-sm text-gray-500">Total Amount Payable :</span>
                                            <span className="text-base font-bold text-[#2F5D7C] min-w-[120px] text-right">
                                                $ {totalAmountPayable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <button
                                                className="text-[#2F5D7C] hover:text-[#1e4560] transition-colors"
                                                title="View breakdown"
                                                onClick={() => setShowCalcModal(true)}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    );

                    return (
                        <Collapse
                            key={section.section}
                            defaultActiveKey={[section.section]}
                            className="mb-3 bg-white rounded-md"
                            items={[{ key: section.section, label: section.section, children: content }]}
                        />
                    );
                })}

            <InvoiceCalculationModal open={showCalcModal} onClose={() => setShowCalcModal(false)} />
        </div>
    );
};

export default QuickViewTab;