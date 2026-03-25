import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "../../api/invoiceApi";

export const useInvoiceData = ({ skip = 0, limit = 10 } = {}) => {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["invoices", skip, limit],
        queryFn: () => getInvoices({ skip, limit }),
        keepPreviousData: true,   // ← prevents flicker when changing pages
    });

    console.log({ data });


    return {
        invoices: data?.items ?? data ?? [],
        total: data?.total ?? 0,
        isLoading,
        isError,
        refetch,
    };
};