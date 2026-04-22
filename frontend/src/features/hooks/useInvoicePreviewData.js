import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchInvoicePreviewData } from "../../api/invoiceApi";
import { useEffect } from "react";

/**
 * Fires vendor detail + workflow data + coding suggestions in parallel
 * the moment an invoice preview opens. Uses a single React-Query cache
 * entry keyed by [invoiceId, vendorId] so subsequent opens are instant.
 *
 * Also pre-seeds the individual query caches used by useWorkflowDataSync
 * and useVendorDetailSync so those hooks return data instantly from cache.
 */
export const useInvoicePreviewData = ({ invoiceId, vendorId, workflowParams = {} }) => {
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery({
        queryKey: ["invoice-preview", invoiceId, vendorId, workflowParams],
        queryFn: () =>
            fetchInvoicePreviewData({ invoiceId, vendorId, workflowParams }),
        enabled: !!invoiceId,
        staleTime: 2 * 60 * 1000, // 2 min
        retry: 1,
    });

    // Pre-seed individual caches so downstream hooks (useWorkflowDataSync,
    // useVendorDetailSync) return data instantly without re-fetching.
    useEffect(() => {
        if (!data) return;

        if (data.workflowData) {
            // Seed both with-params and no-params workflow cache keys so
            // CodingTab (no params) and TopBar (with params) both hit cache.
            queryClient.setQueryData(
                ["workflow", invoiceId, workflowParams],
                data.workflowData
            );
            queryClient.setQueryData(
                ["workflow", invoiceId, {}],
                data.workflowData
            );
        }

        // Seed useVendorDetailSync's cache key: ["vendor", vendorId]
        if (data.vendor) {
            queryClient.setQueryData(["vendor", vendorId], data.vendor);
        }

        // Seed CodingTab's suggestions cache key to avoid duplicate fetch
        if (data.codingSuggestions) {
            queryClient.setQueryData(
                ["coding-suggestions", invoiceId, vendorId],
                data.codingSuggestions
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, invoiceId, vendorId, queryClient]);

    return {
        vendor: data?.vendor ?? null,
        workflowData: data?.workflowData ?? null,
        codingSuggestions: data?.codingSuggestions ?? [],
        isLoadingPreview: isLoading,
        isPreviewError: isError,
    };
};
