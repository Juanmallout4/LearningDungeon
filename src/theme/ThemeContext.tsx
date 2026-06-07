import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, typography, spacing, borderRadius } from './index';

// Type definitions for our Theme
export type ThemeColors = typeof lightColors;

export interface AppTheme {
    colors: ThemeColors;
    typography: typeof typography;
    spacing: typeof spacing;
    borderRadius: typeof borderRadius;
    isDark: boolean;
}

// Initial default theme (fallback)
const defaultTheme: AppTheme = {
    colors: darkColors,
    typography,
    spacing,
    borderRadius,
    isDark: true,
};

// Create Context
const ThemeContext = createContext<{
    theme: AppTheme;
    toggleTheme: () => void;
}>({
    theme: defaultTheme,
    toggleTheme: () => { console.warn('Theme provider not found'); }
});

// Custom Hook
export const useTheme = () => useContext(ThemeContext);

// Provider Component
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();

    // Initialize based on Appearance directly as well to be safe
    const [isDark, setIsDark] = useState(
        systemColorScheme === 'dark' || Appearance.getColorScheme() === 'dark'
    );
    const [hasManualOverride, setHasManualOverride] = useState(false);

    const [isThemeReady, setIsThemeReady] = useState(false);

    // Initialize from storage
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

    // Listen for system theme changes ONLY if no manual override and theme is ready
    useEffect(() => {
        if (isThemeReady && !hasManualOverride) {
            setIsDark(systemColorScheme === 'dark');
        }
    }, [systemColorScheme, hasManualOverride, isThemeReady]);

    // Also listen via Appearance API for Android robustness
    useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            if (isThemeReady && !hasManualOverride) {
                setIsDark(colorScheme === 'dark');
            }
        });
        return () => subscription.remove();
    }, [hasManualOverride, isThemeReady]);

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

    // Sync theme to root HTML tag on Web for CSS variables / scrollbars
    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

            // Dynamically inject scrollbar styles to avoid bundler CSS issues
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

    // Inject dynamic colors into typography
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
