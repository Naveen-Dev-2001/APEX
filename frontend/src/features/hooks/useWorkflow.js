import { useQuery } from "@tanstack/react-query"
import { getAudit, getworkflowApprovers, getWorkflowData } from "../../api/invoiceApi";

export const useWorkflowDataSync = (invoiceId, params = {}) => {

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["workflow", invoiceId, params],
        queryFn: () => getWorkflowData(invoiceId, params),
        enabled: !!invoiceId,
        staleTime: 2 * 60 * 1000,   // 2 min — avoids re-fetch on tab switch
        gcTime: 5 * 60 * 1000,       // 5 min — keeps in cache after unmount
    });

    return {
        workflowData: data,
        isLoadingWorkflowData: isLoading,
        isWorkflowDataError: isError,
        refetchWorkflowData: refetch,
    };
};

export const getWorkflowApproversSync = (invoiceId) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflowApprovers", invoiceId],
        queryFn: () => getworkflowApprovers(invoiceId),
        enabled: !!invoiceId,
        staleTime: 2 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
    })

    return {
        workflowApprovers: data,
        isLoadingWorkflowApprovers: isLoading,
        isWorkflowApproversError: isError,
    }
}


export const getAuditflowSync = (invoiceId) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["auditFlow", invoiceId],
        queryFn: () => getAudit(invoiceId),
        enabled: !!invoiceId,
        staleTime: 2 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
    })

    return {
        getAuditData: data,
        isAuditLoading: isLoading,
        isAuditError: isError
    }
}