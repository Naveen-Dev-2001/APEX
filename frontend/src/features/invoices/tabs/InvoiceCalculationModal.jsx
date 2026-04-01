import { useInvoiceStore } from "../../../store/invoice.store";

const InvoiceCalculationModal = ({ open, onClose }) => {
    const { quickViewFormData } = useInvoiceStore();

    if (!open) return null;

    const lineItemsSubtotal = parseFloat(quickViewFormData?.total_invoice_amount || 0);
    const totalTax = parseFloat(quickViewFormData?.total_tax_amount || 0);
    const extractedSubtotal = lineItemsSubtotal;
    const amountPaid = parseFloat(quickViewFormData?.amountPaid || 0);
    const shipping = 0;
    const surcharges = 0;
    const tdsRate = parseFloat(quickViewFormData?.tdsRate || 0);
    const tdsDeduction = -Math.abs((tdsRate / 100) * lineItemsSubtotal);

    const baseTotal = lineItemsSubtotal + totalTax;
    const totalPayable = baseTotal + tdsDeduction;

    const extractionValue = parseFloat(quickViewFormData?.totalPayable || 0);
    const hasMismatch = Math.abs(extractionValue - totalPayable) > 0.01;

    const fmt = (val) =>
        Number(val).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const rows = [
        ["Line Items (Subtotal)", `$ ${fmt(lineItemsSubtotal)}`],
        ["Total Tax (GST/VAT)", `$ ${fmt(totalTax)}`],
        ["Extracted Subtotal (if different)", `$ ${fmt(extractedSubtotal)}`],
        ["Amount Paid", `$ ${fmt(amountPaid)}`],
        ["Shipping / Handling / Fees", `$ ${fmt(shipping)}`],
        ["Surcharges", `$ ${fmt(surcharges)}`],
        ["TDS Rate (from Vendor)", `${tdsRate.toFixed(2)}%`],
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
                                - $ {fmt(Math.abs(tdsDeduction))}
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
                                        $ {fmt(baseTotal)}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                        (via Default Calculation (Heuristic 1))
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between text-red-500">
                                <span>Less TDS Deduction:</span>
                                <span>- $ {fmt(Math.abs(tdsDeduction))}</span>
                            </div>

                            <div className="flex justify-between font-medium border-t pt-1">
                                <span>Total Amount Payable:</span>
                                <span>$ {fmt(totalPayable)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Heuristic */}
                    <div className="mt-4">
                        <div className="font-medium text-gray-700 mb-1">
                            Heuristic Calculations:
                        </div>
                        <div className="text-[12px] space-y-1">
                            <div>1. Line Items + Tax: $ {fmt(baseTotal)}</div>
                            <div>2. Subtotal + Tax: $ {fmt(baseTotal)}</div>
                            <div>
                                3. Total Reconciliation: $ {fmt(baseTotal)}
                                <div className="text-[11px] text-gray-400">
                                    (Line Items + Tax + Shipping + Surcharges - Amount Paid)
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Warning */}
                    {hasMismatch && (
                        <div className="mt-4 text-[12px] text-orange-500 border-t pt-3">
                            <div className="font-medium">
                                Extraction Value: $ {fmt(extractionValue)}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-red-500">✕</span>
                                <span>
                                    Mismatch detected: The extracted amount does not match any heuristic calculation.
                                </span>
                            </div>
                        </div>
                    )}
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