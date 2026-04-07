// hooks/useSaveInvoice.js
import { saveInvoice } from "../../api/invoiceApi";
import { useInvoiceStore } from "../../store/invoice.store";
import { useCallback } from "react";

export const useSaveInvoice = () => {
    const {
        quickViewFormData,
        quickViewLineItems,
        activeInvoiceData,
        setActiveInvoiceData,
        viewInvoiceId,
    } = useInvoiceStore();

    const buildPayload = useCallback(() => {
        const f = quickViewFormData;

        // ── Separate regular rows from system rows ────────────────────────────
        // System rows (GST / TDS) are already in quickViewLineItems with their
        // calculated values. We save ALL rows — regular first, then system — so
        // on the next load handleView can reconstruct them with isSystemRow.
        const regularRows = quickViewLineItems.filter(i => !i.isSystemRow);
        const gstRow = quickViewLineItems.find(i => i.type === "GST");
        const tdsRow = quickViewLineItems.find(i => i.type === "TDS");

        // Build the ordered list: regular → GST → TDS (if present)
        const allRows = [
            ...quickViewLineItems,
            // ...(gstRow ? [gstRow] : []),
            // ...(tdsRow ? [tdsRow] : []),
        ];

        // ── Map to the server Items shape ─────────────────────────────────────
        const mappedItems = allRows.map((item, index) => ({
            item_number: { value: index + 1, source: "system" },
            description: { value: item.description, source: "user" },
            amount: { value: Number(item.netAmount) || 0, source: "user" },
            qty: { value: Number(item.qty) || 1, source: "user" },
            unit_price: { value: Number(item.unitPrice) || 0, source: "user" },
            discount: { value: Number(item.discount) || 0, source: "user" },
            tax_amount: { value: Number(item.taxAmt) || 0, source: "user" },
        }));

        // ── Derived TDS deduction amount ──────────────────────────────────────
        // tdsRate is a decimal (e.g. 0.10), totalInvoiceAmount is a number.
        const tdsRate = parseFloat(f.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(f.totalInvoiceAmount || f.total_invoice_amount || 0);
        const tdsDeductionValue = -Math.abs(tdsRate * totalInvoiceAmount);

        // ── Reverse-map flat quickViewFormData → extracted_data shape ─────────
        const updatedExtractedData = {
            ...activeInvoiceData.extracted_data,

            // Mark as saved so the next load skips recalculation
            isModified: true,

            vendor_info: {
                ...activeInvoiceData.extracted_data?.vendor_info,
                address: { value: f.vendorAddress },
                country: { value: f.vendorCountry },
                tax_id: { value: f.vendorTaxId },
                contact_email: { value: f.vendorEmail },
                phone: { value: f.vendorPhone },
                bank_name: { value: f.vendorBankName },
                bank_account_number: { value: f.vendorBankAccount },
                contact_person: { value: f.vendorContactPerson },
            },

            client_info: {
                ...activeInvoiceData.extracted_data?.client_info,
                name: { value: f.clientName },
                billing_address: { value: f.billingAddress },
                shipping_address: { value: f.shippingAddress },
                phone: { value: f.phoneNumber },
                email: { value: f.email },
                tax_id: { value: f.clientTaxId },
                contact_person: { value: f.contactPerson },
            },

            invoice_details: {
                ...activeInvoiceData.extracted_data?.invoice_details,
                invoice_number: { value: f.invoiceNumber },
                invoice_date: { value: f.invoiceDate },
                due_date: { value: f.dueDate },
                currency: { value: f.invoiceCurrency },
                type: { value: f.invoiceType },
                po_number: { value: f.poNumber },
                payment_terms: { value: f.paymentTerms },
                payment_method: { value: f.paymentMethod },
                cost_center: { value: f.costCenter },
            },

            service_period: {
                start_date: { value: f.serviceStartDate },
                end_date: { value: f.serviceEndDate },
            },

            amounts: {
                ...activeInvoiceData.extracted_data?.amounts,
                subtotal: { value: f.subtotal },
                total_tax_amount: { value: f.totalTaxAmount },
                total_invoice_amount: { value: f.totalInvoiceAmount },
                amount_paid: { value: f.amountPaid },
                amount_due: { value: f.amountDue },
                shipping_handling_fees: { value: f.shippingFees },
                surcharges: { value: f.surcharges },
                CGST: { value: f.cgst },
                SGST: { value: f.sgst },
                IGST: { value: f.igst },
                withholding_tax: { value: f.withholdingTax },
                // TDS fields — persisted so they survive the isModified load path
                tds_applicability: { value: f.tdsApplicability },
                tds_rate: { value: f.tdsRate },
                tds_section: { value: f.tdsSection },
                tds_deduction: { value: tdsDeductionValue },
            },

            additional_info: {
                ...activeInvoiceData.extracted_data?.additional_info,
                notes_terms: { value: f.notes || f.memo },
                qr_code_irn: { value: f.qrOrIrn },
                company_registration_number: { value: f.companyRegistrationNumber },
            },

            // All rows (regular + GST + TDS) saved together
            Items: {
                ...activeInvoiceData.extracted_data?.Items,
                value: mappedItems,
            },
        };

        const payload = {
            ...activeInvoiceData,
            vendor_id: f.vendorId,
            vendor_name: f.vendorName,
            invoice_number: f.invoiceNumber,
            exchange_rate: f.exchangeRate || activeInvoiceData.exchange_rate,
            extracted_data: updatedExtractedData,
        };

        return payload;
    }, [quickViewFormData, quickViewLineItems, activeInvoiceData]);

    const handleSave = useCallback(async () => {
        const payload = buildPayload();

        // Optimistically update the store so UI stays in sync
        setActiveInvoiceData(payload);

        const object = {
            extracted_data: payload.extracted_data,   // already has isModified: true
            exchange_rate: null,
            vender_id: payload.vendor_id,
        };

        const response = await saveInvoice(viewInvoiceId, object);
        console.log("Save response →", response);

        return response;
    }, [buildPayload, setActiveInvoiceData]);

    return { handleSave, buildPayload };
};