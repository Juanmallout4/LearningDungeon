import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, typography, spacing, borderRadius } from './index';

// Tipo de la paleta de colores activa (deriva su forma de lightColors, que tiene las mismas claves que darkColors)
export type ThemeColors = typeof lightColors;

// Forma del tema completo expuesto a los componentes: colores activos + escalas de tipografía/espaciado/bordes + flag isDark
export interface AppTheme {
    colors: ThemeColors;
    typography: typeof typography;
    spacing: typeof spacing;
    borderRadius: typeof borderRadius;
    isDark: boolean;
}

// Tema por defecto (oscuro) que se usa como valor inicial del contexto antes de que el provider monte
const defaultTheme: AppTheme = {
    colors: darkColors,
    typography,
    spacing,
    borderRadius,
    isDark: true,
};

// Contexto de tema: expone el tema activo y la función para alternar entre claro/oscuro.
// Si no hay provider montado, toggleTheme solo emite un warning (valor de seguridad)
const ThemeContext = createContext<{
    theme: AppTheme;
    toggleTheme: () => void;
}>({
    theme: defaultTheme,
    toggleTheme: () => { console.warn('Theme provider not found'); }
});

// Hook de acceso: devuelve { theme, toggleTheme } del contexto más cercano
export const useTheme = () => useContext(ThemeContext);

// Proveedor del tema: decide si usar claro u oscuro combinando la preferencia del sistema operativo
// con una posible elección manual guardada por el usuario, y construye el objeto de tema final
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();

    // Inicializamos también desde Appearance directamente por seguridad (algunos entornos tardan en reportar el esquema)
    const [isDark, setIsDark] = useState(
        systemColorScheme === 'dark' || Appearance.getColorScheme() === 'dark'
    );
    // true si el usuario eligió manualmente un tema (en ese caso ignoramos los cambios del sistema)
    const [hasManualOverride, setHasManualOverride] = useState(false);

    const [isThemeReady, setIsThemeReady] = useState(false);

    // Carga la preferencia guardada en AsyncStorage (clave 'app-theme'); si existe, marca que hay override manual
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem('app-theme');
                if (savedTheme !== null) {
                    setIsDark(savedTheme === 'dark');
                    setHasManualOverride(true);
                }
                setIsThemeReady(true);
            } catch (e) {
                console.error('Failed to load theme preference', e);
                setIsThemeReady(true);
            }
        };
        loadTheme();
    }, []);

    // Sincroniza con los cambios de esquema del sistema, pero solo si el usuario no ha elegido manualmente
    // y la preferencia guardada ya se cargó (para no pisar la elección manual al arrancar)
    useEffect(() => {
        if (isThemeReady && !hasManualOverride) {
            setIsDark(systemColorScheme === 'dark');
        }
    }, [systemColorScheme, hasManualOverride, isThemeReady]);

    // Suscripción adicional vía Appearance API (más fiable en Android para detectar el cambio en caliente)
    useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            if (isThemeReady && !hasManualOverride) {
                setIsDark(colorScheme === 'dark');
            }
        });
        return () => subscription.remove();
    }, [hasManualOverride, isThemeReady]);

    // Alterna manualmente entre claro/oscuro, marca el override y persiste la elección en AsyncStorage
    const toggleTheme = async () => {
        const newValue = !isDark;
        setIsDark(newValue);
        setHasManualOverride(true);
        try {
            await AsyncStorage.setItem('app-theme', newValue ? 'dark' : 'light');
        } catch (e) {
            console.error('Failed to save theme preference', e);
        }
    };

    // En web, sincroniza el atributo data-theme del <html> raíz (para variables CSS) e inyecta
    // estilos de scrollbar dependientes del tema dinámicamente, evitando problemas con el bundler de CSS estático
    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

            const styleId = 'Learning Dungeon-dynamic-scrollbars';
            let styleEl = document.getElementById(styleId);

            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }

            const thumbColor = isDark ? '#333333' : '#c1c1c1';
            const thumbHoverColor = isDark ? '#555555' : '#a8a8a8';
            const trackColor = isDark ? '#121212' : '#f1f1f1';

            styleEl.innerHTML = `
                html, body { overflow: hidden; height: 100vh; }
                ::-webkit-scrollbar { width: 10px; height: 10px; }
                ::-webkit-scrollbar-track { background: ${trackColor}; }
                ::-webkit-scrollbar-thumb { background: ${thumbColor}; border-radius: 5px; }
                ::-webkit-scrollbar-thumb:hover { background: ${thumbHoverColor}; }
            `;
        }
    }, [isDark]);

    const activeColors = isDark ? darkColors : lightColors;

    // Inyecta el color de texto correspondiente en cada variante tipográfica según el tema activo
    const dynamicTypography = {
        header: { ...typography.header, color: activeColors.text },
        subheader: { ...typography.subheader, color: activeColors.text },
        body: { ...typography.body, color: activeColors.text },
        caption: { ...typography.caption, color: activeColors.textSecondary },
    };

    const currentTheme: AppTheme = {
        colors: activeColors,
        typography: dynamicTypography,
        spacing,
        borderRadius,
        isDark,
    };

    return (
        <ThemeContext.Provider value={{ theme: currentTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
