import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { BELT_CONFIGS } from '../data/belts';
import { useTranslation } from 'react-i18next';

interface BeltDisplayProps {
    rank: number;
    showLine?: boolean;
    showText?: boolean;
    width?: number | string;
    height?: number;
    textSize?: number;
    vertical?: boolean;
}

export const BeltDisplay: React.FC<BeltDisplayProps> = ({
    rank,
    showLine = true,
    showText = true,
    width = 240,
    height = 32,
    textSize,
    vertical = false
}) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    // Buscamos la configuracion visual (colores, nombre, gup) correspondiente al rango numerico recibido
    const config = BELT_CONFIGS[rank];
    if (!config) return null;

    // A partir del rango 10 son cinturones negros, que muestran el numero de Dan en romanos (ej. "I Dan" -> "I")
    const isBlackBelt = rank >= 10;
    const romanRank = isBlackBelt ? config.name.split(' ')[0] : '';

    return (
        <View style={styles.container}>
            {showLine && (
                <View style={[
                    styles.beltLine,
                    {
                        backgroundColor: config.mainColor,
                        width: vertical ? height : (width as any),
                        height: vertical ? (width as any) : height,
                        borderColor: theme.colors.border,
                        flexDirection: vertical ? 'column' : 'row',
                    },
                    config.borderColor ? { borderWidth: 1, borderColor: config.borderColor } : null
                ]}>
                    {isBlackBelt && (
                        <Text style={[styles.romanText, vertical ? { bottom: 4, left: 0, right: 0, textAlign: 'center', fontSize: 13 } : { right: 15 }]}>{romanRank}</Text>
                    )}
                    {config.tipColor && (
                        <View style={[vertical ? styles.tipVertical : styles.tipHorizontal, { backgroundColor: config.tipColor }]} />
                    )}
                </View>
            )}
            {showText && (
                <Text
                    style={[
                        styles.text,
                        { color: config.textColor === 'theme' ? theme.colors.text : config.textColor },
                        textSize ? { fontSize: textSize } : null
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                >
                    {t(`belts.${config.name}`, { defaultValue: config.name })} ({t(`belts.${config.gup}`, { defaultValue: config.gup })})
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 4,
    },
    beltLine: {
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    tipHorizontal: {
        width: '15%', // Ancho relativo para que escale bien con cualquier tamano del cinturon
        height: '100%',
        marginRight: '10%', // Margen relativo, igual que el ancho
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    tipVertical: {
        height: '15%',
        width: '100%',
        marginBottom: '10%',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    romanText: {
        color: '#FFE135', // Amarillo
        fontWeight: 'bold',
        fontSize: 16,
        position: 'absolute',
        right: 15, // Lo colocamos pegado al extremo derecho del cinturon
        zIndex: 2,
    },
    text: {
        fontSize: 18,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    }
});
