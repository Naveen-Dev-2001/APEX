import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "../../api/invoiceApi";
import { useCommonStore } from "../../store/common.store";

export const useInvoiceData = ({ skip = 0, limit = 10, search = "", filters = {}, sort_by = "uploaded_at", sort_dir = "desc", tab = undefined } = {}) => {
    const entity = useCommonStore((state) => state.entity);
    const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["invoices", skip, limit, search, filtersKey, sort_by, sort_dir, tab, entity],
        queryFn: async ({ signal }) => {
            const start = performance.now();

            const res = await getInvoices({ skip, limit, search, filters, sort_by, sort_dir, show_all: true, tab }, { signal });

            const end = performance.now();
            const duration = (end - start).toFixed(2);

            console.log(`Invoices Data Fetch Time: ${duration} ms`);

            return res;
        },
        placeholderData: (previousData, previousQuery) => {
            // Only preserve data if we are staying on the same tab
            const prevTab = previousQuery?.queryKey?.[7]; // tab is at index 7 in queryKey
            if (prevTab !== tab) return undefined;
            return previousData;
        },
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
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
