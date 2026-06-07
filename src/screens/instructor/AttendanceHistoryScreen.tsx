import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TrackingService } from '../../services/TrackingService';

export const AttendanceHistoryScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    // Make these optional since the screen might be accessed without a specific group context
    const groupName = route.params?.group?.name || 'All Groups';
    const activityName = route.params?.activityName || '';
    const activityId = route.params?.activityId;
    const activityType = route.params?.activityType;

    React.useEffect(() => {
        if (!route.params?.group || typeof route.params.group !== 'object') {
            navigation.replace('ActivityList');
        }
    }, [route.params?.group, navigation]);

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [history, setHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    if (!route.params?.group || typeof route.params.group !== 'object') return null;

    useFocusEffect(
        React.useCallback(() => {
            const groupId = route.params?.group?.id;
            if (groupId) {
                TrackingService.getGroupAttendanceHistory(groupId)
                    .then(data => setHistory(data))
                    .catch(err => console.error("Failed to fetch history:", err))
                    .finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
        }, [route.params?.group?.id])
    );

    const renderHistoryItem = ({ item }: { item: any }) => (
        <TouchableOpacity 
            style={[styles.card, item.is_auto && styles.autoCard]}
            onPress={() => navigation.navigate('StudentList', {
                group: route.params?.group,
                activityName,
                activityId,
                activityType,
                initialMode: 'attendance',
                initialDate: item.date,
                isAuto: item.is_auto
            })}
        >
            <View style={styles.dateContainer}>
                <Ionicons name="calendar-outline" size={24} color={item.is_auto ? theme.colors.warning : theme.colors.primary} />
                <Text style={styles.dateText}>{item.date}</Text>
                {item.is_auto && (
                    <View style={styles.autoBadge}>
                        <Text style={styles.autoText}>{t('attendance.auto', { defaultValue: 'Automático' })}</Text>
                    </View>
                )}
            </View>
            <View style={styles.statsContainer}>
                <View style={styles.statBadgePresent}>
                    <Text style={styles.statTextPresent}>{item.present} {t('attendance.present')}</Text>
                </View>
                <View style={[styles.statBadgePresent, styles.statBadgeAbsent]}>
                    <Text style={[styles.statTextPresent, styles.statTextAbsent]}>{item.absent} {t('attendance.absent')}</Text>
                </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{t('attendance.history')}</Text>
                        <Text style={styles.headerSubtitle}>
                            {activityName ? `${activityName} - ${groupName}` : groupName}
                        </Text>
                    </View>
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={history}
                    keyExtractor={item => item.date}
                    contentContainerStyle={styles.listContent}
                    renderItem={renderHistoryItem}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="folder-open-outline" size={48} color={theme.colors.textSecondary} />
                            <Text style={styles.emptyText}>{t('attendance.noRecords', { defaultValue: 'No attendance records found.' })}</Text>
                        </View>
                    }
                />
            )}
        </View>
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
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        padding: 4,
        marginRight: 16,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 18,
        color: theme.colors.text,
    },
    headerSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 12,
    },
    listContent: {
        padding: theme.spacing.m,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    autoCard: {
        backgroundColor: `${theme.colors.warning}15`,
        borderColor: theme.colors.warning,
    },
    autoBadge: {
        backgroundColor: theme.colors.warning,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    autoText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#000',
    },
    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dateText: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    statsContainer: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        justifyContent: 'flex-end',
        marginRight: 16,
    },
    statBadgePresent: {
        backgroundColor: `${theme.colors.success}20`,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statTextPresent: {
        color: theme.colors.success,
        fontSize: 12,
        fontWeight: 'bold',
    },
    statBadgeAbsent: {
        backgroundColor: `${theme.colors.error}20`,
    },
    statTextAbsent: {
        color: theme.colors.error,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xl,
        marginTop: theme.spacing.xl,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.m,
        fontSize: 16,
    }
});
