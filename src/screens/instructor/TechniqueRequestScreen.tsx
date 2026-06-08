import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Image, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { BeltDisplay } from '../../components/BeltDisplay';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ClubService } from '../../services/ClubService';
import { TrackingService } from '../../services/TrackingService';
import { VocabularyTerm } from '../../types';

// Aqui configuramos las notas posibles que el instructor puede dar al calificar una tecnica (escala 1-5)
const SCORE_OPTIONS = [1, 2, 3, 4, 5];

export const TechniqueRequestScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { group, activityName, activityId, activityType, user } = route.params || {};
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Si llegamos sin un grupo valido en los parametros, redirigimos al listado de actividades
    React.useEffect(() => {
        if (!group || typeof group !== 'object') {
            navigation.replace('ActivityList');
        }
    }, [group, navigation]);

    if (!group || typeof group !== 'object') return null;

    const [instructorId, setInstructorId] = useState<string | null>(null);
    // Catalogo de tecnicas con imagen disponibles para pedir, y el filtro de tema seleccionado para acotarlo
    const [pool, setPool] = useState<VocabularyTerm[]>([]);
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

    // Una vez creada la peticion de tecnica, pasamos a la fase de calificar a cada alumno del grupo
    const [request, setRequest] = useState<{ id: string; techniqueName: string; imageUrl?: string } | null>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);
    // Mapa alumno -> calificacion ya guardada (nota, comentario y puntos extra otorgados), para pintar el estado en la lista
    const [grades, setGrades] = useState<Record<string, { score: number; comment?: string; pointsAwarded?: number }>>({});

    // Estado del modal de calificacion: alumno seleccionado y los valores en borrador antes de guardar
    const [gradingStudent, setGradingStudent] = useState<any | null>(null);
    const [draftScore, setDraftScore] = useState<number>(5);
    const [draftComment, setDraftComment] = useState('');
    const [draftPoints, setDraftPoints] = useState('');
    const [isSavingGrade, setIsSavingGrade] = useState(false);

    // Al montar, recuperamos el id del instructor logueado desde AsyncStorage para usarlo en las peticiones al backend
    React.useEffect(() => {
        const fetchInstructor = async () => {
            try {
                const userData = await AsyncStorage.getItem('@Learning Dungeon_user');
                if (userData) setInstructorId(JSON.parse(userData).id);
            } catch (e) {
                console.error('Failed to load instructor ID:', e);
            }
        };
        fetchInstructor();
    }, []);

    // Carga el catalogo de vocabulario de taekwondo ITF que tiene imagen asociada (son las tecnicas que se pueden "pedir")
    React.useEffect(() => {
        const loadPool = async () => {
            const clubId = user?.organizationId;
            if (!clubId) { setIsLoadingPool(false); return; }
            try {
                const data = await ClubService.getVocabulary(clubId, undefined, 'taekwondo_itf', 'image');
                setPool(data);
            } catch (err) {
                console.error('Failed to load technique catalog', err);
            } finally {
                setIsLoadingPool(false);
            }
        };
        loadPool();
    }, [user?.organizationId]);

    // Lista de temas unicos presentes en el catalogo, usada para generar los chips de filtro
    const topics = useMemo(
        () => Array.from(new Set(pool.map(v => v.topic).filter((tp): tp is string => !!tp))),
        [pool]
    );
    // Catalogo filtrado por el tema seleccionado (o completo si no hay filtro activo)
    const filteredPool = useMemo(
        () => selectedTopic ? pool.filter(v => v.topic === selectedTopic) : pool,
        [pool, selectedTopic]
    );

    // Crea la peticion de tecnica para el grupo con el termino elegido y, tras crearla, carga el listado de alumnos a calificar
    const handlePickTechnique = async (term: VocabularyTerm) => {
        if (!instructorId) return;
        try {
            const created = await TrackingService.requestTechnique(group.id, {
                instructorId,
                activityId,
                vocabularyId: term.id,
                techniqueName: term.term,
                imageUrl: term.imageUrl
            });
            setRequest(created);
            setIsLoadingStudents(true);
            const studentsData = await ClubService.getGroupStudents(group.id);
            setStudents(studentsData);
        } catch (err) {
            console.error('Failed to create technique request', err);
            alert(t('technique.requestError', { defaultValue: 'No se pudo crear la petición de técnica.' }));
        } finally {
            setIsLoadingStudents(false);
        }
    };

    // Abre el modal de calificacion para un alumno, precargando los valores si ya tenia una nota guardada (para poder editarla)
    const openGradingModal = (student: any) => {
        const existing = grades[student.id];
        setGradingStudent(student);
        setDraftScore(existing?.score ?? 5);
        setDraftComment(existing?.comment ?? '');
        setDraftPoints(existing?.pointsAwarded ? String(existing.pointsAwarded) : '');
    };

    // Cierra el modal de calificacion, salvo que se este guardando en ese momento (para evitar perder la operacion en curso)
    const closeGradingModal = () => {
        if (isSavingGrade) return;
        setGradingStudent(null);
    };

    // Guarda la calificacion del alumno: envia nota/comentario/puntos al backend, otorga los puntos extra como bonus de juego
    // si procede, y actualiza el mapa local de calificaciones para reflejar el cambio en la lista
    const saveGrade = async () => {
        if (!gradingStudent || !request || !instructorId || isSavingGrade) return;
        setIsSavingGrade(true);
        try {
            // Solo consideramos validos los puntos extra si son un numero positivo; cualquier otro valor se trata como cero
            const pointsAwarded = parseInt(draftPoints, 10);
            const validPoints = !isNaN(pointsAwarded) && pointsAwarded > 0 ? pointsAwarded : 0;

            await TrackingService.submitTechniqueEvaluation(request.id, {
                studentId: gradingStudent.id,
                instructorId,
                score: draftScore,
                comment: draftComment.trim() || undefined,
                pointsAwarded: validPoints
            });

            // Si se otorgaron puntos extra, los sumamos tambien al progreso de gamificacion del alumno (no bloqueante si falla)
            if (validPoints > 0) {
                await ClubService.addGamePoints(gradingStudent.id, validPoints).catch(err =>
                    console.error('Failed to award bonus points', err)
                );
            }

            setGrades(prev => ({
                ...prev,
                [gradingStudent.id]: { score: draftScore, comment: draftComment.trim() || undefined, pointsAwarded: validPoints }
            }));
            setGradingStudent(null);
        } catch (err) {
            console.error('Failed to save technique evaluation', err);
            alert(t('technique.gradeError', { defaultValue: 'No se pudo guardar la calificación.' }));
        } finally {
            setIsSavingGrade(false);
        }
    };

    // Fase 1: cuadricula para elegir que tecnica pedir al grupo, con chips de filtro por tema (solo si hay mas de uno)
    const renderPicker = () => (
        <>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{t('technique.pickTitle', { defaultValue: 'Pedir Técnica' })}</Text>
                        <Text style={styles.headerSubtitle}>{group?.name} · {activityName}</Text>
                    </View>
                </View>
                {/* Chips de filtro por tema; solo se muestran si el catalogo tiene mas de un tema distinto */}
                {topics.length > 1 && (
                    <View style={styles.topicRow}>
                        <TouchableOpacity
                            style={[styles.topicChip, !selectedTopic && styles.topicChipActive]}
                            onPress={() => setSelectedTopic(null)}
                        >
                            <Text style={[styles.topicChipText, !selectedTopic && styles.topicChipTextActive]}>
                                {t('technique.allTopics', { defaultValue: 'Todas' })}
                            </Text>
                        </TouchableOpacity>
                        {topics.map(topic => (
                            <TouchableOpacity
                                key={topic}
                                style={[styles.topicChip, selectedTopic === topic && styles.topicChipActive]}
                                onPress={() => setSelectedTopic(topic)}
                            >
                                <Text style={[styles.topicChipText, selectedTopic === topic && styles.topicChipTextActive]}>{topic}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {isLoadingPool ? (
                <View style={styles.centerFill}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : filteredPool.length === 0 ? (
                <View style={styles.centerFill}>
                    <Ionicons name="image-outline" size={48} color={theme.colors.textSecondary} />
                    <Text style={styles.emptyText}>
                        {t('technique.emptyPool', { defaultValue: 'Todavía no hay técnicas con imagen registradas. Añádelas desde Gestión de Vocabulario.' })}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredPool}
                    key="picker-grid"
                    keyExtractor={item => item.id}
                    numColumns={2}
                    contentContainerStyle={styles.gridContent}
                    columnWrapperStyle={styles.gridRow}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.techniqueCard} onPress={() => handlePickTechnique(item)}>
                            {item.imageUrl ? (
                                <Image source={{ uri: item.imageUrl }} style={styles.techniqueImage} resizeMode="cover" />
                            ) : (
                                <View style={[styles.techniqueImage, styles.techniqueImagePlaceholder]}>
                                    <Ionicons name="image-outline" size={28} color={theme.colors.textSecondary} />
                                </View>
                            )}
                            <Text style={styles.techniqueName} numberOfLines={1}>{item.term}</Text>
                            {item.topic && <Text style={styles.techniqueTopic} numberOfLines={1}>{item.topic}</Text>}
                        </TouchableOpacity>
                    )}
                />
            )}
        </>
    );

    const renderRoster = () => (
        <>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => setRequest(null)} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>{request?.techniqueName}</Text>
                        <Text style={styles.headerSubtitle}>
                            {group?.name} · {t('technique.gradeRoster', { defaultValue: 'Califica a cada alumno' })}
                        </Text>
                    </View>
                    {request?.imageUrl && (
                        <Image source={{ uri: request.imageUrl }} style={styles.requestThumb} resizeMode="cover" />
                    )}
                </View>
            </View>

            {isLoadingStudents ? (
                <View style={styles.centerFill}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={students}
                    key="roster-list"
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => {
                        const grade = grades[item.id];
                        return (
                            <TouchableOpacity style={styles.card} onPress={() => openGradingModal(item)}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>{item.name ? item.name.charAt(0).toUpperCase() : '?'}</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    <Text style={styles.studentName}>{item.name}</Text>
                                    <View style={{ marginTop: 4 }}>
                                        <BeltDisplay rank={item.rank} showText={true} width={120} height={12} />
                                    </View>
                                </View>
                                {grade ? (
                                    <View style={styles.gradedBadge}>
                                        <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                                        <Text style={styles.gradedBadgeText}>{grade.score}/5</Text>
                                        {!!grade.pointsAwarded && (
                                            <Text style={styles.gradedPointsText}>+{grade.pointsAwarded}</Text>
                                        )}
                                    </View>
                                ) : (
                                    <View style={styles.ungradedBadge}>
                                        <Text style={styles.ungradedBadgeText}>
                                            {t('technique.ungraded', { defaultValue: 'Sin calificar' })}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </>
    );

    return (
        <View style={styles.container}>
            {request ? renderRoster() : renderPicker()}

            <Modal visible={gradingStudent !== null} transparent animationType="fade" onRequestClose={closeGradingModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {t('technique.gradeStudent', { name: gradingStudent?.name, defaultValue: `Calificar a ${gradingStudent?.name}` })}
                        </Text>
                        <Text style={styles.modalDesc}>{request?.techniqueName}</Text>

                        <Text style={styles.fieldLabel}>{t('technique.score', { defaultValue: 'Nota' })}</Text>
                        <View style={styles.scoreRow}>
                            {SCORE_OPTIONS.map(score => (
                                <TouchableOpacity
                                    key={score}
                                    style={[styles.scoreOption, draftScore === score && styles.scoreOptionActive]}
                                    onPress={() => setDraftScore(score)}
                                >
                                    <Text style={[styles.scoreOptionText, draftScore === score && styles.scoreOptionTextActive]}>{score}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.fieldLabel}>{t('technique.comment', { defaultValue: 'Comentario (opcional)' })}</Text>
                        <TextInput
                            style={styles.commentInput}
                            placeholder={t('technique.commentPlaceholder', { defaultValue: 'Observaciones para el alumno...' })}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={draftComment}
                            onChangeText={setDraftComment}
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={styles.fieldLabel}>{t('technique.bonusPoints', { defaultValue: 'Puntos extra (opcional)' })}</Text>
                        <TextInput
                            style={styles.pointsInput}
                            placeholder="0"
                            placeholderTextColor={theme.colors.textSecondary}
                            value={draftPoints}
                            onChangeText={text => setDraftPoints(text.replace(/[^0-9]/g, ''))}
                            keyboardType="numeric"
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={closeGradingModal} disabled={isSavingGrade}>
                                <Text style={styles.modalCancelText}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={saveGrade} disabled={isSavingGrade}>
                                {isSavingGrade ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.modalConfirmText}>{t('common.save', { defaultValue: 'Guardar' })}</Text>
                                )}
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
        marginTop: 2,
    },
    requestThumb: {
        width: 44,
        height: 44,
        borderRadius: 8,
        marginLeft: 12,
    },
    centerFill: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.l,
    },
    emptyText: {
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 12,
        fontSize: 14,
    },
    topicRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    topicChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
    },
    topicChipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    topicChipText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '500',
    },
    topicChipTextActive: {
        color: '#FFF',
    },
    gridContent: {
        padding: theme.spacing.m,
    },
    gridRow: {
        gap: theme.spacing.m,
    },
    techniqueCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.s,
        marginBottom: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
    },
    techniqueImage: {
        width: '100%',
        height: 110,
        borderRadius: theme.borderRadius.s,
        marginBottom: 8,
        backgroundColor: theme.colors.surfaceHighlight,
    },
    techniqueImagePlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    techniqueName: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    techniqueTopic: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 2,
        textAlign: 'center',
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
    gradedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.success + '15',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 4,
    },
    gradedBadgeText: {
        color: theme.colors.success,
        fontWeight: 'bold',
        fontSize: 13,
    },
    gradedPointsText: {
        color: theme.colors.warning,
        fontWeight: 'bold',
        fontSize: 12,
        marginLeft: 2,
    },
    ungradedBadge: {
        backgroundColor: theme.colors.surfaceHighlight,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    ungradedBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        width: '100%',
        maxWidth: 420,
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 4,
    },
    modalDesc: {
        color: theme.colors.textSecondary,
        marginBottom: 16,
        fontSize: 14,
    },
    fieldLabel: {
        color: theme.colors.text,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        marginTop: 8,
    },
    scoreRow: {
        flexDirection: 'row',
        gap: 8,
    },
    scoreOption: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
    },
    scoreOptionActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    scoreOptionText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 16,
    },
    scoreOptionTextActive: {
        color: '#FFF',
    },
    commentInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        padding: 12,
        color: theme.colors.text,
        fontSize: 14,
        minHeight: 70,
        textAlignVertical: 'top',
        backgroundColor: theme.colors.background,
    },
    pointsInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        padding: 12,
        color: theme.colors.text,
        fontSize: 14,
        backgroundColor: theme.colors.background,
        width: 100,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
        marginTop: 20,
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modalCancelText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 15,
    },
    modalConfirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
    },
    modalConfirmText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
});
