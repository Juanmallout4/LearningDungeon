import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ClubService } from '../services/ClubService';
import { VocabularyTerm } from '../types';
import { useTranslation } from 'react-i18next';

// Aqui mezclamos un array al azar (algoritmo Fisher-Yates) sin mutar el original
const shuffleArray = (array: any[]) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// Aqui configuramos cuántos puntos suma cada respuesta correcta de este minijuego
const POINTS_PER_CORRECT = 2;

export const TechniqueGameScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};
    const activityType = route.params?.activityType || 'taekwondo_itf';

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Banco de terminos jugables (con imagen asociada) descargado del club
    const [pool, setPool] = useState<VocabularyTerm[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Pregunta actual (termino correcto + opciones mezcladas) y estado de la respuesta del usuario
    const [currentTerm, setCurrentTerm] = useState<VocabularyTerm | null>(null);
    const [options, setOptions] = useState<string[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [multiplierInfo, setMultiplierInfo] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
    // Filtro de tema actualmente activo (null = sin filtrar, se usa todo el banco)
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

    // Cargamos el banco de términos con imagen al montar la pantalla
    useEffect(() => {
        loadPool();
    }, []);

    // Trae del servicio el conjunto de términos jugables: usa el club del usuario o el club
    // global como fallback, y limita por cinturón solo cuando la actividad es Taekwondo
    const loadPool = async () => {
        const GLOBAL_CLUB_ID = '00000000-0000-4000-a000-000000000000';
        const targetOrgId = user?.organizationId || GLOBAL_CLUB_ID;

        try {
            const maxBelt = activityType === 'taekwondo_itf' ? (user?.rank || 0) : undefined;
            const data = await ClubService.getVocabulary(targetOrgId, maxBelt, activityType, 'image');
            setPool(data);
            if (data.length >= 4) {
                generateQuestion(data);
            }
        } catch (error) {
            console.error('Failed to load technique pool', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Lista de temas únicos presentes en el banco de términos, para construir los chips de filtro
    const topics = useMemo(
        () => Array.from(new Set(pool.map(v => v.topic).filter((t): t is string => !!t))),
        [pool]
    );
    // Subconjunto de términos realmente jugable: si hay un tema seleccionado filtramos por él,
    // si no, usamos el banco completo
    const activePool = useMemo(
        () => selectedTopic ? pool.filter(v => v.topic === selectedTopic) : pool,
        [pool, selectedTopic]
    );

    // Cambia el tema activo y genera una nueva pregunta sobre el subconjunto filtrado
    // (si no hay suficientes términos en ese tema, limpia la pregunta actual)
    const handleSelectTopic = (topic: string | null) => {
        setSelectedTopic(topic);
        const filtered = topic ? pool.filter(v => v.topic === topic) : pool;
        if (filtered.length >= 4) {
            generateQuestion(filtered);
        } else {
            setCurrentTerm(null);
        }
    };

    // Construye un conjunto de opciones mezclado (1 respuesta correcta + 3 distractores) para un término dado:
    // toma el resto de items del banco, los baraja, escoge 3 como distractores y mezcla todo el conjunto final
    const buildOptions = (term: VocabularyTerm, items: VocabularyTerm[]) => {
        const otherItems = items.filter(v => v.id !== term.id);
        const shuffledOthers = shuffleArray(otherItems);
        const distractors = shuffledOthers.slice(0, 3).map(v => v.term);
        return shuffleArray([term.term, ...distractors]);
    };

    // Elige al azar un término del conjunto activo como pregunta y genera sus opciones,
    // limpiando cualquier estado de respuesta/feedback de la pregunta anterior
    const generateQuestion = (items: VocabularyTerm[]) => {
        if (items.length < 4) return;

        setSelectedAnswer(null);
        setMultiplierInfo(null);
        setFeedback(null);

        const correctIndex = Math.floor(Math.random() * items.length);
        const correctItem = items[correctIndex];

        setCurrentTerm(correctItem);
        setOptions(buildOptions(correctItem, items));
    };

    // Repite la MISMA pregunta con las opciones rebarajadas, para que una respuesta fallida
    // pueda reintentarse hasta acertar (sin saltar a un término nuevo)
    const retryQuestion = () => {
        if (!currentTerm) return;
        setSelectedAnswer(null);
        setFeedback(null);
        setOptions(buildOptions(currentTerm, activePool));
    };

    // Procesa la respuesta elegida: marca el feedback (correcto/incorrecto), y si acierta,
    // suma puntos al usuario en el servicio y pasa automáticamente a la siguiente pregunta
    const handleSelectOption = (technique: string) => {
        if (selectedAnswer !== null) return; // Evita pulsaciones dobles mientras se procesa la respuesta
        setSelectedAnswer(technique);

        const isCorrect = !!currentTerm && technique === currentTerm.term;
        setFeedback(isCorrect ? 'correct' : 'incorrect');

        if (isCorrect) {
            if (user?.id) {
                ClubService.addGamePoints(user.id, POINTS_PER_CORRECT).then(res => {
                    setMultiplierInfo(t('technique.pointsEarned', {
                        added: res.added,
                        streak: res.streak,
                        multiplier: res.multiplier
                    }));
                }).catch(err => console.error('Failed to add points', err));
            }
            setTimeout(() => generateQuestion(activePool), 1000);
        }
    };

    // Mientras se descarga el banco de terminos, mostramos solo un indicador de carga
    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    // No hay terminos suficientes en todo el banco para jugar (se necesitan al menos 4): pantalla vacia con boton de volver
    if (pool.length < 4) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('technique.gameTitle')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyText}>{t('technique.notEnoughTerms')}</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.refreshButtonText}>{t('vocabulary.backToPractice')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Color de fondo que "destella" según el último resultado (verde si acierta, rojo si falla)
    const flashColor = feedback === 'correct'
        ? `${theme.colors.success}33`
        : feedback === 'incorrect'
            ? `${theme.colors.error}33`
            : theme.colors.background;

    // Selector de temas en forma de chips: solo se construye si el banco tiene temas definidos
    const topicPicker = topics.length > 0 && (
        <View style={styles.topicRow}>
            <TouchableOpacity
                onPress={() => handleSelectTopic(null)}
                style={[styles.topicChip, selectedTopic === null && styles.topicChipSelected]}
            >
                <Text style={[styles.topicChipText, selectedTopic === null && styles.topicChipTextSelected]}>
                    {t('vocabulary.allTopics', { defaultValue: 'Todos los temas' })}
                </Text>
            </TouchableOpacity>
            {topics.map(topic => (
                <TouchableOpacity
                    key={topic}
                    onPress={() => handleSelectTopic(topic)}
                    style={[styles.topicChip, selectedTopic === topic && styles.topicChipSelected]}
                >
                    <Text style={[styles.topicChipText, selectedTopic === topic && styles.topicChipTextSelected]}>
                        {topic}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    // Hay banco general suficiente, pero el tema filtrado no llega al minimo: mostramos el selector de temas + aviso
    if (activePool.length < 4) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('technique.gameTitle')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                {topicPicker}
                <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyText}>{t('technique.notEnoughTerms')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: flashColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('technique.gameTitle')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {topicPicker}

            <View style={styles.gameContent}>
                {currentTerm && (
                    <View style={styles.questionCard}>
                        <Text style={styles.questionPrompt}>{t('technique.guessPrompt')}</Text>
                        {/* La imagen solo se muestra si el termino tiene una asociada (algunos terminos pueden no tenerla) */}
                        {!!currentTerm.imageUrl && (
                            <Image source={{ uri: currentTerm.imageUrl }} style={styles.techniqueImage} resizeMode="contain" />
                        )}

                        <View style={styles.optionsContainer}>
                            {options.map((option, idx) => {
                                let bgColor = theme.colors.surface;
                                let borderColor = theme.colors.border;
                                let textColor = theme.colors.text;

                                // Tras responder, resaltamos en verde la opción correcta y en rojo
                                // la opción marcada por el usuario si fue la incorrecta
                                if (selectedAnswer) {
                                    if (option === currentTerm.term) {
                                        bgColor = `${theme.colors.success}20`;
                                        borderColor = theme.colors.success;
                                        textColor = theme.colors.success;
                                    } else if (option === selectedAnswer) {
                                        bgColor = `${theme.colors.error}20`;
                                        borderColor = theme.colors.error;
                                        textColor = theme.colors.error;
                                    }
                                }

                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[styles.optionButton, { backgroundColor: bgColor, borderColor: borderColor }]}
                                        onPress={() => handleSelectOption(option)}
                                        activeOpacity={selectedAnswer ? 1 : 0.7}
                                    >
                                        <Text style={[styles.optionText, { color: textColor }]}>{option}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {selectedAnswer && (
                            <View style={styles.feedbackContainer}>
                                {feedback === 'correct' ? (
                                    <View style={styles.feedbackRow}>
                                        <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
                                        <View>
                                            <Text style={[styles.feedbackText, { color: theme.colors.success }]}>{t('vocabulary.correct')}</Text>
                                            {multiplierInfo && <Text style={{ color: theme.colors.success, fontWeight: 'bold', marginTop: 4 }}>{multiplierInfo}</Text>}
                                        </View>
                                    </View>
                                ) : (
                                    <>
                                        <View style={styles.feedbackRow}>
                                            <Ionicons name="close-circle" size={28} color={theme.colors.error} />
                                            <Text style={[styles.feedbackText, { color: theme.colors.error }]}>{t('vocabulary.incorrect')}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.nextButton} onPress={retryQuestion}>
                                            <Text style={styles.nextButtonText}>{t('vocabulary.tryAgain')}</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        )}
                    </View>
                )}
            </View>
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
        fontSize: 20,
        color: theme.colors.text,
    },
    topicRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
    },
    topicChip: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    topicChipSelected: {
        backgroundColor: `${theme.colors.primary}20`,
        borderColor: theme.colors.primary,
    },
    topicChipText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    topicChipTextSelected: {
        color: theme.colors.primary,
    },
    gameContent: {
        flex: 1,
        padding: theme.spacing.l,
        justifyContent: 'center',
        alignItems: 'center',
    },
    questionCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.xl,
        width: '100%',
        maxWidth: 500,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    questionPrompt: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 8,
    },
    techniqueImage: {
        width: '100%',
        height: 180,
        borderRadius: theme.borderRadius.m,
        marginBottom: 24,
        backgroundColor: theme.colors.background,
    },
    optionsContainer: {
        width: '100%',
        gap: 12,
    },
    optionButton: {
        width: '100%',
        padding: 16,
        borderRadius: theme.borderRadius.m,
        borderWidth: 2,
        alignItems: 'center',
    },
    optionText: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    feedbackContainer: {
        marginTop: 32,
        alignItems: 'center',
        width: '100%',
    },
    feedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    feedbackText: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    nextButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 24,
        width: '100%',
        alignItems: 'center',
    },
    nextButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 18,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 26,
    },
    refreshButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    refreshButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
