import { useState, useCallback, useRef, useEffect } from "react";
import { masterDataService } from "../../api/masterdataAPI";

/**
 * Hook to handle remote master data searching with debouncing.
 * @param {string} identifier - The master data identifier (e.g., 'GL', 'LOB')
 * @param {Object} options - Configuration options
 * @param {Function} options.mapOption - Mapper to convert backend record to { label, value }
 * @param {any} options.initialValue - Initial selected value
 */
export const useRemoteMasterData = (identifier, { mapOption, initialValue } = {}) => {
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const searchTimeoutRef = useRef(null);

    const fetchOptions = useCallback(async (search = "", limit = 50) => {
        setLoading(true);
        try {
            const res = await masterDataService.getSheetData(identifier, {
                page: 1,
                page_size: limit,
                search
            });
            
            const data = res.data || [];
            const mapped = data.map(mapOption);
            setOptions(mapped);
        } catch (err) {
            console.error(`Error searching ${identifier}:`, err);
        } finally {
            setLoading(false);
        }
    }, [identifier, mapOption]);

    const handleSearch = useCallback((val) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        
        // If empty, we can either clear or fetch top items
        if (!val) {
            fetchOptions("", 50);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            fetchOptions(val, 50);
        }, 500);
    }, [fetchOptions]);

    // Initial load: Fetch top 50 items OR fetch the record for the initialValue
    useEffect(() => {
        fetchOptions("", 50);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [fetchOptions]);

    return {
        options,
        loading,
        handleSearch,
        refresh: () => fetchOptions("", 50)
    };
};
