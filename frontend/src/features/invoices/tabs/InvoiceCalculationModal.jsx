import { useInvoiceStore } from "../../../store/invoice.store";
import { useVendorDetailSync } from "../../hooks/useInvoiceDetailSync";

const InvoiceCalculationModal = ({ open, onClose }) => {
    const { quickViewFormData, lineItems, originalLineItems, selectedVendorId } = useInvoiceStore();
    const { vendor: selectedVendorDetails } = useVendorDetailSync(selectedVendorId);

    if (!open) return null;

    const extractValue = (v) => v?.value !== undefined ? v.value : v;
    const parseCurrencyValue = (val) => {
        if (!val && val !== 0) return 0;
        const strVal = val.toString().replace(/[^0-9.-]+/g, "");
        return parseFloat(strVal) || 0;
    };

    const lineItemsForCalculations = (lineItems && lineItems.length > 0 ? lineItems : originalLineItems) || [];
    
    const calculatedSubtotal = lineItemsForCalculations.reduce((sum, item) => {
        const desc = (extractValue(item.description) || item.description?.value || '').toString().trim();
        const lowDesc = desc.toLowerCase();
        // Safeguard: Skip system tax lines and OCR-extracted generic tax lines
        if (desc === 'Total GST' || desc === 'Total GST (Ineligible)' || desc === 'TDS Deduction' || desc === 'Tax' || 
            lowDesc === 'gst' || lowDesc === 'vat' || lowDesc === 'igst' || lowDesc === 'cgst' || lowDesc === 'sgst') {
            return sum;
        }
        const val = parseCurrencyValue(
            extractValue(item.amount) || 
            extractValue(item.netAmount) || 
            extractValue(item.NetAmount) || 
            extractValue(item.net_amount)
        );
        return sum + val;
    }, 0);
    console.log("calculated subtotal ",calculatedSubtotal);

    const lineItemsSubtotal = calculatedSubtotal;
    const totalTax = parseFloat(quickViewFormData?.totalTaxAmount || 0);
    const extractedSubtotal = parseFloat(quickViewFormData?.subtotal || 0);

    const amountPaid = parseFloat(quickViewFormData?.amountPaid || 0);

    const shipping = parseFloat(quickViewFormData?.shippingFees || 0);
    const surcharges = parseFloat(quickViewFormData?.surcharges || 0);
    let tdsRate = parseFloat(quickViewFormData?.tdsRate || 0);

    const isGstApplicable = totalTax > 0;

    if (selectedVendorDetails) {
        const findVal = (obj, keys) => {
            if (!obj) return null;
            const matchKey = Object.keys(obj).find(k => {
                const normK = k.toLowerCase().replace(/[\s_\\\-]/g, '');
                return keys.some(target => normK === target.toLowerCase().replace(/[\s_\\\-]/g, ''));
            });
            return matchKey ? obj[matchKey] : null;
        };

        const tdsApplicabilityVal = findVal(selectedVendorDetails, [
            'TDS/Withhold Tax Applicability Configuration',
            'TDS Applicability', 'TDS Applicable', 'Withholding Tax Applicable'
        ]);

        const isTDSApplicable = tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes';

        if (isTDSApplicable && isGstApplicable) {
            const tdsRateVal = findVal(selectedVendorDetails, [
                'TDS Percentage', 'Percentage', 'Rate', 'TDS Rate', 'Withholding Rate'
            ]) || '0';
            tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
        }
    }

    const tdsDeduction = -Math.abs((tdsRate / 100) * lineItemsSubtotal);

    const invoiceTotal_calc1 = parseFloat((lineItemsSubtotal + totalTax).toFixed(2));
    const invoiceTotal_calc2 = parseFloat((extractedSubtotal + totalTax).toFixed(2));
    const invoiceTotal_calc3 = parseFloat((lineItemsSubtotal + totalTax - amountPaid + shipping + surcharges).toFixed(2));

    const extractionValue = parseFloat(quickViewFormData?.totalInvoiceAmount || 0);

    const calculations = [
        { value: invoiceTotal_calc1, name: "Heuristic 1: Line Items + Tax" },
        { value: invoiceTotal_calc2, name: "Heuristic 2: Subtotal + Tax" },
        { value: invoiceTotal_calc3, name: "Heuristic 3: Total Reconciliation" }
    ];

    const match = calculations.find(c => Math.abs(extractionValue - c.value) < 0.01);
    const invoiceTotalUsed = match ? match.value : invoiceTotal_calc1;
    const invoiceTotalSourceName = match ? match.name : "Default Calculation (Heuristic 1)";
    const hasMismatch = match === undefined && extractionValue > 0;

    const baseTotal = invoiceTotalUsed;
    const totalPayable = baseTotal + tdsDeduction;

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
                                        (via {invoiceTotalSourceName})
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
                            <div>1. Line Items + Tax: $ {fmt(invoiceTotal_calc1)}</div>
                            <div>2. Subtotal + Tax: $ {fmt(invoiceTotal_calc2)}</div>
                            <div>
                                3. Total Reconciliation: $ {fmt(invoiceTotal_calc3)}
                                <div className="text-[11px] text-gray-400">
                                    (Line Items + Tax + Shipping + Surcharges - Amount Paid)
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Extraction Value Status */}
                    <div className={`mt-4 text-[12px] border-t pt-3 ${hasMismatch ? 'text-orange-500' : 'text-green-600'}`}>
                        <div className="font-medium">
                            Extraction Value: $ {fmt(extractionValue)}
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