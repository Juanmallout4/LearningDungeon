// Paleta de colores para el modo claro. Aqui podemos configurar los colores base de la app (fondo, superficies,
// marca, texto y estados success/error/warning) que consume ThemeContext según el modo activo
export const lightColors = {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceHighlight: '#E9E9E9',
    primary: '#21b668',   // Verde de AIM Education
    secondary: '#0057B7', // Azul (ITF)
    accent: '#CE1126',    // Rojo (ITF)
    text: '#121212',
    textSecondary: '#666666',
    border: '#E0E0E0',
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
};

// Paleta equivalente para el modo oscuro (mismos colores de marca, fondos/textos invertidos)
export const darkColors = {
    background: '#121212',
    surface: '#1E1E1E',
    surfaceHighlight: '#2A2A2A',
    primary: '#21b668',   // Verde de AIM Education
    secondary: '#0057B7', // Azul (ITF)
    accent: '#CE1126',    // Rojo (ITF)
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
};

// Aqui podemos configurar los tamaños y pesos de fuente reutilizados en toda la app (títulos, subtítulos, cuerpo, pies)
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

// Escala de espaciados estándar (en puntos) usada para márgenes y paddings consistentes en toda la UI
export const spacing = {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
};

// Escala de radios de borde estándar para mantener coherencia visual en tarjetas, botones, modales, etc.
export const borderRadius = {
    s: 4,
    m: 8,
    l: 16,
    xl: 24,
};

// Tema estático por defecto (modo oscuro) que se exporta para mantener compatibilidad con código que aún
// no migró al hook useTheme/ThemeContext, o para usarlo fuera del árbol de componentes con contexto
export const theme = {
    colors: darkColors,
    typography,
    spacing,
    borderRadius,
};
