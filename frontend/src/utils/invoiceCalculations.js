import { useInvoiceStore } from "../store/invoice.store";

const extractValue = (v) => v?.value !== undefined ? v.value : v;

const parseCurrencyValue = (val) => {
    if (!val && val !== 0) return 0;
    const strVal = val.toString().replace(/[^0-9.-]+/g, "");
    return parseFloat(strVal) || 0;
};

const findVal = (obj, keys) => {
    if (!obj) return null;
    const matchKey = Object.keys(obj).find(k => {
        const normK = k.toLowerCase().replace(/[\s_\\\-]/g, '');
        return keys.some(target => normK === target.toLowerCase().replace(/[\s_\\\-]/g, ''));
    });
    return matchKey ? obj[matchKey] : null;
};

/**
 * Calculates heuristic invoice totals and determines if there is a mismatch 
 * between the extracted total and calculated values.
 * 
 * @param {Object} quickViewFormData - The current form data for the invoice.
 * @param {Array} lineItems - Current line items.
 * @param {Array} originalLineItems - Original extracted line items (fallback).
 * @param {Object} selectedVendorDetails - Details of the selected vendor (optional).
 * @returns {Object} Calculation results and mismatch status.
 */
export const getInvoiceHeuristics = (quickViewFormData, lineItems, originalLineItems = [], selectedVendorDetails = null) => {
    const lineItemsForCalculations = (lineItems && lineItems.length > 0 ? lineItems : originalLineItems) || [];

    const calculatedSubtotal = lineItemsForCalculations.reduce((sum, item) => {
        // Skip system rows (GST, TDS) added by the frontend
        // if (item.isSystemRow || item.type === "GST" || item.type === "TDS") {
        //     return sum;
        // }

        const desc = (extractValue(item.description) || item.description?.value || '').toString().trim();
        const lowDesc = desc.toLowerCase();

        // Safeguard: Skip system tax lines and OCR-extracted generic tax lines
        if (desc === 'TDS Deduction') {
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

    const lineItemsSubtotal = calculatedSubtotal;
    const totalTax = parseFloat(quickViewFormData?.totalTaxAmount || 0);
    const extractedSubtotal = parseFloat(quickViewFormData?.subtotal || 0);
    const amountPaid = parseFloat(quickViewFormData?.amountPaid || 0);
    const shipping = parseFloat(quickViewFormData?.shippingFees || 0);
    const surcharges = parseFloat(quickViewFormData?.surcharges || 0);

    // TDS Logic
    let tdsRate = parseFloat(quickViewFormData?.tdsRate || 0);
    const entityMaster = useInvoiceStore.getState().entityMaster;
    const isEntityGstApplicable = entityMaster?.gst_applicable !== false;
    const isGstApplicable = isEntityGstApplicable && totalTax > 0;

    let isTDSApplicable = quickViewFormData?.tdsApplicability === "Yes";
    const isTDSExplicitlyNo = quickViewFormData?.tdsApplicability === "No";

    if (!isTDSApplicable && !isTDSExplicitlyNo && selectedVendorDetails) {
        const tdsApplicabilityVal = findVal(selectedVendorDetails, [
            'TDS/Withhold Tax Applicability Configuration',
            'TDS Applicability', 'TDS Applicable', 'Withholding Tax Applicable'
        ]);
        isTDSApplicable = tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes';
    }

    if (isTDSApplicable) {
        if (!quickViewFormData?.tdsRate && selectedVendorDetails) {
            const tdsRateVal = findVal(selectedVendorDetails, [
                'TDS Percentage', 'Percentage', 'Rate', 'TDS Rate', 'Withholding Rate'
            ]) || '0';
            tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
        }
    } else {
        tdsRate = 0;
    }

    // Note: The calculation modal uses tdsRate directly. If tdsRate is 2 (for 2%), 
    // it's treated as 2.0 unless corrected. Keeping consistency with modal logic for now.
    const tdsDeduction = isEntityGstApplicable ? -Math.abs((tdsRate) * (lineItemsSubtotal)) : 0;

    const invoiceTotal_calc1 = parseFloat((lineItemsSubtotal).toFixed(2));
    const invoiceTotal_calc2 = parseFloat((extractedSubtotal + totalTax).toFixed(2));
    const invoiceTotal_calc3 = parseFloat((lineItemsSubtotal + totalTax - amountPaid + shipping + surcharges).toFixed(2));

    // Try both field keys used in different parts of the UI
    const extractionValue = parseFloat(quickViewFormData?.totalInvoiceAmount || quickViewFormData?.totalAmount || 0);

    const calculations = [
        { value: invoiceTotal_calc1, name: "Heuristic 1: Line Items + Tax" },
        { value: invoiceTotal_calc2, name: "Heuristic 2: Subtotal + Tax" },
        { value: invoiceTotal_calc3, name: "Heuristic 3: Total Reconciliation" }
    ];

    const match = Math.abs(extractionValue - invoiceTotal_calc1) < 1.0
        ? { value: invoiceTotal_calc1, name: "Heuristic 1: Line Items + Tax" }
        : undefined;
    const hasMismatch = match === undefined && extractionValue > 0;

    return {
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
    };
};
