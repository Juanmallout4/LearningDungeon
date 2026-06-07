import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { Activity } from '../../types';

const ICON_OPTIONS = ['karate', 'shoe-ballet', 'yoga', 'run', 'soccer', 'basketball', 'tennis', 'swim', 'bike', 'boxing-glove', 'palette', 'music', 'robot', 'translate', 'weight-lifter', 'dumbbell', 'human-handsup', 'meditation', 'sword-cross', 'shield-half-full'];

const ACTIVITY_TYPE_OPTIONS: { value: string; labelKey: string; defaultLabel: string }[] = [
    { value: 'general', labelKey: 'settings.activityTypeGeneral', defaultLabel: 'General' },
    { value: 'taekwondo_itf', labelKey: 'settings.activityTypeTaekwondo', defaultLabel: 'Taekwondo ITF' },
    { value: 'ingles', labelKey: 'settings.activityTypeIngles', defaultLabel: 'Inglés' },
    { value: 'ballet', labelKey: 'settings.activityTypeBallet', defaultLabel: 'Ballet' },
];

export const ActivityListScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user, initialMode } = route.params || {};

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [activities, setActivities] = useState<Activity[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal state – shared for create and edit
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [modalName, setModalName] = useState('');
    const [modalIcon, setModalIcon] = useState(ICON_OPTIONS[0]);
    const [modalActivityType, setModalActivityType] = useState('general');

    useEffect(() => {
        loadActivities();
    }, []);

    const loadActivities = async () => {
        if (!user.organizationId) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await ClubService.getActivities(user.organizationId);
            setActivities(data);
        } catch (error) {
            console.error('Failed to load activities', error);
        } finally {
            setIsLoading(false);
        }
    };

    const visibleActivities = initialMode === 'technique'
        ? activities.filter(a => a.activityType === 'taekwondo_itf')
        : activities;

    const handleActivityPress = (activity: Activity) => {
        navigation.navigate('GroupList', { activity, user, initialMode });
    };

    const handleReportsNavigate = () => {
        navigation.navigate('Reports', { user });
    };

    // ── Open modal for CREATE ──────────────────────────────────────────────────
    const handleCreateActivity = () => {
        const maxActivities =
            user.plan === 'club_elite' ? 10 :
            user.plan === 'club_pro'   ? 5  :
            user.plan === 'club_lite'  ? 3  : 1;

        if (activities.length >= maxActivities) {
            Alert.alert(
                t('settings.limitReached'),
                t('settings.upgradePromptActivity', { defaultValue: 'Upgrade your plan to add more activities.' })
            );
            return;
        }
        setEditingActivity(null);
        setModalName('');
        setModalIcon(ICON_OPTIONS[0]);
        setModalActivityType('general');
        setIsModalVisible(true);
    };

    // ── Open modal for EDIT ────────────────────────────────────────────────────
    const handleEditActivity = (activity: Activity) => {
        setEditingActivity(activity);
        setModalName(activity.name);
        setModalIcon(activity.icon);
        setModalActivityType(activity.activityType || 'general');
        setIsModalVisible(true);
    };

    // ── Delete with confirmation ───────────────────────────────────────────────
    const handleDeleteActivity = (activity: Activity) => {
        Alert.alert(
            t('common.confirmDelete', { defaultValue: 'Confirm Delete' }),
            t('settings.deleteActivityConfirm', { name: activity.name, defaultValue: `Delete activity "${activity.name}"? All its groups will also be deleted.` }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete', { defaultValue: 'Delete' }),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await ClubService.deleteActivity(user.organizationId, activity.id);
                            setActivities(prev => prev.filter(a => a.id !== activity.id));
                        } catch (error: any) {
                            Alert.alert(t('common.error'), error.message || 'Failed to delete activity');
                        }
                    }
                }
            ]
        );
    };

    // ── Save (create or update) ────────────────────────────────────────────────
    const saveActivity = async () => {
        if (!modalName.trim()) {
            Alert.alert(t('common.error'), t('vocabulary.errorEmpty', { defaultValue: 'Name cannot be empty.' }));
            return;
        }
        if (!user.organizationId) {
            Alert.alert(t('common.error'), 'Your account is missing a linked Club Organization ID. Please log out and back in.');
            return;
        }

        const activityType = modalActivityType;
        try {
            if (editingActivity) {
                // UPDATE existing
                const updated = await ClubService.updateActivity(user.organizationId, editingActivity.id, modalName, modalIcon, activityType);
                setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
            } else {
                // CREATE new
                const newAct = await ClubService.addActivity(user.organizationId, modalName, modalIcon, activityType);
                setActivities(prev => [...prev, newAct]);
            }
            setIsModalVisible(false);
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || 'Failed to save activity');
        }
    };

    const closeModal = () => {
        setIsModalVisible(false);
        setEditingActivity(null);
    };

    const isOwner = user.role === 'club_owner';

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('settings.myClasses')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {(isOwner || user.role === 'instructor') && (
                        <TouchableOpacity onPress={handleReportsNavigate} style={[styles.addButton, { marginRight: 16 }]}>
                            <MaterialCommunityIcons name="chart-bar" size={28} color={theme.colors.primary} />
                        </TouchableOpacity>
                    )}
                    {isOwner && (
                        <TouchableOpacity onPress={handleCreateActivity} style={styles.addButton}>
                            <Ionicons name="add" size={28} color={theme.colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={visibleActivities}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.card} onPress={() => handleActivityPress(item)}>
                            <View style={styles.iconContainer}>
                                <MaterialCommunityIcons name={item.icon as any} size={28} color={theme.colors.primary} />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={styles.activityName}>{item.name}</Text>
                            </View>
                            {isOwner ? (
                                <View style={styles.cardActions}>
                                    <TouchableOpacity
                                        onPress={() => handleEditActivity(item)}
                                        style={styles.actionButton}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                                    >
                                        <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleDeleteActivity(item)}
                                        style={styles.actionButton}
                                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                                    >
                                        <Ionicons name="trash-outline" size={20} color={theme.colors.error || '#E55353'} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                    )}
                />
            )}

            {/* Create / Edit Modal */}
            <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {editingActivity
                                ? t('settings.editActivity', { defaultValue: 'Edit Activity' })
                                : t('settings.newActivity', { defaultValue: 'New Activity' })}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder={t('settings.activityName', { defaultValue: 'Activity Name' })}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={modalName}
                            onChangeText={setModalName}
                        />

                        <Text style={styles.label}>{t('settings.chooseIcon', { defaultValue: 'Choose Icon' })}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
                            {ICON_OPTIONS.map(icon => (
                                <TouchableOpacity
                                    key={icon}
                                    onPress={() => setModalIcon(icon)}
                                    style={[
                                        styles.iconPickerItem,
                                        modalIcon === icon && { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}20` }
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        name={icon as any}
                                        size={28}
                                        color={modalIcon === icon ? theme.colors.primary : theme.colors.textSecondary}
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.label}>{t('settings.chooseActivityType', { defaultValue: 'Tipo de Actividad' })}</Text>
                        <View style={styles.activityTypeRow}>
                            {ACTIVITY_TYPE_OPTIONS.map(option => {
                                const isSelected = modalActivityType === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => setModalActivityType(option.value)}
                                        style={[styles.activityTypeChip, isSelected && styles.activityTypeChipSelected]}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.activityTypeChipText, isSelected && styles.activityTypeChipTextSelected]}>
                                            {t(option.labelKey, { defaultValue: option.defaultLabel })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={styles.activityTypeHint}>
                            {t('settings.activityTypeHint', { defaultValue: 'El tipo determina qué TULs, niveles y evaluaciones están disponibles para esta actividad.' })}
                        </Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={saveActivity}>
                                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        paddingTop: theme.spacing.xl,
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
    addButton: {
        padding: 4,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
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
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(33, 182, 104, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    cardContent: {
        flex: 1,
    },
    activityName: {
        color: theme.colors.text,
        fontSize: 18,
        fontWeight: 'bold',
    },
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionButton: {
        padding: 6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 20,
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 20,
    },
    label: {
        color: theme.colors.textSecondary,
        marginBottom: 10,
    },
    iconScroll: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    iconPickerItem: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    activityTypeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    activityTypeChip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    activityTypeChipSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: `${theme.colors.primary}20`,
    },
    activityTypeChipText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    activityTypeChipTextSelected: {
        color: theme.colors.primary,
    },
    activityTypeHint: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    cancelButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    cancelButtonText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    saveButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
});
