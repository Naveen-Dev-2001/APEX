import { useState, useMemo, useEffect, useCallback, useRef } from "react";

export const usePdfHighlights = ({ 
    invoiceData, 
    highlightedField, 
    page, 
    scale, 
    rotation, 
    pdfObj, 
    viewerRef, 
    getViewport,
    setPage,
    autoFit,
    autoFitWidth,
    renderPage
}) => {
    const highlightRef = useRef(null);
    const [activeHighlights, setActiveHighlights] = useState([]);

    /* ---------------- Derived: Highlighted Regions Mapping ---------------- */
    const highlightedRegions = useMemo(() => {
        if (!invoiceData || !highlightedField) return [];

        const ocrData = invoiceData.extracted_data || invoiceData;
        let targetObj = null;

        if (highlightedField.startsWith('LineItem_')) {
            const parts = highlightedField.split('_');
            const index = parseInt(parts[1], 10);
            const field = parts[2];

            const items = ocrData.Items?.value || ocrData.items || [];
            if (items[index]) {
                const item = items[index];
                const fieldMap = {
                    'description': 'description',
                    'qty': 'quantity',
                    'unitPrice': 'unit_price',
                    'discount': 'discount',
                    'netAmount': 'amount',
                    'taxAmt': 'tax_amount',
                };
                const apiField = fieldMap[field] || field;
                targetObj = item[apiField];
            }
        } else {
            const map = {
                'vendorId': ocrData.vendor_info?.vendor_id || ocrData.vendor_info?.vendorId,
                'vendorName': ocrData.vendor_info?.name,
                'invoiceNumber': ocrData.invoice_details?.invoice_number || ocrData.invoice_details?.invoiceNumber,
                'invoiceDate': ocrData.invoice_details?.invoice_date || ocrData.invoice_details?.invoiceDate,
                'dueDate': ocrData.invoice_details?.due_date || ocrData.invoice_details?.dueDate,
                'paymentTerms': ocrData.invoice_details?.payment_terms || ocrData.invoice_details?.paymentTerms,
                'invoiceCurrency': ocrData.invoice_details?.currency,
                'exchangeRate': ocrData.invoice_details?.exchange_rate || ocrData.invoice_details?.exchangeRate,
                'totalAmount': ocrData.amounts?.total_invoice_amount || ocrData.amounts?.totalInvoiceAmount,
                'totalPayable': ocrData.amounts?.amount_due || ocrData.amounts?.amountDue,
                
                // Vendor Level
                'vendorAddress': ocrData.vendor_info?.address,
                'vendorCountry': ocrData.vendor_info?.country,
                'vendorTaxId': ocrData.vendor_info?.tax_id || ocrData.vendor_info?.taxId,
                'vendorEmail': ocrData.vendor_info?.contact_email || ocrData.vendor_info?.contactEmail,
                'vendorPhone': ocrData.vendor_info?.phone,
                'vendorBankName': ocrData.vendor_info?.bank_name || ocrData.vendor_info?.bankName,
                'vendorBankAccount': ocrData.vendor_info?.bank_account_number || ocrData.vendor_info?.bankAccountNumber,
                'vendorContactPerson': ocrData.vendor_info?.contact_person || ocrData.vendor_info?.contactPerson,

                // Buyer
                'clientName': ocrData.client_info?.name,
                'billingAddress': ocrData.client_info?.billing_address || ocrData.client_info?.billingAddress,
                'shippingAddress': ocrData.client_info?.shipping_address || ocrData.client_info?.shippingAddress,
                'phoneNumber': ocrData.client_info?.phone,
                'email': ocrData.client_info?.email,
                'clientTaxId': ocrData.client_info?.tax_id || ocrData.client_info?.taxId,
                'contactPerson': ocrData.client_info?.contact_person || ocrData.client_info?.contactPerson,

                // Totals
                'subtotal': ocrData.amounts?.subtotal,
                'shippingFees': ocrData.amounts?.shipping_handling_fees || ocrData.amounts?.shippingHandlingFees,
                'surcharges': ocrData.amounts?.surcharges,
                'totalInvoiceAmount': ocrData.amounts?.total_invoice_amount || ocrData.amounts?.totalInvoiceAmount,
                'amountDue': ocrData.amounts?.amount_due || ocrData.amounts?.amountDue,

                // Compliance
                'notes': ocrData.additional_info?.notes_terms || ocrData.additional_info?.notesTerms,
                'qrOrIrn': ocrData.additional_info?.qr_code_irn || ocrData.additional_info?.qrCodeIrn,
                'companyRegistrationNumber': ocrData.additional_info?.company_registration_number || ocrData.additional_info?.companyRegistrationNumber,
            };
            targetObj = map[highlightedField];
        }

        const regions = targetObj?.bounding_regions || targetObj?.boundingRegions;
        return Array.isArray(regions) ? regions : [];
    }, [invoiceData, highlightedField]);

    /* ---------------- Logic: Highlighting (STATE-DRIVEN) ---------------- */
    const updateHighlights = useCallback((pageObj, viewport) => {
        if (!highlightRef.current) return;

        const [viewX, viewY, viewW, viewH] = pageObj.view;
        const widthPts = viewW - viewX;
        const heightPts = viewH - viewY;
        const pageOriginalRotation = pageObj.rotate;

        const newHighlights = [];

        highlightedRegions
            .filter(r => {
                const regionPage = r.page_number || r.pageNumber || 0;
                return regionPage === page || regionPage === page - 1;
            })
            .forEach(region => {
                if (!region.polygon || !Array.isArray(region.polygon)) return;

                let xs = [], ys = [];

                for (let i = 0; i < region.polygon.length; i += 2) {
                    const xRaw = region.polygon[i] * 72;
                    const yRaw = region.polygon[i + 1] * 72;

                    let xPts, yPts;

                    switch (pageOriginalRotation) {
                        case 90:
                            xPts = viewX + yRaw;
                            yPts = viewY + xRaw;
                            break;
                        case 180:
                            xPts = viewX + (widthPts - xRaw);
                            yPts = viewY + yRaw;
                            break;
                        case 270:
                            xPts = viewX + (widthPts - yRaw);
                            yPts = viewY + (heightPts - xRaw);
                            break;
                        default:
                            xPts = viewX + xRaw;
                            yPts = viewY + (heightPts - yRaw);
                    }

                    const [vx, vy] = viewport.convertToViewportPoint(xPts, yPts);
                    xs.push(vx);
                    ys.push(vy);
                }

                if (xs.length > 0) {
                    newHighlights.push({
                        left: Math.min(...xs),
                        top: Math.min(...ys),
                        width: Math.max(...xs) - Math.min(...xs),
                        height: Math.max(...ys) - Math.min(...ys),
                        page_number: region.page_number || region.pageNumber
                    });
                }
            });

        setActiveHighlights(newHighlights);
    }, [highlightedRegions, page]);

    /* ---------------- Logic: Auto-Scroll ---------------- */
    const scrollToFirstHighlight = useCallback((pageObj, viewport) => {
        if (!viewerRef.current) return;

        const region = highlightedRegions.find(r => (r.page_number || r.pageNumber) === page);
        if (!region) return;

        const yInches = region.polygon[1];
        const yPts = (pageObj.view[3] - pageObj.view[1]) - yInches * 72;
        const [, yPx] = viewport.convertToViewportPoint(0, yPts);

        requestAnimationFrame(() => {
            if (viewerRef.current) {
                viewerRef.current.scrollTo({
                    top: Math.max(yPx - 150, 0),
                    behavior: "smooth"
                });
            }
        });
    }, [highlightedRegions, page, viewerRef]);

    /* ---------------- Lifecycle: Jump to Highlighted Page ---------------- */
    useEffect(() => {
        if (!pdfObj || !highlightedRegions.length) return;

        const targetPage = highlightedRegions[0]?.page_number || highlightedRegions[0]?.pageNumber;
        if (!targetPage || targetPage === page) return;

        setPage(targetPage);
        if (autoFit) {
            autoFitWidth(pdfObj, targetPage, rotation);
        } else {
            renderPage(pdfObj, targetPage, scale, rotation);
        }
    }, [highlightedRegions, pdfObj, page, rotation, autoFit, autoFitWidth, renderPage, scale, setPage]);

    /* ---------------- Lifecycle: Highlight Draw & Scroll ---------------- */
    useEffect(() => {
        if (!pdfObj) return;

        (async () => {
            try {
                const pageObj = await pdfObj.getPage(page);
                const viewport = getViewport(pageObj, scale);
                updateHighlights(pageObj, viewport);
                if (highlightedRegions.length > 0) {
                    scrollToFirstHighlight(pageObj, viewport);
                }
            } catch (err) {
                console.error("Highlighting Effect Error:", err);
            }
        })();
    }, [highlightedRegions, page, scale, rotation, pdfObj, updateHighlights, scrollToFirstHighlight, getViewport]);

    return {
        activeHighlights,
        highlightRef,
        highlightedField, // To trigger key re-renders
        updateHighlights // Expose if needed for manual calls
    };
};
