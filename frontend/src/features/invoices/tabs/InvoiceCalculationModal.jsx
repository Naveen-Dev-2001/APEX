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
        hasMismatch,
        calculations
    } = getInvoiceHeuristics(quickViewFormData, lineItems, originalLineItems, selectedVendorDetails);

    const invoiceTotalUsed = match ? match.value : invoiceTotal_calc1;
    const invoiceTotalSourceName = match ? match.name : "Default Calculation (Heuristic 1)";

    const baseTotal = invoiceTotalUsed;
    const totalPayable = baseTotal + tdsDeduction;


    const rows = [
        ["Line Items (Subtotal)", formatCurrency(lineItemsSubtotal)],
        ["Total Tax (GST/VAT)", formatCurrency(totalTax)],
        ["Extracted Subtotal (if different)", formatCurrency(extractedSubtotal)],
        ["Amount Paid", formatCurrency(amountPaid)],
        ["Shipping / Handling / Fees", formatCurrency(shipping)],
        ["Surcharges", formatCurrency(surcharges)],
        ["TDS Rate (from Vendor)", `${(tdsRate * 100).toFixed(2)}%`],
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
            onClick={onClose}
        >
            <div
                className="bg-white w-[620px] max-h-[80vh] rounded-md shadow-md border flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-2 border-b text-[14px] font-medium text-gray-700">
                    <span>Total Invoice Amount - Calculation Details</span>
                    <span
                        onClick={onClose}
                        className="cursor-pointer text-gray-400 hover:text-gray-600 text-[16px]"
                    >
                        ✕
                    </span>
                </div>

                {/* Body */}
                <div className="p-4 text-[13px] text-gray-600 overflow-y-auto flex-1">

                    {/* Table Box */}
                    <div className="border rounded-md overflow-hidden">
                        {rows.map(([label, value], i) => (
                            <div
                                key={i}
                                className="flex justify-between px-3 py-2 border-b last:border-b-0"
                            >
                                <span>{label}</span>
                                <span className="text-gray-800">{value}</span>
                            </div>
                        ))}

                        {/* TDS Row */}
                        <div className="flex justify-between px-3 py-2 border-t">
                            <span className="text-red-500">TDS Deduction Amount</span>
                            <span className="text-red-500">
                                - {formatCurrency(Math.abs(tdsDeduction))}
                            </span>
                        </div>
                    </div>

                    {/* Payable Section */}
                    <div className="mt-4">
                        <div className="font-medium text-gray-700 mb-2">
                            Payable Amount Derivation:
                        </div>

                        <div className="text-[13px] space-y-1">
                            <div className="flex justify-between">
                                <span>Base Invoice Total Used:</span>
                                <div className="text-right">
                                    <div className="text-gray-800">
                                        {formatCurrency(baseTotal)}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                        (via {invoiceTotalSourceName})
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between text-red-500">
                                <span>Less TDS Deduction:</span>
                                <span>- {formatCurrency(Math.abs(tdsDeduction))}</span>
                            </div>

                            <div className="flex justify-between font-medium border-t pt-1">
                                <span>Total Amount Payable:</span>
                                <span>{formatCurrency(totalPayable)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Heuristic */}
                    <div className="mt-4">
                        <div className="font-medium text-gray-700 mb-1">
                            Heuristic Calculations:
                        </div>
                        <div className="text-[12px] space-y-1">
                            <div>1. Line Items + Tax: {formatCurrency(invoiceTotal_calc1)}</div>
                            <div>2. Subtotal + Tax: {formatCurrency(invoiceTotal_calc2)}</div>
                            <div>
                                3. Total Reconciliation: {formatCurrency(invoiceTotal_calc3)}
                                <div className="text-[11px] text-gray-400">
                                    (Line Items + Tax + Shipping + Surcharges - Amount Paid)
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Extraction Value Status */}
                    <div className={`mt-4 text-[12px] border-t pt-3 ${hasMismatch ? 'text-orange-500' : 'text-green-600'}`}>
                        <div className="font-medium">
                            Extraction Value: {formatCurrency(extractionValue)}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                            {hasMismatch ? (
                                <>
                                    <span></span>
                                    <span>
                                        Mismatch detected: The extracted amount does not match any heuristic calculation.
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span></span>
                                    <span>
                                        Match found: The extracted amount matches {match?.name ?? 'a heuristic calculation'}.
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-4 py-3 border-t">
                    <button
                        onClick={onClose}
                        className="px-3 py-1 border rounded text-[13px] text-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-[13px]"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InvoiceCalculationModal;