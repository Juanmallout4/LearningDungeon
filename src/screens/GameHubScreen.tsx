import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

export const GameHubScreen = ({ navigation, route }: any) => {
    const { theme } = useTheme();
    // Si venimos desde una actividad concreta (p.ej. clase del dia), la propagamos a los minijuegos para registrar el progreso correcto
    const activityType = route?.params?.activityType;

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.colors.background,
        },
        header: {
            padding: 24,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            alignItems: 'center',
        },
        headerTitle: {
            fontSize: 28,
            fontWeight: 'bold',
            color: theme.colors.text,
            marginBottom: 8,
        },
        headerSubtitle: {
            fontSize: 16,
            color: theme.colors.textSecondary,
        },
        content: {
            padding: 24,
        },
        grid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 20,
        },
        card: {
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            padding: 24,
            width: Platform.OS === 'web' ? 300 : '100%',
            height: Platform.OS === 'web' ? 380 : undefined,
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 3,
        },
        iconContainer: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.colors.primary + '15',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
        },
        cardTitle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: theme.colors.text,
            marginBottom: 8,
            textAlign: 'center',
        },
        cardDescription: {
            fontSize: 14,
            color: theme.colors.textSecondary,
            textAlign: 'center',
            marginBottom: 20,
            lineHeight: 20,
        },
        playButton: {
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 25,
            width: '100%',
        },
        playButtonText: {
            color: '#FFFFFF',
            fontWeight: 'bold',
            textAlign: 'center',
            fontSize: 16,
        }
    });

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Campamento de Entrenamiento</Text>
                <Text style={styles.headerSubtitle}>Elige tu próxima aventura</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.grid}>
                    {/* Acceso al minijuego de vocabulario (Jumbi): otorga HP y puntos individuales */}
                    <TouchableOpacity 
                        style={styles.card} 
                        onPress={() => navigation.navigate('VocabularyGame', { activityType })}
                        activeOpacity={0.8}
                    >
                        <View style={{ alignItems: 'center' }}>
                            <View style={styles.iconContainer}>
                                <Icon name="brain" size={40} color={theme.colors.primary} />
                            </View>
                            <Text style={styles.cardTitle}>Entrenamiento Solo</Text>
                            <Text style={styles.cardDescription}>
                                Aprende vocabulario en el minijuego de Jumbi. Gana HP y puntos para ti.
                            </Text>
                        </View>
                        <View style={styles.playButton}>
                            <Text style={styles.playButtonText}>Jugar ahora</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Acceso al minijuego de emparejar imagen-tecnica: otorga el doble de puntos que el de vocabulario */}
                    <TouchableOpacity
                        style={styles.card}
                        onPress={() => navigation.navigate('TechniqueGame', { activityType })}
                        activeOpacity={0.8}
                    >
                        <View style={{ alignItems: 'center' }}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.colors.success + '15' }]}>
                                <Icon name="image-search" size={40} color={theme.colors.success} />
                            </View>
                            <Text style={styles.cardTitle}>Reto de Técnicas</Text>
                            <Text style={styles.cardDescription}>
                                Asocia la imagen con la técnica correcta. ¡Vale el doble de puntos!
                            </Text>
                        </View>
                        <View style={styles.playButton}>
                            <Text style={styles.playButtonText}>Jugar ahora</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Acceso a clanes, chat grupal y batallas contra el Jefe Semanal */}
                    <TouchableOpacity 
                        style={styles.card} 
                        onPress={() => navigation.navigate('ClanHubScreen', { activityType })}
                        activeOpacity={0.8}
                    >
                        <View style={{ alignItems: 'center' }}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.colors.error + '15' }]}>
                                <Icon name="shield-check" size={40} color={theme.colors.error} />
                            </View>
                            <Text style={styles.cardTitle}>Clanes y Arena</Text>
                            <Text style={styles.cardDescription}>
                                Únete a tu clan, chatea con tus compañeros y formen grupos para derrotar al Jefe Semanal.
                            </Text>
                        </View>
                        <View style={[styles.playButton, { backgroundColor: theme.colors.error }]}>
                            <Text style={styles.playButtonText}>Ingresar</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Acceso a la tienda del club para canjear puntos y oro por objetos */}
                    <TouchableOpacity 
                        style={styles.card} 
                        onPress={() => navigation.navigate('Market')}
                        activeOpacity={0.8}
                    >
                        <View style={{ alignItems: 'center' }}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.colors.success + '15' }]}>
                                <Icon name="store" size={40} color={theme.colors.success} />
                            </View>
                            <Text style={styles.cardTitle}>Mercado del Club</Text>
                            <Text style={styles.cardDescription}>
                                Gasta tus Puntos y Oro para conseguir accesorios, mejoras y recompensas especiales.
                            </Text>
                        </View>
                        <View style={[styles.playButton, { backgroundColor: theme.colors.success }]}>
                            <Text style={styles.playButtonText}>Visitar Tienda</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Acceso al inventario para equipar objetos comprados (armas, armadura, consumibles) */}
                    <TouchableOpacity 
                        style={styles.card} 
                        onPress={() => navigation.navigate('Inventory')}
                        activeOpacity={0.8}
                    >
                        <View style={{ alignItems: 'center' }}>
                            <View style={[styles.iconContainer, { backgroundColor: '#3182CE15' }]}>
                                <Icon name="bag-personal" size={40} color="#3182CE" />
                            </View>
                            <Text style={styles.cardTitle}>Inventario & Equipo</Text>
                            <Text style={styles.cardDescription}>
                                Equipa armas, armaduras y objetos consumibles que hayas comprado para mejorar en combate.
                            </Text>
                        </View>
                        <View style={[styles.playButton, { backgroundColor: '#3182CE' }]}>
                            <Text style={styles.playButtonText}>Abrir Mochila</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
};
