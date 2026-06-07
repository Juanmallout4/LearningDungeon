import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ClubService } from '../services/ClubService';
import { VocabularyTerm } from '../types';
import { useTranslation } from 'react-i18next';

// Utility for shuffling
const shuffleArray = (array: any[]) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const VocabularyGameScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};
    const activityType = route.params?.activityType || 'taekwondo_itf';

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [vocabulary, setVocabulary] = useState<VocabularyTerm[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [currentTerm, setCurrentTerm] = useState<VocabularyTerm | null>(null);
    const [options, setOptions] = useState<string[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [multiplierInfo, setMultiplierInfo] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

    useEffect(() => {
        loadVocabulary();
    }, []);

    const loadVocabulary = async () => {
        const GLOBAL_CLUB_ID = '00000000-0000-4000-a000-000000000000';
        const targetOrgId = user?.organizationId || GLOBAL_CLUB_ID;

        try {
            // Belt-level filtering only makes sense for Taekwondo's rank-based vocabulary
            const maxBelt = activityType === 'taekwondo_itf' ? (user?.rank || 0) : undefined;
            const data = await ClubService.getVocabulary(targetOrgId, maxBelt, activityType, 'text');
            setVocabulary(data);
            if (data.length >= 4) {
                generateQuestion(data);
            }
        } catch (error) {
            console.error('Failed to load vocabulary', error);
        } finally {
            setIsLoading(false);
        }
    };

    const topics = useMemo(
        () => Array.from(new Set(vocabulary.map(v => v.topic).filter((t): t is string => !!t))),
        [vocabulary]
    );
    const activePool = useMemo(
        () => selectedTopic ? vocabulary.filter(v => v.topic === selectedTopic) : vocabulary,
        [vocabulary, selectedTopic]
    );

    const handleSelectTopic = (topic: string | null) => {
        setSelectedTopic(topic);
        const pool = topic ? vocabulary.filter(v => v.topic === topic) : vocabulary;
        if (pool.length >= 4) {
            generateQuestion(pool);
        } else {
            setCurrentTerm(null);
        }
    };

    // Builds a fresh shuffled set of options (1 correct + 3 distractors) for a given term
    const buildOptions = (term: VocabularyTerm, vocabPool: VocabularyTerm[]) => {
        const otherItems = vocabPool.filter(v => v.id !== term.id);
        const shuffledOthers = shuffleArray(otherItems);
        const distractors = shuffledOthers.slice(0, 3).map(v => v.meaning);
        return shuffleArray([term.meaning, ...distractors]);
    };

    const generateQuestion = (vocabPool: VocabularyTerm[]) => {
        if (vocabPool.length < 4) return;

        // Always reset states
        setSelectedAnswer(null);
        setMultiplierInfo(null);
        setFeedback(null);

        // Pick a random correct term and build its options
        const correctIndex = Math.floor(Math.random() * vocabPool.length);
        const correctItem = vocabPool[correctIndex];

        setCurrentTerm(correctItem);
        setOptions(buildOptions(correctItem, vocabPool));
    };

    // Re-asks the SAME term with re-shuffled options, so a wrong answer can be retried until correct
    const retryQuestion = () => {
        if (!currentTerm) return;
        setSelectedAnswer(null);
        setFeedback(null);
        setOptions(buildOptions(currentTerm, activePool));
    };

    const handleSelectOption = (meaning: string) => {
        if (selectedAnswer !== null) return; // Prevent double clicks
        setSelectedAnswer(meaning);

        const isCorrect = !!currentTerm && meaning === currentTerm.meaning;
        setFeedback(isCorrect ? 'correct' : 'incorrect');

        if (isCorrect) {
            if (user?.id) {
                ClubService.addGamePoints(user.id, 1).then(res => {
                    setMultiplierInfo(t('vocabulary.pointsEarned', {
                        added: res.added,
                        streak: res.streak,
                        multiplier: res.multiplier
                    }));
                }).catch(err => console.error('Failed to add points', err));
            }
            // Correct answers move on to the next question automatically
            setTimeout(() => generateQuestion(activePool), 1000);
        }
    };

    if (isLoading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    if (activePool.length < 4 && vocabulary.length >= 4) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('vocabulary.gameTitle')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                {topics.length > 0 && (
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
                )}
                <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyText}>{t('vocabulary.notEnoughTerms')}</Text>
                </View>
            </View>
        );
    }

    if (vocabulary.length < 4) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('vocabulary.gameTitle')}</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyContainer}>
                    <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyText}>{t('vocabulary.notEnoughTerms')}</Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.refreshButtonText}>{t('vocabulary.backToPractice')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const flashColor = feedback === 'correct'
        ? `${theme.colors.success}33`
        : feedback === 'incorrect'
            ? `${theme.colors.error}33`
            : theme.colors.background;

    return (
        <View style={[styles.container, { backgroundColor: flashColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('vocabulary.gameTitle')}</Text>
                <View style={{ width: 40 }} />
            </View>

            {topics.length > 0 && (
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
            )}

            <View style={styles.gameContent}>
                {currentTerm && (
                    <View style={styles.questionCard}>
                        <Text style={styles.questionPrompt}>{t('vocabulary.guessPrompt')}</Text>
                        <Text style={styles.termText}>{currentTerm.term}</Text>
                        
                        <View style={styles.optionsContainer}>
                            {options.map((option, idx) => {
                                let bgColor = theme.colors.surface;
                                let borderColor = theme.colors.border;
                                let textColor = theme.colors.text;

                                if (selectedAnswer) {
                                    if (option === currentTerm.meaning) {
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
    termText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: theme.colors.primary,
        marginBottom: 32,
        textAlign: 'center',
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
