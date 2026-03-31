import { Collapse } from "antd";
import { QUICK_VIEW_CONFIG } from "../Fields";
import { Dropdown } from "../../../components/ui";
import CustomInput from "../../../shared/components/CustomInput";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useVendersListSync, useVendorDetailSync } from "../../hooks/useInvoiceDetailSync";
import { useCallback, useEffect, useMemo } from "react";
import { AutoComplete } from "antd";
import CustomDatePicker from "../../../shared/components/CustomDatePicker";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import CustomDropdown from "../../../shared/components/CustomDropdown";

dayjs.extend(customParseFormat);

const QuickViewTab = () => {

    const {
        quickViewFormData,
        setQuickViewField,
        quickViewLineItems,
        updateQuickViewLineItem,
        deleteQuickViewLineItem,
        selectedVendorId,
        setQuickViewFormData,
        addQuickViewLineItem,
        entityMaster,
        setSelectedVendorId
    } = useInvoiceStore();

    console.log("quickViewFormData-------------->", quickViewFormData);


    const { vendorsList } = useVendersListSync();
    const { vendor } = useVendorDetailSync(selectedVendorId);

    useEffect(() => {
        if (!vendor || !selectedVendorId) return;

        const TERMS = ['NET 7', 'NET 8', 'NET 12', 'NET 15', 'NET 20', 'NET 30', 'NET 45', 'NET 60', 'NET 90'];

        const getDueDate = (invoiceDate, payTerms) => {
            if (!invoiceDate || !payTerms) return "";

            const days = parseInt(payTerms.match(/\d+/)?.[0] || 0, 10);

            return dayjs(invoiceDate).add(days, "day").format("YYYY-MM-DD");
        };


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

                gst_eligibility: vendor?.gst_eligibility

            };
        });

    }, [vendor, selectedVendorId])


    const vendorOptions = useMemo(() => {
        if (!vendorsList?.length) return [];

        return vendorsList.map(v => ({
            value: v.vendor_id,
            label: `${v.vendor_id} - ${v.vendor_name}`
        }));
    }, [vendorsList]);

    // Replace with this
    const handleChange = useCallback((key, value) => {
        setQuickViewField(key, value);
    }, [setQuickViewField]);

    const filterVendors = useCallback((input, option) => {
        return option?.label
            ?.toLowerCase()
            .includes(input.toLowerCase());
    }, []);

    const renderField = (field) => {
        const value = quickViewFormData?.[field.key] ?? "";

        const commonProps = {
            label: field.label,
            value,
            disabled: !field.editable,
        };

        if (field.key === "vendorId" || field.key === "vendorName") {
            return (
                <AutoComplete
                    value={value}
                    options={vendorOptions}
                    style={{ width: "100%", height: "40px" }}
                    filterOption={filterVendors}
                    onSelect={(val, option) => {
                        handleChange("vendorId", val);
                        handleChange("vendorName", option.label.split(" - ")[1]);
                        setSelectedVendorId(val);
                    }}
                    onSearch={(val) => handleChange(field.key, val)}
                    placeholder="Search Vendor"
                />
            );
        }

        switch (field.type) {
            case "input":
                return (
                    <CustomInput
                        {...commonProps}
                        onChange={(e) =>
                            handleChange(field.key, e.target.value)
                        }
                        height="40px"
                    />
                );

            case "dropdown":
                return (
                    <CustomDropdown
                        {...commonProps}
                        options={field.options || []}
                        style={{ width: "100%", borderRadius: "8px", height: "40px" }}
                        onChange={(val) =>
                            handleChange(field.key, val)
                        }
                        filterOption={filterVendors}
                        placement="bottomLeft"
                    />
                );

            case "date":
                return (
                    <CustomDatePicker
                        {...commonProps}
                        value={value}
                        onChange={(date, dateString) =>
                            handleChange(field.key, dateString)
                        }
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className="p-2">

            {QUICK_VIEW_CONFIG.map((section) => {

                const content = (
                    <>
                        {/* FORM */}
                        {section.type === "form" && (
                            <div className="grid grid-cols-2 gap-4">
                                {section.fields
                                    .filter((field) => {
                                        if (!field.visible) return true;
                                        return field.visible(quickViewFormData);
                                    })
                                    .map((field) => (
                                        <div key={field.key} className="flex flex-col justify-end">
                                            {renderField(field)}
                                        </div>
                                    ))}
                            </div>
                        )}

                        {/* TABLE */}
                        {section.type === "table" && (() => {

                            // ── Derived row calculations ──────────────────────────────
                            const isGstEligible = entityMaster?.gst_applicable === true ? true : false

                            const gstTaxLabel = isGstEligible ? "Total GST" : "Total Tax";
                            const gstTaxValue = parseFloat(quickViewFormData?.total_tax_amount || 0);

                            const tdsRate = parseFloat(quickViewFormData?.tdsRate || 0);
                            const totalInvoiceAmount = parseFloat(quickViewFormData?.total_invoice_amount || 0);

                            const tdsDeductionValue = -Math.abs(parseFloat(tdsRate || 0) * totalInvoiceAmount)

                            const regularItems = quickViewLineItems.filter(row =>
                                row.description !== "Total GST" && row.description !== "Total Tax"
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


                            return (
                                <div className="w-full">

                                    <div className="overflow-x-auto">
                                        <div className="overflow-y-auto max-h-[300px]">
                                            <table className="w-full border-separate border-spacing-y-2" style={{ minWidth: "800px" }}>

                                                <thead className="bg-[#2F5D7C] text-white sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2 w-[60px]">S.No</th>
                                                        {section.columns.map(col => (
                                                            <th key={col.key} className="p-2 text-left min-w-[150px]">
                                                                {col.label}
                                                            </th>
                                                        ))}
                                                        <th className="p-2 w-[60px]">Action</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {/* Regular editable rows */}
                                                    {processedItems?.map((row, index) => (
                                                        <tr key={row.id} className="bg-white shadow-sm">
                                                            <td className="p-2 text-center w-[60px]">{index + 1}</td>
                                                            {section.columns.map(col => (
                                                                <td key={col.key} className="p-2 min-w-[150px]">
                                                                    <CustomInput
                                                                        value={row[col.key]}
                                                                        disabled={!col.editable}
                                                                        onChange={(e) =>
                                                                            updateQuickViewLineItem(row.id, col.key, e.target.value)
                                                                        }
                                                                    />
                                                                </td>
                                                            ))}
                                                            <td
                                                                className="p-2 text-red-500 cursor-pointer text-center w-[60px]"
                                                                onClick={() => deleteQuickViewLineItem(row.id)}
                                                            >
                                                                🗑
                                                            </td>
                                                        </tr>
                                                    ))}

                                                    {/* Row 1: Total GST / Total Tax */}
                                                    <tr className="shadow-sm">
                                                        <td className="p-2 text-center w-[60px]">
                                                            {processedItems?.length + 1}
                                                        </td>
                                                        {section.columns.map((col, colIndex) => (
                                                            <td key={col.key} className="p-2 min-w-[150px]">
                                                                <CustomInput
                                                                    value={
                                                                        colIndex === 0
                                                                            ? gstTaxLabel                    // description
                                                                            : col.key === "qty"
                                                                                ? "1"
                                                                                : col.key === "unitPrice"
                                                                                    ? gstTaxValue.toLocaleString("en-US", {
                                                                                        minimumFractionDigits: 2,
                                                                                        maximumFractionDigits: 2
                                                                                    })
                                                                                    : col.key === "discount"
                                                                                        ? "0"
                                                                                        : col.key === "netAmount"
                                                                                            ? gstTaxValue.toLocaleString("en-US", {
                                                                                                minimumFractionDigits: 2,
                                                                                                maximumFractionDigits: 2
                                                                                            })
                                                                                            : col.key === "taxAmt"
                                                                                                ? "0"
                                                                                                : ""
                                                                    }
                                                                    disabled={false}
                                                                    onChange={(e) => { }}
                                                                />
                                                            </td>

                                                        ))}
                                                        <td className="p-2 w-[60px]" />
                                                    </tr>

                                                    {/* Row 2: TDS Deduction */}
                                                    <tr className="shadow-sm">
                                                        <td className="p-2 text-center w-[60px]">
                                                            {processedItems?.length + 2}
                                                        </td>
                                                        {section.columns.map((col, colIndex) => (
                                                            <td key={col.key} className="p-2 min-w-[150px]">
                                                                <CustomInput
                                                                    value={
                                                                        colIndex === 0
                                                                            ? "TDS Deduction"                // description
                                                                            : col.key === "qty"
                                                                                ? "1"
                                                                                : col.key === "unitPrice"
                                                                                    ? tdsDeductionValue.toLocaleString("en-US", {
                                                                                        minimumFractionDigits: 2,
                                                                                        maximumFractionDigits: 2
                                                                                    })
                                                                                    : col.key === "discount"
                                                                                        ? "0"
                                                                                        : col.key === "netAmount"
                                                                                            ? tdsDeductionValue.toLocaleString("en-US", {
                                                                                                minimumFractionDigits: 2,
                                                                                                maximumFractionDigits: 2
                                                                                            })
                                                                                            : col.key === "taxAmt"
                                                                                                ? "0"
                                                                                                : ""
                                                                    }
                                                                    disabled={false}
                                                                    onChange={(e) => { }}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="p-2 w-[60px]" />
                                                    </tr>

                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Add Line Item Button */}
                                    <button
                                        onClick={addQuickViewLineItem}
                                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 mb-4 border border-dashed border-[#2F5D7C] rounded-md text-[#2F5D7C] hover:bg-[#eaf2f8] transition-colors font-medium text-sm"
                                    >
                                        <span className="text-lg leading-none">+</span>
                                        Add Line Item
                                    </button>

                                    {/* Summary Footer */}
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
                                                $ {(
                                                    totalAmountPayable
                                                ).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <button
                                                className="text-[#2F5D7C] hover:text-[#1e4560] transition-colors"
                                                title="View breakdown"
                                                onClick={() => { }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                                >
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </>
                );

                return (
                    <Collapse
                        key={section.section}
                        defaultActiveKey={[section.section]}
                        className="mb-3 bg-white rounded-md"
                        items={[
                            {
                                key: section.section,
                                label: section.section,
                                children: content,
                            },
                        ]}
                    />
                );
            })}

        </div>
    );
};

export default QuickViewTab;