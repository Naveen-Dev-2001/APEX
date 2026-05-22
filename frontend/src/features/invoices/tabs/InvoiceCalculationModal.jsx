import { useInvoiceStore } from "../../../store/invoice.store";
import { useVendorDetailSync } from "../../hooks/useInvoiceDetailSync";
import { formatCurrency } from "../../../utils/formatters";
import { getInvoiceHeuristics } from "../../../utils/invoiceCalculations";

const InvoiceCalculationModal = ({ open, onClose }) => {
    const { quickViewFormData, lineItems, originalLineItems, selectedVendorId } = useInvoiceStore();
    const { vendor: selectedVendorDetails } = useVendorDetailSync(selectedVendorId);

    if (!open) return null;

    const {
        lineItemsSubtotal,
        totalTax,
        extractedSubtotal,
        amountPaid,
        shipping,
        surcharges,
        tdsRate,
        tdsDeduction,
        invoiceTotal_calc1,
        invoiceTotal_calc2,
        invoiceTotal_calc3,
        extractionValue,
        match,
        hasMismatch
    } = getInvoiceHeuristics(quickViewFormData, lineItems, originalLineItems, selectedVendorDetails);

    const invoiceTotalUsed = match ? match.value : invoiceTotal_calc1;
    const invoiceTotalSourceName = match 
        ? match.name.replace("Heuristic ", "Heuristics ") 
        : "Heuristics 1: Line Items + Tax";

    const baseTotal = invoiceTotalUsed;
    const totalPayable = baseTotal + tdsDeduction;

    const firstBoxRows = [
        { label: "Line Items (Sub total)", value: formatCurrency(lineItemsSubtotal) },
        { label: "Total Tax (GST/VAT)", value: formatCurrency(totalTax) },
        { label: "Extracted Subtotal (If Different)", value: formatCurrency(extractedSubtotal) },
        { label: "Amount Paid", value: formatCurrency(amountPaid) },
        { label: "Shipping / Handling / Fees", value: formatCurrency(shipping) },
        { label: "Surcharges", value: formatCurrency(surcharges) },
        { label: "TDS Rate (From Vendor)", value: `${(tdsRate * 100).toFixed(2)} %` },
        { label: "TDS Deduction Amount", value: `-${formatCurrency(Math.abs(tdsDeduction))}`, isRed: true }
    ];

    const payableRows = [
        {
            label: `Base Invoice Total Used (Via ${invoiceTotalSourceName} )`,
            value: formatCurrency(baseTotal)
        },
        {
            label: "Less TDS Deduction",
            value: `-${formatCurrency(Math.abs(tdsDeduction))}`,
            isRed: true
        },
        {
            label: "Total Amount Payable",
            value: formatCurrency(totalPayable),
            isBold: true
        }
    ];

    const heuristicRows = [
        {
            label: "1. Line Items + Tax",
            value: formatCurrency(invoiceTotal_calc1),
            isMatch: Math.abs(extractionValue - invoiceTotal_calc1) < 1.0
        },
        {
            label: "2. Subtotal + Tax",
            value: formatCurrency(invoiceTotal_calc2),
            isMatch: Math.abs(extractionValue - invoiceTotal_calc2) < 1.0
        },
        {
            label: "3. Total Reconciliation (Line Items + Tax + Shipping + Surcharges - Amount Paid )",
            value: formatCurrency(invoiceTotal_calc3),
            isMatch: Math.abs(extractionValue - invoiceTotal_calc3) < 1.0
        }
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
        >
            <div
                className="bg-white w-[640px] max-h-[90vh] rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-6 pt-5 pb-3 flex-shrink-0">
                    <h2 className="text-[18px] font-bold text-gray-800 custom-font-jura">
                        Total Invoice Amount - Calculation Details
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 pb-6 overflow-y-auto flex-1 space-y-5 text-[13px]">
                    
                    {/* First Table Box */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        {firstBoxRows.map((row, idx) => (
                            <div
                                key={idx}
                                className={`flex justify-between items-start px-4 py-2.5 border-b border-gray-200/60 last:border-b-0 ${
                                    idx % 2 === 0 ? "bg-[#f8f9fa]" : "bg-white"
                                }`}
                            >
                                <span className="text-gray-600 font-normal pr-4">{row.label}</span>
                                <span className={`${row.isRed ? "text-red-500" : "text-gray-800"} font-normal flex-shrink-0`}>
                                    {row.value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Payable Amount Derivation Section */}
                    <div>
                        <h3 className="text-[15px] font-bold text-[#24A1DD] mb-2.5 custom-font-jura">
                            Payable Amount Derivation
                        </h3>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {payableRows.map((row, idx) => (
                                <div
                                    key={idx}
                                    className={`flex justify-between items-start px-4 py-2.5 border-b border-gray-200/60 last:border-b-0 ${
                                        idx % 2 === 0 ? "bg-[#f8f9fa]" : "bg-white"
                                    }`}
                                >
                                    <span className={`${row.isBold ? "text-gray-800 font-semibold" : "text-gray-600 font-normal"} pr-4`}>
                                        {row.label}
                                    </span>
                                    <span className={`${
                                        row.isRed 
                                            ? "text-red-500" 
                                            : row.isBold 
                                                ? "text-gray-800 font-semibold" 
                                                : "text-gray-800 font-normal"
                                    } flex-shrink-0`}>
                                        {row.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Heuristic Calculation Section */}
                    <div>
                        <h3 className="text-[15px] font-bold text-[#24A1DD] mb-2.5 custom-font-jura">
                            Heuristic Calculation
                        </h3>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {heuristicRows.map((row, idx) => (
                                <div
                                    key={idx}
                                    className={`flex justify-between items-start px-4 py-2.5 border-b border-gray-200/60 last:border-b-0 ${
                                        idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"
                                    }`}
                                >
                                    <div className="text-gray-600 font-normal pr-4">
                                        {row.label}
                                        {row.isMatch && (
                                            <span className="ml-2 px-2.5 py-0.5 bg-[#22c55e] text-white text-[11px] font-medium rounded-full inline-flex items-center align-middle whitespace-nowrap">
                                                Match found
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-gray-800 font-normal flex-shrink-0">
                                        {row.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Extraction Value Status */}
                    <div className="pt-2">
                        <hr className="border-gray-200 mb-4" />
                        <div className="font-semibold text-gray-800 text-[14px]">
                            Extraction Value : {formatCurrency(extractionValue)}
                        </div>
                        <div className={`text-[13px] font-medium mt-1 ${hasMismatch ? "text-red-500" : "text-[#22c55e]"}`}>
                            {hasMismatch ? (
                                "Mismatch detected: The extracted amount does not match the Line Items + Tax calculation."
                            ) : (
                                `The extraction amount matches ${
                                    match 
                                        ? match.name.replace("Heuristic ", "Heuristic ").replace(":", ".") 
                                        : "Heuristic 1. Line Items + Tax"
                                }`
                            )}
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default InvoiceCalculationModal;