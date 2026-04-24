import { useState, useCallback, useRef, useEffect } from "react";
import { masterDataService } from "../../api/masterdataAPI";

/**
 * Hook to handle remote master data searching with debouncing.
 * @param {string} identifier - The master data identifier (e.g., 'GL', 'LOB')
 * @param {Object} options - Configuration options
 * @param {Function} options.mapOption - Mapper to convert backend record to { label, value }
 * @param {any} options.initialValue - Initial selected value
 */
export const useRemoteMasterData = (identifier, { mapOption, initialValue, enabled = true } = {}) => {
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const hasFetchedRef = useRef(false);
    const searchTimeoutRef = useRef(null);

    const fetchOptions = useCallback(async (search = "", limit = 50) => {
        if (!enabled) return;
        setLoading(true);
        try {
            const res = await masterDataService.getMasterData(identifier, {
                page: 1,
                page_size: limit,
                search
            });
            
            const data = res.data || [];
            const mapped = data.map(mapOption);
            setOptions(mapped);
            if (!search) hasFetchedRef.current = true;
        } catch (err) {
            console.error(`Error searching ${identifier}:`, err);
        } finally {
            setLoading(false);
        }
    }, [identifier, mapOption, enabled]);

    const handleSearch = useCallback((val) => {
        if (!enabled) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        
        // If empty, we can either clear or fetch top items
        if (!val) {
            fetchOptions("", 50);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            fetchOptions(val, 50);
        }, 500);
    }, [fetchOptions, enabled]);

    const onDropdownOpen = useCallback((open) => {
        if (open && !hasFetchedRef.current && !loading && enabled) {
            fetchOptions("", 50);
        }
    }, [fetchOptions, loading, enabled]);

    // Initial load: Removed to favor on-demand loading via onDropdownOpen or Search
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, []);

    return {
        options,
        loading,
        handleSearch,
        onDropdownOpen,
        refresh: () => fetchOptions("", 50)
    };
};
