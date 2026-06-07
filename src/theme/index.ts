export const lightColors = {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceHighlight: '#E9E9E9',
    primary: '#21b668',   // AIM Education Green
    secondary: '#0057B7', // Blue (ITF)
    accent: '#CE1126',    // Red (ITF)
    text: '#121212',
    textSecondary: '#666666',
    border: '#E0E0E0',
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
};

export const darkColors = {
    background: '#121212',
    surface: '#1E1E1E',
    surfaceHighlight: '#2A2A2A',
    primary: '#21b668',   // AIM Education Green
    secondary: '#0057B7', // Blue (ITF)
    accent: '#CE1126',    // Red (ITF)
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
};

export const typography = {
    header: {
        fontSize: 28,
        fontWeight: 'bold' as 'bold',
    },
    subheader: {
        fontSize: 20,
        fontWeight: '600' as '600',
    },
    body: {
        fontSize: 16,
    },
    caption: {
        fontSize: 14,
    }
};

export const spacing = {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
};

export const borderRadius = {
    s: 4,
    m: 8,
    l: 16,
    xl: 24,
};

// Export a default static theme for backward compatibility during the transition,
// or for files that haven't been migrated to the hook yet.
export const theme = {
    colors: darkColors,
    typography,
    spacing,
    borderRadius,
};
