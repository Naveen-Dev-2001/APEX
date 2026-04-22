import { useQuery } from "@tanstack/react-query";
import { masterDataService, fetchBulkCodingData } from "../../api/masterdataAPI";

export const useGLMasterSync = (enabled = true) => {
    return useQuery({
        queryKey: ["gl-master"],
        queryFn: () => masterDataService.getGLMasterData({ page_size: 2000 }),
        staleTime: 5 * 60 * 1000,
        enabled,
    });
};

export const useLOBMasterSync = (enabled = true) => {
    return useQuery({
        queryKey: ["lob-master"],
        queryFn: () => masterDataService.getLOBMasterData({ page_size: 2000 }),
        staleTime: 5 * 60 * 1000,
        enabled,
    });
};

export const useDepartmentMasterSync = (enabled = true) => {
    return useQuery({
        queryKey: ["department-master"],
        queryFn: () => masterDataService.getDepartmentMasterData({ page_size: 2000 }),
        staleTime: 5 * 60 * 1000,
        enabled,
    });
};

export const useCustomerMasterSync = (enabled = true) => {
    return useQuery({
        queryKey: ["customer-master"],
        queryFn: () => masterDataService.getCustomerMasterData({ page_size: 2000 }),
        staleTime: 5 * 60 * 1000,
        enabled,
    });
};

export const useItemMasterSync = (enabled = true) => {
    return useQuery({
        queryKey: ["item-master"],
        queryFn: () => masterDataService.getItemMasterData({ page_size: 2000 }),
        staleTime: 5 * 60 * 1000,
        enabled,
    });
};

/**
 * Fetches GL + LOB + Department + Customer + Item in ONE request.
 * Returns { glData, lobData, deptData, customerData, itemData, isLoading, isError }
 * so CodingTab can replace 5 individual hooks with a single hook call.
 */
export const useBulkCodingDataSync = (enabled = true) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["bulk-coding-data"],
        queryFn: () => fetchBulkCodingData(2000),
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        enabled,
    });

    return {
        glData:       data?.gl       ?? [],
        lobData:      data?.lob      ?? [],
        deptData:     data?.department ?? [],
        customerData: data?.customer ?? [],
        itemData:     data?.item     ?? [],
        isLoading,
        isError,
    };
};

