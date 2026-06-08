import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface VideoAdModalProps {
    visible: boolean;
    onClose: () => void;
}

const TOTAL_DURATION = 15; // Aqui podemos configurar cuantos segundos dura el anuncio simulado
const SKIP_THRESHOLD = 5; // Aqui podemos configurar a partir de que segundo se habilita el boton de "saltar"

// Modal de anuncio simulado a pantalla completa: cuenta hacia atras desde TOTAL_DURATION y, al llegar
// a SKIP_THRESHOLD segundos transcurridos, habilita el boton de saltar; si el usuario no lo cierra antes,
// se cierra solo al llegar a 0
export const VideoAdModal: React.FC<VideoAdModalProps> = ({ visible, onClose }) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [timeLeft, setTimeLeft] = useState(TOTAL_DURATION);
    const [canSkip, setCanSkip] = useState(false);

    useEffect(() => {
        // Reiniciamos el contador cada vez que el modal se hace visible y arrancamos un intervalo
        // de 1 segundo que va descontando el tiempo restante y habilitando el "saltar" cuando corresponda
        let interval: NodeJS.Timeout;

        if (visible) {
            setTimeLeft(TOTAL_DURATION);
            setCanSkip(false);

            interval = setInterval(() => {
                setTimeLeft((prev) => {
                    const next = prev - 1;
                    if (TOTAL_DURATION - next >= SKIP_THRESHOLD) {
                        setCanSkip(true);
                    }
                    if (next <= 0) {
                        clearInterval(interval);
                        onClose(); // Cerramos automaticamente el anuncio al llegar a 0 segundos
                        return 0;
                    }
                    return next;
                });
            }, 1000);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [visible, onClose]);

    return (
        <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (canSkip) onClose(); }}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.timerBadge}>
                        <Text style={styles.timerText}>{timeLeft}s</Text>
                    </View>

                    {canSkip ? (
                        <TouchableOpacity style={styles.skipButton} onPress={onClose}>
                            <Text style={styles.skipText}>{t('videoAd.skip', { defaultValue: 'Skip Ad' })}</Text>
                            <Ionicons name="play-skip-forward" size={16} color={theme.colors.background} />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.disabledSkipButton}>
                            <Text style={styles.disabledSkipText}>
                                {t('videoAd.skipIn', { defaultValue: `Skip in ${SKIP_THRESHOLD - (TOTAL_DURATION - timeLeft)}s` })}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.adContent}>
                    <Ionicons name="videocam-outline" size={80} color={theme.colors.border} />
                    <Text style={styles.adTitle}>{t('videoAd.advertisement', { defaultValue: 'Advertisement' })}</Text>
                    <Text style={styles.adDescription}>
                        {t('videoAd.description', { defaultValue: 'This helps keep the app free for everyone.' })}
                    </Text>
                    <ActivityIndicator style={{ marginTop: theme.spacing.xl }} color={theme.colors.primary} size="large" />
                </View>

                <TouchableOpacity style={styles.removeAdsPrompt}>
                    <Text style={styles.removeAdsText}>
                        {t('videoAd.removeAdsPrompt', { defaultValue: 'Hate ads? Upgrade or Subscribe to permanently remove them.' })}
                    </Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000', // Los anuncios suelen tener fondo negro completo
        justifyContent: 'center',
    },
    header: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.l,
        zIndex: 10,
    },
    timerBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        justifyContent: 'center',
    },
    timerText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    skipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    skipText: {
        color: '#000000',
        fontWeight: 'bold',
        marginRight: 6,
    },
    disabledSkipButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        justifyContent: 'center',
    },
    disabledSkipText: {
        color: 'rgba(255,255,255,0.7)',
        fontWeight: 'bold',
    },
    adContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xl,
    },
    adTitle: {
        ...theme.typography.header,
        color: '#FFFFFF',
        marginTop: theme.spacing.l,
    },
    adDescription: {
        ...theme.typography.body,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginTop: theme.spacing.s,
    },
    removeAdsPrompt: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        paddingHorizontal: theme.spacing.xl,
    },
    removeAdsText: {
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        textDecorationLine: 'underline',
        fontSize: 12,
    }
});
