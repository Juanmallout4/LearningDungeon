import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, FlatList, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { apiFetch } from '../../utils/apiFetch';
import { Group, Activity, ProgressionActivityOption, PROGRESSION_ACTIVITY_TYPES } from '../../types';
import { BeltDisplay } from '../../components/BeltDisplay';
import { BELT_CONFIGS } from '../../data/belts';
import { ProgressionBadge } from '../../components/ProgressionBadge';
import { PROGRESSION_SCALES } from '../../data/progressionScales';

export const InstructorManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params;

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [instructors, setInstructors] = useState<{ id: string; email: string; name: string; belt?: string; birthday?: string | null; role?: string; activityIds?: string[] }[]>([]);

    const [activities, setActivities] = useState<Activity[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);

    // Aqui gestionamos el modal de asignación de actividades a un instructor (qué disciplinas puede impartir)
    const [isActivityModalVisible, setIsActivityModalVisible] = useState(false);
    const [selectedInstructorForActivities, setSelectedInstructorForActivities] = useState<{ id: string; name: string } | null>(null);
    const [pendingActivityIds, setPendingActivityIds] = useState<Set<string>>(new Set());
    const [isSavingActivities, setIsSavingActivities] = useState(false);
    const [isGroupModalVisible, setIsGroupModalVisible] = useState(false);
    const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
    const [instructorGroups, setInstructorGroups] = useState<Set<string>>(new Set());
    const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
    const [selectedInstructorBirthday, setSelectedInstructorBirthday] = useState<string | null>(null);

    // Calcula la edad a partir de la fecha de nacimiento (misma lógica que en StudentManagementScreen)
    const getPersonAge = (birthday: string | null): number | null => {
        if (!birthday) return null;
        const birth = new Date(birthday);
        if (isNaN(birth.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        return age;
    };

    // Aqui controlamos el modal de restablecimiento de contraseña forzado para instructores
    const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
    const [selectedInstructorForPassword, setSelectedInstructorForPassword] = useState<{ id: string, name: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isResettingPassword, setIsResettingPassword] = useState(false);

    // Aqui guardamos el texto de búsqueda de la lista y el estado del modal de promoción de cinturón/nivel del instructor
    const [searchQuery, setSearchQuery] = useState('');
    const [isBeltModalVisible, setIsBeltModalVisible] = useState(false);
    const [selectedInstructorForBelt, setSelectedInstructorForBelt] = useState<{ id: string, name: string, currentBelt?: string } | null>(null);
    const [isUpdatingBelt, setIsUpdatingBelt] = useState(false);
    const [progressionActivityOptions, setProgressionActivityOptions] = useState<ProgressionActivityOption[]>([]);
    const [selectedProgressionActivity, setSelectedProgressionActivity] = useState<ProgressionActivityOption | null>(null);
    const [isLoadingProgressionActivities, setIsLoadingProgressionActivities] = useState(false);

    // Esta pantalla solo es accesible para propietarios de club con plan Pro/Elite; si no se cumple, avisamos y volvemos atrás
    useEffect(() => {
        if (user.role !== 'club_owner' || (user.plan !== 'club_pro' && user.plan !== 'club_elite')) {
            Alert.alert(t('settings.limitReached'), t('settings.upgradeToPro'));
            navigation.goBack();
            return;
        }
        if (user.organizationId) {
            loadInstructors();
            loadGroups();
            ClubService.getActivities(user.organizationId).then(setActivities).catch(() => {});
        }
    }, [user]);

    // Trae los instructores del club y los reordena para que el/los propietarios aparezcan siempre primero en la lista
    const loadInstructors = async () => {
        try {
            const data = await ClubService.getInstructors(user.organizationId);
            // Los dueños del club aparecen arriba de la lista sin importar el orden en que los devuelva la API
            const sorted = [...data].sort((a, b) => (a.role === 'club_owner' ? 0 : 1) - (b.role === 'club_owner' ? 0 : 1));
            setInstructors(sorted);
        } catch (error) {
            console.error('Failed to load instructors', error);
        }
    };

    // Trae todos los grupos/actividades del club, usados en el modal de asignación de grupos
    const loadGroups = async () => {
        try {
            const data = await ClubService.getAllClubGroups(user.organizationId);
            setGroups(data);
        } catch (error) {
            console.error('Failed to load groups', error);
        }
    };

    // Añade al club un instructor que ya tiene cuenta en la app, mapeando los códigos de error del backend a mensajes traducidos
    const handleAddInstructor = async () => {
        if (!email.trim() || !user.organizationId) return;

        setIsLoading(true);
        try {
            const result = await ClubService.addInstructor(user.organizationId, email.trim());

            if (result.success) {
                setInstructors([...instructors, result.user]);
                setEmail('');
                Alert.alert(
                    t('instructor.instructorAddedTitle', { defaultValue: 'Instructor Added' }),
                    t('instructor.instructorAddedBody', { defaultValue: 'The instructor has been added to your club.' })
                );
            } else {
                let errorMsg = t('instructor.errorAdding', { defaultValue: 'Could not add instructor.' });
                if (result.error === 'invalid_email') errorMsg = t('instructor.invalidEmail', { defaultValue: 'Please enter a valid email address.' });
                if (result.error === 'not_found') errorMsg = t('instructor.userNotFound', { defaultValue: 'This email is not registered in Learning Dungeon They must create an account first.' });
                if (result.error === 'already_added') errorMsg = t('instructor.alreadyAdded', { defaultValue: 'This instructor is already in your club.' });

                Alert.alert(t('common.error', { defaultValue: 'Error' }), errorMsg);
            }
        } catch (error: any) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message || 'Failed to add instructor');
        } finally {
            setIsLoading(false);
        }
    };

    // Pide confirmación (window.confirm en web, Alert nativo en móvil) y ejecuta la expulsión del instructor del club
    const handleRemoveInstructor = (id: string, name: string) => {
        const title = t('instructor.removeInstructorTitle', { defaultValue: 'Remove Instructor?' });
        const message = t('instructor.removeInstructorBody', { defaultValue: 'Are you sure you want to remove {{name}} from your club?', name });

        const performRemoval = async () => {
            try {
                if (!user.organizationId) return;
                await ClubService.deleteInstructor(user.organizationId, id);
                setInstructors(instructors.filter(i => i.id !== id));
            } catch (error: any) {
                if (Platform.OS === 'web') {
                    window.alert('Error: ' + (error.message || 'Failed to remove instructor'));
                } else {
                    Alert.alert('Error', error.message || 'Failed to remove instructor');
                }
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`${title}\n\n${message}`)) {
                performRemoval();
            }
        } else {
            Alert.alert(title, message, [
                { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                {
                    text: t('settings.remove', { defaultValue: 'Remove' }),
                    style: 'destructive',
                    onPress: performRemoval
                }
            ]);
        }
    };

    // Abre el modal de asignación de grupos para el instructor: carga sus grupos actuales y arranca con las secciones colapsadas
    const openGroupModal = async (instructorId: string, birthday?: string | null) => {
        setSelectedInstructorId(instructorId);
        setSelectedInstructorBirthday(birthday || null);
        // Empezamos con todas las secciones de actividad colapsadas
        setExpandedActivities(new Set());
        try {
            const groupsAssociated = await ClubService.getStudentGroups(instructorId);
            setInstructorGroups(new Set(groupsAssociated.map(g => g.id)));
        } catch (error) {
            console.error("Failed to load instructor groups", error);
        }
        setIsGroupModalVisible(true);
    };

    // Pinta una fila de grupo dentro del modal de asignación, marcando si el instructor ya está en él, si es recomendado y si está lleno
    const renderGroupRow = (g: Group, recommended: boolean) => {
        const isEnrolled = instructorGroups.has(g.id);
        const isFull = g.maxStudents != null && g.studentCount >= g.maxStudents;
        return (
            <TouchableOpacity
                key={g.id}
                style={[
                    styles.groupRow,
                    isEnrolled && styles.groupRowEnrolled,
                    recommended && !isEnrolled && styles.groupRowRecommended,
                ]}
                onPress={() => handleToggleGroup(g.id)}
                activeOpacity={0.7}
            >
                <View style={[styles.checkbox, isEnrolled && styles.checkboxChecked]}>
                    {isEnrolled && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.groupRowName, isEnrolled && { color: theme.colors.primary }]}>{g.name}</Text>
                    <Text style={styles.groupRowTime}>{g.time}</Text>
                </View>
                {g.maxStudents != null && (
                    <View style={[styles.capacityBadge, isFull && styles.capacityBadgeFull]}>
                        <Text style={[styles.capacityBadgeText, isFull && { color: theme.colors.error }]}>
                            {g.studentCount}/{g.maxStudents}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // Expande o colapsa la sección de grupos de una actividad concreta dentro del modal
    const toggleActivityExpand = (activityId: string) => {
        setExpandedActivities(prev => {
            const next = new Set(prev);
            if (next.has(activityId)) next.delete(activityId);
            else next.add(activityId);
            return next;
        });
    };

    // Inscribe o desinscribe al instructor de un grupo concreto, actualizando el set local de grupos según el resultado
    const handleToggleGroup = async (groupId: string) => {
        if (!selectedInstructorId) return;
        try {
            const isEnrolled = instructorGroups.has(groupId);
            if (isEnrolled) {
                await ClubService.unenrollStudentFromGroup(groupId, selectedInstructorId);
                setInstructorGroups(prev => {
                    const next = new Set(prev);
                    next.delete(groupId);
                    return next;
                });
            } else {
                await ClubService.enrollStudentInGroup(groupId, selectedInstructorId);
                setInstructorGroups(prev => {
                    const next = new Set(prev);
                    next.add(groupId);
                    return next;
                });
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to toggle group assignment');
        }
    };

    // Abre el modal de actividades del instructor, precargando como "pendientes" las actividades que ya tiene asignadas
    const openActivityModal = (id: string, name: string, currentActivityIds: string[] = []) => {
        setSelectedInstructorForActivities({ id, name });
        setPendingActivityIds(new Set(currentActivityIds));
        setIsActivityModalVisible(true);
    };

    // Guarda en el backend el conjunto de actividades seleccionadas para el instructor y actualiza la lista local
    const handleSaveActivities = async () => {
        if (!selectedInstructorForActivities || !user.organizationId) return;
        setIsSavingActivities(true);
        try {
            const ids = Array.from(pendingActivityIds);
            await ClubService.updateInstructorActivities(user.organizationId, selectedInstructorForActivities.id, ids);
            setInstructors(prev => prev.map(i =>
                i.id === selectedInstructorForActivities.id ? { ...i, activityIds: ids } : i
            ));
            setIsActivityModalVisible(false);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo guardar');
        } finally {
            setIsSavingActivities(false);
        }
    };

    // Abre el modal de restablecimiento de contraseña para el instructor indicado, limpiando el campo
    const openPasswordModal = (id: string, name: string) => {
        setSelectedInstructorForPassword({ id, name });
        setNewPassword('');
        setIsPasswordModalVisible(true);
    };

    // Fuerza una contraseña temporal nueva para el instructor mediante la ruta admin del backend (mínimo 6 caracteres)
    const handleResetPassword = async () => {
        if (!selectedInstructorForPassword || newPassword.length < 6) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), 'Password must be at least 6 characters long.');
            return;
        }

        setIsResettingPassword(true);
        try {
            const response = await apiFetch(`/api/users/${selectedInstructorForPassword.id}/password/admin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset password');
            }

            Alert.alert(t('common.success', { defaultValue: 'Success' }), `Password for ${selectedInstructorForPassword.name} has been securely updated.`);
            setIsPasswordModalVisible(false);
        } catch (error: any) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message);
        } finally {
            setIsResettingPassword(false);
        }
    };

    // Abre el modal de promoción: a diferencia de los alumnos (que se basan en sus grupos), aquí partimos de las actividades
    // ASIGNADAS al instructor y cruzamos con sus progresiones actuales para construir las opciones disponibles
    const openBeltModal = async (id: string, name: string, currentBelt?: string) => {
        setSelectedInstructorForBelt({ id, name, currentBelt });
        setSelectedProgressionActivity(null);
        setProgressionActivityOptions([]);
        setIsLoadingProgressionActivities(true);
        setIsBeltModalVisible(true);
        try {
            const instructor = instructors.find(i => i.id === id);
            // Solo consideramos actividades asignadas al instructor que además tengan un sistema de progresión soportado
            const assignedActivities = activities.filter(a =>
                instructor?.activityIds?.includes(a.id) && a.activityType && PROGRESSION_ACTIVITY_TYPES.includes(a.activityType)
            );
            const progressions = await ClubService.getUserProgressions(id);
            const options: ProgressionActivityOption[] = assignedActivities.map(a => {
                const prog = progressions.find(p => p.activityId === a.id);
                return {
                    activityId: a.id,
                    activityName: a.name,
                    activityType: a.activityType!,
                    currentLevelOrder: prog?.levelOrder ?? null,
                    currentLevelName: prog?.levelName ?? null,
                };
            });
            setProgressionActivityOptions(options);
            if (options.length === 1) setSelectedProgressionActivity(options[0]);
        } catch (error) {
            console.error('Failed to load instructor progression activities', error);
        } finally {
            setIsLoadingProgressionActivities(false);
        }
    };

    // Asigna al instructor un nuevo nivel/cinturón en la actividad seleccionada y refresca su cinturón visible si es Taekwondo ITF
    const handleAssignBelt = async (levelOrder: number, levelName: string) => {
        if (!selectedInstructorForBelt || !selectedProgressionActivity || !user.id) return;
        setIsUpdatingBelt(true);
        try {
            await ClubService.updateUserProgression(selectedInstructorForBelt.id, selectedProgressionActivity.activityId, levelOrder, levelName, user.id);
            if (selectedProgressionActivity.activityType === 'taekwondo_itf') {
                setInstructors(instructors.map(i => i.id === selectedInstructorForBelt.id ? { ...i, belt: levelName } : i));
            }
            Alert.alert('Success', `${selectedInstructorForBelt.name} is now ${levelName}.`);
            setIsBeltModalVisible(false);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to update progression.');
        } finally {
            setIsUpdatingBelt(false);
        }
    };

    // Filtra la lista de instructores por nombre o email según el texto de búsqueda
    const filteredInstructors = instructors.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings.manageInstructors', { defaultValue: 'Manage Instructors' })}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                <View style={styles.addSection}>
                    <Text style={styles.sectionTitle}>{t('settings.manageInstructors', { defaultValue: 'Manage Instructors' })}</Text>
                    <Text style={styles.sectionSubtitle}>
                        {t('settings.manageInstructorsDesc', { defaultValue: 'Add or remove instructors who can evaluate students and manage attendance for your club.' })}
                    </Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="ej: profe@tkd.com"
                            placeholderTextColor={theme.colors.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <TouchableOpacity
                            style={[styles.addButton, !email.trim() && { opacity: 0.5 }]}
                            onPress={handleAddInstructor}
                            disabled={!email.trim() || isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <Text style={styles.addButtonText}>{t('settings.addInstructor', { defaultValue: 'Add' })}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.helperText}>
                        {t('instructor.mustHaveAccount', { defaultValue: '* The instructor must have an active Learning Dungeon account.' })}
                    </Text>
                </View>

                <View style={styles.listSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>{t('settings.activeInstructors', { defaultValue: 'Active Instructors' })} ({filteredInstructors.length})</Text>
                    </View>

                    <View style={[styles.inputContainer, { marginBottom: theme.spacing.m }]}>
                        <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }} />
                        <TextInput
                            style={[styles.input, { paddingLeft: 40 }]}
                            placeholder="Buscar por nombre o email..."
                            placeholderTextColor={theme.colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {filteredInstructors.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="people-outline" size={48} color={theme.colors.border} />
                            <Text style={styles.emptyStateText}>{t('settings.emptyInstructors', { defaultValue: 'No instructors added yet.' })}</Text>
                        </View>
                    ) : (
                        filteredInstructors.map(instructor => (
                            <View key={instructor.id} style={styles.instructorCard}>
                                <View style={styles.instructorInfo}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{instructor.name ? instructor.name.charAt(0).toUpperCase() : '?'}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.instructorName}>{instructor.name}</Text>
                                            {/* Distinguimos visualmente al dueño del club dentro de la lista de instructores */}
                                            {instructor.role === 'club_owner' && (
                                                <View style={{ backgroundColor: theme.colors.secondary + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                    <Text style={{ color: theme.colors.secondary, fontSize: 11, fontWeight: '700' }}>{t('settings.clubOwner', { defaultValue: 'Dueño del club' })}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.instructorEmail}>{instructor.email}</Text>
                                        {/* Mostramos como insignias las actividades que tiene asignadas (resolviendo el id contra la lista de actividades del club) */}
                                        {instructor.activityIds && instructor.activityIds.length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                                                {instructor.activityIds.map(aid => {
                                                    const act = activities.find(a => a.id === aid);
                                                    if (!act) return null;
                                                    return (
                                                        <View key={aid} style={{ backgroundColor: theme.colors.primary + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '600' }}>{act.name}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {/* El botón de promoción solo está disponible para el dueño del club o instructores con rango suficiente (>= 10) */}
                                    {(user.role === 'club_owner' || (user.role === 'instructor' && user.rank >= 10)) && (
                                        <TouchableOpacity style={[styles.assignButton, { backgroundColor: theme.colors.secondary }]} onPress={() => openBeltModal(instructor.id, instructor.name, instructor.belt)}>
                                            <Ionicons name="star" size={20} color="white" />
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.assignButton, { backgroundColor: '#7C3AED' }]}
                                        onPress={() => openActivityModal(instructor.id, instructor.name, instructor.activityIds)}
                                    >
                                        <MaterialCommunityIcons name="tag-multiple" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.assignButton, { backgroundColor: theme.colors.warning }]}
                                        onPress={() => openPasswordModal(instructor.id, instructor.name)}
                                    >
                                        <Ionicons name="key" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.assignButton} onPress={() => openGroupModal(instructor.id, instructor.birthday)}>
                                        <Ionicons name="list" size={20} color="white" />
                                    </TouchableOpacity>
                                    {/* No se puede expulsar al dueño del club de la lista de instructores */}
                                    {instructor.role !== 'club_owner' && (
                                        <TouchableOpacity
                                            style={styles.removeButton}
                                            onPress={() => handleRemoveInstructor(instructor.id, instructor.name)}
                                        >
                                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Modal de asignación de grupos al instructor, organizado por actividad con secciones plegables */}
            <Modal visible={isGroupModalVisible} transparent animationType="fade" onRequestClose={() => setIsGroupModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('settings.assignGroup', { defaultValue: 'Assign to Group' })}</Text>

                        {/* Insignia con la edad del instructor, solo si conocemos su fecha de nacimiento */}
                        {(() => {
                            const age = getPersonAge(selectedInstructorBirthday);
                            if (age === null) return null;
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12, alignSelf: 'flex-start' }}>
                                    <Ionicons name="person" size={14} color={theme.colors.primary} style={{ marginRight: 5 }} />
                                    <Text style={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 13 }}>{age} años</Text>
                                </View>
                            );
                        })()}

                        {groups.length === 0 ? (
                            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
                                {t('settings.noGroupsActivity', { defaultValue: 'You must create Activities and Groups first in the Instructors panel.' })}
                            </Text>
                        ) : (() => {
                            // Agrupamos los grupos del club por actividad para pintar una sección plegable por cada una
                            const activityMap = new Map<string, { name: string; icon: string; groups: Group[] }>();
                            groups.forEach(g => {
                                if (!activityMap.has(g.activityId)) {
                                    activityMap.set(g.activityId, { name: g.activityName || g.activityId, icon: g.activityIcon || 'karate', groups: [] });
                                }
                                activityMap.get(g.activityId)!.groups.push(g);
                            });

                            const instructorAge = getPersonAge(selectedInstructorBirthday);

                            return (
                                <ScrollView style={{ maxHeight: 380, width: '100%' }} showsVerticalScrollIndicator={true}>
                                    {Array.from(activityMap.entries()).map(([actId, { name: actName, icon: actIcon, groups: actGroups }]) => {
                                        const enrolledCount = actGroups.filter(g => instructorGroups.has(g.id)).length;
                                        const isExpanded = expandedActivities.has(actId);

                                        // Recomendaciones basadas en la edad: solo se consideran los grupos con un rango de edad explícito
                                        const recommended = instructorAge !== null
                                            ? actGroups.filter(g => {
                                                if (g.minAge == null && g.maxAge == null) return false;
                                                const minOk = g.minAge == null || instructorAge >= (g.minAge as number);
                                                const maxOk = g.maxAge == null || instructorAge <= (g.maxAge as number);
                                                return minOk && maxOk;
                                            })
                                            : [];
                                        const others = actGroups.filter(g => !recommended.includes(g));

                                        return (
                                            <View key={actId}>
                                                {/* Cabecera de la actividad: pulsándola se expande/colapsa la lista de sus grupos */}
                                                <TouchableOpacity
                                                    style={styles.activityHeader}
                                                    onPress={() => toggleActivityExpand(actId)}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                        <MaterialCommunityIcons
                                                            name={actIcon as any}
                                                            size={18}
                                                            color={theme.colors.primary}
                                                            style={{ marginRight: 8 }}
                                                        />
                                                        <Text style={styles.activityHeaderText}>{actName}</Text>
                                                        {enrolledCount > 0 && (
                                                            <View style={styles.enrolledBadge}>
                                                                <Text style={styles.enrolledBadgeText}>{enrolledCount}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                            {actGroups.length} {actGroups.length === 1 ? 'clase' : 'clases'}
                                                        </Text>
                                                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textSecondary} />
                                                    </View>
                                                </TouchableOpacity>

                                                {/* Lista de grupos de la actividad, separados en recomendados y otros */}
                                                {isExpanded && (
                                                    <View style={{ marginTop: 2 }}>
                                                        {/* Grupos recomendados según la edad del instructor */}
                                                        {recommended.length > 0 && (
                                                            <View style={styles.recommendedSection}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 5 }}>
                                                                    <Ionicons name="sparkles" size={13} color="#D69E2E" />
                                                                    <Text style={{ color: '#D69E2E', fontWeight: 'bold', fontSize: 11 }}>
                                                                        RECOMENDADO PARA SU EDAD ({instructorAge} años)
                                                                    </Text>
                                                                </View>
                                                                {recommended.map(g => renderGroupRow(g, true))}
                                                            </View>
                                                        )}
                                                        {/* Resto de grupos que no encajan en el rango de edad recomendado */}
                                                        {others.length > 0 && (
                                                            <View>
                                                                {recommended.length > 0 && (
                                                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 8, marginBottom: 4, marginLeft: 4 }}>
                                                                        Otras clases
                                                                    </Text>
                                                                )}
                                                                {others.map(g => renderGroupRow(g, false))}
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            );
                        })()}

                        <TouchableOpacity style={styles.cancelButton} onPress={() => setIsGroupModalVisible(false)}>
                            <Text style={styles.cancelButtonText}>{t('common.done', { defaultValue: 'Done' })}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal para elegir qué actividades/disciplinas imparte el instructor (selección múltiple con checkboxes) */}
            <Modal visible={isActivityModalVisible} transparent animationType="fade" onRequestClose={() => setIsActivityModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Actividades de {selectedInstructorForActivities?.name}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
                            Selecciona las actividades de las que se encarga este instructor
                        </Text>
                        {activities.length === 0 ? (
                            <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic', marginBottom: 16 }}>No hay actividades creadas</Text>
                        ) : (
                            <ScrollView style={{ width: '100%', maxHeight: 300, marginBottom: 16 }}>
                                {activities.map(act => {
                                    const isSelected = pendingActivityIds.has(act.id);
                                    return (
                                        <TouchableOpacity
                                            key={act.id}
                                            onPress={() => setPendingActivityIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(act.id)) next.delete(act.id); else next.add(act.id);
                                                return next;
                                            })}
                                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                                        >
                                            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                                                {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                                            </View>
                                            <MaterialCommunityIcons name={(act.icon || 'tag') as any} size={18} color={isSelected ? theme.colors.primary : theme.colors.textSecondary} style={{ marginHorizontal: 10 }} />
                                            <Text style={{ color: isSelected ? theme.colors.primary : theme.colors.text, fontWeight: isSelected ? '700' : '400', fontSize: 15 }}>{act.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }} onPress={() => setIsActivityModalVisible(false)}>
                                <Text style={{ color: theme.colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.primary }} onPress={handleSaveActivities} disabled={isSavingActivities}>
                                {isSavingActivities ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal para forzar una contraseña temporal nueva al instructor */}
            <Modal visible={isPasswordModalVisible} transparent animationType="fade" onRequestClose={() => setIsPasswordModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Reset Password</Text>
                        <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                            Force a new temporary password for {selectedInstructorForPassword?.name}. They can use it to log in immediately.
                        </Text>
                        
                        <TextInput
                            style={styles.modalInput}
                            placeholder="New Password (min. 6 chars)"
                            placeholderTextColor={theme.colors.textSecondary}
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry={false}
                            autoCapitalize="none"
                        />

                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }} onPress={() => setIsPasswordModalVisible(false)}>
                                <Text style={{ color: theme.colors.text }}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.primary }} onPress={handleResetPassword} disabled={isResettingPassword}>
                                {isResettingPassword ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('common.save', { defaultValue: 'Save' })}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal de promoción de cinturón/nivel del instructor: el contenido cambia según el número y tipo de actividades de progresión */}
            <Modal visible={isBeltModalVisible} transparent animationType="fade" onRequestClose={() => setIsBeltModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Promover Instructor</Text>

                        {/* Cargando -> indicador. Sin actividades de progresión -> aviso. Varias -> selector. Una sola -> directo a elegir nivel */}
                        {isLoadingProgressionActivities ? (
                            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
                        ) : progressionActivityOptions.length === 0 ? (
                            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                {selectedInstructorForBelt?.name} no está asignado a ninguna actividad con sistema de progresión.
                            </Text>
                        ) : !selectedProgressionActivity ? (
                            <>
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    {selectedInstructorForBelt?.name} está asignado a varias actividades. Elige cuál promover.
                                </Text>
                                <FlatList
                                    data={progressionActivityOptions}
                                    keyExtractor={(item) => item.activityId}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.groupModalItem, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                                            onPress={() => setSelectedProgressionActivity(item)}
                                        >
                                            <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>{item.activityName}</Text>
                                            {item.currentLevelName && (
                                                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{item.currentLevelName}</Text>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                    style={{ maxHeight: 300, width: '100%', marginBottom: 16 }}
                                />
                            </>
                        ) : selectedProgressionActivity.activityType === 'taekwondo_itf' ? (
                            // Para Taekwondo ITF mostramos la lista de cinturones (BELT_CONFIGS), filtrada por el rango de quien promociona
                            <>
                                {selectedProgressionActivity.currentLevelName && (
                                    <View style={{ position: 'absolute', top: 16, right: 16 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold' }}>
                                            {selectedProgressionActivity.currentLevelName}
                                        </Text>
                                    </View>
                                )}
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    Selecciona el nuevo cinturón para {selectedInstructorForBelt?.name} en {selectedProgressionActivity.activityName}.
                                </Text>
                                <FlatList
                                    data={Object.keys(BELT_CONFIGS).map(Number).sort((a, b) => a - b).filter(b => user.role === 'club_owner' || b <= (user.rank - 1))}
                                    keyExtractor={(item) => item.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.groupModalItem, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                                            onPress={() => handleAssignBelt(item, BELT_CONFIGS[item].name)}
                                            disabled={isUpdatingBelt}
                                        >
                                            <BeltDisplay rank={item} showText={true} width={250} height={24} />
                                        </TouchableOpacity>
                                    )}
                                    style={{ maxHeight: 300, width: '100%', marginBottom: 16 }}
                                />
                            </>
                        ) : (
                            // Para el resto de actividades, usamos la escala de progresión genérica de PROGRESSION_SCALES según su tipo
                            <>
                                {selectedProgressionActivity.currentLevelName && (
                                    <View style={{ position: 'absolute', top: 16, right: 16 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold' }}>
                                            {selectedProgressionActivity.currentLevelName}
                                        </Text>
                                    </View>
                                )}
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    Selecciona el nuevo nivel para {selectedInstructorForBelt?.name} en {selectedProgressionActivity.activityName}.
                                </Text>
                                <FlatList
                                    data={PROGRESSION_SCALES[selectedProgressionActivity.activityType] || []}
                                    keyExtractor={(item) => item.order.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.groupModalItem, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
                                            onPress={() => handleAssignBelt(item.order, item.name)}
                                            disabled={isUpdatingBelt}
                                        >
                                            <ProgressionBadge activityType={selectedProgressionActivity.activityType} levelOrder={item.order} levelName={item.name} width={250} height={28} />
                                        </TouchableOpacity>
                                    )}
                                    style={{ maxHeight: 300, width: '100%', marginBottom: 16 }}
                                />
                            </>
                        )}

                        <TouchableOpacity style={styles.cancelButton} onPress={() => setIsBeltModalVisible(false)}>
                            <Text style={styles.cancelButtonText}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
                        </TouchableOpacity>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.m,
        paddingTop: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
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
        padding: theme.spacing.m,
        paddingBottom: 40,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    addSection: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    sectionTitle: {
        ...theme.typography.subheader,
        color: theme.colors.text,
        marginBottom: 4,
    },
    sectionSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: theme.spacing.m,
    },
    inputContainer: {
        flexDirection: 'row',
        gap: theme.spacing.s,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.s,
        padding: 12,
        color: theme.colors.text,
        fontSize: 16,
    },
    addButton: {
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.s,
    },
    addButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    helperText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 8,
        fontStyle: 'italic',
    },
    listSection: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xl,
    },
    emptyStateText: {
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.s,
        textAlign: 'center',
    },
    instructorCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    instructorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.m,
    },
    avatarText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    instructorName: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    instructorEmail: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    assignButton: {
        padding: 8,
        backgroundColor: theme.colors.primary,
        borderRadius: 8,
    },
    removeButton: {
        padding: 8,
        backgroundColor: theme.colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.error,
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
        alignItems: 'center',
        maxHeight: '80%',
    },
    modalTitle: {
        ...theme.typography.header,
        color: theme.colors.primary,
        marginBottom: 16,
    },
    groupModalItem: {
        width: '100%',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    cancelButton: {
        marginTop: 16,
        padding: 16,
        width: '100%',
        alignItems: 'center'
    },
    cancelButtonText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold'
    },
    modalInput: {
        width: '100%',
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        color: theme.colors.text,
        marginBottom: 16,
    },
    activityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.background,
        borderRadius: 8,
        marginBottom: 2,
        marginTop: 6,
    },
    activityHeaderText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 14,
    },
    enrolledBadge: {
        marginLeft: 8,
        backgroundColor: theme.colors.primary,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    enrolledBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        marginBottom: 2,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    groupRowEnrolled: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '12',
    },
    groupRowName: {
        color: theme.colors.text,
        fontWeight: '600',
        fontSize: 14,
    },
    groupRowTime: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 1,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    capacityBadge: {
        backgroundColor: theme.colors.background,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    capacityBadgeFull: {
        borderColor: theme.colors.error,
        backgroundColor: theme.colors.error + '15',
    },
    capacityBadgeText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    groupRowRecommended: {
        borderColor: '#D69E2E55',
        backgroundColor: '#D69E2E0D',
    },
    recommendedSection: {
        backgroundColor: '#D69E2E0D',
        borderRadius: 10,
        padding: 10,
        marginTop: 4,
        borderWidth: 1,
        borderColor: '#D69E2E33',
    },
});
