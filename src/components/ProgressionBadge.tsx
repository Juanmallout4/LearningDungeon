import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { PROGRESSION_SCALES } from '../data/progressionScales';

interface ProgressionBadgeProps {
    activityType: string;
    levelOrder: number;
    levelName?: string;
    width?: number | string;
    height?: number;
    textSize?: number;
}

// Pequeña insignia que muestra el nivel/grado actual de un usuario en una actividad: busca el color y
// nombre correspondientes en el catalogo PROGRESSION_SCALES segun la actividad y el numero de orden del nivel,
// y si no encuentra una entrada en el catalogo recurre al nombre de nivel recibido por props como respaldo
export const ProgressionBadge: React.FC<ProgressionBadgeProps> = ({
    activityType,
    levelOrder,
    levelName,
    width = 140,
    height = 32,
    textSize,
}) => {
    const { theme } = useTheme();
    const level = PROGRESSION_SCALES[activityType]?.find(l => l.order === levelOrder);
    const backgroundColor = level?.color || theme.colors.surfaceHighlight;
    const color = level?.textColor || (level ? theme.colors.text : theme.colors.textSecondary);
    const label = level?.name || levelName || '';

    if (!label) return null;

    return (
        <View
            style={[
                styles.badge,
                { backgroundColor, width: width as any, height, borderColor: theme.colors.border },
            ]}
        >
            <Text
                style={[styles.text, { color }, textSize ? { fontSize: textSize } : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {label}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        marginVertical: 4,
    },
    text: {
        fontSize: 14,
        fontWeight: 'bold',
    },
});
