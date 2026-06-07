import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { ProgressionBadge } from './ProgressionBadge';
import { TrackingService } from '../services/TrackingService';
import { EVALUATION_RUBRICS, CATEGORY_EVALUATION_MAX_SCORE } from '../data/evaluationRubrics';

interface ActivityPracticeDashboardProps {
    activityType: string;
    activityName: string;
    levelOrder: number | null;
    levelName: string | null;
    userId: string;
    onPlayPress: () => void;
}

interface CategoryEvaluation {
    evaluationType: string;
    activityType: string;
    date: string;
    score: number;
    summaryComment?: string;
    categoryScores?: { categoryKey: string; score: number; comment?: string }[];
}

export const ActivityPracticeDashboard: React.FC<ActivityPracticeDashboardProps> = ({
    activityType,
    activityName,
    levelOrder,
    levelName,
    userId,
    onPlayPress,
}) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [lastEvaluation, setLastEvaluation] = useState<CategoryEvaluation | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        const loadLastEvaluation = async () => {
            try {
                const evaluations = await TrackingService.getEvaluations(userId);
                const match = (evaluations || []).find((e: CategoryEvaluation) =>
                    e.evaluationType === 'category' && e.activityType === activityType);
                if (!cancelled) setLastEvaluation(match || null);
            } catch (error) {
                console.error('Failed to load evaluations for activity dashboard', error);
                if (!cancelled) setLastEvaluation(null);
            }
        };
        loadLastEvaluation();
        return () => { cancelled = true; };
    }, [userId, activityType]);

    const rubric = EVALUATION_RUBRICS[activityType] || [];

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('home.currentLevel')}</Text>
                {levelOrder !== null ? (
                    <ProgressionBadge activityType={activityType} levelOrder={levelOrder} levelName={levelName || undefined} width={200} height={32} />
                ) : (
                    <Text style={styles.emptyText}>{t('home.noLevelAssigned', { activity: activityName })}</Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('home.lastEvaluation')}</Text>
                {lastEvaluation === undefined ? (
                    <ActivityIndicator color={theme.colors.primary} />
                ) : lastEvaluation === null ? (
                    <Text style={styles.emptyText}>{t('home.noEvaluationsYet', { activity: activityName })}</Text>
                ) : (
                    <View>
                        <Text style={styles.evalDate}>{lastEvaluation.date}</Text>
                        {(lastEvaluation.categoryScores || []).map((cat, idx) => {
                            const label = rubric.find(c => c.key === cat.categoryKey)?.label || cat.categoryKey;
                            return (
                                <View key={idx} style={styles.categoryRow}>
                                    <Text style={styles.categoryLabel}>{label}</Text>
                                    <Text style={styles.categoryScore}>{cat.score}/{CATEGORY_EVALUATION_MAX_SCORE}</Text>
                                </View>
                            );
                        })}
                        {!!lastEvaluation.summaryComment && (
                            <Text style={styles.evalComment}>"{lastEvaluation.summaryComment}"</Text>
                        )}
                    </View>
                )}
            </View>

            <TouchableOpacity style={styles.playButton} onPress={onPlayPress}>
                <Ionicons name="game-controller-outline" size={22} color="#FFF" />
                <Text style={styles.playButtonText}>{t('home.playWords')}</Text>
            </TouchableOpacity>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
    },
    card: {
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: theme.spacing.m,
        alignItems: 'flex-start',
    },
    sectionTitle: {
        ...theme.typography.subheader,
        marginBottom: theme.spacing.s,
        fontSize: 16,
    },
    emptyText: {
        color: theme.colors.textSecondary,
    },
    evalDate: {
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.s,
    },
    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    categoryLabel: {
        color: theme.colors.text,
        fontWeight: '600',
    },
    categoryScore: {
        color: theme.colors.primary,
        fontWeight: 'bold',
    },
    evalComment: {
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        marginTop: theme.spacing.s,
    },
    playButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
    },
    playButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
});
