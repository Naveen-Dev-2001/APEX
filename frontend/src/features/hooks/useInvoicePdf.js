import { useQuery } from "@tanstack/react-query";
import { getInvoicePdf } from "../../api/invoiceApi";
import { useInvoiceStore } from "../../store/invoice.store";

export const useInvoicePdf = (invoiceId, isEnabled = true) => {
    const activeInvoiceData = useInvoiceStore((state) => state.activeInvoiceData);
    const isArchived = Boolean(activeInvoiceData?.is_archived);

    return useQuery({
        queryKey: ["invoice-pdf", invoiceId, isArchived],
        queryFn: async () => {
            if (!invoiceId) return null;
            return await getInvoicePdf(invoiceId, isArchived);
        },
        enabled: !!invoiceId && isEnabled,
        staleTime: 5 * 60 * 1000, // Caches for 5 minutes
        retry: false, // Don't retry on fetch failure
    });
};
