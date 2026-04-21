import { useQuery } from "@tanstack/react-query"
import { getAudit, getworkflowApprovers, getWorkflowData } from "../../api/invoiceApi";

export const useWorkflowDataSync = (invoiceId, params = {}) => {

    const { data, isLoading, isError } = useQuery({
        queryKey: ["workflow", invoiceId, params],
        queryFn: () => getWorkflowData(invoiceId, params),
        enabled: !!invoiceId,
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
    })

    return {
        getAuditData: data,
        isAuditLoading: isLoading,
        isAuditError: isError
    }
}