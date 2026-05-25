// hooks/useSaveInvoice.js
import { saveInvoice } from "../../api/invoiceApi";
import { useInvoiceStore } from "../../store/invoice.store";
import { useCallback } from "react";
import toast from '../../utils/toast';
import { masterDataService } from "../../api/masterdataAPI";

export const useSaveInvoice = () => {
    const {
        quickViewFormData,
        activeInvoiceData,
        setActiveInvoiceData,
        setInvoiceData,
        viewInvoiceId,
        lineItems
    } = useInvoiceStore();

    const buildPayload = useCallback(() => {

        const f = quickViewFormData;

        // ── Save exactly what is on screen ────────────────────────────────────
        const lineItemsToSave = lineItems;
        const originalLineItems = useInvoiceStore.getState().originalLineItems;

        const originalItems = activeInvoiceData.extracted_data?.Items?.value || [];

        // ── Map to the server Items shape ─────────────────────────────────────
        const mappedItems = lineItemsToSave.map((item, index) => {
            const original = originalItems[index] || {};

            return {
                item_number: { value: index + 1, source: "system" },
                description: {
                    ...(original.description || {}),
                    value: item.description ?? "",
                    source: "user"
                },
                amount: {
                    ...(original.amount || {}),
                    value: Number(item.netAmount) || 0,
                    source: "user"
                },
                qty: {
                    ...(original.qty || original.quantity || {}),
                    value: Number(item.qty) || 1,
                    source: "user"
                },
                unit_price: {
                    ...(original.unit_price || {}),
                    value: Number(item.unitPrice) || 0,
                    source: "user"
                },
                discount: {
                    ...(original.discount || {}),
                    value: Number(item.discount) || 0,
                    source: "user"
                },
                tax_amount: {
                    ...(original.tax_amount || {}),
                    value: Number(item.taxAmt) || 0,
                    source: "user"
                },
                gl_code: { value: item.glCode || "", source: "user" },
                lob: { value: item.lob || "", source: "user" },
                department: { value: item.department || "", source: "user" },
                customer: { value: item.customer || "", source: "user" },
                item: { value: item.item || "", source: "user" },
                ...(item.isSystemRow ? { is_system_row: true, row_type: item.type } : {}),
            };
        });

        // ── Map originalLineItems → OriginalItems server shape ────────────────
        // Always excludes system rows — they are derived, never part of the original.
        // Falls back to regular rows from mappedItems if originalLineItems is empty.
        const sourceOriginals = originalLineItems?.length
            ? originalLineItems
            : lineItemsToSave.filter(i => !i.isSystemRow);

        const mappedOriginalItems = sourceOriginals.map((item, index) => {
            const original = originalItems[index] || {};

            return {
                item_number: { value: index + 1, source: "system" },
                description: {
                    ...(original.description || {}),
                    value: item.description ?? "",
                    source: "user"
                },
                amount: {
                    ...(original.amount || {}),
                    value: Number(item.netAmount) || 0,
                    source: "user"
                },
                qty: {
                    ...(original.qty || original.quantity || {}),
                    value: Number(item.qty) || 1,
                    source: "user"
                },
                unit_price: {
                    ...(original.unit_price || {}),
                    value: Number(item.unitPrice) || 0,
                    source: "user"
                },
                discount: {
                    ...(original.discount || {}),
                    value: Number(item.discount) || 0,
                    source: "user"
                },
                tax_amount: {
                    ...(original.tax_amount || {}),
                    value: Number(item.taxAmt) || 0,
                    source: "user"
                },
                gl_code: { value: item.glCode || "", source: "user" },
                lob: { value: item.lob || "", source: "user" },
                department: { value: item.department || "", source: "user" },
                customer: { value: item.customer || "", source: "user" },
                item: { value: item.item || "", source: "user" },
                line_type: { value: item.lineType || "Expense", source: "user" },
            };
        });

        // ── Derived TDS deduction amount ──────────────────────────────────────
        const entityMaster = useInvoiceStore.getState().entityMaster;
        const isEntityGstApplicable = entityMaster?.gst_applicable !== false;
        const tdsRate = parseFloat(f.tdsRate || 0);
        const totalInvoiceAmount = parseFloat(f.totalInvoiceAmount || f.total_invoice_amount || 0);
        const tdsDeductionValue = isEntityGstApplicable ? -Math.abs(tdsRate * totalInvoiceAmount) : 0;

        // ── Reverse-map flat quickViewFormData → extracted_data shape ─────────
        const updatedExtractedData = {
            ...activeInvoiceData.extracted_data,

            OriginalItems: {
                value: mappedOriginalItems,
            },

            // Mark as saved so the next load skips recalculation and grouping
            isModified: true,
            lineItemsSnapshot: lineItems,

            vendor_info: {
                ...activeInvoiceData.extracted_data?.vendor_info,
                address: { ...activeInvoiceData.extracted_data?.vendor_info?.address, value: f.vendorAddress },
                country: { ...activeInvoiceData.extracted_data?.vendor_info?.country, value: f.vendorCountry },
                tax_id: { ...activeInvoiceData.extracted_data?.vendor_info?.tax_id, value: f.vendorTaxId },
                contact_email: { ...activeInvoiceData.extracted_data?.vendor_info?.contact_email, value: f.vendorEmail },
                phone: { ...activeInvoiceData.extracted_data?.vendor_info?.phone, value: f.vendorPhone },
                bank_name: { ...activeInvoiceData.extracted_data?.vendor_info?.bank_name, value: f.vendorBankName },
                bank_account_number: { ...activeInvoiceData.extracted_data?.vendor_info?.bank_account_number, value: f.vendorBankAccount },
                contact_person: { ...activeInvoiceData.extracted_data?.vendor_info?.contact_person, value: f.vendorContactPerson },
                vendor_id: { ...activeInvoiceData.extracted_data?.vendor_info?.vendor_id, value: f.vendorId },
                name: { ...activeInvoiceData.extracted_data?.vendor_info?.name, value: f.vendorName },
            },

            client_info: {
                ...activeInvoiceData.extracted_data?.client_info,
                name: { ...activeInvoiceData.extracted_data?.client_info?.name, value: f.clientName },
                billing_address: { ...activeInvoiceData.extracted_data?.client_info?.billing_address, value: f.billingAddress },
                shipping_address: { ...activeInvoiceData.extracted_data?.client_info?.shipping_address, value: f.shippingAddress },
                phone: { ...activeInvoiceData.extracted_data?.client_info?.phone, value: f.phoneNumber },
                email: { ...activeInvoiceData.extracted_data?.client_info?.email, value: f.email },
                tax_id: { ...activeInvoiceData.extracted_data?.client_info?.tax_id, value: f.clientTaxId },
                contact_person: { ...activeInvoiceData.extracted_data?.client_info?.contact_person, value: f.contactPerson },
            },

            invoice_details: {
                ...activeInvoiceData.extracted_data?.invoice_details,
                invoice_number: { ...activeInvoiceData.extracted_data?.invoice_details?.invoice_number, value: f.invoiceNumber },
                reference_number: { ...activeInvoiceData.extracted_data?.invoice_details?.reference_number, value: f.referenceNumber },
                invoice_date: { ...activeInvoiceData.extracted_data?.invoice_details?.invoice_date, value: f.invoiceDate },
                due_date: { ...activeInvoiceData.extracted_data?.invoice_details?.due_date, value: f.dueDate },
                posting_date: { ...activeInvoiceData.extracted_data?.invoice_details?.posting_date, value: f.postingDate },
                currency: { ...activeInvoiceData.extracted_data?.invoice_details?.currency, value: f.invoiceCurrency },
                type: { ...activeInvoiceData.extracted_data?.invoice_details?.type, value: f.invoiceType },
                po_number: { ...activeInvoiceData.extracted_data?.invoice_details?.po_number, value: f.poNumber },
                payment_terms: { ...activeInvoiceData.extracted_data?.invoice_details?.payment_terms, value: f.paymentTerms },
                payment_method: { ...activeInvoiceData.extracted_data?.invoice_details?.payment_method, value: f.paymentMethod },
                cost_center: { ...activeInvoiceData.extracted_data?.invoice_details?.cost_center, value: f.costCenter },
            },

            service_period: {
                ...activeInvoiceData.extracted_data?.service_period,
                start_date: { ...activeInvoiceData.extracted_data?.service_period?.start_date, value: f.serviceStartDate },
                end_date: { ...activeInvoiceData.extracted_data?.service_period?.end_date, value: f.serviceEndDate },
            },

            amounts: {
                ...activeInvoiceData.extracted_data?.amounts,
                subtotal: { ...activeInvoiceData.extracted_data?.amounts?.subtotal, value: f.subtotal },
                total_tax_amount: { ...activeInvoiceData.extracted_data?.amounts?.total_tax_amount, value: f.totalTaxAmount },
                total_invoice_amount: { ...activeInvoiceData.extracted_data?.amounts?.total_invoice_amount, value: f.totalAmount || f.totalInvoiceAmount },
                amount_paid: { ...activeInvoiceData.extracted_data?.amounts?.amount_paid, value: f.amountPaid },
                amount_due: { ...activeInvoiceData.extracted_data?.amounts?.amount_due, value: f.amountDue },
                shipping_handling_fees: { ...activeInvoiceData.extracted_data?.amounts?.shipping_handling_fees, value: f.shippingFees },
                surcharges: { ...activeInvoiceData.extracted_data?.amounts?.surcharges, value: f.surcharges },
                CGST: { ...activeInvoiceData.extracted_data?.amounts?.CGST, value: f.cgst },
                SGST: { ...activeInvoiceData.extracted_data?.amounts?.SGST, value: f.sgst },
                IGST: { ...activeInvoiceData.extracted_data?.amounts?.IGST, value: f.igst },
                withholding_tax: { ...activeInvoiceData.extracted_data?.amounts?.withholding_tax, value: f.withholdingTax },
                tds_applicability: { ...activeInvoiceData.extracted_data?.amounts?.tds_applicability, value: f.tdsApplicability },
                tds_rate: { ...activeInvoiceData.extracted_data?.amounts?.tds_rate, value: f.tdsRate },
                tds_section: { ...activeInvoiceData.extracted_data?.amounts?.tds_section, value: f.tdsSection },
                tds_deduction: { ...activeInvoiceData.extracted_data?.amounts?.tds_deduction, value: tdsDeductionValue },
                total_amount_payable: { ...activeInvoiceData.extracted_data?.amounts?.total_amount_payable, value: f.totalPayable },
                // Persist user overrides so they survive reload
                line_grouping: { value: f.lineGrouping ?? "" },
                gst_eligibility: { value: f.gstEligibility ?? "" },
                is_gst_deleted: { value: f.isGstDeleted ?? false },
            },

            additional_info: {
                ...activeInvoiceData.extracted_data?.additional_info,
                notes_terms: { ...activeInvoiceData.extracted_data?.additional_info?.notes_terms, value: f.notes },
                memo: { ...activeInvoiceData.extracted_data?.additional_info?.memo, value: f.memo },
                qr_code_irn: { ...activeInvoiceData.extracted_data?.additional_info?.qr_code_irn, value: f.qrOrIrn },
                company_registration_number: { ...activeInvoiceData.extracted_data?.additional_info?.company_registration_number, value: f.companyRegistrationNumber },
            },

            // Exactly what is on screen — regular rows + system rows
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
            posting_date: f.postingDate,
            last_updated_at: activeInvoiceData.updated_at
        };

        return payload;
    }, [quickViewFormData, lineItems, activeInvoiceData]);

    const handleSave = useCallback(async (extraFields = {}, currentVendor = null) => {
        try {
            const payload = buildPayload();

            // ── Normalize vendor data (API returns an array) ──────────────────
            const normalizedVendor = Array.isArray(currentVendor) ? currentVendor[0] : currentVendor;

            // ── Update Vendor Master if data changed ──────────────────────────
            // (e.g. TDS settings or Line Grouping changed from master defaults)
            if (normalizedVendor && normalizedVendor.id) {
                const f = quickViewFormData;
                const v = normalizedVendor;

                const hasTdsChanged =
                    (f.tdsApplicability === "Yes") !== !!v.tds_applicability ||
                    parseFloat(f.tdsRate || 0) !== parseFloat(v.tds_percentage || 0) ||
                    f.tdsSection !== (v.tds_section_code || "NA");

                const hasGroupingChanged =
                    (f.lineGrouping === "Yes") !== !!v.line_grouping ||
                    (f.gstEligibility === "Eligible") !== !!v.gst_eligibility;

                if (hasTdsChanged || hasGroupingChanged) {
                    console.log(`Updating vendor master defaults for ${v.vendor_id}...`, {
                        tds: f.tdsSection,
                        rate: f.tdsRate,
                        grouping: f.lineGrouping
                    });
                    
                    const updatedVendor = {
                        ...v,
                        tds_applicability: f.tdsApplicability === "Yes",
                        tds_percentage: parseFloat(f.tdsRate || 0),
                        tds_section_code: f.tdsSection,
                        line_grouping: f.lineGrouping === "Yes",
                        gst_eligibility: f.gstEligibility === "Eligible"
                    };

                    masterDataService.editVendorRow(undefined, updatedVendor)
                        .then(() => console.log("Vendor master updated successfully."))
                        .catch(err => console.error("Failed to update vendor master:", err));
                }
            } else if (normalizedVendor) {
                console.warn("Cannot update vendor master: currentVendor object missing 'id' property.", normalizedVendor);
            }

            // Apply any extra field overrides (e.g. status)
            const finalPayload = {
                ...payload,
                ...extraFields
            };

            // Optimistically update the store so UI stays in sync
            setActiveInvoiceData(finalPayload);

            const object = {
                extracted_data: finalPayload.extracted_data,   // already has isModified: true
                exchange_rate: finalPayload.exchange_rate,
                vendor_id: finalPayload.vendor_id,
                vendor_name: finalPayload.vendor_name,
                invoice_number: finalPayload.invoice_number,
                reference_number: finalPayload.extracted_data?.invoice_details?.reference_number?.value,
                total_amount: finalPayload.extracted_data?.amounts?.total_invoice_amount?.value,
                amount_due: finalPayload.extracted_data?.amounts?.amount_due?.value,
                invoice_date: finalPayload.extracted_data?.invoice_details?.invoice_date?.value,
                due_date: finalPayload.extracted_data?.invoice_details?.due_date?.value,
                posting_date: finalPayload.extracted_data?.invoice_details?.posting_date?.value,
                last_updated_at: finalPayload.last_updated_at,
                ...extraFields // Merge extra fields (like status) into the final object
            };

            const response = await saveInvoice(viewInvoiceId, object);
            console.log("Save response →", response);

            // Sync only server-side metadata (updated_at, status) back onto the
            // already-correct optimistic state.  Do NOT call setInvoiceData(response)
            // here — the server response may not echo back the full extracted_data
            // (Items with gl_code/lob/department/customer/item), which would cause
            // setInvoiceData to re-map all line items and wipe those fields.
            if (response) {
                // Patch only the metadata fields that the server owns
                const patchedData = {
                    ...finalPayload,
                    updated_at: response.updated_at ?? finalPayload.updated_at,
                    status: response.status ?? finalPayload.status,
                };
                setActiveInvoiceData(patchedData);
            }

            return response;
        } catch (err) {
            const errorData = err?.response?.data;
            const detail = errorData?.detail || "Failed to save invoice";
            toast.error(typeof detail === "string" ? detail : (detail.message || "Something went wrong"));
            return null;
        }
    }, [buildPayload, setActiveInvoiceData, setInvoiceData, viewInvoiceId]);

    return { handleSave, buildPayload };
};