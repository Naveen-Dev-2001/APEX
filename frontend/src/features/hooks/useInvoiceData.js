import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInvoices } from "../../api/invoiceApi";
import { useCommonStore } from "../../store/common.store";
import { useAuthStore } from "../../store/authStore";

export const useInvoiceData = ({ skip = 0, limit = 10, search = "", filters = {}, sort_by = "uploaded_at", sort_dir = "desc", tab = undefined } = {}) => {
    const entity = useCommonStore((state) => state.entity);
    const { user, activeRole } = useAuthStore();
    const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters]);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["invoices", skip, limit, search, filtersKey, sort_by, sort_dir, tab, entity, user?.email, activeRole],
        queryFn: async ({ signal }) => {
            const start = performance.now();

            const res = await getInvoices({ skip, limit, search, filters, sort_by, sort_dir, show_all: true, tab }, { signal });

            const end = performance.now();
            const duration = (end - start).toFixed(2);

            console.log(`Invoices Data Fetch Time: ${duration} ms`);

            return res;
        },
        placeholderData: (previousData, previousQuery) => {
            const prevKey = previousQuery?.queryKey;
            if (!prevKey) return undefined;
            
            // Only preserve data if we are staying on the same tab, user, and role
            const isSameContext = 
                prevKey[7] === tab && 
                prevKey[9] === user?.email && 
                prevKey[10] === activeRole;

            return isSameContext ? previousData : undefined;
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
