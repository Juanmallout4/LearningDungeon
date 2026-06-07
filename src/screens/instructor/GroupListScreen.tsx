import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
    TextInput, Alert, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ClubService } from '../../services/ClubService';
import { Group, GroupSession } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
const timeStringToDate = (timeStr: string): Date => {
    const d = new Date();
    const [h, m] = (timeStr || '00:00').split(':');
    d.setHours(parseInt(h || '0', 10), parseInt(m || '0', 10), 0, 0);
    return d;
};
const dateToTimeString = (d: Date): string =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

const formatSessionsDisplay = (sessions: GroupSession[], daysShort: string[]): string => {
    if (!sessions?.length) return '';
    return sessions.map(s => {
        const days = [...s.days].sort((a, b) => a - b).map(d => daysShort[d]).join('-');
        const aula = s.aulaName ? ` · ${s.aulaName}` : '';
        const instructor = s.instructorName ? ` · ${s.instructorName}` : '';
        return `${days}  ${s.startTime}–${s.endTime}${aula}${instructor}`;
    }).join('\n');
};

interface SessionState {
    days: number[];
    startTime: Date;
    endTime: Date;
    aulaId: string | null;
    instructorId: string | null;
}

const makeDefaultSession = (prev?: SessionState): SessionState => {
    if (prev) {
        return { days: [], startTime: new Date(prev.startTime), endTime: new Date(prev.endTime), aulaId: prev.aulaId, instructorId: prev.instructorId };
    }
    const start = new Date(); start.setHours(17, 0, 0, 0);
    const end = new Date();   end.setHours(18, 0, 0, 0);
    return { days: [], startTime: start, endTime: end, aulaId: null, instructorId: null };
};

type TimePickerTarget = { idx: number; field: 'startTime' | 'endTime' } | null;

// Aula type
interface Aula { id: string; name: string; capacity?: number | null; description?: string | null; color?: string }
// Instructor type (subset of what getInstructors returns)
interface Instructor { id: string; name: string; email: string }

