import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export const GamificationManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Aqui configuramos las tarjetas del menu de gestion: cada una enlaza con su pantalla via navigation.navigate(option.route)
    const managementOptions = [
        {
            title: "Vocabulario 'Jumbi'",
            description: "Añade, edita o elimina las palabras y significados que los alumnos contestarán en el minijuego de vocabulario.",
            icon: "book-outline",
            route: "VocabularyManagement",
            color: theme.colors.primary,
        },
        {
            title: "Mercado del Club",
            description: "Crea recompensas físicas o virtuales y asígnales un valor. Los alumnos las comprarán con sus puntos.",
            icon: "storefront-outline",
            route: "MarketManagement",
            color: "#FFD700", // Color dorado para destacar la tarjeta del Mercado
        },
        {
            title: "Jefes y Monstruos (Bosses)",
            description: "Configura el Jefe Activo para tu clase. Ponle vida, recompensas y usa tu propia foto si quieres ser tú el jefe.",
            icon: "skull-outline",
            route: "BossManagement",
            color: theme.colors.error,
        }
    ];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Gestión de Juegos y Eventos</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.subtitle}>Selecciona el módulo que deseas configurar para tu club:</Text>

                {/* Pintamos cada opcion como una tarjeta pulsable; el color de borde e icono viene de option.color */}
                <View style={styles.grid}>
                    {managementOptions.map((option, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[styles.card, { borderColor: option.color }]}
                            onPress={() => navigation.navigate(option.route, { user })}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: option.color + '15' }]}>
                                <Ionicons name={option.icon as any} size={40} color={option.color} />
                            </View>
                            <Text style={styles.cardTitle}>{option.title}</Text>
                            <Text style={styles.cardDesc}>{option.description}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        padding: theme.spacing.l,
        paddingTop: Platform.OS === 'web' ? theme.spacing.l : theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: {
        padding: 4,
        marginRight: 16,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
    },
    content: {
        padding: theme.spacing.xl,
        alignItems: 'center',
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        marginBottom: 30,
        textAlign: 'center',
        maxWidth: 600,
    },
    grid: {
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 20,
        width: '100%',
        maxWidth: 1000,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        width: Platform.OS === 'web' ? 300 : '100%',
        alignItems: 'center',
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
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 12,
        textAlign: 'center',
    },
    cardDesc: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
    },
});
