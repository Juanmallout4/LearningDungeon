import { useState, useEffect } from 'react';

/**
 * Delays updating the returned value until `delay` ms have passed
 * without the input changing. Use this on search query state so
 * filter/query logic only fires after the user stops typing.
 *
 * Usage:
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 300);
 *   const filtered = useMemo(() => items.filter(...debouncedQuery...), [items, debouncedQuery]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
