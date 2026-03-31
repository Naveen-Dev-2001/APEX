import { useQuery } from "@tanstack/react-query";
import { getVendorById, fetchAllVendors } from "../../api/invoiceApi";

export const useVendorDetailSync = (vendorId) => {

    const { data, isLoading, isError } = useQuery({
        queryKey: ["vendor", vendorId],
        queryFn: () => getVendorById(vendorId),
        enabled: !!vendorId,
        staleTime: 5 * 60 * 1000,
    });

    // Normalize data here
    const vendor = Array.isArray(data) ? data[0] : data;

    return {
        vendor,
        isLoadingVendorDetail: isLoading,
        isError,
    };
};

export const useVendersListSync = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["vendors"],
        queryFn: () => fetchAllVendors(),
        enabled: true,
        staleTime: 5 * 60 * 1000,
    });

    return {
        vendorsList: data,
        isLoadingVendorsList: isLoading,
        isVenderError: isError,
    }
}