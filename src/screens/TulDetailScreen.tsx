import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Tul } from '../types';
import { theme as defaultTheme } from '../theme'; // se mantiene por si BeltDisplay necesita el tema por defecto como fallback
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { TulDiagram } from '../components/TulDiagram';
import { BeltDisplay } from '../components/BeltDisplay';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useTranslation } from 'react-i18next';
import { TULS_DATA } from '../data/tuls';

type ParamList = {
    Details: { tul: Tul };
};

export const TulDetailScreen = ({ route }: any) => {
    // El Tul puede llegar completo por parametros (navegacion interna) o solo como id (p.ej. enlaces externos/deeplinks)
    const paramTul = route.params?.tul;
    const paramId = route.params?.id;
    // Si no viene el objeto Tul, lo buscamos en los datos locales por id o por nombre (sin distinguir mayusculas)
    const tul = paramTul || (paramId ? TULS_DATA.find(t => t.id === paramId || t.name.toLowerCase() === paramId.toLowerCase()) : null);

    const navigation = useNavigation();
    const { theme } = useTheme();
    const { t, i18n } = useTranslation();
    const { width } = useWindowDimensions();
    const styles = createStyles(theme);

    // Pantalla de respaldo si el id/objeto recibido no corresponde a ningun Tul conocido
    if (!tul) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: theme.colors.text, fontSize: 18 }}>Tul not found.</Text>
                <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home' as never)}>
                    <Text style={{ color: theme.colors.primary, marginTop: 10, fontSize: 16 }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Calculamos el tamaño del reproductor manteniendo proporcion 16:9, limitando el ancho a 800px (vista web/tablet)
    const videoWidth = Math.min(width, 800) - 32;
    const videoHeight = videoWidth * (9 / 16);

    // Los textos del Tul pueden venir como string simple o como mapa de traducciones { es, en, ... }
    const getTranslatedProperty = (property: Record<string, string> | string) => {
        if (typeof property === 'string') return property;
        if (!property) return '';
        // Normalizamos el codigo de idioma (de 'es-ES' nos quedamos con 'es') y aplicamos cascada de fallback
        const langCode = i18n.language.split('-')[0];
        return property[langCode] || property['es'] || property['en'] || '';
    };

    return (
        <ScrollView style={styles.container}>
            {/* Cabecera con el nombre del Tul y el cinturon requerido */}
            <View style={styles.header}>
                <View style={{ flex: 1, paddingRight: theme.spacing.s, justifyContent: 'center' }}>
                    <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>{tul.name}</Text>
                </View>
                <View style={{ width: 140, alignItems: 'center' }}>
                    <BeltDisplay rank={tul.rankRequirement} width={140} height={24} showText={true} textSize={10} />
                </View>
            </View>

            <View style={styles.content}>

                {/* Video tutorial de YouTube embebido (no se reproduce automaticamente) */}
                <View style={styles.videoCard}>
                    <Text style={styles.sectionTitle}>{t('tulDetail.videoGuide')}</Text>
                    <YoutubePlayer
                        height={videoHeight}
                        play={false}
                        videoId={tul.videoId}
                    />
                </View>

                {/* Solo se muestra si el Tul tiene definido un significado de cinturon */}
                {tul.beltMeaning && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Ionicons name="ribbon" size={20} color={theme.colors.primary} />
                            <Text style={styles.cardTitle}>{t('tulDetail.beltMeaning')}</Text>
                        </View>
                        <Text style={styles.cardText}>{getTranslatedProperty(tul.beltMeaning)}</Text>
                    </View>
                )}

                {/* Significado general del Tul (origen historico, simbolismo, etc.) */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="book" size={20} color={theme.colors.primary} />
                        <Text style={styles.cardTitle}>{t('tulDetail.meaning')}</Text>
                    </View>
                    <Text style={styles.cardText}>{getTranslatedProperty(tul.meaning)}</Text>
                </View>

                {/* Diagrama del recorrido del Tul; si no hay detalle especifico, usamos la descripcion general como texto */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="map" size={20} color={theme.colors.primary} />
                        <Text style={styles.cardTitle}>{t('tulDetail.diagram')}</Text>
                    </View>
                    <View style={styles.diagramContainer}>
                        <TulDiagram type={tul.diagramType} size={150} />
                        <Text style={[styles.cardText, { marginTop: 16, textAlign: 'center' }]}>
                            {getTranslatedProperty(tul.diagramDetails) || getTranslatedProperty(tul.description)}
                        </Text>
                    </View>
                </View>

                {/* Listado detallado de movimientos pendiente de implementar; de momento solo mostramos el conteo */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="list" size={20} color={theme.colors.primary} />
                        <Text style={styles.cardTitle}>{t('tulDetail.movements', { count: tul.moves })}</Text>
                    </View>
                    <Text style={styles.cardText}>
                        {t('tulDetail.movementsComingSoon')}
                    </Text>
                </View>

            </View>
        </ScrollView>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        padding: theme.spacing.m,
        paddingTop: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    backButton: {
        padding: 4,
        marginRight: 16,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 24,
        color: theme.colors.text,
    },
    content: {
        padding: theme.spacing.m,
        paddingBottom: 40,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    videoCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    sectionTitle: {
        ...theme.typography.subheader,
        marginBottom: theme.spacing.s,
        color: theme.colors.text,
        fontSize: 18,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
    },
    cardTitle: {
        ...theme.typography.subheader,
        color: theme.colors.primary,
        fontSize: 18,
        marginLeft: 8,
    },
    cardText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 22,
    },
    diagramContainer: {
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.m,
        marginTop: 8,
    }
});
