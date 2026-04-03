import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "../../api/invoiceApi";

export const useInvoiceData = ({ skip = 0, limit = 10, search = "", sort_by = "uploaded_at", sort_dir = "desc" } = {}) => {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["invoices", skip, limit, search, sort_by, sort_dir],
        queryFn: async () => {
            const start = performance.now();

            const res = await getInvoices({ skip, limit, search, sort_by, sort_dir });

            const end = performance.now();
            const duration = (end - start).toFixed(2);

            console.log(`Invoices Data Fetch Time: ${duration} ms`);

            return res;
        },
        keepPreviousData: true,
    });

    return {
        invoices: data?.data ?? [],
        total: data?.total ?? 0,
        page: data?.page ?? 1,
        page_size: data?.page_size ?? 10,
        isLoading,
        isError,
        refetch,
    };
};