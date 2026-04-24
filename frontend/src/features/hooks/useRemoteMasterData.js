import { useState, useCallback, useRef, useEffect } from "react";
import { masterDataService } from "../../api/masterdataAPI";

/**
 * Hook to handle remote master data searching with debouncing.
 * @param {string} identifier - The master data identifier (e.g., 'GL', 'LOB')
 * @param {Object} options - Configuration options
 * @param {Function} options.mapOption - Mapper to convert backend record to { label, value }
 * @param {boolean} options.preload - Whether to fetch initial options immediately
 * @param {Array<string|number>} options.initialValues - Selected values that must have labels available
 */
export const useRemoteMasterData = (identifier, { mapOption, preload = false, initialValues = [], enabled = true } = {}) => {
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const hasFetchedRef = useRef(false);
    const searchTimeoutRef = useRef(null);
    const optionsRef = useRef([]);

    const mergeOptions = useCallback((existing, incoming) => {
        const map = new Map();
        existing.forEach((opt) => map.set(String(opt.value), opt));
        incoming.forEach((opt) => map.set(String(opt.value), opt));
        return Array.from(map.values());
    }, []);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const fetchOptions = useCallback(async (search = "", limit = 50, merge = false) => {
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
            setOptions((prev) => (merge ? mergeOptions(prev, mapped) : mapped));
            if (!search) hasFetchedRef.current = true;
        } catch (err) {
            console.error(`Error searching ${identifier}:`, err);
        } finally {
            setLoading(false);
        }
    }, [identifier, mapOption, enabled, mergeOptions]);

    const handleSearch = useCallback((val) => {
        if (!enabled) return;
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        
        // If empty, we can either clear or fetch top items
        if (!val) {
            fetchOptions("", 50);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            fetchOptions(val, 50, false);
        }, 500);
    }, [fetchOptions, enabled]);

    const onDropdownOpen = useCallback((open) => {
        if (open && !hasFetchedRef.current && !loading && enabled) {
            fetchOptions("", 50);
        }
    }, [fetchOptions, loading, enabled]);

    useEffect(() => {
        if (!enabled || !preload || hasFetchedRef.current) return;
        fetchOptions("", 50, false);
    }, [enabled, preload, fetchOptions]);

    useEffect(() => {
        if (!enabled || !initialValues?.length) return;

        const selected = Array.from(new Set(initialValues.filter(Boolean).map(String)));
        if (selected.length === 0) return;

        const known = new Set(optionsRef.current.map((opt) => String(opt.value)));
        const missing = selected.filter((val) => !known.has(val));
        if (missing.length === 0) return;

        let cancelled = false;
        (async () => {
            try {
                const responses = await Promise.all(
                    missing.map((val) =>
                        masterDataService.getMasterData(identifier, {
                            page: 1,
                            page_size: 50,
                            search: val
                        })
                    )
                );
                if (cancelled) return;

                const fetched = responses
                    .flatMap((res) => res.data || [])
                    .map(mapOption)
                    .filter((opt) => missing.includes(String(opt.value)));

                if (fetched.length > 0) {
                    setOptions((prev) => mergeOptions(prev, fetched));
                }
            } catch (err) {
                console.error(`Error ensuring selected ${identifier} values:`, err);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, identifier, initialValues, mapOption, mergeOptions]);

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
        refresh: () => fetchOptions("", 50, false)
    };
};
