import { useQuery } from "@tanstack/react-query";
import { masterDataService } from "../../api/masterdataAPI";

export const useGLMasterSync = () => {
    return useQuery({
        queryKey: ["gl-master"],
        queryFn: () => masterDataService.getGLMasterData(),
        staleTime: 5 * 60 * 1000,
    });
};

export const useLOBMasterSync = () => {
    return useQuery({
        queryKey: ["lob-master"],
        queryFn: () => masterDataService.getLOBMasterData(),
        staleTime: 5 * 60 * 1000,
    });
};

export const useDepartmentMasterSync = () => {
    return useQuery({
        queryKey: ["department-master"],
        queryFn: () => masterDataService.getDepartmentMasterData(),
        staleTime: 5 * 60 * 1000,
    });
};

export const useCustomerMasterSync = () => {
    return useQuery({
        queryKey: ["customer-master"],
        queryFn: () => masterDataService.getCustomerMasterData(),
        staleTime: 5 * 60 * 1000,
    });
};

export const useItemMasterSync = () => {
    return useQuery({
        queryKey: ["item-master"],
        queryFn: () => masterDataService.getItemMasterData(),
        staleTime: 5 * 60 * 1000,
    });
};
