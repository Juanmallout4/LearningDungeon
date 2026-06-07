import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Modal, Image, Alert, ActivityIndicator, Platform, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { UserProfile } from '../types';
import { AuthService } from '../services/AuthService';
import { useTranslation } from 'react-i18next';
import { BELT_CONFIGS } from '../data/belts';
import { EVALUATION_RUBRICS, CATEGORY_EVALUATION_MAX_SCORE } from '../data/evaluationRubrics';
import { BeltDisplay } from '../components/BeltDisplay';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { TrackingService } from '../services/TrackingService';
import { ClubService } from '../services/ClubService';

export const ProfileScreen = ({ route }: any) => {
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { user } = route.params;

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [localUser, setLocalUser] = useState<UserProfile>(user);
    const [isBeltPickerVisible, setIsBeltPickerVisible] = useState(false);
    const [isUsernameModalVisible, setIsUsernameModalVisible] = useState(false);
    const [newUsername, setNewUsername] = useState(user.username || '');
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
    const [activeTab, setActiveTab] = useState<'evaluations' | 'attendance' | 'reports'>('evaluations');
    const [evalSortOrder, setEvalSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [evalFilterTul, setEvalFilterTul] = useState<string | null>(null);
    const [isTulFilterVisible, setIsTulFilterVisible] = useState(false);
    const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);

    const [evaluations, setEvaluations] = useState<any[]>([]);
    const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
    const [userPoints, setUserPoints] = useState<number>(0);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const now = new Date();
    const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
    const [reportYear, setReportYear] = useState(now.getFullYear());
    const [isLoadingReport, setIsLoadingReport] = useState(true);
    const [reportEvaluations, setReportEvaluations] = useState<any[]>([]);
    const [reportAttendanceMap, setReportAttendanceMap] = useState<Record<string, string>>({});

    React.useEffect(() => {
        const loadStats = async () => {
            try {
                const [evals, att, pts, rankRes] = await Promise.all([
                    TrackingService.getEvaluations(localUser.id),
                    TrackingService.getAttendance(localUser.id),
                    ClubService.getUserPoints(localUser.id).catch(() => ({ points: 0, streak: 0 })),
                    // Always fetch the live rank from the server — users.belt is the
                    // authoritative column and the cached profile may be stale.
                    fetch(`/api/users/${localUser.id}/rank`).catch(() => null)
                ]);
                setEvaluations(evals);
                setAttendanceMap(att);
                setUserPoints(pts.points);

                if (rankRes && rankRes.ok) {
                    const rankData = await rankRes.json();
                    if (rankData.success) {
                        setLocalUser(prev => ({
                            ...prev,
                            rank: rankData.currentRank ?? prev.rank,
                            beltName: rankData.beltText ?? prev.beltName,
                        }));
                    }
                }
            } catch (err) {
                console.error("Failed to load tracking data", err);
            } finally {
                setIsLoadingStats(false);
            }
        };
        loadStats();
    }, [localUser.id]);

    React.useEffect(() => {
        const loadMonthlyReport = async () => {
            setIsLoadingReport(true);
            try {
                const [evals, att] = await Promise.all([
                    TrackingService.getEvaluations(localUser.id, reportMonth, reportYear),
                    TrackingService.getAttendance(localUser.id, reportMonth, reportYear)
                ]);
                setReportEvaluations(evals);
                setReportAttendanceMap(att);
            } catch (err) {
                console.error("Failed to load monthly report", err);
            } finally {
                setIsLoadingReport(false);
            }
        };
        loadMonthlyReport();
    }, [localUser.id, reportMonth, reportYear]);

    const goToPrevMonth = () => {
        if (reportMonth === 1) {
            setReportMonth(12);
            setReportYear(prev => prev - 1);
        } else {
            setReportMonth(prev => prev - 1);
        }
    };

    const goToNextMonth = () => {
        if (reportMonth === 12) {
            setReportMonth(1);
            setReportYear(prev => prev + 1);
        } else {
            setReportMonth(prev => prev + 1);
        }
    };

    const MONTH_NAMES = [
        'reports.january', 'reports.february', 'reports.march', 'reports.april',
        'reports.may', 'reports.june', 'reports.july', 'reports.august',
        'reports.september', 'reports.october', 'reports.november', 'reports.december'
    ];
    const MONTH_DEFAULTS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const handleUpdateBelt = async (rank: number) => {
        const newBeltName = BELT_CONFIGS[rank]?.name || localUser.beltName;

        try {
            await AuthService.updateBelt(localUser.id, rank, newBeltName);

            const updatedUser = { ...localUser, rank, beltName: newBeltName };
            setLocalUser(updatedUser);
            setIsBeltPickerVisible(false);

            // Sync with Home screen
            navigation.navigate({
                name: 'Home',
                params: { user: updatedUser },
                merge: true,
            });

            // Update Async Storage
            import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
                AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(updatedUser));
            });

        } catch (error: any) {
            const errorMsg = error.message || t('profile.errorUpdatingBelt');
            Alert.alert(t('common.error'), errorMsg);
        }
    };

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            try {
                // Determine format
                const uri = result.assets[0].uri;
                const extension = uri.split('.').pop()?.toLowerCase() || 'jpeg';
                const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
                const base64String = `data:${mimeType};base64,${result.assets[0].base64}`;

                await AuthService.updateProfilePicture(localUser.id, base64String);

                const updatedUser = { ...localUser, profilePicture: base64String };
                setLocalUser(updatedUser);
                navigation.navigate({
                    name: 'Home',
                    params: { user: updatedUser },
                    merge: true,
                });
                
                // Update Async Storage
                import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
                    AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(updatedUser));
                });
            } catch (error: any) {
                Alert.alert(t('common.error'), error.message || t('profile.errorProfilePicture'));
            }
        }
    };

    const handleLeaveClub = () => {
        const title = t('profile.leaveClubConfirmTitle');
        const message = t('profile.leaveClubConfirmMessage');

        const executeLeave = async () => {
            if (!localUser.organizationId) return;
            try {
                await ClubService.removeStudentFromClub(localUser.organizationId, localUser.id);
                
                const updatedUser = { ...localUser };
                delete updatedUser.organizationId;
                delete updatedUser.organizationName;
                setLocalUser(updatedUser);
                
                import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
                    AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(updatedUser)); // Instantly persist to device cache
                });

                navigation.navigate({ name: 'Home', params: { user: updatedUser }, merge: true });
            } catch (err: any) {
                if (Platform.OS === 'web') {
                    window.alert(t('common.error') + ': ' + (err.message || t('common.error')));
                } else {
                    Alert.alert(t('common.error'), err.message || t('common.error'));
                }
            }
        };

        if (Platform.OS === 'web') {
            const confirmed = window.confirm(`${title}\n\n${message}`);
            if (confirmed) executeLeave();
        } else {
            Alert.alert(title, message, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('profile.leaveClub'), style: 'destructive', onPress: executeLeave }
            ]);
        }
    };

    const handleUpdateUsername = async () => {
        if (!newUsername.trim()) return;
        setIsUpdatingUsername(true);
        try {
            const result = await AuthService.updateUsername(localUser.id, newUsername);
            const updatedUser = { ...localUser, username: result };
            setLocalUser(updatedUser);
            setIsUsernameModalVisible(false);
            
            navigation.navigate({ name: 'Home', params: { user: updatedUser }, merge: true });
            
            import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
                AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(updatedUser));
            });
            Alert.alert(t('common.success'), t('profile.usernameUpdated'));
        } catch(error: any) {
            Alert.alert(t('common.error'), error.message);
        } finally {
            setIsUpdatingUsername(false);
        }
    }

    const renderEvaluation = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.evaluationCard} onPress={() => setSelectedEvaluation(item)}>
            <View style={styles.evalHeader}>
                <Text style={styles.evalTul}>{item.evaluationType === 'category' ? (item.activityName || item.activityType) : item.tul}</Text>
                <View style={styles.scoreBadge}>
                    <Text style={styles.scoreText}>{item.score}</Text>
                </View>
            </View>
            <Text style={styles.evalDate}>{item.date}</Text>
            <Text style={styles.evalComment}>{item.summaryComment || item.comment}</Text>
        </TouchableOpacity>
    );

    const calculateStreak = () => {
        let streak = 0;
        const sortedDates = Object.keys(attendanceMap).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        for (const date of sortedDates) {
            const status = attendanceMap[date];
            if (status === 'present' || status === 'late') {
                streak++;
            } else if (status === 'absent') {
                break;
            }
        }
        return streak;
    };

    const currentStreak = calculateStreak();
    // Base size 16. Grows by 4 for every streak day, max cap at 5 days (36)
    const flameSize = Math.min(16 + (currentStreak * 4), 36);

    // Color logic
    const isStreakZero = currentStreak === 0;
    const streakColor = isStreakZero ? theme.colors.textSecondary : '#FF6B00';
    const streakBorderColor = isStreakZero ? theme.colors.border : '#FF6B0030';
    const streakBgColor = isStreakZero ? theme.colors.background : theme.colors.surface;

    // Report logic based on user tier — scoped to the selected month
    const renderReportTab = () => {
        if (isLoadingStats || isLoadingReport) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            );
        }
        // Normalize each evaluation to its own scale (TUL: /3, category rubrics & technique: /5) before averaging,
        // since a student can have evaluations from different activity types mixed together.
        const totalScoreRatio = reportEvaluations.reduce((acc, ev) => acc + ((ev.score || 0) / (ev.maxScore || 3)), 0);
        const avgScorePct = reportEvaluations.length > 0 ? Math.round((totalScoreRatio / reportEvaluations.length) * 100) : null;

        const totalClasses = Object.keys(reportAttendanceMap).length;
        const presentClasses = Object.values(reportAttendanceMap).filter(status => status === 'present' || status === 'late').length;
        const attendanceRate = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) + '%' : '-';

        // Get latest comment for detailed report
        const latestEvaluation = reportEvaluations.length > 0 ? [...reportEvaluations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
        const detailedReport = latestEvaluation?.summaryComment || latestEvaluation?.comment || t('settings.none');

        const techniqueEvaluations = reportEvaluations.filter(ev => ev.evaluationType === 'technique');
        const monthLabel = t(MONTH_NAMES[reportMonth - 1], { defaultValue: MONTH_DEFAULTS[reportMonth - 1] });
        const isCurrentMonth = reportMonth === (now.getMonth() + 1) && reportYear === now.getFullYear();

        return (
            <View>
                <View style={styles.monthSelectorRow}>
                    <TouchableOpacity onPress={goToPrevMonth} style={styles.monthArrowButton}>
                        <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.monthLabel}>{monthLabel} {reportYear}</Text>
                    <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrowButton} disabled={isCurrentMonth}>
                        <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? theme.colors.border : theme.colors.primary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.evaluationCard}>
                    <Text style={styles.evalTul}>{t('reports.basicProgress')}</Text>
                    <View style={{ height: 8 }} />
                    <Text style={styles.evalDate}>{t('reports.averageScore')}: {avgScorePct !== null ? `${avgScorePct}%` : '-'}</Text>

                    {(localUser.plan === 'club_pro' || localUser.plan === 'club_elite') && (
                        <>
                            <View style={{ height: 8 }} />
                            <Text style={styles.evalDate}>{t('reports.attendanceRate')}: {attendanceRate}</Text>
                        </>
                    )}

                    {localUser.plan === 'club_elite' && (
                        <>
                            <View style={{ height: 8 }} />
                            <Text style={styles.evalComment}>{t('reports.detailed')}: {detailedReport}</Text>
                        </>
                    )}
                </View>

                {techniqueEvaluations.length > 0 && (
                    <>
                        <Text style={styles.techniqueSectionTitle}>
                            {t('reports.techniqueEvaluations', { defaultValue: 'Técnicas evaluadas este mes' })}
                        </Text>
                        {techniqueEvaluations.map(ev => (
                            <View key={ev.id} style={styles.techniqueReportCard}>
                                {ev.imageUrl ? (
                                    <Image source={{ uri: ev.imageUrl }} style={styles.techniqueReportThumb} resizeMode="cover" />
                                ) : (
                                    <View style={[styles.techniqueReportThumb, styles.techniqueReportThumbPlaceholder]}>
                                        <Ionicons name="image-outline" size={22} color={theme.colors.textSecondary} />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={styles.evalTul}>{ev.tul}</Text>
                                        <View style={styles.scoreBadge}>
                                            <Text style={styles.scoreText}>{ev.score}/{ev.maxScore}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.evalDate}>{ev.date}</Text>
                                    {!!ev.summaryComment && <Text style={styles.evalComment}>{ev.summaryComment}</Text>}
                                    {!!ev.pointsAwarded && (
                                        <View style={styles.pointsAwardedBadge}>
                                            <Ionicons name="star" size={14} color="#FFD700" />
                                            <Text style={styles.pointsAwardedText}>+{ev.pointsAwarded} {t('reports.points', { defaultValue: 'puntos' })}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))}
                    </>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings.myProfile')}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
                <View style={styles.profileCard}>
                    <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
                        {localUser.profilePicture ? (
                            <Image source={{ uri: localUser.profilePicture }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>{localUser.name ? localUser.name.charAt(0).toUpperCase() : '?'}</Text>
                        )}
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.s }}>
                        <Text style={[styles.nameText, { marginBottom: 0 }]}>{localUser.name}</Text>
                        {localUser.role === 'student' && (
                            <View style={{ marginLeft: 8 }}>
                                <Ionicons
                                    name="camera"
                                    size={20}
                                    color={localUser.mediaConsent ? theme.colors.success : theme.colors.error}
                                />
                            </View>
                        )}
                    </View>

                    {localUser.username && (
                        <TouchableOpacity onPress={() => { setNewUsername(localUser.username || ''); setIsUsernameModalVisible(true); }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.m }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>@{localUser.username}</Text>
                            <Ionicons name="pencil" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 6 }} />
                        </TouchableOpacity>
                    )}

                    <View style={styles.beltRow}>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                            <BeltDisplay rank={localUser.rank} showText={true} width={160} height={20} />
                        </View>
                        {!localUser.organizationName && (
                            <TouchableOpacity onPress={() => setIsBeltPickerVisible(true)} style={styles.editBeltButton}>
                                <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.roleContainer}>
                        {localUser.plan === 'club_elite' && localUser.organizationLogo && (
                            <Image
                                source={{ uri: localUser.organizationLogo }}
                                style={styles.clubLogoInline}
                            />
                        )}
                        <Text style={styles.roleText}>
                            {localUser.role === 'club_owner' ? t('settings.roleClubOwner') :
                                localUser.role === 'instructor' ? t('settings.roleInstructor') : t('settings.roleStudent')}
                            {localUser.organizationName ? ` • ${localUser.organizationName}` : ` • ${t('settings.none')}`}
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${theme.colors.primary}15`, padding: 12, borderRadius: 12, marginTop: 16, justifyContent: 'center' }}>
                        <Ionicons name="star" size={24} color="#FFD700" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.colors.text }}>{userPoints} PTS</Text>
                    </View>

                    {localUser.organizationName && localUser.role !== 'club_owner' && (
                        <TouchableOpacity onPress={handleLeaveClub} style={styles.leaveClubButton}>
                            <Text style={styles.leaveClubText}>{t('profile.leaveClub')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Tabs */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'evaluations' && styles.activeTab]}
                        onPress={() => setActiveTab('evaluations')}
                    >
                        <Text style={[styles.tabText, activeTab === 'evaluations' && styles.activeTabText]}>
                            {t('profile.evaluations')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'attendance' && styles.activeTab]}
                        onPress={() => setActiveTab('attendance')}
                    >
                        <Text style={[styles.tabText, activeTab === 'attendance' && styles.activeTabText]}>
                            {t('profile.attendance')}
                        </Text>
                    </TouchableOpacity>
                    {localUser.organizationName && (
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'reports' && styles.activeTab]}
                            onPress={() => setActiveTab('reports')}
                        >
                            <Text style={[styles.tabText, activeTab === 'reports' && styles.activeTabText]}>
                                {t('reports.title')}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Tab Content */}
                <View style={styles.tabContent}>
                    {activeTab === 'evaluations' ? (
                        <View>
                            <View style={styles.filterRow}>
                                <TouchableOpacity
                                    style={styles.filterButton}
                                    onPress={() => setEvalSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                                >
                                    <Ionicons name="swap-vertical" size={16} color={theme.colors.text} />
                                    <Text style={styles.filterText}>{evalSortOrder === 'newest' ? t('profile.sortNewest') : t('profile.sortOldest')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.filterButton}
                                    onPress={() => setIsTulFilterVisible(true)}
                                >
                                    <Ionicons name="filter" size={16} color={theme.colors.text} />
                                    <Text style={styles.filterText}>{evalFilterTul ? evalFilterTul : t('profile.allTuls')}</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={evaluations.filter(e => !evalFilterTul || e.tul === evalFilterTul).sort((a, b) => {
                                    const timeA = new Date(a.date.split('-').reverse().join('-')).getTime();
                                    const timeB = new Date(b.date.split('-').reverse().join('-')).getTime();
                                    return evalSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
                                })}
                                keyExtractor={item => item.id}
                                renderItem={renderEvaluation}
                                scrollEnabled={false}
                                ListEmptyComponent={
                                    <Text style={styles.emptyText}>{t('profile.noEvaluations')}</Text>
                                }
                            />
                        </View>
                    ) : activeTab === 'attendance' ? (
                        <View>
                            <AttendanceCalendar
                                data={attendanceMap as any}
                            />
                            <View style={styles.legend}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendColor, { backgroundColor: `${theme.colors.success}30` }]} />
                                    <Text style={styles.legendText}>{t('attendance.present')}</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendColor, { backgroundColor: `${theme.colors.warning}30` }]} />
                                    <Text style={styles.legendText}>{t('attendance.late')}</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendColor, { backgroundColor: `${theme.colors.error}30` }]} />
                                    <Text style={styles.legendText}>{t('attendance.absent')}</Text>
                                </View>
                            </View>

                            <View style={[styles.streakHeader, { marginTop: 16 }]}>
                                <View style={[styles.streakContainer, { borderColor: streakBorderColor, backgroundColor: streakBgColor }]}>
                                    <Text style={[styles.flameEmoji, { fontSize: flameSize, lineHeight: flameSize + 4, opacity: isStreakZero ? 0.3 : 1 }]}>🔥</Text>
                                    <View>
                                        <Text style={[styles.streakCount, { color: streakColor }]}>{currentStreak}</Text>
                                        <Text style={[styles.streakLabel, { color: isStreakZero ? theme.colors.textSecondary : streakColor }]}>{t('profile.streak')}</Text>
                                    </View>
                                </View>
                            </View>

                        </View>
                    ) : activeTab === 'reports' ? (
                        renderReportTab()
                    ) : null}
                </View>
            </ScrollView>

            {/* Belt Picker Modal for Unaffiliated Users */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isBeltPickerVisible}
                onRequestClose={() => setIsBeltPickerVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('settings.belt')}</Text>
                            <TouchableOpacity onPress={() => setIsBeltPickerVisible(false)}>
                                <Text style={styles.closeButton}>X</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={Object.keys(BELT_CONFIGS).map(Number).sort((a, b) => a - b)}
                            keyExtractor={item => item.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.modalItem}
                                    onPress={() => handleUpdateBelt(item)}
                                >
                                    <BeltDisplay
                                        rank={item}
                                        showText={true}
                                        width={150}
                                        height={20}
                                    />
                                    {localUser.rank === item && (
                                        <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                            ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
                        />
                    </View>
                </View>
            </Modal>

            {/* Username Picker Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={isUsernameModalVisible}
                onRequestClose={() => setIsUsernameModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 24 }]}>
                        <Text style={styles.modalTitle}>{t('profile.editUsername')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, marginBottom: 16, textAlign: 'center' }}>
                            {t('profile.usernameHelp')}
                        </Text>
                        
                        <TextInput
                            style={{
                                width: '100%',
                                backgroundColor: theme.colors.background,
                                color: theme.colors.text,
                                padding: 12,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                marginBottom: 20
                            }}
                            value={newUsername}
                            onChangeText={setNewUsername}
                            placeholder="@username"
                            placeholderTextColor={theme.colors.textSecondary}
                            autoCapitalize="none"
                        />

                        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }} onPress={() => setIsUsernameModalVisible(false)}>
                                <Text style={{ color: theme.colors.text }}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 8, backgroundColor: theme.colors.primary }} onPress={handleUpdateUsername} disabled={isUpdatingUsername}>
                                {isUpdatingUsername ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('common.save')}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Tul Filter Dropdown Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={isTulFilterVisible}
                onRequestClose={() => setIsTulFilterVisible(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setIsTulFilterVisible(false)}
                >
                    <View style={[styles.modalContent, { maxHeight: '50%', width: '80%', alignSelf: 'center' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('profile.filterByTul')}</Text>
                        </View>
                        <ScrollView>
                            <TouchableOpacity
                                style={styles.modalItem}
                                onPress={() => {
                                    setEvalFilterTul(null);
                                    setIsTulFilterVisible(false);
                                }}
                            >
                                <Text style={{ color: theme.colors.text, fontSize: 16 }}>{t('profile.allTuls')}</Text>
                                {!evalFilterTul && <Ionicons name="checkmark" size={24} color={theme.colors.primary} />}
                            </TouchableOpacity>
                            <View style={styles.modalSeparator} />

                            {Array.from(new Set(evaluations.filter(e => e.evaluationType !== 'category').map(e => e.tul))).map(tulName => (
                                <View key={tulName as string}>
                                    <TouchableOpacity
                                        style={styles.modalItem}
                                        onPress={() => {
                                            setEvalFilterTul(tulName as string);
                                            setIsTulFilterVisible(false);
                                        }}
                                    >
                                        <Text style={{ color: theme.colors.text, fontSize: 16 }}>{tulName}</Text>
                                        {evalFilterTul === tulName && <Ionicons name="checkmark" size={24} color={theme.colors.primary} />}
                                    </TouchableOpacity>
                                    <View style={styles.modalSeparator} />
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Evaluation Details Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={!!selectedEvaluation}
                onRequestClose={() => setSelectedEvaluation(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('profile.evaluationDetails')}</Text>
                            <TouchableOpacity onPress={() => setSelectedEvaluation(null)}>
                                <Text style={styles.closeButton}>X</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ padding: 16 }}>
                            {selectedEvaluation && (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.colors.text }}>
                                            {selectedEvaluation.evaluationType === 'category' ? (selectedEvaluation.activityName || selectedEvaluation.activityType) : selectedEvaluation.tul}
                                        </Text>
                                        <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: 'bold' }}>{selectedEvaluation.score}</Text>
                                    </View>
                                    <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>{selectedEvaluation.date}</Text>

                                    {selectedEvaluation.evaluationType === 'category'
                                        ? selectedEvaluation.categoryScores?.map((cat: any, idx: number) => {
                                            const rubric = EVALUATION_RUBRICS[selectedEvaluation.activityType] || [];
                                            const label = rubric.find(c => c.key === cat.categoryKey)?.label || cat.categoryKey;
                                            return (
                                                <View key={idx} style={{ marginBottom: 12, backgroundColor: theme.colors.background, padding: 12, borderRadius: 8 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>{label}</Text>
                                                        <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{cat.score}/{CATEGORY_EVALUATION_MAX_SCORE}</Text>
                                                    </View>
                                                    {cat.comment && (
                                                        <Text style={{ color: theme.colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>"{cat.comment}"</Text>
                                                    )}
                                                </View>
                                            );
                                        })
                                        : selectedEvaluation.movements?.map((mov: any, idx: number) => (
                                        <View key={idx} style={{ marginBottom: 12, backgroundColor: theme.colors.background, padding: 12, borderRadius: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>
                                                    {mov.moveIndex === -1 ? 'Jumbi' : `${t('profile.move')} ${mov.moveIndex + 1}`}
                                                </Text>
                                                <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{mov.score}/3</Text>
                                            </View>
                                            {mov.comment && (
                                                <Text style={{ color: theme.colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>"{mov.comment}"</Text>
                                            )}
                                        </View>
                                    ))}

                                    <View style={{ height: 20 }} />
                                    <Text style={{ color: theme.colors.text, fontWeight: 'bold' }}>{t('profile.instructorComment')}</Text>
                                    <Text style={{ color: theme.colors.textSecondary, marginTop: 4 }}>{selectedEvaluation.summaryComment || selectedEvaluation.comment || t('settings.none')}</Text>
                                    <View style={{ height: 40 }} />
                                </>
                            )}
                        </ScrollView>
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
        paddingTop: theme.spacing.s,
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
        flex: 1,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    profileCard: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.xl,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: theme.spacing.m,
        overflow: 'hidden',
    },
    avatarImage: {
        width: 80,
        height: 80,
        borderRadius: 40,
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: 'bold',
    },
    nameText: {
        ...theme.typography.header,
        color: theme.colors.text,
        marginBottom: theme.spacing.s,
    },
    streakHeader: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: theme.spacing.s,
    },
    streakContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    flameEmoji: {
        marginRight: 6,
    },
    streakCount: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 16,
    },
    streakLabel: {
        fontSize: 10,
        textTransform: 'uppercase',
        fontWeight: 'bold',
        lineHeight: 12,
    },
    beltRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: theme.spacing.m,
    },
    editBeltButton: {
        position: 'absolute',
        right: 0,
        padding: 8,
    },
    roleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    clubLogoInline: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 10,
    },
    roleText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    leaveClubButton: {
        marginTop: 12,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: `${theme.colors.error}10`,
        borderWidth: 1,
        borderColor: `${theme.colors.error}40`,
    },
    leaveClubText: {
        color: theme.colors.error,
        fontSize: 14,
        fontWeight: 'bold',
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        marginTop: theme.spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.colors.primary,
    },
    tabText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    activeTabText: {
        color: theme.colors.primary,
    },
    tabContent: {
        paddingVertical: theme.spacing.s,
        paddingHorizontal: theme.spacing.m,
    },
    evaluationCard: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    evalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    evalTul: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    scoreBadge: {
        backgroundColor: `${theme.colors.primary}20`,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 16,
    },
    scoreText: {
        color: theme.colors.primary,
        fontWeight: 'bold',
        fontSize: 16,
    },
    evalDate: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginBottom: 8,
    },
    evalComment: {
        color: theme.colors.text,
        fontSize: 14,
        fontStyle: 'italic',
    },
    emptyText: {
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginTop: 40,
        fontSize: 16,
    },
    monthSelectorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.m,
    },
    monthArrowButton: {
        padding: 8,
        backgroundColor: theme.colors.surfaceHighlight,
        borderRadius: 20,
        marginHorizontal: 16,
    },
    monthLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
        minWidth: 140,
        textAlign: 'center',
    },
    techniqueSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: theme.spacing.s,
        marginTop: theme.spacing.s,
    },
    techniqueReportCard: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    techniqueReportThumb: {
        width: 56,
        height: 56,
        borderRadius: theme.borderRadius.s,
        marginRight: theme.spacing.m,
        backgroundColor: theme.colors.surfaceHighlight,
    },
    techniqueReportThumbPlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pointsAwardedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 4,
    },
    pointsAwardedText: {
        color: theme.colors.warning,
        fontWeight: 'bold',
        fontSize: 13,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: theme.spacing.m,
        gap: 16,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendColor: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    legendText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    filterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    filterText: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: '500',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        maxHeight: '80%',
        width: '100%',
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    modalTitle: {
        color: theme.colors.primary,
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeButton: {
        color: theme.colors.text,
        fontSize: 24,
        fontWeight: 'bold',
    },
    modalItem: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalSeparator: {
        height: 1,
        backgroundColor: theme.colors.border,
    }
});
