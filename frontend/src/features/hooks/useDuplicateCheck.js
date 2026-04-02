import { useEffect } from "react";
import { useInvoiceStore } from "../../store/invoice.store";
import { checkDuplicate } from "../../api/invoiceApi";

export const useDuplicateCheck = () => {
    const { 
        quickViewFormData, 
        viewInvoiceId, 
        setIsDuplicate, 
        setDuplicateMessage 
    } = useInvoiceStore();

    const vendorId = quickViewFormData?.vendorId;
    const invoiceNumber = quickViewFormData?.invoiceNumber;

    useEffect(() => {
        if (!vendorId || !invoiceNumber) {
            setIsDuplicate(false);
            setDuplicateMessage("");
            return;
        }

        const triggerCheck = async () => {
            try {
                const response = await checkDuplicate({
                    vendor_id: vendorId,
                    invoice_number: invoiceNumber,
                    current_invoice_id: viewInvoiceId
                });

                if (response.is_duplicate) {
                    setIsDuplicate(true);
                    setDuplicateMessage(response.message || "Duplicate invoice detected.");
                } else {
                    setIsDuplicate(false);
                    setDuplicateMessage("");
                }
            } catch (error) {
                console.error("Duplicate check failed:", error);
                // Keep the current state if API fails
            }
        };

        const timeoutId = setTimeout(triggerCheck, 500); // 500ms debounce
        return () => clearTimeout(timeoutId);

    }, [vendorId, invoiceNumber, viewInvoiceId, setIsDuplicate, setDuplicateMessage]);

    return null;
};
