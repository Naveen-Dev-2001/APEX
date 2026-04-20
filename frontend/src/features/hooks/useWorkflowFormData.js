import { useQuery } from "@tanstack/react-query";
import workflowAPI from "../../api/workflowAPI"

// ── Individual queries with long cache times (dropdown data rarely changes) ──

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const CACHE_TIME = 10 * 60 * 1000; // 10 minutes

export const useApprovers = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow-approvers"],
        queryFn: async () => {
            const start = performance.now();
            const res = await workflowAPI.getApprovers();
            console.log(`Approvers fetch: ${(performance.now() - start).toFixed(2)}ms`);
            return res ?? [];
        },
        staleTime: STALE_TIME,
        gcTime: CACHE_TIME,
    });

    return { approvers: data ?? [], isLoading, isError };
};

export const useLobs = (enabled = true) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow-lobs"],
        queryFn: async () => {
            const start = performance.now();
            const res = await workflowAPI.getLobs();
            console.log(`LOBs fetch: ${(performance.now() - start).toFixed(2)}ms`);
            return res ?? [];
        },
        staleTime: STALE_TIME,
        gcTime: CACHE_TIME,
        enabled,
    });

    return { lobs: data ?? [], isLoading, isError };
};

export const useDepartments = (enabled = true) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow-departments"],
        queryFn: async () => {
            const start = performance.now();
            const res = await workflowAPI.getDepartments();
            console.log(`Departments fetch: ${(performance.now() - start).toFixed(2)}ms`);
            return res ?? [];
        },
        staleTime: STALE_TIME,
        gcTime: CACHE_TIME,
        enabled,
    });

    return { departments: data ?? [], isLoading, isError };
};

export const useWorkflowVendors = (enabled = false) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow-vendors"],
        queryFn: async () => {
            // This is now discouraged for large datasets. 
            // RuleModal uses handleVendorSearch instead.
            return []; 
        },
        staleTime: STALE_TIME,
        gcTime: CACHE_TIME,
        enabled,
    });

    return { vendors: data ?? [], isLoading, isError };
};

// ── Combined hook used directly in RuleModal ──
export const useWorkflowFormData = (mode) => {
    const isCodification = mode === "codification";
    const isVendor = mode === "vendor";

    const { approvers, isLoading: approversLoading } = useApprovers();
    const { lobs, isLoading: lobsLoading } = useLobs(isCodification);
    const { departments, isLoading: deptsLoading } = useDepartments(isCodification);
    const { vendors, isLoading: vendorsLoading } = useWorkflowVendors(isVendor);

    return {
        approvers,
        lobs,
        departments,
        vendors,
        approversLoading,
        lobsLoading,
        deptsLoading,
        vendorsLoading,
    };
};