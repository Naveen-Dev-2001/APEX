import { useQuery } from "@tanstack/react-query"
import { getAudit, getworkflowApprovers, getWorkflowData } from "../../api/invoiceApi";

export const useWorkflowDataSync = (invoiceId) => {

    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow", invoiceId],
        queryFn: () => getWorkflowData(invoiceId),
        enabled: !!invoiceId,
        staleTime: 5 * 60 * 1000,
    });

    return {
        workflowData: data,
        isLoadingWorkflowData: isLoading,
        isWorkflowDataError: isError,
    };
};

export const getWorkflowApproversSync = (invoiceId) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflowApprovers", invoiceId],
        queryFn: () => getworkflowApprovers(invoiceId),
        enabled: !!invoiceId,
        staleTime: 5 * 60 * 1000,
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
        staleTime: 5 * 60 * 1000,
    })

    return {
        getAuditData: data,
        isAuditLoading: isLoading,
        isAuditError: isError
    }
}