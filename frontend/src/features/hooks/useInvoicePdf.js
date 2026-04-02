import { useQuery } from "@tanstack/react-query";
import { getInvoicePdf } from "../../api/invoiceApi";

export const useInvoicePdf = (invoiceId) => {
    return useQuery({
        queryKey: ["invoice-pdf", invoiceId],
        queryFn: async () => {
            if (!invoiceId) return null;
            return await getInvoicePdf(invoiceId);
        },
        enabled: !!invoiceId,
        staleTime: 5 * 60 * 1000, // Caches for 5 minutes
        retry: false, // Don't retry on fetch failure
    });
};
