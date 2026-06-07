import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, FlatList, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { apiFetch } from '../../utils/apiFetch';
import { Group, ProgressionActivityOption, PROGRESSION_ACTIVITY_TYPES } from '../../types';
import { BeltDisplay } from '../../components/BeltDisplay';
import { BELT_CONFIGS } from '../../data/belts';
import { ProgressionBadge } from '../../components/ProgressionBadge';
import { PROGRESSION_SCALES } from '../../data/progressionScales';

// ─── Group row sub-component ────────────────────────────────────────────────
const GroupRow = ({ group, enrolled, recommended, onToggle, theme }: {
    group: any; enrolled: boolean; recommended: boolean;
    onToggle: (id: string) => void; theme: any;
}) => {
    const ageLabel = (group.minAge != null || group.maxAge != null)
        ? `${group.minAge ?? '0'} – ${group.maxAge ?? '∞'} años`
        : null;
    const count = parseInt(group.studentCount) || 0;
    const max = group.maxStudents;
    const isFull = max != null && count >= max;

    return (
        <TouchableOpacity
            onPress={() => onToggle(group.id)}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 11,
                paddingHorizontal: 12,
                borderRadius: 10,
                marginBottom: 6,
                backgroundColor: enrolled
                    ? theme.colors.primary + '18'
                    : recommended
                        ? '#D69E2E18'
                        : theme.colors.background,
                borderWidth: 1,
                borderColor: enrolled
                    ? theme.colors.primary
                    : recommended
                        ? '#D69E2E55'
                        : theme.colors.border,
            }}
        >
            {/* Checkbox */}
            <View style={{
                width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                borderColor: enrolled ? theme.colors.primary : theme.colors.border,
                backgroundColor: enrolled ? theme.colors.primary : 'transparent',
                justifyContent: 'center', alignItems: 'center', marginRight: 10,
            }}>
                {enrolled && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>

            {/* Name + schedule */}
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: 'bold', fontSize: 14 }}>{group.name}</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 1 }}>{group.time}</Text>
            </View>

            {/* Right: age range + capacity */}
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
                {ageLabel && (
                    <View style={{ backgroundColor: theme.colors.surface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: 'bold' }}>{ageLabel}</Text>
                    </View>
                )}
                {max != null && (
                    <Text style={{ fontSize: 10, color: isFull ? '#E53E3E' : theme.colors.textSecondary }}>
                        {count}/{max} {isFull ? '● lleno' : ''}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

// ─── Main screen ────────────────────────────────────────────────────────────
export const StudentManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params;

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [students, setStudents] = useState<{ id: string; email: string; name: string; belt?: string; birthday?: string | null }[]>([]);

    // Register new student mode
    const [addMode, setAddMode] = useState<'search' | 'create'>('search');
    const [createName, setCreateName] = useState('');
    const [createSurname, setCreateSurname] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPhone, setCreatePhone] = useState('');
    const [createBirthday, setCreateBirthday] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [tempPasswordModal, setTempPasswordModal] = useState<{ name: string; email: string; password: string } | null>(null);

    const [groups, setGroups] = useState<(Group & { activityName?: string })[]>([]);
    const [isGroupModalVisible, setIsGroupModalVisible] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [selectedStudentBirthday, setSelectedStudentBirthday] = useState<string | null>(null);
    const [studentGroups, setStudentGroups] = useState<Set<string>>(new Set());
    const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

    // Password Reset State
    const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
    const [selectedStudentForPassword, setSelectedStudentForPassword] = useState<{ id: string, name: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isResettingPassword, setIsResettingPassword] = useState(false);

    // Age helper
    const getStudentAge = (birthday: string | null): number | null => {
        if (!birthday) return null;
        const birth = new Date(birthday);
        if (isNaN(birth.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        return age;
    };

    // Filter & Belts State
    const [searchQuery, setSearchQuery] = useState('');
    const [isBeltModalVisible, setIsBeltModalVisible] = useState(false);
    const [selectedStudentForBelt, setSelectedStudentForBelt] = useState<{ id: string, name: string, currentBelt?: string } | null>(null);
    const [isUpdatingBelt, setIsUpdatingBelt] = useState(false);
    const [progressionActivityOptions, setProgressionActivityOptions] = useState<ProgressionActivityOption[]>([]);
    const [selectedProgressionActivity, setSelectedProgressionActivity] = useState<ProgressionActivityOption | null>(null);
    const [isLoadingProgressionActivities, setIsLoadingProgressionActivities] = useState(false);

    useEffect(() => {
        if (user.role !== 'club_owner' || (user.plan !== 'club_pro' && user.plan !== 'club_elite')) {
            Alert.alert(t('settings.limitReached'), t('settings.upgradeToPro'));
            navigation.goBack();
            return;
        }
        if (user.organizationId) {
            loadStudents();
            loadGroups();
        }
    }, [user]);

    const loadStudents = async () => {
        try {
            const data = await ClubService.getClubStudents(user.organizationId);
            setStudents(data);
        } catch (error) {
            console.error('Failed to load students', error);
        }
    };

    const loadGroups = async () => {
        try {
            const data = await ClubService.getAllClubGroups(user.organizationId);
            setGroups(data);
        } catch (error) {
            console.error('Failed to load groups', error);
        }
    };

    const handleAddStudent = async () => {
        if (!email.trim() || !user.organizationId) return;

        setIsLoading(true);
        try {
            const result = await ClubService.addStudentToClub(user.organizationId, email.trim());

            if (result.success) {
                setStudents([...students, { ...result.user, birthday: null }]);
                setEmail('');
                Alert.alert(
                    t('common.success', { defaultValue: 'Success' }),
                    t('settings.studentAddedSuccess', { defaultValue: 'The student has been successfully registered to your club.' })
                );
            } else {
                let errorMsg = t('instructor.errorAdding', { defaultValue: 'Could not add student.' });
                if (result.error === 'invalid_email') errorMsg = t('instructor.invalidEmail', { defaultValue: 'Please enter a valid email address.' });
                if (result.error === 'not_found') errorMsg = t('instructor.userNotFound', { defaultValue: 'This email is not registered in Learning Dungeon They must create an account first.' });
                if (result.error === 'already_added') errorMsg = t('instructor.alreadyAdded', { defaultValue: 'This student is already in your club.' });
                if (result.error === 'wrong_role') errorMsg = 'This user is an instructor or owner, not a student.';

                Alert.alert(t('common.error', { defaultValue: 'Error' }), errorMsg);
            }
        } catch (error: any) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message || 'Failed to add student');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateStudent = async () => {
        if (!createName.trim() || !createEmail.trim()) return;
        setIsCreating(true);
        try {
            const result = await ClubService.createStudent(user.organizationId, {
                name: createName.trim(),
                surname: createSurname.trim(),
                email: createEmail.trim(),
                phone: createPhone.trim() || undefined,
                birthday: createBirthday.trim() || undefined,
            });
            if (!result.success) {
                let msg = 'No se pudo crear el alumno.';
                if (result.error === 'already_exists') msg = 'Ya existe una cuenta con ese correo electrónico.';
                if (result.error === 'name_email_required') msg = 'El nombre y el correo son obligatorios.';
                Alert.alert('Error', msg);
                return;
            }
            setStudents(prev => [...prev, { ...result.student, birthday: result.student.birthday }]);
            setCreateName(''); setCreateSurname(''); setCreateEmail('');
            setCreatePhone(''); setCreateBirthday('');
            setAddMode('search');
            setTempPasswordModal({
                name: result.student.name,
                email: result.student.email,
                password: result.tempPassword!,
            });
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Error al crear el alumno');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRemoveStudent = (id: string, name: string) => {
        const title = t('settings.removeStudentTitle', { defaultValue: 'Remove Student?' });
        const message = t('settings.removeStudentBody', { defaultValue: 'Are you sure you want to remove {{name}} from your club?', name });

        if (Platform.OS === 'web') {
            if (window.confirm(`${title}\n\n${message}`)) {
                performRemoval(id);
            }
        } else {
            Alert.alert(
                title,
                message,
                [
                    { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                    {
                        text: t('settings.remove', { defaultValue: 'Remove' }),
                        style: 'destructive',
                        onPress: () => performRemoval(id)
                    }
                ]
            );
        }
    };

    const performRemoval = async (id: string) => {
        try {
            if (!user.organizationId) return;
            await ClubService.removeStudentFromClub(user.organizationId, id);
            setStudents(students.filter(s => s.id !== id));
        } catch (error: any) {
            if (Platform.OS === 'web') {
                window.alert('Error: ' + (error.message || 'Failed to remove student'));
            } else {
                Alert.alert('Error', error.message || 'Failed to remove student');
            }
        }
    };

    const openGroupModal = async (studentId: string, birthday?: string | null) => {
        setSelectedStudentId(studentId);
        setSelectedStudentBirthday(birthday || null);
        try {
            const groupsAssociated = await ClubService.getStudentGroups(studentId);
            setStudentGroups(new Set(groupsAssociated.map(g => g.id)));
        } catch (error) {
            console.error("Failed to load student groups", error);
        }
        // Start with all sections collapsed
        setExpandedActivities(new Set());
        setIsGroupModalVisible(true);
    };

    const handleToggleGroup = async (groupId: string) => {
        if (!selectedStudentId) return;
        try {
            const isEnrolled = studentGroups.has(groupId);
            if (isEnrolled) {
                await ClubService.unenrollStudentFromGroup(groupId, selectedStudentId);
                setStudentGroups(prev => {
                    const next = new Set(prev);
                    next.delete(groupId);
                    return next;
                });
            } else {
                await ClubService.enrollStudentInGroup(groupId, selectedStudentId);
                setStudentGroups(prev => {
                    const next = new Set(prev);
                    next.add(groupId);
                    return next;
                });
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to toggle group assignment');
        }
    };

    const openPasswordModal = (id: string, name: string) => {
        setSelectedStudentForPassword({ id, name });
        setNewPassword('');
        setIsPasswordModalVisible(true);
    };

    const handleResetPassword = async () => {
        if (!selectedStudentForPassword || newPassword.length < 6) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), 'Password must be at least 6 characters long.');
            return;
        }

        setIsResettingPassword(true);
        try {
            // Note: Normally we'd put this in AuthService, but for brevity we'll fetch natively here since it's an isolated Admin route
            const response = await apiFetch(`/api/users/${selectedStudentForPassword.id}/password/admin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset password');
            }

            Alert.alert(t('common.success', { defaultValue: 'Success' }), `Password for ${selectedStudentForPassword.name} has been securely updated.`);
            setIsPasswordModalVisible(false);
        } catch (error: any) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message);
        } finally {
            setIsResettingPassword(false);
        }
    };

    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            const response = await apiFetch('/api/admin/force-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Failed to trigger sync');
            
            Alert.alert(
                t('common.success', { defaultValue: 'Success' }), 
                'HubSpot Sync has been triggered in the background. It may take a few minutes to complete depending on the number of contacts.'
            );
        } catch (error: any) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const openBeltModal = async (id: string, name: string, currentBelt?: string) => {
        setSelectedStudentForBelt({ id, name, currentBelt });
        setSelectedProgressionActivity(null);
        setProgressionActivityOptions([]);
        setIsLoadingProgressionActivities(true);
        setIsBeltModalVisible(true);
        try {
            const groupsAssociated = await ClubService.getStudentGroups(id);
            const byActivity = new Map<string, ProgressionActivityOption>();
            groupsAssociated.forEach(g => {
                if (!g.activityType || !PROGRESSION_ACTIVITY_TYPES.includes(g.activityType)) return;
                if (!byActivity.has(g.activityId)) {
                    byActivity.set(g.activityId, {
                        activityId: g.activityId,
                        activityName: g.activityName || g.activityType,
                        activityType: g.activityType,
                        currentLevelOrder: g.progressionLevelOrder ?? null,
                        currentLevelName: g.progressionLevelName ?? null,
                    });
                }
            });
            const options = Array.from(byActivity.values());
            setProgressionActivityOptions(options);
            if (options.length === 1) setSelectedProgressionActivity(options[0]);
        } catch (error) {
            console.error('Failed to load student progression activities', error);
        } finally {
            setIsLoadingProgressionActivities(false);
        }
    };

    const handleAssignBelt = async (levelOrder: number, levelName: string) => {
        if (!selectedStudentForBelt || !selectedProgressionActivity || !user.id) return;
        setIsUpdatingBelt(true);
        try {
            await ClubService.updateUserProgression(selectedStudentForBelt.id, selectedProgressionActivity.activityId, levelOrder, levelName, user.id);
            if (selectedProgressionActivity.activityType === 'taekwondo_itf') {
                setStudents(students.map(s => s.id === selectedStudentForBelt.id ? { ...s, belt: levelName } : s));
            }
            Alert.alert('Success', `${selectedStudentForBelt.name} is now ${levelName}.`);
            setIsBeltModalVisible(false);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to update progression.');
        } finally {
            setIsUpdatingBelt(false);
        }
    };

    const debouncedSearch = useDebounce(searchQuery, 250);
    const filteredStudents = useMemo(
        () => students.filter(s =>
            s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            s.email.toLowerCase().includes(debouncedSearch.toLowerCase())
        ),
        [students, debouncedSearch]
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings.manageStudents', { defaultValue: 'Manage Students' })}</Text>
                <TouchableOpacity onPress={handleForceSync} disabled={isSyncing} style={{ width: 40, alignItems: 'center' }}>
                    {isSyncing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="sync" size={24} color={theme.colors.primary} />}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                <View style={styles.addSection}>
                    {/* Mode toggle */}
                    <View style={styles.modeToggle}>
                        <TouchableOpacity
                            style={[styles.modeTab, addMode === 'search' && styles.modeTabActive]}
                            onPress={() => setAddMode('search')}
                        >
                            <Ionicons name="search" size={15} color={addMode === 'search' ? '#fff' : theme.colors.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={[styles.modeTabText, addMode === 'search' && styles.modeTabTextActive]}>Ya tiene cuenta</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeTab, addMode === 'create' && styles.modeTabActive]}
                            onPress={() => setAddMode('create')}
                        >
                            <Ionicons name="person-add" size={15} color={addMode === 'create' ? '#fff' : theme.colors.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={[styles.modeTabText, addMode === 'create' && styles.modeTabTextActive]}>Registrar nuevo</Text>
                        </TouchableOpacity>
                    </View>

                    {addMode === 'search' ? (
                        <>
                            <Text style={styles.sectionSubtitle}>
                                Añade a un alumno que ya tiene cuenta en Learning Dungeon por su correo electrónico.
                            </Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('common.email')}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                <TouchableOpacity
                                    style={[styles.addButton, !email.trim() && { opacity: 0.5 }]}
                                    onPress={handleAddStudent}
                                    disabled={!email.trim() || isLoading}
                                >
                                    {isLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.addButtonText}>Añadir</Text>}
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.sectionSubtitle}>
                                Crea una cuenta nueva para un alumno que todavía no está registrado. Recibirás una contraseña temporal para darle.
                            </Text>
                            <View style={{ gap: 10 }}>
                                <View style={styles.inputRow}>
                                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nombre *" placeholderTextColor={theme.colors.textSecondary} value={createName} onChangeText={setCreateName} />
                                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Apellidos *" placeholderTextColor={theme.colors.textSecondary} value={createSurname} onChangeText={setCreateSurname} />
                                </View>
                                <TextInput style={styles.input} placeholder="Correo electrónico *" placeholderTextColor={theme.colors.textSecondary} value={createEmail} onChangeText={setCreateEmail} autoCapitalize="none" keyboardType="email-address" />
                                <View style={styles.inputRow}>
                                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Teléfono" placeholderTextColor={theme.colors.textSecondary} value={createPhone} onChangeText={setCreatePhone} keyboardType="phone-pad" />
                                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Fecha nac. (AAAA-MM-DD)" placeholderTextColor={theme.colors.textSecondary} value={createBirthday} onChangeText={setCreateBirthday} />
                                </View>
                                <TouchableOpacity
                                    style={[styles.addButton, { paddingVertical: 14, borderRadius: 8, opacity: (!createName.trim() || !createEmail.trim()) ? 0.5 : 1 }]}
                                    onPress={handleCreateStudent}
                                    disabled={!createName.trim() || !createEmail.trim() || isCreating}
                                >
                                    {isCreating
                                        ? <ActivityIndicator color="#FFF" size="small" />
                                        : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <Ionicons name="person-add" size={18} color="#FFF" />
                                            <Text style={styles.addButtonText}>Crear cuenta</Text>
                                          </View>
                                    }
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>

                <View style={styles.listSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>{t('settings.currentStudents', { defaultValue: 'Current Students' })} ({filteredStudents.length})</Text>
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

                    {filteredStudents.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="people-outline" size={48} color={theme.colors.border} />
                            <Text style={styles.emptyStateText}>{t('settings.noStudentsYet', { defaultValue: 'No students enrolled in your club yet.' })}</Text>
                        </View>
                    ) : (
                        filteredStudents.map((student) => (
                            <View key={student.id} style={styles.studentCard}>
                                <View style={styles.studentInfo}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{student.name ? student.name.charAt(0).toUpperCase() : '?'}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.studentName}>{student.name}</Text>
                                        <Text style={styles.studentEmail}>{student.email}</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {(user.role === 'club_owner' || user.role === 'instructor') && (
                                        <TouchableOpacity style={[styles.assignButton, { backgroundColor: theme.colors.secondary }]} onPress={() => openBeltModal(student.id, student.name, student.belt)}>
                                            <Ionicons name="star" size={20} color="white" />
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={[styles.assignButton, { backgroundColor: theme.colors.warning }]} onPress={() => openPasswordModal(student.id, student.name)}>
                                        <Ionicons name="key" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.assignButton} onPress={() => openGroupModal(student.id, student.birthday)}>
                                        <Ionicons name="list" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveStudent(student.id, student.name)}>
                                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            {/* Temp password modal after creating new student */}
            <Modal visible={!!tempPasswordModal} transparent animationType="fade" onRequestClose={() => setTempPasswordModal(null)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { gap: 12 }]}>
                        <View style={{ alignItems: 'center' }}>
                            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.success + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                                <Ionicons name="checkmark-circle" size={32} color={theme.colors.success} />
                            </View>
                            <Text style={[styles.modalTitle, { color: theme.colors.success }]}>¡Alumno registrado!</Text>
                        </View>

                        <Text style={{ color: theme.colors.text, textAlign: 'center', fontSize: 15 }}>
                            <Text style={{ fontWeight: 'bold' }}>{tempPasswordModal?.name}</Text> ya puede iniciar sesión con:
                        </Text>

                        <View style={{ backgroundColor: theme.colors.background, borderRadius: 10, padding: 14, width: '100%', gap: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="mail-outline" size={16} color={theme.colors.textSecondary} />
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Correo:</Text>
                                <Text style={{ color: theme.colors.text, fontWeight: 'bold', flex: 1 }}>{tempPasswordModal?.email}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="key-outline" size={16} color={theme.colors.textSecondary} />
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Contraseña temporal:</Text>
                                <Text style={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 18, letterSpacing: 2, flex: 1 }}>{tempPasswordModal?.password}</Text>
                            </View>
                        </View>

                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                            Comparte estos datos con el alumno. Puede cambiar su contraseña desde los ajustes de la app.
                        </Text>

                        <TouchableOpacity
                            style={[styles.addButton, { width: '100%', paddingVertical: 14, borderRadius: 10 }]}
                            onPress={() => setTempPasswordModal(null)}
                        >
                            <Text style={[styles.addButtonText, { textAlign: 'center' }]}>Entendido</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Group Assignment Modal — grouped by activity */}
            <Modal visible={isGroupModalVisible} transparent animationType="fade" onRequestClose={() => setIsGroupModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Header */}
                        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <Ionicons name="list" size={22} color={theme.colors.primary} style={{ marginRight: 8 }} />
                            <Text style={styles.modalTitle}>{t('settings.assignGroup', { defaultValue: 'Asignar a Grupo' })}</Text>
                        </View>

                        {/* Age badge */}
                        {(() => {
                            const age = getStudentAge(selectedStudentBirthday);
                            if (age === null) return null;
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12, alignSelf: 'flex-start' }}>
                                    <Ionicons name="person" size={14} color={theme.colors.primary} style={{ marginRight: 5 }} />
                                    <Text style={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 13 }}>{age} años</Text>
                                </View>
                            );
                        })()}

                        {groups.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <Ionicons name="folder-open-outline" size={40} color={theme.colors.border} />
                                <Text style={{ color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
                                    {t('settings.noGroupsActivity', { defaultValue: 'Crea actividades y grupos primero en el panel de Instructores.' })}
                                </Text>
                            </View>
                        ) : (
                            <ScrollView style={{ width: '100%', maxHeight: 440 }} showsVerticalScrollIndicator>
                                {(() => {
                                    // Build activity map preserving order
                                    const activityMap: Map<string, { name: string; icon: string; groups: typeof groups }> = new Map();
                                    groups.forEach(g => {
                                        const key = g.activityId || 'sin-actividad';
                                        const entry = activityMap.get(key) || { name: g.activityName || 'Sin actividad', icon: g.activityIcon || 'karate', groups: [] };
                                        entry.groups.push(g);
                                        activityMap.set(key, entry);
                                    });

                                    const studentAge = getStudentAge(selectedStudentBirthday);

                                    return Array.from(activityMap.entries()).map(([activityId, { name: activityName, icon: activityIcon, groups: activityGroups }]) => {
                                        const isExpanded = expandedActivities.has(activityId);

                                        // Split into recommended vs others
                                        // Only groups with an EXPLICIT age range that the student fits are "recommended"
                                        const recommended = studentAge !== null
                                            ? activityGroups.filter(g => {
                                                if (g.minAge == null && g.maxAge == null) return false; // no range = not recommended
                                                const minOk = g.minAge == null || studentAge >= (g.minAge as number);
                                                const maxOk = g.maxAge == null || studentAge <= (g.maxAge as number);
                                                return minOk && maxOk;
                                            })
                                            : [];
                                        const others = activityGroups.filter(g => !recommended.includes(g));

                                        const enrolledCount = activityGroups.filter(g => studentGroups.has(g.id)).length;

                                        return (
                                            <View key={activityId} style={{ marginBottom: 8 }}>
                                                {/* Activity header — tap to expand/collapse */}
                                                <TouchableOpacity
                                                    onPress={() => setExpandedActivities(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(activityId)) next.delete(activityId);
                                                        else next.add(activityId);
                                                        return next;
                                                    })}
                                                    style={styles.activityHeader}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                        <MaterialCommunityIcons name={activityIcon as any} size={18} color={theme.colors.primary} />
                                                        <Text style={styles.activityHeaderText}>{activityName}</Text>
                                                        {enrolledCount > 0 && (
                                                            <View style={{ backgroundColor: theme.colors.success, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                                                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{enrolledCount}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
                                                </TouchableOpacity>

                                                {isExpanded && (
                                                    <View style={{ marginTop: 2 }}>
                                                        {/* Recommended group(s) */}
                                                        {recommended.length > 0 && (
                                                            <View style={styles.recommendedSection}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 5 }}>
                                                                    <Ionicons name="sparkles" size={14} color="#D69E2E" />
                                                                    <Text style={{ color: '#D69E2E', fontWeight: 'bold', fontSize: 12 }}>
                                                                        RECOMENDADO PARA SU EDAD ({studentAge} años)
                                                                    </Text>
                                                                </View>
                                                                {recommended.map(g => (
                                                                    <GroupRow key={g.id} group={g} enrolled={studentGroups.has(g.id)} recommended onToggle={handleToggleGroup} theme={theme} />
                                                                ))}
                                                            </View>
                                                        )}

                                                        {/* Other groups */}
                                                        {others.length > 0 && (
                                                            <View>
                                                                {recommended.length > 0 && (
                                                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 8, marginBottom: 4, marginLeft: 4 }}>
                                                                        Otras clases
                                                                    </Text>
                                                                )}
                                                                {others.map(g => (
                                                                    <GroupRow key={g.id} group={g} enrolled={studentGroups.has(g.id)} recommended={false} onToggle={handleToggleGroup} theme={theme} />
                                                                ))}
                                                            </View>
                                                        )}

                                                        {/* No age range configured */}
                                                        {recommended.length === 0 && studentAge !== null && activityGroups.every(g => g.minAge == null && g.maxAge == null) && (
                                                            <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontStyle: 'italic', marginLeft: 4, marginBottom: 4 }}>
                                                                Sin rango de edad configurado en estos grupos
                                                            </Text>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    });
                                })()}
                            </ScrollView>
                        )}

                        <TouchableOpacity style={[styles.cancelButton, { marginTop: 8 }]} onPress={() => setIsGroupModalVisible(false)}>
                            <Text style={[styles.cancelButtonText, { color: theme.colors.primary, fontWeight: 'bold' }]}>{t('common.done', { defaultValue: 'Hecho' })}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Password Reset Modal */}
            <Modal visible={isPasswordModalVisible} transparent animationType="fade" onRequestClose={() => setIsPasswordModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Reset Password</Text>
                        <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                            Force a new temporary password for {selectedStudentForPassword?.name}. They can use it to log in immediately.
                        </Text>
                        
                        <TextInput
                            style={styles.input}
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

            {/* Progression Promotion Modal */}
            <Modal visible={isBeltModalVisible} transparent animationType="fade" onRequestClose={() => setIsBeltModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Promover Alumno</Text>

                        {isLoadingProgressionActivities ? (
                            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
                        ) : progressionActivityOptions.length === 0 ? (
                            <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                {selectedStudentForBelt?.name} no está inscrito en ninguna actividad con sistema de progresión.
                            </Text>
                        ) : !selectedProgressionActivity ? (
                            <>
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    {selectedStudentForBelt?.name} está inscrito en varias actividades. Elige cuál promover.
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
                            <>
                                {selectedProgressionActivity.currentLevelName && (
                                    <View style={{ position: 'absolute', top: 16, right: 16 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold' }}>
                                            {selectedProgressionActivity.currentLevelName}
                                        </Text>
                                    </View>
                                )}
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    Selecciona el nuevo cinturón para {selectedStudentForBelt?.name} en {selectedProgressionActivity.activityName}.
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
                            <>
                                {selectedProgressionActivity.currentLevelName && (
                                    <View style={{ position: 'absolute', top: 16, right: 16 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold' }}>
                                            {selectedProgressionActivity.currentLevelName}
                                        </Text>
                                    </View>
                                )}
                                <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                                    Selecciona el nuevo nivel para {selectedStudentForBelt?.name} en {selectedProgressionActivity.activityName}.
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
    studentCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    studentInfo: {
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
    studentName: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    studentEmail: {
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
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: 10,
        padding: 4,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modeTab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
    },
    modeTabActive: {
        backgroundColor: theme.colors.primary,
    },
    modeTabText: {
        color: theme.colors.textSecondary,
        fontWeight: '600',
        fontSize: 13,
    },
    modeTabTextActive: {
        color: '#fff',
    },
    inputRow: {
        flexDirection: 'row',
        gap: 10,
    },
    activityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surface,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    activityHeaderText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 15,
    },
    recommendedSection: {
        backgroundColor: '#D69E2E0D',
        borderRadius: 10,
        padding: 10,
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#D69E2E33',
    },
});
