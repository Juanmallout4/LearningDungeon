import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { TULS_DATA } from '../../data/tuls';
import { EVALUATION_RUBRICS, CATEGORY_EVALUATION_MAX_SCORE } from '../../data/evaluationRubrics';
import { BeltDisplay } from '../../components/BeltDisplay';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackingService } from '../../services/TrackingService';

export const EvaluationScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { student, activityName, activityId, activityType } = route.params || {};
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [selectedTulId, setSelectedTulId] = useState<string | null>(null);
    // Notas por movimiento del tul que se esta evaluando: indice de movimiento -> puntuacion (1-3)
    const [scores, setScores] = useState<{ [key: number]: number }>({});
    const [comments, setComments] = useState<{ [key: number]: string }>({});
    // Para actividades con rubrica por categorias (Ingles/Ballet): clave de categoria -> puntuacion
    const [categoryScores, setCategoryScores] = useState<{ [key: string]: number }>({});
    const [categoryComments, setCategoryComments] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);
    const [instructorId, setInstructorId] = useState<string | null>(null);

    // Si la actividad tiene una rubrica por categorias definida (no es taekwondo), la usamos para pintar el formulario alternativo
    const rubric = activityType ? EVALUATION_RUBRICS[activityType] : undefined;

    React.useEffect(() => {
        if (!student || typeof student !== 'object') {
            navigation.replace('ActivityList');
            return;
        }
        // Comprobacion extra en cliente (el servidor tambien la aplica): todo activityType debe tener flujo de tuls o una rubrica conocida
        if (activityType && activityType !== 'taekwondo_itf' && !EVALUATION_RUBRICS[activityType]) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('instructor.evaluationNotAvailable', { defaultValue: 'Las evaluaciones no están disponibles para esta actividad.' }));
            navigation.goBack();
        }
    }, [student, activityType, navigation]);

    // Al montar, recuperamos el id del instructor logueado desde AsyncStorage para incluirlo al guardar la evaluacion
    React.useEffect(() => {
        const fetchInstructor = async () => {
            try {
                const userData = await AsyncStorage.getItem('@Learning Dungeon_user');
                if (userData) {
                    setInstructorId(JSON.parse(userData).id);
                }
            } catch (e) {
                console.error('Failed to load instructor ID:', e);
            }
        };
        fetchInstructor();
    }, []);

    // Selecciona el tul a evaluar y reinicia las notas/comentarios anteriores para empezar de cero
    const handleTulSelect = (tulId: string) => {
        setSelectedTulId(tulId);
        setScores({}); // Reiniciamos las notas
        setComments({}); // Reiniciamos los comentarios
    };

    // Guarda la nota elegida para un movimiento concreto del tul
    const handleScore = (moveIndex: number, score: number) => {
        setScores(prev => ({
            ...prev,
            [moveIndex]: score
        }));
    };

    // Guarda el comentario opcional que el instructor escribe para un movimiento concreto
    const handleComment = (moveIndex: number, text: string) => {
        setComments(prev => ({
            ...prev,
            [moveIndex]: text
        }));
    };

    // Envia la evaluacion del tul al backend: calcula la nota media, arma la lista de movimientos calificados y los persiste
    const submitEvaluation = async () => {
        if (!selectedTulId || isSaving) return;
        
        const selectedTulObj = TULS_DATA.find(t => t.id === selectedTulId);
        if (!selectedTulObj) return;

        setIsSaving(true);

        // Si todavia no tenemos el id del instructor en memoria, lo recuperamos de AsyncStorage y lo cacheamos
        let currentInstructorId = instructorId;
        if (!currentInstructorId) {
            try {
                const userData = await AsyncStorage.getItem('@Learning Dungeon_user');
                if (userData) {
                    currentInstructorId = JSON.parse(userData).id;
                    setInstructorId(currentInstructorId); // lo cacheamos para no repetir la lectura
                }
            } catch (e) {
                console.error("Error retrieving user from storage", e);
            }
        }

        if (!currentInstructorId) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), "No se pudo identificar al instructor. Por favor, reinicia la sesión.");
            setIsSaving(false);
            return;
        }
        try {
            // Calculamos la nota media de todos los movimientos calificados para usarla como resumen de la evaluacion
            const sumScore = Object.values(scores).reduce((a, b) => a + b, 0);
            const totalMoves = Object.values(scores).length;
            const avg = totalMoves > 0 ? (sumScore / totalMoves).toFixed(1) : 0;
            const summary = `Nota media: ${avg}`;

            // Construimos la lista de movimientos calificados (incluye el Jumbi en el indice -1) con su nota y comentario
            const movements = [];
            for (let i = -1; i < selectedTulObj.moves; i++) {
                if (scores[i] !== undefined) {
                    movements.push({
                        moveIndex: i,
                        score: scores[i],
                        comment: comments[i] || ''
                    });
                }
            }

            if (movements.length === 0) {
                 Alert.alert(t('common.error', { defaultValue: 'Error' }), t('instructor.minGrade', { defaultValue: 'Debes calificar al menos un movimiento.' }));
                 setIsSaving(false);
                 return;
            }

            await TrackingService.saveEvaluation({
                studentId: student.id,
                instructorId: currentInstructorId,
                tulId: selectedTulId,
                tulName: selectedTulObj.name,
                summaryComment: summary,
                movements,
                activityId
            });

            Alert.alert(t('instructor.evaluationSavedTitle'), t('instructor.evaluationSavedBody', { name: student.name }));
            navigation.goBack();
        } catch (error) {
            console.error('Error saving evaluation:', error);
            Alert.alert(t('common.error', { defaultValue: 'Error' }), "Hubo un problema al guardar la evaluación.");
            setIsSaving(false);
        }
    };

    // Guarda la nota elegida para una categoria de la rubrica (Ingles/Ballet)
    const handleCategoryScore = (categoryKey: string, score: number) => {
        setCategoryScores(prev => ({ ...prev, [categoryKey]: score }));
    };

    // Guarda el comentario opcional para una categoria de la rubrica
    const handleCategoryComment = (categoryKey: string, text: string) => {
        setCategoryComments(prev => ({ ...prev, [categoryKey]: text }));
    };

    // Envia la evaluacion por categorias (actividades con rubrica, no taekwondo): calcula la media y persiste las notas
    const submitCategoryEvaluation = async () => {
        if (!rubric || isSaving) return;
        setIsSaving(true);

        // Igual que en submitEvaluation: si falta el id del instructor en memoria, lo recuperamos de AsyncStorage
        let currentInstructorId = instructorId;
        if (!currentInstructorId) {
            try {
                const userData = await AsyncStorage.getItem('@Learning Dungeon_user');
                if (userData) {
                    currentInstructorId = JSON.parse(userData).id;
                    setInstructorId(currentInstructorId);
                }
            } catch (e) {
                console.error("Error retrieving user from storage", e);
            }
        }

        if (!currentInstructorId) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), "No se pudo identificar al instructor. Por favor, reinicia la sesión.");
            setIsSaving(false);
            return;
        }
        try {
            // Filtramos las categorias que realmente se calificaron y armamos el payload con nota y comentario de cada una
            const scoresPayload = rubric
                .filter(category => categoryScores[category.key] !== undefined)
                .map(category => ({
                    categoryKey: category.key,
                    score: categoryScores[category.key],
                    comment: categoryComments[category.key] || ''
                }));

            if (scoresPayload.length === 0) {
                Alert.alert(t('common.error', { defaultValue: 'Error' }), t('instructor.minGrade', { defaultValue: 'Debes calificar al menos un movimiento.' }));
                setIsSaving(false);
                return;
            }

            // Nota media de todas las categorias calificadas, usada como resumen de la evaluacion
            const sumScore = scoresPayload.reduce((a, b) => a + b.score, 0);
            const avg = (sumScore / scoresPayload.length).toFixed(1);
            const summary = `Nota media: ${avg}`;

            await TrackingService.saveCategoryEvaluation({
                studentId: student.id,
                instructorId: currentInstructorId,
                activityId,
                summaryComment: summary,
                scores: scoresPayload
            });

            Alert.alert(t('instructor.evaluationSavedTitle'), t('instructor.evaluationSavedBody', { name: student.name }));
            navigation.goBack();
        } catch (error) {
            console.error('Error saving category evaluation:', error);
            Alert.alert(t('common.error', { defaultValue: 'Error' }), "Hubo un problema al guardar la evaluación.");
            setIsSaving(false);
        }
    };

    const selectedTul = TULS_DATA.find(t => t.id === selectedTulId);

    // Solo mostramos tuls cuyo requisito de rango sea igual o inferior al cinturon actual del alumno
    const availableTuls = TULS_DATA.filter(t => t.rankRequirement <= student.rank);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>{t('instructor.evaluateStudent', { name: student.name })}</Text>
                    {activityName && <Text style={styles.headerSubtitle}>{activityName}</Text>}
                </View>
            </View>

            {activityType === 'taekwondo_itf' ? (
                !selectedTul ? (
                    <ScrollView contentContainerStyle={styles.content}>
                        <Text style={styles.sectionTitle}>{t('instructor.selectTulToEvaluate')}</Text>
                        {availableTuls.map(tul => (
                            <TouchableOpacity
                                key={tul.id}
                                style={styles.tulCard}
                                onPress={() => handleTulSelect(tul.id)}
                            >
                                <Text style={styles.tulName}>{tul.name}</Text>
                                <View pointerEvents="none">
                                    <BeltDisplay rank={tul.rankRequirement} showText={false} width={80} height={10} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                ) : (
                    <View style={{ flex: 1 }}>
                        <View style={styles.tulHeader}>
                            <TouchableOpacity onPress={() => setSelectedTulId(null)}>
                                <Text style={styles.changeTulText}>{t('instructor.changeTul')}</Text>
                            </TouchableOpacity>
                            <Text style={styles.tulTitle}>{selectedTul.name}</Text>
                            <View style={{ width: 50 }} />
                        </View>

                        <ScrollView contentContainerStyle={styles.evalContent}>
                            <Text style={styles.instruction}>{t('instructor.gradeMoves')}</Text>

                            {/* Generamos una fila por cada movimiento del tul; el indice -1 corresponde al Jumbi (postura inicial) */}
                            {Array.from({ length: selectedTul.moves + 1 }).map((_, mappedIndex) => {
                                const index = mappedIndex - 1;
                                return (
                                <View key={index} style={styles.moveRowContainer}>
                                    <View style={styles.moveRow}>
                                        <Text style={[styles.moveNum, index === -1 && { fontSize: 14 }]}>
                                            {index === -1 ? 'Jumbi' : index + 1}
                                        </Text>
                                        <View style={styles.scoreContainer}>
                                            {[1, 2, 3].map(score => (
                                                <TouchableOpacity
                                                    key={score}
                                                    style={[
                                                        styles.scoreButton,
                                                        scores[index] === score && styles.scoreButtonSelected
                                                    ]}
                                                    onPress={() => handleScore(index, score)}
                                                >
                                                    <Text style={[
                                                        styles.scoreText,
                                                        scores[index] === score && styles.scoreTextSelected
                                                    ]}>{score}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                    <TextInput
                                        style={styles.commentInput}
                                        placeholder={t('instructor.addCommentOptional', { defaultValue: 'Add comment (optional)' })}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        value={comments[index] || ''}
                                        onChangeText={(text) => handleComment(index, text)}
                                    />
                                </View>
                                );
                            })}

                            <TouchableOpacity style={styles.submitButton} onPress={submitEvaluation}>
                                <Text style={styles.submitButtonText}>{t('instructor.saveEvaluation')}</Text>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                )
            ) : rubric ? (
                <View style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.evalContent}>
                        <Text style={styles.instruction}>
                            {t('instructor.gradeCategories', { defaultValue: `Califica cada categoría del 1 al ${CATEGORY_EVALUATION_MAX_SCORE}` })}
                        </Text>

                        {rubric.map(category => (
                            <View key={category.key} style={styles.moveRowContainer}>
                                <View style={styles.moveRow}>
                                    <Text style={[styles.moveNum, { fontSize: 14, width: 130, textAlign: 'left' }]}>
                                        {category.label}
                                    </Text>
                                    <View style={styles.scoreContainer}>
                                        {Array.from({ length: CATEGORY_EVALUATION_MAX_SCORE }, (_, i) => i + 1).map(score => (
                                            <TouchableOpacity
                                                key={score}
                                                style={[
                                                    styles.scoreButton,
                                                    categoryScores[category.key] === score && styles.scoreButtonSelected
                                                ]}
                                                onPress={() => handleCategoryScore(category.key, score)}
                                            >
                                                <Text style={[
                                                    styles.scoreText,
                                                    categoryScores[category.key] === score && styles.scoreTextSelected
                                                ]}>{score}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                                <TextInput
                                    style={styles.commentInput}
                                    placeholder={t('instructor.addCommentOptional', { defaultValue: 'Add comment (optional)' })}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={categoryComments[category.key] || ''}
                                    onChangeText={(text) => handleCategoryComment(category.key, text)}
                                />
                            </View>
                        ))}

                        <TouchableOpacity style={styles.submitButton} onPress={submitCategoryEvaluation}>
                            <Text style={styles.submitButtonText}>{t('instructor.saveEvaluation')}</Text>
                        </TouchableOpacity>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            ) : null}
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
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
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
    content: {
        padding: theme.spacing.m,
    },
    sectionTitle: {
        color: theme.colors.textSecondary,
        marginBottom: 16,
        fontSize: 16,
    },
    tulCard: {
        backgroundColor: theme.colors.surface,
        padding: 16,
        borderRadius: 8,
        marginBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    tulName: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    tulHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    tulTitle: {
        color: theme.colors.primary,
        fontSize: 20,
        fontWeight: 'bold',
    },
    changeTulText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    evalContent: {
        padding: 16,
    },
    instruction: {
        color: theme.colors.textSecondary,
        marginBottom: 16,
        textAlign: 'center',
    },
    moveRowContainer: {
        marginBottom: 12,
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        padding: 8,
    },
    moveRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    commentInput: {
        color: theme.colors.text,
        fontSize: 14,
        marginTop: 8,
        padding: 8,
        backgroundColor: theme.colors.background,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    moveNum: {
        color: theme.colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        width: 50,
        textAlign: 'center',
    },
    scoreContainer: {
        flexDirection: 'row',
        flex: 1,
        justifyContent: 'space-around',
    },
    scoreButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
    },
    scoreButtonSelected: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    scoreText: {
        color: theme.colors.textSecondary,
    },
    scoreTextSelected: {
        color: '#000',
        fontWeight: 'bold',
    },
    submitButton: {
        backgroundColor: theme.colors.primary,
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    submitButtonText: {
        color: theme.colors.background,
        fontWeight: 'bold',
        fontSize: 16,
    }
});