// ─────────────────────────────────────────────────────────────────────────────
export const GroupListScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { activity, user, initialMode } = route.params || {};
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [groups, setGroups] = useState<Group[]>([]);
    const [aulas, setAulas] = useState<Aula[]>([]);
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Create/Edit Modal state
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [deleteTargetGroup, setDeleteTargetGroup] = useState<Group | null>(null);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [modalName, setModalName] = useState('');
    const [sessionInputs, setSessionInputs] = useState<SessionState[]>([makeDefaultSession()]);
    const [activeTimePicker, setActiveTimePicker] = useState<TimePickerTarget>(null);
    const [maxStudentsInput, setMaxStudentsInput] = useState('');
    const [minAgeInput, setMinAgeInput] = useState('');
    const [maxAgeInput, setMaxAgeInput] = useState('');
    const [modalError, setModalError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Aulas management modal
    const [isAulaModalVisible, setIsAulaModalVisible] = useState(false);
    const [aulaName, setAulaName] = useState('');
    const [aulaCapacity, setAulaCapacity] = useState('');
    const [aulaDescription, setAulaDescription] = useState('');
    const [aulaColor, setAulaColor] = useState('#3182CE');
    const [editingAula, setEditingAula] = useState<Aula | null>(null);
    const [aulaSaving, setAulaSaving] = useState(false);
    const [aulaError, setAulaError] = useState<string | null>(null);

    const daysShort = t('settings.daysShort', {
        returnObjects: true,
        defaultValue: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    }) as string[];

    useEffect(() => {
        if (!activity || typeof activity !== 'object') {
            navigation.replace('ActivityList');
        } else {
            loadData();
        }
    }, [activity, navigation]);

    const loadData = async () => {
        if (!user.organizationId) { setIsLoading(false); return; }
        try {
            const [groupData, aulaData, instructorData] = await Promise.all([
                user.role === 'student'
                    ? ClubService.getStudentGroups(user.id)
                    : ClubService.getGroups(user.organizationId),
                ClubService.getAulas(user.organizationId).catch(() => []),
                ClubService.getInstructors(user.organizationId).catch(() => []),
            ]);
            setGroups((groupData as Group[]).filter((g: Group) => g.activityId === activity.id));
            setAulas(aulaData);
            setInstructors(instructorData);
        } catch (error) {
            console.error('Failed to load groups', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!activity || typeof activity !== 'object') return null;

    const isOwner = user.role === 'club_owner';

    // ── Navigation ────────────────────────────────────────────────────────────
    const handleGroupPress = (group: Group) => {
        if (user.role === 'student') return;
        if (initialMode === 'technique') {
            navigation.navigate('TechniqueRequest', { group, activityName: activity.name, activityId: activity.id, activityType: activity.activityType, user });
            return;
        }
        navigation.navigate('StudentList', { group, activityName: activity.name, activityId: activity.id, activityType: activity.activityType, user, initialMode });
    };

    // ── Open modal: CREATE ────────────────────────────────────────────────────
    const handleCreateGroup = () => {
        const maxGroupsPerActivity =
            user.plan === 'club_elite' ? 30 :
            user.plan === 'club_pro'   ? 15 :
            user.plan === 'club_lite'  ? 10 : 1;

        if (groups.length >= maxGroupsPerActivity) {
            Alert.alert(t('settings.limitReached'), t('settings.upgradePromptGroup', { defaultValue: 'Upgrade your plan to add more groups.' }));
            return;
        }
        resetModal();
        setIsModalVisible(true);
    };

    // ── Open modal: EDIT ──────────────────────────────────────────────────────
    const handleEditGroup = (group: Group) => {
        openModalForGroup(group, false);
    };

    // ── Open modal: DUPLICATE ─────────────────────────────────────────────────
    const handleDuplicateGroup = (group: Group) => {
        openModalForGroup(group, true);
    };

    const openModalForGroup = (group: Group, isDuplicate: boolean) => {
        if (isDuplicate) {
            setEditingGroup(null);
            setModalName(`Copia de ${group.name}`);
        } else {
            setEditingGroup(group);
            setModalName(group.name);
        }
        setMaxStudentsInput(group.maxStudents ? group.maxStudents.toString() : '');
        setMinAgeInput(group.minAge ? group.minAge.toString() : '');
        setMaxAgeInput(group.maxAge ? group.maxAge.toString() : '');

        const rawSessions = group.sessions;
        const parsedSessions: GroupSession[] | null = (() => {
            if (!rawSessions) return null;
            if (Array.isArray(rawSessions) && rawSessions.length > 0) return rawSessions;
            if (typeof rawSessions === 'string') {
                try { const p = JSON.parse(rawSessions); return Array.isArray(p) ? p : null; }
                catch { return null; }
            }
            return null;
        })();

        if (parsedSessions && parsedSessions.length > 0) {
            setSessionInputs(parsedSessions.map(s => ({
                days: Array.isArray(s.days) ? s.days : [],
                startTime: timeStringToDate(s.startTime || '17:00'),
                endTime: timeStringToDate(s.endTime || '18:00'),
                aulaId: s.aulaId || null,
                instructorId: s.instructorId || null,
            })));
        } else {
            const parts = (group.time || '').split(' ');
            const timePart = parts[parts.length - 1] || '17:00';
            const daysPart = parts.slice(0, -1).join(' ');
            const start = timeStringToDate(timePart);
            const end = new Date(start); end.setHours(end.getHours() + 1);
            const days: number[] = [];
            daysShort.forEach((name, idx) => { if (daysPart.includes(name)) days.push(idx); });
            setSessionInputs([{ days, startTime: start, endTime: end, aulaId: null, instructorId: null }]);
        }
        setModalError(null);
        setIsModalVisible(true);
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDeleteGroup = (group: Group) => setDeleteTargetGroup(group);

    const confirmDeleteGroup = async () => {
        if (!deleteTargetGroup) return;
        const group = deleteTargetGroup;
        setDeleteTargetGroup(null);
        try {
            await ClubService.deleteGroup(user.organizationId, group.id);
            setGroups(prev => prev.filter(g => g.id !== group.id));
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || 'Failed to delete group');
        }
    };

    // ── Session helpers ───────────────────────────────────────────────────────
    const addSession = () => {
        const last = sessionInputs[sessionInputs.length - 1];
        setSessionInputs(prev => [...prev, makeDefaultSession(last)]);
    };
    const removeSession = (idx: number) => setSessionInputs(prev => prev.filter((_, i) => i !== idx));

    const toggleSessionDay = (sessionIdx: number, dayIdx: number) => {
        setSessionInputs(prev => prev.map((s, i) => {
            if (i !== sessionIdx) return s;
            const days = s.days.includes(dayIdx)
                ? s.days.filter(d => d !== dayIdx)
                : [...s.days, dayIdx];
            return { ...s, days };
        }));
    };

    const updateSessionTime = (sessionIdx: number, field: 'startTime' | 'endTime', date: Date) => {
        setSessionInputs(prev => prev.map((s, i) => i === sessionIdx ? { ...s, [field]: date } : s));
    };

    const updateSessionAula = (sessionIdx: number, aulaId: string | null) => {
        setSessionInputs(prev => prev.map((s, i) => i === sessionIdx ? { ...s, aulaId } : s));
    };

    const updateSessionInstructor = (sessionIdx: number, instructorId: string | null) => {
        setSessionInputs(prev => prev.map((s, i) => i === sessionIdx ? { ...s, instructorId } : s));
    };

    const onNativeTimeChange = (event: any, selectedDate?: Date) => {
        if (!activeTimePicker) return;
        if (Platform.OS === 'android') {
            setActiveTimePicker(null);
            if (event.type === 'dismissed') return;
        }
        if (selectedDate) updateSessionTime(activeTimePicker.idx, activeTimePicker.field, selectedDate);
    };

    // ── Save (create or update) ───────────────────────────────────────────────
    const saveGroup = async () => {
        setModalError(null);

        if (!modalName.trim()) {
            setModalError(t('settings.fillRequired', { defaultValue: 'Por favor escribe el nombre del grupo.' }));
            return;
        }
        if (sessionInputs.some(s => s.days.length === 0)) {
            setModalError(t('settings.sessionNeedsDays', { defaultValue: 'Cada sesión necesita al menos un día seleccionado.' }));
            return;
        }
        if (!user?.organizationId) {
            setModalError('No se encontró la organización. Cierra sesión e inicia de nuevo.');
            return;
        }

        setIsSaving(true);
        try {
            const sessionsData: GroupSession[] = sessionInputs.map(s => {
                const aula = aulas.find(a => a.id === s.aulaId);
                const instructor = instructors.find(i => i.id === s.instructorId);
                return {
                    days: [...(Array.isArray(s.days) ? s.days : [])].sort((a, b) => a - b),
                    startTime: dateToTimeString(s.startTime instanceof Date ? s.startTime : new Date()),
                    endTime: dateToTimeString(s.endTime instanceof Date ? s.endTime : new Date()),
                    aulaId: s.aulaId || null,
                    aulaName: aula?.name || null,
                    instructorId: s.instructorId || null,
                    instructorName: instructor?.name || null,
                };
            });

            const timeDisplay = formatSessionsDisplay(sessionsData, daysShort);
            const maxStudentsVal = maxStudentsInput.trim() !== '' ? parseInt(maxStudentsInput, 10) : null;
            const minAgeVal = minAgeInput.trim() !== '' ? parseInt(minAgeInput, 10) : null;
            const maxAgeVal = maxAgeInput.trim() !== '' ? parseInt(maxAgeInput, 10) : null;

            if (editingGroup) {
                const updated = await ClubService.updateGroup(
                    user.organizationId, editingGroup.id,
                    modalName, timeDisplay, maxStudentsVal, sessionsData, minAgeVal, maxAgeVal
                );
                if (updated) {
                    setGroups(prev => prev.map(g =>
                        g.id === updated.id ? { ...updated, studentCount: g.studentCount } : g
                    ));
                }
            } else {
                const newGroup = await ClubService.addGroup(
                    user.organizationId, activity.id,
                    modalName, timeDisplay, maxStudentsVal, sessionsData, minAgeVal, maxAgeVal
                );
                setGroups(prev => [...prev, newGroup]);
            }
            closeModal();
        } catch (error: any) {
            const msg: string = error.message || '';
            if (msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('token')) {
                setModalError('Tu sesión ha expirado. Cierra sesión e inicia sesión de nuevo para continuar.');
            } else {
                setModalError(msg || 'Ha ocurrido un error inesperado.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const resetModal = () => {
        setEditingGroup(null);
        setModalName('');
        setSessionInputs([makeDefaultSession()]);
        setMaxStudentsInput('');
        setMinAgeInput('');
        setMaxAgeInput('');
        setActiveTimePicker(null);
        setModalError(null);
    };
    const closeModal = () => { setIsModalVisible(false); resetModal(); };

    // ── Aulas management ─────────────────────────────────────────────────────
    const openAulaModal = () => {
        resetAulaForm();
        setIsAulaModalVisible(true);
    };
    const resetAulaForm = () => {
        setAulaName(''); setAulaCapacity(''); setAulaDescription('');
        setAulaColor('#3182CE'); setEditingAula(null); setAulaError(null);
    };
    const editAula = (aula: Aula) => {
        setEditingAula(aula);
        setAulaName(aula.name);
        setAulaCapacity(aula.capacity?.toString() || '');
        setAulaDescription(aula.description || '');
        setAulaColor(aula.color || '#3182CE');
        setAulaError(null);
    };
    const saveAula = async () => {
        if (!aulaName.trim()) { setAulaError('El nombre del aula es obligatorio.'); return; }
        setAulaSaving(true);
        setAulaError(null);
        try {
            const cap = aulaCapacity.trim() ? parseInt(aulaCapacity) : null;
            if (editingAula) {
                const updated = await ClubService.updateAula(user.organizationId, editingAula.id, aulaName, cap, aulaDescription, aulaColor);
                setAulas(prev => prev.map(a => a.id === updated.id ? updated : a));
            } else {
                const created = await ClubService.addAula(user.organizationId, aulaName, cap, aulaDescription, aulaColor);
                setAulas(prev => [...prev, created]);
            }
            resetAulaForm();
        } catch (e: any) {
            setAulaError(e.message || 'Error al guardar el aula.');
        } finally {
            setAulaSaving(false);
        }
    };
    const deleteAula = async (aula: Aula) => {
        try {
            await ClubService.deleteAula(user.organizationId, aula.id);
            setAulas(prev => prev.filter(a => a.id !== aula.id));
            if (editingAula?.id === aula.id) resetAulaForm();
        } catch (e: any) {
            setAulaError(e.message || 'Error al eliminar el aula.');
        }
    };

    // ── Time picker renderer ──────────────────────────────────────────────────
    const renderTimePicker = (sessionIdx: number, field: 'startTime' | 'endTime') => {
        const timeValue = sessionInputs[sessionIdx]?.[field];
        if (!timeValue) return null;
        const isActive = activeTimePicker?.idx === sessionIdx && activeTimePicker?.field === field;

        if (Platform.OS === 'web') {
            return (
                <input
                    type="time"
                    value={dateToTimeString(timeValue)}
                    onChange={(e) => {
                        const [h, m] = (e.target as HTMLInputElement).value.split(':');
                        if (h && m) {
                            const d = new Date(timeValue);
                            d.setHours(parseInt(h, 10), parseInt(m, 10));
                            updateSessionTime(sessionIdx, field, d);
                        }
                    }}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '8px',
                        border: `1px solid ${theme.colors.border}`,
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text, fontSize: '15px', outline: 'none',
                    } as any}
                />
            );
        }
        return (
            <View>
                <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => {
                        if (Platform.OS === 'ios') {
                            setActiveTimePicker(isActive ? null : { idx: sessionIdx, field });
                        } else {
                            setActiveTimePicker({ idx: sessionIdx, field });
                        }
                    }}
                >
                    <Ionicons name="time-outline" size={15} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.timeButtonText}>{dateToTimeString(timeValue)}</Text>
                </TouchableOpacity>
                {Platform.OS === 'ios' && isActive && (
                    <DateTimePicker value={timeValue} mode="time" is24Hour display="spinner" onChange={onNativeTimeChange} style={{ height: 110 }} />
                )}
            </View>
        );
    };

    // ── Aula picker renderer per session ─────────────────────────────────────
    const renderAulaPicker = (sessionIdx: number) => {
        const current = sessionInputs[sessionIdx]?.aulaId;
        if (Platform.OS === 'web') {
            return (
                <select
                    value={current || ''}
                    onChange={(e) => updateSessionAula(sessionIdx, (e.target as HTMLSelectElement).value || null)}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '8px',
                        border: `1px solid ${theme.colors.border}`,
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text, fontSize: '14px', outline: 'none',
                        cursor: 'pointer',
                    } as any}
                >
                    <option value="">Sin sala</option>
                    {aulas.map(a => (
                        <option key={a.id} value={a.id}>{a.name}{a.capacity ? ` (${a.capacity})` : ''}</option>
                    ))}
                </select>
            );
        }
        // Native fallback: simple touchable cycling
        const currentAula = aulas.find(a => a.id === current);
        return (
            <TouchableOpacity
                style={[styles.timeButton, { flex: 1, justifyContent: 'space-between' }]}
                onPress={() => {
                    const idx = aulas.findIndex(a => a.id === current);
                    const next = aulas[(idx + 1) % (aulas.length + 1)];
                    updateSessionAula(sessionIdx, next?.id || null);
                }}
            >
                <Text style={{ color: currentAula ? theme.colors.text : theme.colors.textSecondary, fontSize: 14 }}>
                    {currentAula ? currentAula.name : 'Sin sala'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
            </TouchableOpacity>
        );
    };

    // ── Instructor picker renderer per session ───────────────────────────────
    const renderInstructorPicker = (sessionIdx: number) => {
        const current = sessionInputs[sessionIdx]?.instructorId;
        if (Platform.OS === 'web') {
            return (
                <select
                    value={current || ''}
                    onChange={(e) => updateSessionInstructor(sessionIdx, (e.target as HTMLSelectElement).value || null)}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '8px',
                        border: `1px solid ${theme.colors.border}`,
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text, fontSize: '14px', outline: 'none',
                        cursor: 'pointer',
                    } as any}
                >
                    <option value="">Sin instructor asignado</option>
                    {instructors.map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                </select>
            );
        }
        const currentInstructor = instructors.find(i => i.id === current);
        return (
            <TouchableOpacity
                style={[styles.timeButton, { flex: 1, justifyContent: 'space-between' }]}
                onPress={() => {
                    const idx = instructors.findIndex(i => i.id === current);
                    const next = instructors[(idx + 1) % (instructors.length + 1)];
                    updateSessionInstructor(sessionIdx, next?.id || null);
                }}
            >
                <Text style={{ color: currentInstructor ? theme.colors.text : theme.colors.textSecondary, fontSize: 14 }}>
                    {currentInstructor ? currentInstructor.name : 'Sin instructor'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
            </TouchableOpacity>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>{activity.name}</Text>
                        <Text style={styles.headerSubtitle}>{t('instructor.myGroups')}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {isOwner && (
                        <TouchableOpacity onPress={openAulaModal} style={[styles.addButton, { marginRight: 4 }]}>
                            <Ionicons name="business-outline" size={22} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                    {(isOwner || user.role === 'instructor') && (
                        <TouchableOpacity onPress={handleCreateGroup} style={styles.addButton}>
                            <Ionicons name="add" size={28} color={theme.colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* List */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={groups}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
                            <Ionicons name="people-outline" size={54} color={theme.colors.border} />
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 15 }}>
                                {t('settings.noGroupsYet', { defaultValue: 'No hay grupos aún. ¡Crea el primero!' })}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const displayTime = item.sessions?.length
                            ? formatSessionsDisplay(item.sessions, daysShort)
                            : (item.time || '');
                        return (
                            <TouchableOpacity style={styles.card} onPress={() => handleGroupPress(item)} activeOpacity={0.85}>
                                <View style={styles.cardContent}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.groupName}>{item.name}</Text>
                                        <Text style={styles.groupTime}>{displayTime}</Text>
                                        {(item.minAge || item.maxAge) && (
                                            <View style={styles.agePill}>
                                                <Ionicons name="person-outline" size={12} color={theme.colors.textSecondary} style={{ marginRight: 3 }} />
                                                <Text style={styles.agePillText}>
                                                    {item.minAge && item.maxAge
                                                        ? `${item.minAge}–${item.maxAge} ${t('settings.yearsOld', { defaultValue: 'yr' })}`
                                                        : item.minAge
                                                        ? `≥ ${item.minAge} ${t('settings.yearsOld', { defaultValue: 'yr' })}`
                                                        : `≤ ${item.maxAge} ${t('settings.yearsOld', { defaultValue: 'yr' })}`}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.badgeRow}>
                                        <View style={styles.badge}>
                                            <Ionicons name="people" size={12} color={theme.colors.primary} style={{ marginRight: 3 }} />
                                            <Text style={styles.badgeText}>
                                                {item.studentCount}{item.maxStudents ? `/${item.maxStudents}` : ''}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                                {isOwner ? (
                                    <View style={styles.cardActions}>
                                        <TouchableOpacity
                                            onPress={() => handleDuplicateGroup(item)}
                                            style={styles.actionButton}
                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                        >
                                            <Ionicons name="copy-outline" size={19} color={theme.colors.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleEditGroup(item)}
                                            style={styles.actionButton}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                                        >
                                            <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleDeleteGroup(item)}
                                            style={styles.actionButton}
                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                                        >
                                            <Ionicons name="trash-outline" size={20} color={theme.colors.error || '#E55353'} />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {/* ── Delete confirmation Modal ── */}
            <Modal visible={deleteTargetGroup !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxWidth: 400, alignSelf: 'center', width: '100%' }]}>
                        <Ionicons name="warning" size={44} color={theme.colors.error || '#E55353'} style={{ alignSelf: 'center', marginBottom: 12 }} />
                        <Text style={[styles.modalTitle, { textAlign: 'center' }]}>
                            {t('common.confirmDelete', { defaultValue: 'Confirmar eliminación' })}
                        </Text>
                        <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
                            {t('settings.deleteGroupConfirm', {
                                name: deleteTargetGroup?.name,
                                defaultValue: `¿Eliminar el grupo "${deleteTargetGroup?.name}"? Esta acción no se puede deshacer.`
                            })}
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteTargetGroup(null)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.colors.error || '#E55353' }]} onPress={confirmDeleteGroup}>
                                <Text style={styles.saveButtonText}>{t('common.delete', { defaultValue: 'Eliminar' })}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Aulas management Modal ── */}
            <Modal visible={isAulaModalVisible} transparent animationType="slide" onRequestClose={() => setIsAulaModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxWidth: 520, alignSelf: 'center', width: '100%' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                            <Ionicons name="business" size={22} color={theme.colors.primary} style={{ marginRight: 8 }} />
                            <Text style={styles.modalTitle}>Gestionar Salas / Aulas</Text>
                        </View>

                        {/* Existing aulas */}
                        <ScrollView style={{ maxHeight: 220, marginBottom: 16 }}>
                            {aulas.length === 0 ? (
                                <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic', textAlign: 'center', padding: 16 }}>
                                    Aún no hay aulas registradas.
                                </Text>
                            ) : (
                                aulas.map(a => (
                                    <View key={a.id} style={[styles.aulaRow, editingAula?.id === a.id && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0F' }]}>
                                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: a.color || '#3182CE', marginRight: 10 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>{a.name}</Text>
                                            {a.capacity && <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Capacidad: {a.capacity}</Text>}
                                            {a.description && <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{a.description}</Text>}
                                        </View>
                                        <TouchableOpacity onPress={() => editAula(a)} style={{ padding: 6 }}>
                                            <Ionicons name="pencil" size={16} color={theme.colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => deleteAula(a)} style={{ padding: 6 }}>
                                            <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        {/* Add / Edit form */}
                        <View style={[styles.sessionCard, { backgroundColor: theme.colors.background }]}>
                            <Text style={styles.sectionHeader}>{editingAula ? 'Editar aula' : 'Nueva aula'}</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Nombre del aula (ej: Sala A)"
                                placeholderTextColor={theme.colors.textSecondary}
                                value={aulaName}
                                onChangeText={setAulaName}
                            />
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="Capacidad (opcional)"
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={aulaCapacity}
                                    onChangeText={t => setAulaCapacity(t.replace(/[^0-9]/g, ''))}
                                    keyboardType="number-pad"
                                />
                                <TextInput
                                    style={[styles.input, { flex: 2 }]}
                                    placeholder="Descripción (opcional)"
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={aulaDescription}
                                    onChangeText={setAulaDescription}
                                />
                            </View>
                            {/* Color picker — web uses native color input, native fallback with presets */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                <Text style={styles.label}>Color:</Text>
                                {Platform.OS === 'web' ? (
                                    <input
                                        type="color"
                                        value={aulaColor}
                                        onChange={(e) => setAulaColor((e.target as HTMLInputElement).value)}
                                        style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: '4px' } as any}
                                    />
                                ) : (
                                    ['#3182CE', '#38A169', '#E53E3E', '#D69E2E', '#805AD5', '#DD6B20'].map(c => (
                                        <TouchableOpacity key={c} onPress={() => setAulaColor(c)}
                                            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: aulaColor === c ? 3 : 0, borderColor: '#fff' }} />
                                    ))
                                )}
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: aulaColor, marginLeft: 4, borderWidth: 1, borderColor: theme.colors.border }} />
                            </View>

                            {aulaError && (
                                <View style={styles.errorBox}>
                                    <Ionicons name="alert-circle" size={16} color={theme.colors.error} style={{ marginRight: 6 }} />
                                    <Text style={styles.errorText}>{aulaError}</Text>
                                </View>
                            )}
                            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                                {editingAula && (
                                    <TouchableOpacity style={styles.cancelButton} onPress={resetAulaForm}>
                                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[styles.saveButton, aulaSaving && { opacity: 0.6 }]}
                                    onPress={saveAula}
                                    disabled={aulaSaving}
                                >
                                    {aulaSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>{editingAula ? 'Actualizar' : 'Añadir aula'}</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.cancelButton, { alignSelf: 'center', marginTop: 8 }]} onPress={() => setIsAulaModalVisible(false)}>
                            <Text style={[styles.cancelButtonText, { color: theme.colors.primary, fontWeight: 'bold' }]}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Edit/Create Modal ── */}
            <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={closeModal}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={styles.modalOverlay}>
                        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>
                                    {editingGroup
                                        ? t('settings.editGroup', { defaultValue: 'Editar Grupo' })
                                        : t('settings.newGroup', { defaultValue: 'Nuevo Grupo' })}
                                </Text>

                                {/* Name */}
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('settings.groupName', { defaultValue: 'Nombre del grupo' })}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={modalName}
                                    onChangeText={v => { setModalName(v); setModalError(null); }}
                                />

                                {/* ── Sessions ── */}
                                <Text style={styles.sectionHeader}>
                                    {t('settings.sessions', { defaultValue: 'Sesiones / Horario' })}
                                </Text>

                                {sessionInputs.map((session, sessionIdx) => (
                                    <View key={sessionIdx} style={styles.sessionCard}>
                                        <View style={styles.sessionHeader}>
                                            <Text style={styles.sessionLabel}>
                                                {t('settings.session', { defaultValue: 'Sesión' })} {sessionIdx + 1}
                                            </Text>
                                            {sessionInputs.length > 1 && (
                                                <TouchableOpacity onPress={() => removeSession(sessionIdx)}>
                                                    <Ionicons name="close-circle" size={22} color={theme.colors.error || '#E55353'} />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {/* Days */}
                                        <Text style={styles.label}>{t('settings.daysLabel', { defaultValue: 'Días' })}</Text>
                                        <View style={styles.daysContainer}>
                                            {daysShort.map((day, dayIdx) => {
                                                const isSelected = session.days.includes(dayIdx);
                                                return (
                                                    <TouchableOpacity
                                                        key={dayIdx}
                                                        style={[styles.dayButton, isSelected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                                                        onPress={() => { toggleSessionDay(sessionIdx, dayIdx); setModalError(null); }}
                                                    >
                                                        <Text style={[styles.dayText, { color: isSelected ? '#FFF' : theme.colors.textSecondary }]}>{day}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>

                                        {/* Start / End */}
                                        <View style={styles.timeRow}>
                                            <View style={styles.timeBlock}>
                                                <Text style={styles.label}>{t('settings.startTime', { defaultValue: 'Inicio' })}</Text>
                                                {renderTimePicker(sessionIdx, 'startTime')}
                                            </View>
                                            <View style={styles.timeArrow}>
                                                <Ionicons name="arrow-forward" size={18} color={theme.colors.textSecondary} />
                                            </View>
                                            <View style={styles.timeBlock}>
                                                <Text style={styles.label}>{t('settings.endTime', { defaultValue: 'Fin' })}</Text>
                                                {renderTimePicker(sessionIdx, 'endTime')}
                                            </View>
                                        </View>

                                        {/* Aula / Room picker */}
                                        {aulas.length > 0 && (
                                            <View style={{ marginTop: 8 }}>
                                                <Text style={styles.label}>
                                                    <Ionicons name="business-outline" size={13} color={theme.colors.textSecondary} /> Sala
                                                </Text>
                                                {renderAulaPicker(sessionIdx)}
                                            </View>
                                        )}

                                        {/* Instructor picker */}
                                        {instructors.length > 0 && (
                                            <View style={{ marginTop: 8 }}>
                                                <Text style={styles.label}>
                                                    <Ionicons name="person-outline" size={13} color={theme.colors.textSecondary} /> Instructor
                                                </Text>
                                                {renderInstructorPicker(sessionIdx)}
                                            </View>
                                        )}
                                    </View>
                                ))}

                                {/* Android time picker */}
                                {Platform.OS === 'android' && activeTimePicker && sessionInputs[activeTimePicker.idx] && (
                                    <DateTimePicker
                                        value={sessionInputs[activeTimePicker.idx][activeTimePicker.field]}
                                        mode="time" is24Hour display="default"
                                        onChange={onNativeTimeChange}
                                    />
                                )}

                                {/* Add session */}
                                <TouchableOpacity style={styles.addSessionButton} onPress={addSession}>
                                    <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                                    <Text style={styles.addSessionText}>
                                        {t('settings.addSession', { defaultValue: 'Añadir otra sesión' })}
                                    </Text>
                                </TouchableOpacity>

                                {/* ── Age range ── */}
                                <Text style={styles.sectionHeader}>{t('settings.ageRange', { defaultValue: 'Rango de edad (opcional)' })}</Text>
                                <View style={styles.ageRow}>
                                    <View style={styles.ageBlock}>
                                        <Text style={styles.label}>{t('settings.minAge', { defaultValue: 'Edad mín.' })}</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="ej: 6"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            value={minAgeInput}
                                            onChangeText={text => setMinAgeInput(text.replace(/[^0-9]/g, ''))}
                                            keyboardType="number-pad"
                                            maxLength={3}
                                        />
                                    </View>
                                    <View style={styles.ageSeparator}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 18 }}>–</Text>
                                    </View>
                                    <View style={styles.ageBlock}>
                                        <Text style={styles.label}>{t('settings.maxAge', { defaultValue: 'Edad máx.' })}</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="ej: 14"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            value={maxAgeInput}
                                            onChangeText={text => setMaxAgeInput(text.replace(/[^0-9]/g, ''))}
                                            keyboardType="number-pad"
                                            maxLength={3}
                                        />
                                    </View>
                                </View>

                                {/* ── Max students ── */}
                                <Text style={styles.label}>{t('settings.maxStudents', { defaultValue: 'Máx. alumnos (opcional)' })}</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('settings.maxStudentsPlaceholder', { defaultValue: 'ej: 20 — vacío = sin límite' })}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={maxStudentsInput}
                                    onChangeText={text => setMaxStudentsInput(text.replace(/[^0-9]/g, ''))}
                                    keyboardType="number-pad"
                                    maxLength={4}
                                />

                                {/* Inline error (replaces Alert.alert) */}
                                {modalError && (
                                    <View style={styles.errorBox}>
                                        <Ionicons name="alert-circle" size={16} color={theme.colors.error} style={{ marginRight: 6 }} />
                                        <Text style={styles.errorText}>{modalError}</Text>
                                    </View>
                                )}

                                {/* Buttons */}
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
                                        onPress={saveGroup}
                                        disabled={isSaving}
                                    >
                                        {isSaving
                                            ? <ActivityIndicator size="small" color="#FFF" />
                                            : <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                                        }
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
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
    backButton: { padding: 4, marginRight: 16 },
    addButton: { padding: 4 },
    headerTitle: { ...theme.typography.header, fontSize: 20, color: theme.colors.text },
    headerSubtitle: { color: theme.colors.textSecondary, fontSize: 14 },
    listContent: { padding: theme.spacing.m },

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
    cardContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    groupName: { color: theme.colors.text, fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
    groupTime: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
    agePill: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    agePillText: { color: theme.colors.textSecondary, fontSize: 12 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
    badge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1, borderColor: theme.colors.primary,
        borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    },
    badgeText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 12 },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 },
    actionButton: { padding: 6 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 },
    modalContent: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20 },
    modalTitle: { color: theme.colors.text, fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 8, padding: 11,
        fontSize: 15, marginBottom: 16,
    },
    label: { color: theme.colors.textSecondary, marginBottom: 8, fontWeight: '600', fontSize: 13 },
    sectionHeader: {
        color: theme.colors.text, fontSize: 15, fontWeight: 'bold',
        marginTop: 8, marginBottom: 12,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 6,
    },
    sessionCard: {
        borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 10, padding: 12, marginBottom: 12,
        backgroundColor: theme.colors.background,
    },
    sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sessionLabel: { color: theme.colors.text, fontWeight: 'bold', fontSize: 14 },
    daysContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    dayButton: {
        width: 34, height: 34, borderRadius: 17,
        borderWidth: 1, borderColor: theme.colors.border,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: theme.colors.surface,
    },
    dayText: { fontSize: 13, fontWeight: 'bold' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeBlock: { flex: 1 },
    timeArrow: { alignItems: 'center', paddingTop: 22 },
    timeButton: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1, borderColor: theme.colors.border,
        borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12,
    },
    timeButtonText: { color: theme.colors.text, fontSize: 15, fontWeight: 'bold' },
    addSessionButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, marginBottom: 8,
        borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary,
        borderRadius: 10, gap: 6,
    },
    addSessionText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 14 },
    ageRow: { flexDirection: 'row', alignItems: 'center' },
    ageBlock: { flex: 1 },
    ageSeparator: { paddingHorizontal: 8, paddingBottom: 16, alignItems: 'center' },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
    cancelButtonText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
    saveButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 10, paddingHorizontal: 20,
        borderRadius: 8, minWidth: 80, alignItems: 'center', justifyContent: 'center',
    },
    saveButtonText: { color: '#FFF', fontWeight: 'bold' },
    errorBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: (theme.colors.error || '#E53E3E') + '18',
        borderWidth: 1, borderColor: (theme.colors.error || '#E53E3E') + '44',
        borderRadius: 8, padding: 10, marginBottom: 12,
    },
    errorText: { color: theme.colors.error || '#E53E3E', fontSize: 13, flex: 1, flexWrap: 'wrap' },
    aulaRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10, paddingHorizontal: 12,
        borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border,
        backgroundColor: theme.colors.background, marginBottom: 6,
    },
});
