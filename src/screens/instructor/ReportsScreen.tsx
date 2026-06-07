import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Alert,
    TouchableOpacity, ActionSheetIOS, Platform, Modal
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { UserProfile } from '../../types';
import { ClubService } from '../../services/ClubService';
import { Activity } from '../../types';
import { ExportService } from '../../services/ExportService';
import { TrackingService } from '../../services/TrackingService';

type RootStackParamList = { Reports: { user: UserProfile } };
type ReportsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reports'>;
type ReportsScreenRouteProp = RouteProp<RootStackParamList, 'Reports'>;

// ── helpers ──────────────────────────────────────────────────────────────────

const toISO = (d: Date) => d.toISOString().split('T')[0];

const getPeriodDates = (mode: 'monthly' | 'biweekly', start: Date) => {
    const todayISO = toISO(new Date());
    if (mode === 'monthly') {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        const to = toISO(end) > todayISO ? todayISO : toISO(end);
        return {
            from: toISO(start),
            to,
            month: start.getMonth() + 1,
            label: start.toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
        };
    }
    const end = new Date(start.getTime() + 13 * 86400000);
    const to = toISO(end) > todayISO ? todayISO : toISO(end);
    return {
        from: toISO(start),
        to,
        month: start.getMonth() + 1,
        label: `${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    };
};

// ── small chart components ────────────────────────────────────────────────────

const DonutChart: React.FC<{ value: number; size?: number; strokeColor: string; trackColor: string }> = ({
    value, size = 88, strokeColor, trackColor,
}) => {
    const r = (size - 12) / 2;
    const circ = 2 * Math.PI * r;
    const dashOffset = circ - (Math.min(value, 100) / 100) * circ;
    const cx = size / 2, cy = size / 2;
    return (
        <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={10} fill="none" />
            <Circle
                cx={cx} cy={cy} r={r} stroke={strokeColor} strokeWidth={10} fill="none"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
            />
        </Svg>
    );
};

const HBar: React.FC<{ label: string; value: number; maxValue: number; color: string; suffix?: string; subtitle?: string; theme: any }> = ({
    label, value, maxValue, color, suffix = '', subtitle, theme,
}) => {
    const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
    return (
        <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>{label}</Text>
                <Text style={{ color: color, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>{value}{suffix}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: theme.colors.border, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ height: 8, width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
            </View>
            {subtitle ? <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 3 }}>{subtitle}</Text> : null}
        </View>
    );
};

// ── KPI card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{ icon: string; value: string; label: string; color: string; theme: any; small?: boolean }> = ({
    icon, value, label, color, theme, small,
}) => (
    <View style={[
        kpiCardStyle.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        small && kpiCardStyle.cardSmall,
    ]}>
        <MaterialCommunityIcons name={icon as any} size={small ? 24 : 30} color={color} />
        <Text style={[kpiCardStyle.value, { color: theme.colors.text, fontSize: small ? 20 : 24 }]}>{value}</Text>
        <Text style={[kpiCardStyle.label, { color: theme.colors.textSecondary, fontSize: small ? 11 : 12 }]} numberOfLines={2}>{label}</Text>
    </View>
);

const kpiCardStyle = StyleSheet.create({
    card: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', marginHorizontal: 4 },
    cardSmall: { padding: 10, marginHorizontal: 3 },
    value: { fontWeight: 'bold', marginTop: 6 },
    label: { marginTop: 3, textAlign: 'center' },
});

// ── section header ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: string; title: string; theme: any; color?: string }> = ({ icon, title, theme, color }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color || theme.colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </View>
);

// ── main screen ───────────────────────────────────────────────────────────────

export const ReportsScreen: React.FC<any> = ({ navigation, route }) => {
    const { user } = route.params;
    const { t } = useTranslation();
    const { theme } = useTheme();

    const rawPlan = user.plan || 'free';
    const plan = (rawPlan === 'free' && user.role === 'instructor' && user.organizationName) ? 'club_pro' : rawPlan;

    const isElite = plan === 'club_elite';
    const isPro = plan === 'club_pro' || isElite;
    const isLite = plan === 'club_lite';
    const hasPlan = isPro || isLite;

    // period state
    const [periodMode, setPeriodMode] = useState<'monthly' | 'biweekly'>('monthly');
    const [periodStart, setPeriodStart] = useState<Date>(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });

    const period = getPeriodDates(periodMode, periodStart);

    const navigatePeriod = (dir: number) => {
        if (periodMode === 'monthly') {
            setPeriodStart(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
        } else {
            setPeriodStart(prev => new Date(prev.getTime() + dir * 14 * 86400000));
        }
    };

    // data state
    const [activities, setActivities] = useState<Activity[]>([]);
    const [evaluations, setEvaluations] = useState<any[]>([]);
    const [attendance, setAttendance] = useState<any[]>([]);
    const [overview, setOverview] = useState<any>(null);
    const [rosterChanges, setRosterChanges] = useState<any>(null);
    const [monthlyChurn, setMonthlyChurn] = useState<any>(null);
    const [gamification, setGamification] = useState<any>(null);
    const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);

    // segment filter
    const [segmentMode, setSegmentMode] = useState<'general' | 'activity' | 'instructor'>('general');
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

    const segmentActivityId = segmentMode === 'activity' ? selectedSegmentId ?? undefined : undefined;
    const segmentInstructorId = segmentMode === 'instructor' ? selectedSegmentId ?? undefined : undefined;

    const loadData = useCallback(async () => {
        if (!hasPlan || !user.organizationId) return;
        setIsLoading(true);
        try {
            const promises: Promise<any>[] = [
                ClubService.getActivities(user.organizationId),
                TrackingService.getClubEvaluations(user.organizationId, period.month, period.from, period.to, segmentActivityId, segmentInstructorId),
                TrackingService.getClubAttendance(user.organizationId, period.month, period.from, period.to, segmentActivityId, segmentInstructorId),
            ];
            if (isElite) {
                promises.push(TrackingService.getClubStudentsOverview(user.organizationId, segmentActivityId, segmentInstructorId));
                promises.push(TrackingService.getClubRosterChanges(user.organizationId, period.from, period.to, segmentActivityId, segmentInstructorId));
                promises.push(TrackingService.getClubGamificationStats(user.organizationId));
                promises.push(ClubService.getInstructors(user.organizationId));
                promises.push(TrackingService.getClubMonthlyChurn(user.organizationId, segmentActivityId, segmentInstructorId));
            }
            const results = await Promise.all(promises);
            setActivities(results[0]);
            setEvaluations(results[1]);
            setAttendance(results[2]);
            if (isElite) {
                setOverview(results[3]);
                setRosterChanges(results[4]);
                setGamification(results[5]);
                setInstructors(results[6] || []);
                setMonthlyChurn(results[7]);
            }
        } catch (e) {
            console.error('Error loading report data', e);
        } finally {
            setIsLoading(false);
        }
    }, [user.organizationId, period.from, period.to, isElite, segmentActivityId, segmentInstructorId]);

    useEffect(() => {
        if (plan === 'free') {
            Alert.alert(t('reports.title'), t('reports.upgradeToView'), [
                { text: t('common.oops'), onPress: () => navigation.goBack() },
            ]);
        }
    }, [plan]);

    useEffect(() => { loadData(); }, [loadData]);

    if (plan === 'free') return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

    // ── computed ─────────────────────────────────────────────────────────────

    const seenIds = new Set<string>();
    const uniqueStudents: { id: string; name: string }[] = [];
    for (const e of evaluations) {
        if (e.studentId && !seenIds.has(e.studentId)) { seenIds.add(e.studentId); uniqueStudents.push({ id: e.studentId, name: e.studentName }); }
    }
    for (const a of attendance) {
        if (a.studentId && !seenIds.has(a.studentId)) { seenIds.add(a.studentId); uniqueStudents.push({ id: a.studentId, name: a.studentName }); }
    }

    // Normalize each evaluation to its own scale (TUL: /3, category rubrics: /5) before averaging,
    // since the merged list can contain evaluations from different activity types.
    const avgScorePct = evaluations.length > 0
        ? (evaluations.reduce((acc, ev) => acc + ((ev.score || 0) / (ev.maxScore || 3)), 0) / evaluations.length) * 100
        : 0;

    let totalPresent = 0, totalSessions = 0;
    attendance.forEach(r => { totalPresent += r.present; totalSessions += r.total; });
    const avgAttendance = totalSessions === 0 ? 0 : (totalPresent / totalSessions) * 100;

    // ── retention KPIs (Elite) ────────────────────────────────────────────────
    const retentionKpis = (() => {
        if (!rosterChanges || !overview) return null;
        const nuevosSocios = new Set((rosterChanges.enrolled || []).map((s: any) => s.studentId)).size;
        const bajasCount   = new Set((rosterChanges.unenrolled || []).map((s: any) => s.studentId)).size;
        const sociosFinal  = overview.totalStudents || 0;
        const sociosInicio = Math.max(sociosFinal - nuevosSocios + bajasCount, 1);
        const tasaRetencion = Math.min(((sociosFinal - nuevosSocios) / sociosInicio) * 100, 100);
        const tasaAbandono  = (bajasCount / sociosInicio) * 100;

        // Duración media de alta — basada en el churn mensual real de los últimos N meses con datos:
        //   retención anual = Π(1 - churn_i)
        //   churn mensual equivalente = 1 - raíz_N(retención anual)
        //   vida útil estimada (meses) = 1 / churn mensual equivalente
        let duracionMedia: number | null = null;
        const months = monthlyChurn?.months || [];
        if (months.length > 0) {
            const churnRates = months.map((m: any) => m.sociosInicio > 0 ? m.bajas / m.sociosInicio : 0);
            const n = churnRates.length;
            const annualRetention = churnRates.reduce((acc: number, c: number) => acc * (1 - c), 1);
            const monthlyEquivChurn = 1 - Math.pow(Math.max(annualRetention, 0), 1 / n);
            duracionMedia = monthlyEquivChurn > 0 ? 1 / monthlyEquivChurn : null;
        }

        return { tasaRetencion, tasaAbandono, duracionMedia };
    })();

    const buildFullReportData = () => {
        const clubName = user.organizationName || 'Mi Club';

        let segmentLabel: string | undefined;
        if (segmentMode === 'activity' && selectedSegmentId) {
            segmentLabel = activities.find(a => a.id === selectedSegmentId)?.name;
        } else if (segmentMode === 'instructor' && selectedSegmentId) {
            const inst = instructors.find(i => i.id === selectedSegmentId);
            segmentLabel = inst ? inst.name : undefined;
        }

        const students = uniqueStudents.map(({ id, name }) => {
            const evs = evaluations.filter(e => e.studentId === id);
            const scPct = evs.length > 0
                ? (evs.reduce((a: number, e: any) => a + ((e.score || 0) / (e.maxScore || 3)), 0) / evs.length) * 100
                : 0;
            const att = attendance.find((a: any) => a.studentId === id);
            const attRate = att ? (att.present / att.total) * 100 : 0;
            const actNames = Array.from(new Set(evs.map(e => e.activityId).filter(Boolean)))
                .map(actId => activities.find(a => a.id === actId)?.name)
                .filter((n): n is string => !!n);
            return { studentName: name, activityName: actNames.join(', '), score: scPct, attendanceRate: attRate };
        });

        const retentionData = retentionKpis && rosterChanges ? {
            nuevosSocios: new Set((rosterChanges.enrolled || []).map((s: any) => s.studentId)).size,
            bajas: new Set((rosterChanges.unenrolled || []).map((s: any) => s.studentId)).size,
            tasaRetencion: retentionKpis.tasaRetencion,
            tasaAbandono: retentionKpis.tasaAbandono,
            duracionMedia: retentionKpis.duracionMedia,
        } : undefined;

        const gamData = gamification ? {
            avgLevel: gamification.avgLevel,
            totalItemsCollected: gamification.totalItemsCollected,
            classDist: gamification.classDist || {},
            levelBuckets: gamification.levelBuckets || {},
            topStudents: (gamification.topStudents || []).map((s: any) => ({
                studentName: s.studentName,
                level: s.level,
                rpgClass: s.rpgClass,
            })),
        } : undefined;

        return {
            clubName,
            periodLabel: period.label,
            segment: segmentLabel,
            notaMedia: avgScorePct,
            tasaAsistencia: avgAttendance,
            totalStudents: overview?.totalStudents || 0,
            avgStudentsPerGroup: overview?.avgStudentsPerGroup || 0,
            overallCapacityPct: overview?.overallCapacityPct || 0,
            activities: (overview?.activities || []).map((a: any) => ({
                name: a.name,
                groupCount: a.groupCount,
                studentCount: a.studentCount,
                totalCapacity: a.totalCapacity,
                capacityPct: a.capacityPct,
            })),
            students,
            retention: retentionData,
            gamification: gamData,
        };
    };

    const triggerExport = async (format: 'pdf' | 'csv') => {
        const data = buildFullReportData();
        if (format === 'pdf') await ExportService.exportToPDF(data);
        else await ExportService.exportToCSV(data);
    };

    const handleExport = () => {
        if (Platform.OS === 'web') { setShowExportModal(true); return; }
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options: ['Cancel', t('reports.exportPdf'), t('reports.exportCsv')], cancelButtonIndex: 0 },
                (i) => { if (i === 1) triggerExport('pdf'); if (i === 2) triggerExport('csv'); }
            );
        } else {
            Alert.alert(t('reports.export'), t('reports.exportFormat'), [
                { text: 'PDF', onPress: () => triggerExport('pdf') },
                { text: 'CSV', onPress: () => triggerExport('csv') },
                { text: t('reports.cancel'), style: 'cancel' },
            ]);
        }
    };

    const handleStudentPress = (name: string) => {
        const ev = evaluations.find(e => e.studentName === name) || attendance.find(a => a.studentName === name);
        if (!ev) return;
        navigation.navigate('Profile', {
            user: { id: ev.studentId, name: ev.studentName, email: ev.studentEmail || '', rank: ev.rank || 0, beltName: ev.beltName || 'Blanco', role: 'student', plan: 'free', organizationId: user.organizationId, organizationName: user.organizationName },
        });
    };

    const navigateToStudent = (studentId: string, studentName: string, email?: string) => {
        if (!studentId) return;
        navigation.navigate('Profile', {
            user: { id: studentId, name: studentName, email: email || '', rank: 0, beltName: 'Blanco', role: 'student', plan: 'free', organizationId: user.organizationId, organizationName: user.organizationName },
        });
    };

    // ── render ────────────────────────────────────────────────────────────────

    const totalEnrolledStudents = overview?.activities?.reduce((s: number, a: any) => s + a.studentCount, 0) || 1;

    const gamTopStudents: any[] = gamification?.topStudents || [];
    const levelBuckets: Record<string, number> = gamification?.levelBuckets || {};
    const maxBucket = Object.values(levelBuckets).reduce((m, v) => Math.max(m as number, v as number), 1) as number;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                        </TouchableOpacity>
                        <View>
                            <Text style={[styles.title, { color: theme.colors.text }]}>{t('reports.title')}</Text>
                            <Text style={[styles.planBadge, { color: theme.colors.textSecondary }]}>
                                {isElite ? 'Club Elite' : isPro ? 'Club Pro' : 'Club Lite'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={handleExport} style={[styles.exportButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <MaterialCommunityIcons name="export-variant" size={22} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 32 }}>

                {/* ── Period mode toggle (Elite only) ── */}
                {isElite && (
                    <View style={[styles.section, { flexDirection: 'row', padding: 4, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12 }]}>
                        {(['monthly', 'biweekly'] as const).map(mode => (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.modeTab, periodMode === mode && { backgroundColor: theme.colors.primary }]}
                                onPress={() => {
                                    setPeriodMode(mode);
                                    setPeriodStart(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                                }}
                            >
                                <Text style={[styles.modeTabText, { color: periodMode === mode ? '#fff' : theme.colors.textSecondary }]}>
                                    {mode === 'monthly' ? t('reports.periodMonthly') : t('reports.periodBiweekly')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* ── Period selector (Pro + Elite) ── */}
                {(isPro || isLite) && (
                    <View style={styles.periodSelector}>
                        <TouchableOpacity onPress={() => navigatePeriod(-1)} style={styles.periodArrow}>
                            <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.periodLabel, { color: theme.colors.text }]}>{period.label}</Text>
                        <TouchableOpacity onPress={() => navigatePeriod(1)} style={styles.periodArrow}>
                            <Ionicons name="chevron-forward" size={24} color={theme.colors.primary} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Segment filter (Pro + Elite) ── */}
                {isPro && (
                    <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
                        {/* Mode tabs */}
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                            {(['general', 'activity', 'instructor'] as const).map(mode => {
                                const label = mode === 'general' ? 'General' : mode === 'activity' ? 'Actividad' : 'Instructor';
                                const active = segmentMode === mode;
                                return (
                                    <TouchableOpacity
                                        key={mode}
                                        onPress={() => { setSegmentMode(mode); setSelectedSegmentId(null); }}
                                        style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border }}
                                    >
                                        <Text style={{ color: active ? '#fff' : theme.colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {/* Activity picker */}
                        {segmentMode === 'activity' && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                {activities.map(act => {
                                    const active = selectedSegmentId === act.id;
                                    return (
                                        <TouchableOpacity
                                            key={act.id}
                                            onPress={() => setSelectedSegmentId(active ? null : act.id)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: active ? theme.colors.secondary : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.secondary : theme.colors.border }}
                                        >
                                            <Text style={{ color: active ? '#fff' : theme.colors.text, fontSize: 12, fontWeight: '500' }}>{act.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                        {/* Instructor picker */}
                        {segmentMode === 'instructor' && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                {instructors.map(ins => {
                                    const active = selectedSegmentId === ins.id;
                                    return (
                                        <TouchableOpacity
                                            key={ins.id}
                                            onPress={() => setSelectedSegmentId(active ? null : ins.id)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: active ? theme.colors.secondary : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.secondary : theme.colors.border }}
                                        >
                                            <Text style={{ color: active ? '#fff' : theme.colors.text, fontSize: 12, fontWeight: '500' }}>{ins.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                )}

                {/* ── KPI Row 1: score + attendance (Pro + Elite) ── */}
                {isPro && (
                    <View style={[styles.section, { flexDirection: 'row' }]}>
                        <KpiCard icon="star-outline" value={`${avgScorePct.toFixed(0)}%`} label={t('reports.averageScore')} color={theme.colors.primary} theme={theme} />
                        <View style={{ width: 8 }} />
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 14, padding: 14 }}>
                            <DonutChart value={avgAttendance} strokeColor={avgAttendance >= 70 ? theme.colors.success : theme.colors.error} trackColor={theme.colors.border} />
                            <Text style={{ color: theme.colors.text, fontWeight: 'bold', fontSize: 16, marginTop: 4 }}>{avgAttendance.toFixed(0)}%</Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 2 }}>{t('reports.attendanceRate')}</Text>
                        </View>
                    </View>
                )}

                {/* ── KPI Row 2: Elite totals ── */}
                {isElite && overview && (
                    <View style={[styles.section, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                        <KpiCard icon="account-group" value={`${overview.totalStudents}`} label={t('reports.totalStudents')} color={theme.colors.primary} theme={theme} small />
                        <KpiCard icon="account-multiple" value={`${overview?.avgStudentsPerGroup || 0}`} label={t('reports.avgPerGroup')} color={theme.colors.secondary} theme={theme} small />
                        <KpiCard icon="seat" value={`${overview.overallCapacityPct}%`} label={t('reports.capacityUsed')} color={overview.overallCapacityPct > 80 ? theme.colors.success : theme.colors.textSecondary} theme={theme} small />
                    </View>
                )}

                {/* ── Activity Distribution (Pro + Elite) ── */}
                {isPro && (overview?.activities?.length > 0 || activities.length > 0) && (
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }]}>
                        <SectionHeader icon="chart-bar" title={t('reports.activityDistribution')} theme={theme} />
                        {isElite && overview?.activities ? (
                            overview.activities.map((act: any) => {
                                const suffix = act.totalCapacity > 0
                                    ? ` / ${act.totalCapacity} plazas`
                                    : ` alumnos`;
                                const avgPerGroup = act.groupCount > 0
                                    ? Math.round(act.studentCount / act.groupCount)
                                    : 0;
                                const subtitle = `${act.groupCount} grupo${act.groupCount !== 1 ? 's' : ''} · ${avgPerGroup} alumnos/grupo de media`;
                                return (
                                    <HBar
                                        key={act.activityId}
                                        label={act.name}
                                        value={act.studentCount}
                                        maxValue={totalEnrolledStudents}
                                        color={theme.colors.primary}
                                        suffix={suffix}
                                        subtitle={subtitle}
                                        theme={theme}
                                    />
                                );
                            })
                        ) : (
                            activities.map(act => {
                                const cnt = evaluations.filter(e => e.activityId === act.id).length;
                                const maxCnt = Math.max(...activities.map(a => evaluations.filter(e => e.activityId === a.id).length), 1);
                                return <HBar key={act.id} label={act.name} value={cnt} maxValue={maxCnt} color={theme.colors.primary} theme={theme} />;
                            })
                        )}
                    </View>
                )}

                {/* ── Roster Changes (Elite only) ── */}
                {isElite && (
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }]}>
                        <SectionHeader icon="swap-horizontal" title={t('reports.rosterChanges')} theme={theme} color={theme.colors.primary} />

                        {/* Summary badges */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                            <View style={[styles.rosterBadge, { flex: 1, minWidth: 100, backgroundColor: '#2196F318' }]}>
                                <MaterialCommunityIcons name="account-plus" size={16} color="#2196F3" />
                                <Text style={{ color: '#2196F3', fontWeight: '700', marginLeft: 5 }}>
                                    {rosterChanges?.totalNewAccounts ?? 0} fichas
                                </Text>
                            </View>
                            <View style={[styles.rosterBadge, { flex: 1, minWidth: 100, backgroundColor: '#4CAF5018' }]}>
                                <MaterialCommunityIcons name="arrow-up-circle" size={16} color="#4CAF50" />
                                <Text style={{ color: '#4CAF50', fontWeight: '700', marginLeft: 5 }}>
                                    {rosterChanges?.totalEnrolled ?? 0} altas
                                </Text>
                            </View>
                            <View style={[styles.rosterBadge, { flex: 1, minWidth: 100, backgroundColor: '#F4433618' }]}>
                                <MaterialCommunityIcons name="arrow-down-circle" size={16} color="#F44336" />
                                <Text style={{ color: '#F44336', fontWeight: '700', marginLeft: 5 }}>
                                    {rosterChanges?.totalUnenrolled ?? 0} bajas
                                </Text>
                            </View>
                        </View>

                        {/* Retention KPIs */}
                        {retentionKpis && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                <KpiCard
                                    icon="account-check"
                                    value={`${retentionKpis.tasaRetencion.toFixed(1)}%`}
                                    label="Tasa de retención"
                                    color={retentionKpis.tasaRetencion >= 80 ? theme.colors.success : theme.colors.error}
                                    theme={theme}
                                    small
                                />
                                <KpiCard
                                    icon="account-remove"
                                    value={`${retentionKpis.tasaAbandono.toFixed(1)}%`}
                                    label="Tasa de abandono"
                                    color={retentionKpis.tasaAbandono <= 5 ? theme.colors.success : theme.colors.error}
                                    theme={theme}
                                    small
                                />
                                <KpiCard
                                    icon="timer-outline"
                                    value={retentionKpis.duracionMedia !== null ? `${retentionKpis.duracionMedia.toFixed(1)} per.` : '—'}
                                    label="Duración media"
                                    color={theme.colors.textSecondary}
                                    theme={theme}
                                    small
                                />
                            </View>
                        )}

                        {/* Nuevas fichas */}
                        {rosterChanges?.newAccounts?.length > 0 && (
                            <>
                                <Text style={{ color: '#2196F3', fontWeight: '600', fontSize: 13, marginBottom: 6 }}>Nuevas fichas</Text>
                                {rosterChanges.newAccounts.map((s: any, i: number) => (
                                    <TouchableOpacity key={`na-${i}`} style={[styles.rosterRow, { borderBottomColor: theme.colors.border }]} onPress={() => navigateToStudent(s.studentId, s.studentName, s.email)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.colors.text, fontWeight: '500' }} numberOfLines={1}>{s.studentName}</Text>
                                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{s.email}</Text>
                                        </View>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginLeft: 8 }}>{s.date}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {/* Altas */}
                        {rosterChanges?.enrolled?.length > 0 && (
                            <>
                                <Text style={{ color: '#4CAF50', fontWeight: '600', fontSize: 13, marginBottom: 6 }}>Altas</Text>
                                {rosterChanges.enrolled.map((s: any, i: number) => (
                                    <TouchableOpacity key={`e-${i}`} style={[styles.rosterRow, { borderBottomColor: theme.colors.border }]} onPress={() => navigateToStudent(s.studentId, s.studentName)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.colors.text, fontWeight: '500' }} numberOfLines={1}>{s.studentName}</Text>
                                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{s.activityName} · {s.groupName}</Text>
                                        </View>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginLeft: 8 }}>{s.date}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {/* Bajas */}
                        {rosterChanges?.unenrolled?.length > 0 && (
                            <>
                                <Text style={{ color: '#F44336', fontWeight: '600', fontSize: 13, marginTop: 10, marginBottom: 6 }}>Bajas</Text>
                                {rosterChanges.unenrolled.map((s: any, i: number) => (
                                    <TouchableOpacity key={`u-${i}`} style={[styles.rosterRow, { borderBottomColor: theme.colors.border }]} onPress={() => navigateToStudent(s.studentId, s.studentName)}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: theme.colors.text, fontWeight: '500' }} numberOfLines={1}>{s.studentName}</Text>
                                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{s.activityName} · {s.groupName}</Text>
                                        </View>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginLeft: 8 }}>{s.date}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {(!rosterChanges?.newAccounts?.length && !rosterChanges?.enrolled?.length && !rosterChanges?.unenrolled?.length) && (
                            <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin movimientos en este periodo</Text>
                        )}
                    </View>
                )}

                {/* ── Gamification (Elite only) ── */}
                {isElite && (
                    <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }]}>
                        <SectionHeader icon="sword-cross" title={t('reports.gamification')} theme={theme} color="#FF9800" />
                        {gamification ? (
                            <>
                                {/* Gamification KPIs */}
                                <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                                    <KpiCard icon="sword" value={`${gamification.avgLevel}`} label={t('reports.avgLevel')} color="#FF9800" theme={theme} small />
                                    <KpiCard icon="treasure-chest" value={`${gamification.totalItemsCollected}`} label={t('reports.totalItems')} color="#9C27B0" theme={theme} small />
                                </View>

                                {/* Level distribution */}
                                <Text style={{ color: theme.colors.text, fontWeight: '600', marginBottom: 8 }}>{t('reports.levelDistribution')}</Text>
                                {Object.entries(levelBuckets).map(([range, count]) => (
                                    <HBar key={range} label={`Lv ${range}`} value={count as number} maxValue={maxBucket} color="#FF9800" theme={theme} />
                                ))}

                                {/* RPG class distribution */}
                                {Object.keys(gamification.classDist).length > 0 && (
                                    <>
                                        <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: 12, marginBottom: 8 }}>{t('reports.classDistribution')}</Text>
                                        {Object.entries(gamification.classDist).map(([cls, cnt]) => (
                                            <HBar key={cls} label={cls} value={cnt as number} maxValue={gamification.students.length || 1} color={cls === 'Sin clase' ? theme.colors.textSecondary : '#9C27B0'} suffix=" alumnos" theme={theme} />
                                        ))}
                                    </>
                                )}

                                {/* Top players */}
                                {gamTopStudents.length > 0 && (
                                    <>
                                        <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: 12, marginBottom: 8 }}>{t('reports.topPlayers')}</Text>
                                        {gamTopStudents.map((s: any, i: number) => (
                                            <View key={s.userId} style={[styles.rosterRow, { borderBottomColor: theme.colors.border }]}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                    <Text style={{ color: '#FF9800', fontWeight: '700', width: 24 }}>#{i + 1}</Text>
                                                    <Text style={{ color: theme.colors.text, fontWeight: '500', flex: 1 }}>{s.studentName}</Text>
                                                </View>
                                                <Text style={{ color: '#FF9800', fontWeight: '700' }}>Lv {s.level}</Text>
                                            </View>
                                        ))}
                                    </>
                                )}
                            </>
                        ) : (
                            <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>{t('reports.noGamificationData')}</Text>
                        )}
                    </View>
                )}

                {/* ── Student list (all paid plans) ── */}
                <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }]}>
                    {/* Table header */}
                    <View style={[styles.tableHeader, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.colStudent, { color: theme.colors.textSecondary }]}>Alumno</Text>
                        <View style={styles.colStats}>
                            <Text style={[styles.colLabel, { color: theme.colors.textSecondary }]}>{t('reports.score')}</Text>
                            {isPro && <Text style={[styles.colLabel, { color: theme.colors.textSecondary }]}>Asist.</Text>}
                            {isElite && <Text style={[styles.colLabel, { color: theme.colors.textSecondary }]}>{t('reports.level')}</Text>}
                        </View>
                    </View>

                    {uniqueStudents.length === 0 ? (
                        <View style={{ padding: 24, alignItems: 'center' }}>
                            <Text style={{ color: theme.colors.textSecondary }}>{t('reports.noData')}</Text>
                        </View>
                    ) : (
                        uniqueStudents.map(({ id, name }) => {
                            const evs = evaluations.filter(e => e.studentId === id);
                            const scPct = evs.length > 0
                                ? (evs.reduce((a, e) => a + ((e.score || 0) / (e.maxScore || 3)), 0) / evs.length) * 100
                                : 0;
                            const att = attendance.find(a => a.studentId === id);
                            const attRate = att ? (att.present / att.total) * 100 : 0;
                            const actName = Array.from(new Set(evs.map(e => e.activityId).filter(Boolean)))
                                .map(actId => activities.find(a => a.id === actId)?.name)
                                .filter((n): n is string => !!n)
                                .join(', ');
                            const gamStudent = gamification?.students?.find((s: any) => s.userId === id);

                            return (
                                <TouchableOpacity
                                    key={id}
                                    style={[styles.tableRow, { borderBottomColor: theme.colors.border }]}
                                    onPress={() => handleStudentPress(name)}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.studentName, { color: theme.colors.text }]} numberOfLines={1}>{name}</Text>
                                        {actName ? <Text style={[styles.actLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{actName}</Text> : null}
                                    </View>
                                    <View style={styles.colStats}>
                                        <Text style={[styles.colValue, { color: theme.colors.primary }]}>{scPct.toFixed(0)}%</Text>
                                        {isPro && (
                                            <Text style={[styles.colValue, { color: attRate < 70 ? theme.colors.error : theme.colors.success }]}>
                                                {attRate.toFixed(0)}%
                                            </Text>
                                        )}
                                        {isElite && gamStudent && (
                                            <Text style={[styles.colValue, { color: '#FF9800' }]}>Lv {gamStudent.level}</Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>
            </ScrollView>

            {/* ── Export modal (web) ── */}
            <Modal visible={showExportModal} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowExportModal(false)}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text }]}>{t('reports.export')}</Text>
                        <TouchableOpacity style={[styles.modalBtn, { borderBottomColor: theme.colors.border }]} onPress={() => { setShowExportModal(false); triggerExport('pdf'); }}>
                            <Text style={[styles.modalBtnText, { color: theme.colors.primary }]}>{t('reports.exportPdf')}</Text>
                        </TouchableOpacity>
                        {(isPro || isElite) && (
                            <TouchableOpacity style={styles.modalBtn} onPress={() => { setShowExportModal(false); triggerExport('csv'); }}>
                                <Text style={[styles.modalBtnText, { color: theme.colors.primary }]}>{t('reports.exportCsv')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.modalBtn, { borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 8 }]} onPress={() => setShowExportModal(false)}>
                            <Text style={[styles.modalBtnText, { color: theme.colors.error || '#d32f2f' }]}>{t('reports.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 8 },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backButton: { marginRight: 14, padding: 4 },
    exportButton: { padding: 10, borderRadius: 20, borderWidth: 1 },
    title: { fontSize: 26, fontWeight: 'bold' },
    planBadge: { fontSize: 13, marginTop: 1 },
    content: { flex: 1 },
    section: { marginHorizontal: 16, marginTop: 14 },
    modeTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    modeTabText: { fontSize: 14, fontWeight: '600' },
    periodSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
    periodArrow: { padding: 8 },
    periodLabel: { fontSize: 16, fontWeight: '700', marginHorizontal: 12, minWidth: 160, textAlign: 'center' },
    rosterBadge: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 10 },
    rosterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    tableHeader: { flexDirection: 'row', padding: 12, borderBottomWidth: 2, alignItems: 'center' },
    tableRow: { flexDirection: 'row', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
    colStudent: { fontSize: 13, fontWeight: '600', flex: 1 },
    colStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    colLabel: { fontSize: 12, width: 56, textAlign: 'center' },
    colValue: { fontSize: 15, fontWeight: '700', width: 56, textAlign: 'center' },
    studentName: { fontSize: 15, fontWeight: '600' },
    actLabel: { fontSize: 12, marginTop: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: 300, borderRadius: 12, padding: 20, alignItems: 'center', elevation: 5 },
    modalTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 14 },
    modalBtn: { width: '100%', paddingVertical: 14, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
    modalBtnText: { fontSize: 15, fontWeight: '600' },
});
