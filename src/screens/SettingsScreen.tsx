
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { UserProfile } from '../types';
import { useTranslation } from 'react-i18next';
import { MenuContent } from '../components/MenuContent';

export const SettingsScreen = ({ route }: any) => {
    const user = route.params?.user as UserProfile;
    const navigation = useNavigation<any>();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings.title')}</Text>
                <View style={{ width: 40 }} />
            </View>

            <MenuContent user={user} />
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.m,
        paddingTop: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        marginBottom: theme.spacing.m,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 18,
        color: theme.colors.text,
    },
    content: {
        paddingBottom: 40,
    },
    section: {
        marginBottom: theme.spacing.l,
        paddingHorizontal: theme.spacing.m,
    },
    sectionTitle: {
        ...theme.typography.subheader,
        marginBottom: theme.spacing.s,
        color: theme.colors.textSecondary,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: 4,
    },
    value: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    separator: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: 12,
    },
    badgeContainer: {
        backgroundColor: theme.colors.primary,
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 12,
    },
    actionButton: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    actionButtonText: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    arrow: {
        color: theme.colors.textSecondary,
        fontSize: 18,
    },
    premiumCard: {
        backgroundColor: theme.isDark ? '#2C2C2C' : theme.colors.background, // Darker card or background
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.primary, // Gold border
    },
    premiumTitle: {
        color: theme.colors.primary,
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    premiumDesc: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    }
});
