import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme, AppTheme } from '../theme/ThemeContext';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'accent';
    style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({ title, onPress, variant = 'primary', style }) => {
    const { theme } = useTheme();
    const styles = createStyles(theme);

    const getBackgroundColor = () => {
        switch (variant) {
            case 'primary': return theme.colors.primary;
            case 'secondary': return theme.colors.secondary;
            case 'accent': return theme.colors.accent;
            default: return theme.colors.primary;
        }
    };

    return (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: getBackgroundColor() }, style]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Text style={styles.text}>{title}</Text>
        </TouchableOpacity>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    button: {
        paddingVertical: theme.spacing.m,
        paddingHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3, // Android shadow
        shadowColor: '#000', // iOS shadow
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    text: {
        color: '#FFFFFF', // White text for better contrast on dark/green
        fontSize: 16,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    }
});
