import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "../../api/invoiceApi";

export const useInvoiceData = ({ skip = 0, limit = 10 } = {}) => {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["invoices", skip, limit],
        queryFn: async () => {
            const start = performance.now();

            const res = await getInvoices({ skip, limit });

            const end = performance.now();
            const duration = (end - start).toFixed(2);

            console.log(`Invoices Data Fetch Time: ${duration} ms`);

            return res
        },
        keepPreviousData: true,
    });

    return {
        invoices: data?.items ?? data ?? [],
        total: data?.total ?? 0,
        fetchTime: data?.fetchTime ?? 0,
        isLoading,
        isError,
        refetch,
    };
};