import React, { useState, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { BeltDisplay } from '../../components/BeltDisplay';
import { useTranslation } from 'react-i18next';
import { AttendanceStatus } from '../../types';

import { ClubService } from '../../services/ClubService';
import { TrackingService } from '../../services/TrackingService';

export const StudentListScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { group, activityName, activityId, activityType, initialMode, initialDate, isAuto } = route.params || {};
    // Solo en taekwondo ITF tiene sentido evaluar tuls; el resto de actividades van directas a pasar lista
    const isTaekwondoActivity = activityType === 'taekwondo_itf';
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Si llegamos aqui sin un grupo valido en los parametros, mandamos al usuario al listado de actividades
    React.useEffect(() => {
        if (!group || typeof group !== 'object') {
            navigation.replace('ActivityList');
        }
    }, [group, navigation]);

    if (!group || typeof group !== 'object') return null;

    const [searchQuery, setSearchQuery] = useState('');
    // Modo de pantalla: evaluar tuls o pasar lista de asistencia (puede venir forzado desde la navegacion)
    const [mode, setMode] = useState<'evaluate' | 'attendance'>(initialMode || 'evaluate');
    // Si no nos pasan una fecha concreta, calculamos la de hoy en formato dd-mm-aaaa para usarla por defecto
    const [attendanceDate, setAttendanceDate] = useState(initialDate || (() => {
        const today = new Date();
        const d = String(today.getDate()).padStart(2, '0');
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const y = today.getFullYear();
        return `${d}-${m}-${y}`;
    })());
    // Mapa alumno -> estado de asistencia (presente/ausente/tarde) para la fecha seleccionada
    const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceStatus | undefined>>({});

    const [students, setStudents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // Indica si la asistencia se genero automaticamente y todavia falta que el instructor la confirme
    const [isAutoUnconfirmed, setIsAutoUnconfirmed] = useState(isAuto || false);

    // Las evaluaciones de tul solo aplican a taekwondo ITF: si la actividad es otra, forzamos el modo asistencia
    React.useEffect(() => {
        if (!isTaekwondoActivity && mode === 'evaluate') {
            setMode('attendance');
        }
    }, [isTaekwondoActivity]);

    // Carga inicial: traemos los alumnos del grupo y, si estamos en modo asistencia, tambien los registros del dia
    React.useEffect(() => {
        const loadInitData = async () => {
            if (!group?.id) return;
            try {
                const studentsData = await ClubService.getGroupStudents(group.id);
                setStudents(studentsData);

                if (mode === 'attendance') {
                    const date = initialDate || attendanceDate;
                    const recordsMap = await TrackingService.getGroupAttendanceByDate(group.id, date);

                    // Completamos con 'present' a los alumnos que todavia no tienen registro para esta fecha
                    const allRecords: Record<string, AttendanceStatus> = {};
                    const studentsToSave: string[] = [];

                    studentsData.forEach(s => {
                        if (recordsMap[s.id]) {
                            allRecords[s.id] = recordsMap[s.id];
                        } else {
                            allRecords[s.id] = 'present';
                            studentsToSave.push(s.id);
                        }
                    });

                    setAttendanceRecords(allRecords);

                    // Persistimos en el backend los registros que faltaban, para que queden guardados como 'present'
                    if (studentsToSave.length > 0) {
                        await Promise.all(
                            studentsToSave.map(id =>
                                TrackingService.syncAttendance(group.id, id, date, 'present').catch(console.error)
                            )
                        );
                    }
                }
            } catch (err) {
                console.error("Failed to load list details", err);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitData();
    }, [group?.id, initialDate, mode]);

    // Aplicamos un pequeño retraso a la busqueda para no filtrar en cada pulsacion de tecla
    const debouncedSearch = useDebounce(searchQuery, 250);
    // Lista de alumnos filtrada por nombre segun lo que el instructor va escribiendo en el buscador
    const filteredStudents = useMemo(
        () => students.filter(s => s.name.toLowerCase().includes(debouncedSearch.toLowerCase())),
        [students, debouncedSearch]
    );

    // Al pulsar un alumno: en modo evaluar abrimos su pantalla de evaluacion; en modo asistencia rotamos su estado
    const handleStudentPress = async (student: any) => {
        if (mode === 'evaluate') {
            if (!isTaekwondoActivity) return;
            navigation.navigate('Evaluation', { student, activityName, activityId, activityType });
        } else if (mode === 'attendance') {
            const currentStatus = attendanceRecords[student.id] ?? 'present';

            // Ciclo de estados al tocar la tarjeta: presente -> ausente -> tarde -> presente
            let nextStatus: AttendanceStatus;
            if (currentStatus === 'present') {
                nextStatus = 'absent';
            } else if (currentStatus === 'absent') {
                nextStatus = 'late';
            } else {
                nextStatus = 'present';
            }

            // Actualizamos primero la UI de forma optimista y luego sincronizamos con el servidor
            setAttendanceRecords(prev => ({
                ...prev,
                [student.id]: nextStatus
            }));

            try {
                await TrackingService.syncAttendance(group.id, student.id, attendanceDate, nextStatus);
                setIsAutoUnconfirmed(false);
            } catch (error) {
                console.error("Failed to sync attendance", error);
                alert(t('common.error', { defaultValue: 'Error saving attendance. Check connection.' }));
            }
        }
    };

    // Confirma manualmente una asistencia que el sistema genero de forma automatica
    const handleConfirmAuto = async () => {
        try {
            await TrackingService.verifyAttendance(group.id, attendanceDate);
            setIsAutoUnconfirmed(false);
        } catch (error) {
            console.error("Failed to verify attendance", error);
            alert(t('common.error', { defaultValue: 'Error verifying attendance.' }));
        }
    };

    // Aqui cambiamos entre el modo de evaluacion de tuls y el de pasar lista
    const toggleMode = () => {
        setMode(prev => (prev === 'evaluate' ? 'attendance' : 'evaluate'));
    };

    // Calcula el color de fondo/borde de la tarjeta segun el estado de asistencia del alumno
    const getAttendanceCardStyle = (studentId: string) => {
        if (mode !== 'attendance') return {};

        const status = attendanceRecords[studentId] || 'present'; // Si no hay registro, lo pintamos como presente
        if (status === 'absent') {
            return { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error };
        } else if (status === 'late') {
            return { backgroundColor: theme.colors.warning + '15', borderColor: theme.colors.warning };
        } else {
            // Presente
            return { backgroundColor: theme.colors.success + '15', borderColor: theme.colors.success };
        }
    };

    // Devuelve el icono que representa el estado de asistencia actual del alumno
    const renderAttendanceIcon = (studentId: string) => {
        const status = attendanceRecords[studentId] || 'present';
        if (status === 'absent') {
            return <Ionicons name="close-circle" size={28} color={theme.colors.error} />;
        } else if (status === 'late') {
            return <Ionicons name="time" size={28} color={theme.colors.warning} />;
        } else {
            return <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />;
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{group?.name || t('instructor.studentListTitle')}</Text>
                        <Text style={styles.headerSubtitle}>{activityName} - {t('instructor.studentsCount', { count: filteredStudents.length })}</Text>
                    </View>
                    <View style={styles.headerActions}>
                        {/* Acceso al historial solo tiene sentido cuando estamos pasando lista */}
                        {mode === 'attendance' && (
                            <TouchableOpacity
                                onPress={() => navigation.navigate('AttendanceHistory', { group, activityName, activityId, activityType })}
                                style={styles.historyButton}
                            >
                                <Ionicons name="time-outline" size={24} color={theme.colors.primary} />
                            </TouchableOpacity>
                        )}
                        {/* El boton de cambiar de modo solo aparece para actividades de taekwondo ITF */}
                        {isTaekwondoActivity && (
                            <TouchableOpacity onPress={toggleMode} style={styles.modeToggleButton}>
                                <Ionicons
                                    name={mode === 'evaluate' ? 'clipboard-outline' : 'pencil'}
                                    size={24}
                                    color={mode === 'evaluate' ? theme.colors.primary : theme.colors.success}
                                />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Selector/visor de fecha y boton de confirmacion, solo visibles en modo asistencia */}
                {mode === 'attendance' && (
                    <View style={styles.dateDisplayContainer}>
                        <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                        <Text style={styles.dateSelectorLabel}>{t('attendance.selectDate')}:</Text>
                        <View style={styles.dateChip}>
                            <Text style={styles.dateChipText}>{attendanceDate}</Text>
                        </View>
                        {/* Si la asistencia se genero sola, ofrecemos al instructor confirmarla con un toque */}
                        {isAutoUnconfirmed && (
                            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmAuto}>
                                <Text style={styles.confirmButtonText}>{t('attendance.confirm', { defaultValue: 'Confirmar' })}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('instructor.searchPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredStudents}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.card, getAttendanceCardStyle(item.id)]}
                            onPress={() => handleStudentPress(item)}
                        >
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{item.name ? item.name.charAt(0).toUpperCase() : '?'}</Text>
                            </View>
                            <View style={styles.cardContent}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.studentName}>{item.name}</Text>
                                    {/* En modo asistencia mostramos un icono que avisa si el alumno tiene consentimiento de imagen */}
                                    {mode === 'attendance' && (
                                        <View style={{ marginLeft: 8 }}>
                                            <Ionicons
                                                name="camera"
                                                size={16}
                                                color={item.mediaConsent ? theme.colors.success : theme.colors.error}
                                            />
                                        </View>
                                    )}
                                </View>
                                <View style={{ marginTop: 4 }}>
                                    <BeltDisplay rank={item.rank} showText={true} width={120} height={12} />
                                </View>
                            </View>
                            {/* Segun el modo activo mostramos el icono de editar evaluacion o el de estado de asistencia */}
                            {mode === 'evaluate' ? (
                                <Ionicons name="create-outline" size={24} color={theme.colors.primary} />
                            ) : (
                                renderAttendanceIcon(item.id)
                            )}
                        </TouchableOpacity>
                    )}
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
        marginBottom: 12,
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
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 40,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: theme.colors.text,
        fontSize: 16,
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
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 16,
    },
    cardContent: {
        flex: 1,
    },
    studentName: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    historyButton: {
        padding: 8,
        backgroundColor: theme.colors.surfaceHighlight,
        borderRadius: 20,
        marginRight: 8,
    },
    modeToggleButton: {
        padding: 8,
        backgroundColor: theme.colors.surfaceHighlight,
        borderRadius: 20,
        marginLeft: 8,
    },
    dateDisplayContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: theme.colors.surface,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    dateSelectorLabel: {
        color: theme.colors.textSecondary,
        marginRight: 'auto',
        fontSize: 14,
        fontWeight: '500',
    },
    dateChip: {
        backgroundColor: theme.colors.surfaceHighlight,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
    },
    dateChipText: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: 'bold',
    },
    confirmButton: {
        backgroundColor: theme.colors.warning,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginLeft: 8,
    },
    confirmButtonText: {
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold',
    },
    segmentedControl: {
        flexDirection: 'row',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
    },
    segmentButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentButtonLeft: {
        borderRightWidth: 1,
        borderRightColor: theme.colors.border,
    },
    segmentButtonRight: {
    },
    segmentInactive: {
        backgroundColor: theme.colors.surface,
    },
    segmentPresentActive: {
        backgroundColor: theme.colors.success,
    },
    segmentAbsentActive: {
        backgroundColor: theme.colors.error,
    },
    footer: {
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    saveButton: {
        backgroundColor: theme.colors.primary,
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    saveButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
