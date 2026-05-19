import { useQuery } from "@tanstack/react-query";
import { getInvoicePdf } from "../../api/invoiceApi";

export const useInvoicePdf = (invoiceId, isEnabled = true) => {
    return useQuery({
        queryKey: ["invoice-pdf", invoiceId],
        queryFn: async () => {
            if (!invoiceId) return null;
            return await getInvoicePdf(invoiceId);
        },
        enabled: !!invoiceId && isEnabled,
        staleTime: 5 * 60 * 1000, // Caches for 5 minutes
        retry: false, // Don't retry on fetch failure
    });
};
