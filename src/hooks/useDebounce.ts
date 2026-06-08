import { useState, useEffect } from 'react';

// Aqui retrasamos la actualizacion del valor devuelto hasta que pasen "delay" milisegundos sin que
// el valor de entrada cambie. Es util para campos de busqueda: asi el filtrado solo se ejecuta cuando
// el usuario deja de escribir, en lugar de en cada pulsacion de tecla
//
// Uso:
//   const [query, setQuery] = useState('');
//   const debouncedQuery = useDebounce(query, 300);
//   const filtered = useMemo(() => items.filter(...debouncedQuery...), [items, debouncedQuery]);
export function useDebounce<T>(value: T, delay = 300): T {
    // Guardamos una copia "retrasada" del valor que solo se actualiza cuando el temporizador llega a su fin
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Cada vez que "value" cambia, reiniciamos el temporizador: si llega un nuevo cambio antes
        // de que se cumpla el plazo, cancelamos el anterior y empezamos de nuevo (efecto "debounce")
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
