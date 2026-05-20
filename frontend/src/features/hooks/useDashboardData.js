// features/dashboard/hooks/useDashboardData.js
import { useQueries } from "@tanstack/react-query";
import {
    getSummary,
    getAging,
    getStatusBreakdown,
    getVendors,
    getTopVendors,
    getPayments
} from "../../api/dashboardApi";
import { useCommonStore } from "../../store/common.store";

export const useDashboardData = () => {
    const entity = useCommonStore((state) => state.entity)
    const results = useQueries({
        queries: [
            { queryKey: ["dashboard", "summary", entity], queryFn: getSummary },
            { queryKey: ["dashboard", "aging", entity], queryFn: getAging },
            { queryKey: ["dashboard", "status", entity], queryFn: getStatusBreakdown },
            { queryKey: ["dashboard", "vendors", entity], queryFn: getVendors },
            { queryKey: ["dashboard", "topVendors", entity], queryFn: getTopVendors },
            { queryKey: ["dashboard", "payments", entity], queryFn: getPayments },
        ],
    });

    return {
        summary: results[0].data,
        aging: results[1].data,
        status: results[2].data,
        vendors: results[3].data,
        topVendors: results[4].data,
        payments: results[5].data,

        isLoading: results.some(q => q.isLoading),
        isFetching: results.some(q => q.isFetching),
        isError: results.some(q => q.isError),
    };
};