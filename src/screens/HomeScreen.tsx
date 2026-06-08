import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, FlatList, Image, useWindowDimensions, Platform } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { UserProfile, Tul, BELT_RANKS } from '../types';
import { TULS_DATA } from '../data/tuls';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Button } from '../components/Button';
import YoutubePlayer from "react-native-youtube-iframe";
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BeltDisplay } from '../components/BeltDisplay';

import { BELT_CONFIGS } from '../data/belts';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AuthService } from '../services/AuthService';
import { ClubService } from '../services/ClubService';
import { ActivityPracticeDashboard } from '../components/ActivityPracticeDashboard';
import { EVALUATION_RUBRICS } from '../data/evaluationRubrics';

interface PracticedActivity {
    activityType: string;
    activityId: string | null;
    activityName: string | null;
    levelOrder: number | null;
    levelName: string | null;
}

type ParamList = {
    Home: { user: UserProfile };
    Details: { tul: Tul };
    Settings: { user: UserProfile };
    VocabularyGame: { user: UserProfile };
    GameHub: { user: UserProfile };
};

export const HomeScreen = () => {
    const route = useRoute<RouteProp<ParamList, 'Home'>>();
    const navigation = useNavigation<NativeStackNavigationProp<ParamList>>();
    const paramUser = route.params?.user;

    const [user, setUser] = useState<UserProfile | null>(paramUser || null);

    const { theme } = useTheme();
    const { t } = useTranslation();
    const { width, height } = useWindowDimensions();
    const styles = createStyles(theme);

    const videoWidth = Math.min(width, 600) - 32;
    const videoHeight = videoWidth * (9 / 16);
    const [twoColCardDims, setTwoColCardDims] = useState({ width: 0, height: 0 });
    // Calculamos el tamaño máximo del vídeo (16:9) que cabe dentro de la tarjeta de la columna,
    // restando el padding/cabecera para no desbordar el contenedor
    const twoColInnerW = Math.max(twoColCardDims.width - 32, 0);
    const twoColMaxH  = Math.max(twoColCardDims.height - 200, 80);
    const twoColVideoW = twoColInnerW > 0
        ? (twoColInnerW * (9 / 16) <= twoColMaxH ? twoColInnerW : twoColMaxH * (16 / 9))
        : videoWidth;
    const twoColVideoH = twoColVideoW * (9 / 16);

    const [currentTul, setCurrentTul] = useState<Tul | null>(null);
    const [minRank, setMinRank] = useState<number>(0);
    const [maxRank, setMaxRank] = useState<number>(user?.rank || 0);
    const [pickerMode, setPickerMode] = useState<'min' | 'max' | 'select' | null>(null);
    // Cada tipo de actividad tiene su propio panel de Práctica (TULs para Taekwondo, nivel + resumen
    // de evaluaciones para Inglés/Ballet). Consideramos que el usuario "practica" una actividad si
    // está matriculado en uno de sus grupos, o si tiene un registro de progresión personal
    // (cubre instructores/dueños de club con rango propio que no están matriculados como alumnos)
    const [practicedActivities, setPracticedActivities] = useState<PracticedActivity[] | null>(null);
    const [selectedPracticeActivityId, setSelectedPracticeActivityId] = useState<string | null>(null);

    // Si no llega un usuario por parámetros de navegación, intentamos recuperar la sesión guardada;
    // si tampoco existe, mandamos al usuario de vuelta a la pantalla de Login
    useEffect(() => {
        const verifyUser = async () => {
            if (!user) {
                const saved = await AuthService.getSavedUser();
                if (saved) {
                    setUser(saved);
                    setMaxRank(saved.rank);
                } else {
                    navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
                }
            } else {
                setMaxRank(user.rank);
            }
        };
        verifyUser();
    }, [user]);

    // Construye la lista de actividades que el usuario practica combinando tres fuentes:
    // grupos en los que está matriculado, progresiones personales y (para dueños de club)
    // las actividades que ofrece su organización. Se usa un Map para deduplicar por activityId.
    useEffect(() => {
        const loadPracticedActivities = async () => {
            if (!user?.id) return;
            try {
                const [groups, progressions] = await Promise.all([
                    ClubService.getStudentGroups(user.id),
                    ClubService.getUserProgressions(user.id),
                ]);
                const merged = new Map<string, PracticedActivity>();
                // Los datos de matrícula tienen prioridad (traen contexto vivo: nombre y nivel actual del grupo)
                groups.forEach(g => {
                    if (!g.activityType || !g.activityId) return;
                    merged.set(g.activityId, {
                        activityType: g.activityType,
                        activityId: g.activityId,
                        activityName: g.activityName || null,
                        levelOrder: g.progressionLevelOrder ?? null,
                        levelName: g.progressionLevelName ?? null,
                    });
                });
                // Las filas de progresión personal completan a quienes no están (o ya no están) matriculados,
                // por ejemplo un dueño de club/instructor con rango propio sin ser alumno de un grupo activo
                progressions.forEach(p => {
                    if (!merged.has(p.activityId)) {
                        merged.set(p.activityId, {
                            activityType: p.activityType,
                            activityId: p.activityId,
                            activityName: p.activityName || null,
                            levelOrder: p.levelOrder ?? null,
                            levelName: p.levelName ?? null,
                        });
                    }
                });
                // Damos a los dueños de club visibilidad sobre todas las actividades de su club —no solo
                // las que practican ellos— para que puedan revisar el panel de Práctica de cada una (su
                // propio dashboard mostrará simplemente "sin nivel/evaluaciones" si no la estudian).
                // Esto se ejecuta ANTES del fallback de cinturón heredado de abajo, para que la actividad
                // real de Taekwondo del dueño (con su nombre correcto) sea la que ocupe ese hueco
                // y el fallback no añada una segunda entrada sintética sin nombre junto a ella.
                if (user.role === 'club_owner' && user.organizationId) {
                    const clubActivities = await ClubService.getActivities(user.organizationId);
                    clubActivities.forEach(a => {
                        if (!a.activityType || merged.has(a.id)) return;
                        if (a.activityType !== 'taekwondo_itf' && !EVALUATION_RUBRICS[a.activityType]) return;
                        merged.set(a.id, {
                            activityType: a.activityType,
                            activityId: a.id,
                            activityName: a.name,
                            levelOrder: null,
                            levelName: null,
                        });
                    });
                }
                // Fallback de cinturón heredado/global: algunas cuentas (p.ej. dueños de club creados en el
                // registro) tienen users.belt_level/rank > 0 para Taekwondo sin ninguna matrícula ni fila en
                // tul_user_progression (esa tabla solo se rellena por backfill de grupo o promoción).
                // Sin esto, un dueño de club IX-Dan sin grupos/progresiones no vería ningún panel.
                if (user.rank > 0 && !Array.from(merged.values()).some(a => a.activityType === 'taekwondo_itf')) {
                    merged.set('__legacy_taekwondo_rank__', {
                        activityType: 'taekwondo_itf',
                        activityId: null,
                        activityName: null,
                        levelOrder: null,
                        levelName: null,
                    });
                }
                setPracticedActivities(Array.from(merged.values()));
            } catch (error) {
                console.error('Failed to load practiced activities for practice dashboard', error);
                // Si falla la carga, asumimos Taekwondo por defecto para que los usuarios existentes
                // sigan viendo su panel de TULs ante un error puntual
                setPracticedActivities([{ activityType: 'taekwondo_itf', activityId: null, activityName: null, levelOrder: null, levelName: null }]);
            }
        };
        loadPracticedActivities();
    }, [user?.id]);

    if (!user) {
        return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
    }

    // Filtra de TULS_DATA solo los tuls cuyo requisito de rango cae dentro del rango min-max elegido
    const getPlayableTuls = () => {
        return TULS_DATA.filter(t => t.rankRequirement >= minRank && t.rankRequirement <= maxRank);
    };

    // Elige al azar un tul de entre los disponibles en el rango actual y lo muestra en pantalla
    const handleRandomize = () => {
        const pool = getPlayableTuls();
        if (pool.length === 0) {
            Alert.alert(t('common.oops'), t('home.emptyState'));
            return;
        }
        const randomIndex = Math.floor(Math.random() * pool.length);
        setCurrentTul(pool[randomIndex]);
    };

    const navigateToDetails = () => {
        if (currentTul) {
            navigation.navigate('Details', { tul: currentTul });
        }
    };

    const handleSelectTul = (tul: Tul) => {
        setCurrentTul(tul);
        setPickerMode(null);
    };

    const handleSelectRank = (rank: number) => {
        if (pickerMode === 'min') {
            if (rank > maxRank) setMaxRank(rank); // Ajustamos el máximo automáticamente si el mínimo lo supera
            setMinRank(rank);
        } else if (pickerMode === 'max') {
            if (rank < minRank) setMinRank(rank); // Ajustamos el mínimo automáticamente si el máximo es menor
            setMaxRank(rank);
        }
        setPickerMode(null);
    };
    const navigateToSettings = () => {
        navigation.navigate('Settings', { user });
    };

    // Aqui sacamos la configuración visual (color, nombre, gup) del cinturón actual del usuario
    const userRankConfig = BELT_CONFIGS[user?.rank ?? 0] || BELT_CONFIGS[0];

    // Decide qué panel de actividad practicada mostrar: respeta la elección explícita del usuario
    // (el selector de pastillas), y si no hay ninguna, prioriza Taekwondo ITF (panel más completo,
    // valor histórico por defecto) o, en su defecto, la primera actividad de la lista
    const selectedActivity: PracticedActivity | null = practicedActivities && practicedActivities.length > 0
        ? (practicedActivities.find(a => a.activityId === selectedPracticeActivityId)
            || practicedActivities.find(a => a.activityType === 'taekwondo_itf')
            || practicedActivities[0])
        : null;

    // Inglés/Ballet (y cualquier futura actividad basada en rúbricas) usan el panel genérico; Taekwondo conserva el suyo
    const showActivityDashboard = !!selectedActivity && selectedActivity.activityType !== 'taekwondo_itf' && !!EVALUATION_RUBRICS[selectedActivity.activityType];
    // Solo mostramos el estado vacío "nada que practicar" cuando ya terminó la carga y la selección no es Taekwondo
    // (tanto Taekwondo como el estado de carga caen en el layout de panel de TULs de siempre, más abajo)
    const showNoPracticeEmptyState = practicedActivities !== null && !showActivityDashboard && selectedActivity?.activityType !== 'taekwondo_itf';

    return (
        <View style={styles.container}>
            {/* Cabecera: saludo, cinturón actual, logo del club (si aplica) y accesos rápidos */}
            <View style={styles.header}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ justifyContent: 'center', paddingTop: 12 }}>
                        <Text style={styles.greeting}>{t('home.greeting', { name: (user.name || '').split(' ')[0] })}</Text>
                        <Text style={[
                            styles.rank,
                            { color: userRankConfig.textColor === 'theme' ? theme.colors.text : (userRankConfig.textColor || theme.colors.primary), marginTop: 4 }
                        ]}>
                            {t(`belts.${userRankConfig.name}`, { defaultValue: userRankConfig.name })} ({t(`belts.${userRankConfig.gup}`, { defaultValue: userRankConfig.gup })})
                        </Text>
                        {user.plan === 'club_elite' && user.organizationLogo && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                                <Image
                                    source={{ uri: user.organizationLogo }}
                                    style={styles.headerClubLogo}
                                />
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                                    {user.organizationName}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ paddingHorizontal: 16 }}>
                        <BeltDisplay rank={user.rank} showText={false} width={80} height={16} vertical={true} />
                    </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {selectedActivity?.activityType === 'taekwondo_itf' && (
                            <TouchableOpacity style={styles.stats} onPress={() => setPickerMode('select')}>
                                <Text style={styles.statsText}>{t('home.tulsCount', { count: getPlayableTuls().length })}</Text>
                            </TouchableOpacity>
                        )}
                        {(Platform.OS !== 'web' || width <= 768) && (
                            <TouchableOpacity onPress={navigateToSettings} style={{ padding: 8 }}>
                                <Ionicons name="menu" size={32} color={theme.colors.text} />
                            </TouchableOpacity>
                        )}
                    </View>
                    {/* Selector de actividad: solo aparece si el usuario practica más de una actividad con panel propio */}
                    {practicedActivities && practicedActivities.length > 1 && (
                        <View style={[styles.headerActivitySwitcherRow, { justifyContent: 'flex-end' }]}>
                            {practicedActivities.map(activity => {
                                const isSelected = activity.activityId === (selectedActivity?.activityId ?? null) && activity.activityType === selectedActivity?.activityType;
                                return (
                                    <TouchableOpacity
                                        key={activity.activityId || activity.activityType}
                                        style={[styles.activityPill, isSelected && styles.activityPillSelected]}
                                        onPress={() => setSelectedPracticeActivityId(activity.activityId)}
                                    >
                                        <Text style={[styles.activityPillText, isSelected && styles.activityPillTextSelected]} numberOfLines={1}>
                                            {activity.activityName || t(`activities.${activity.activityType}`, { defaultValue: activity.activityType })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            </View>

            {showActivityDashboard && selectedActivity ? (
                /* ── Panel genérico por actividad para Inglés/Ballet (y futuras actividades basadas en rúbricas) ── */
                <View style={styles.content}>
                    <ActivityPracticeDashboard
                        activityType={selectedActivity.activityType}
                        activityName={selectedActivity.activityName || selectedActivity.activityType}
                        levelOrder={selectedActivity.levelOrder}
                        levelName={selectedActivity.levelName}
                        userId={user.id}
                        onPlayPress={() => navigation.navigate('GameHub', { user, activityType: selectedActivity?.activityType })}
                    />
                </View>
            ) : showNoPracticeEmptyState ? (
                /* ── Aún no hay actividades practicadas con panel de Práctica propio ── */
                <View style={styles.content}>
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>{t('home.noPracticeActivities', { defaultValue: 'Todavía no participas en ninguna actividad con seguimiento de práctica. ¡Pregunta a tu club sobre las clases disponibles!' })}</Text>
                    </View>
                    {user.organizationId && (
                        <TouchableOpacity style={styles.inlineGameButton} onPress={() => navigation.navigate('GameHub', { user, activityType: selectedActivity?.activityType })}>
                            <Ionicons name="game-controller-outline" size={22} color="#FFF" />
                            <Text style={styles.inlineGameText}>{t('home.playWords')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : currentTul && Platform.OS === 'web' && width > 768 ? (
                /* ── Layout a dos columnas (web + tul seleccionado y pantalla ancha) ── */
                <View style={styles.contentRow}>
                    {/* Columna izquierda: la tarjeta de vídeo ocupa el espacio restante */}
                    <View style={styles.tulCard} onLayout={(e) => setTwoColCardDims({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tulCardContent} showsVerticalScrollIndicator={false}>
                            <Text style={styles.tulName}>{currentTul.name}</Text>
                            <View style={{ marginBottom: 16 }}>
                                <BeltDisplay rank={currentTul.rankRequirement} />
                            </View>
                            <View style={[styles.videoContainer, { width: twoColVideoW, alignSelf: 'center' }]}>
                                <YoutubePlayer
                                    key={currentTul.videoId}
                                    height={twoColVideoH}
                                    width={twoColVideoW}
                                    play={false}
                                    videoId={currentTul.videoId}
                                />
                            </View>
                        </ScrollView>
                        <TouchableOpacity style={styles.infoButton} onPress={navigateToDetails}>
                            <Text style={styles.infoButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Columna derecha: controles y selector de rango apilados verticalmente */}
                    <View style={styles.sidePanel}>
                        <TouchableOpacity style={styles.chooseTulButton} onPress={() => setPickerMode('select')}>
                            <Ionicons name="list-outline" size={22} color={theme.colors.primary} />
                            <Text style={styles.chooseTulText}>{t('home.chooseTulButton')}</Text>
                        </TouchableOpacity>
                        <Button title={t('home.generateButton')} onPress={handleRandomize} />
                        {user.organizationId && (
                            <TouchableOpacity style={styles.inlineGameButton} onPress={() => navigation.navigate('GameHub', { user, activityType: selectedActivity?.activityType })}>
                                <Ionicons name="game-controller-outline" size={22} color="#FFF" />
                                <Text style={styles.inlineGameText}>{t('home.playWords')}</Text>
                            </TouchableOpacity>
                        )}
                        <View style={styles.settings}>
                            <Text style={styles.sectionTitle}>{t('home.practiceRange')}</Text>
                            <TouchableOpacity style={[styles.rangeButton, { marginBottom: 8 }]} onPress={() => setPickerMode('min')}>
                                <Text style={styles.rangeLabel}>{t('home.from')}</Text>
                                <BeltDisplay rank={minRank} showText={true} width={120} height={18} />
                            </TouchableOpacity>
                            <View style={{ alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="arrow-down" size={18} color={theme.colors.textSecondary} />
                            </View>
                            <TouchableOpacity style={styles.rangeButton} onPress={() => setPickerMode('max')}>
                                <Text style={styles.rangeLabel}>{t('home.to')}</Text>
                                <BeltDisplay rank={maxRank} showText={true} width={120} height={18} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            ) : (
                /* ── Layout estándar a una sola columna (móvil o pantalla estrecha) ── */
                <View style={styles.content}>
                    {/* El banner del mercader solo aparece domingos (0) y martes (2) */}
                    {[0, 2].includes(new Date().getDay()) && (
                        <TouchableOpacity
                            style={styles.merchantBanner}
                            onPress={() => navigation.navigate('GameHub' as any, { screen: 'Market' })}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={styles.merchantTitle}>{t('home.merchantBannerTitle')}</Text>
                                <Text style={styles.merchantSub}>{t('home.merchantBannerSub')}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={24} color="#D69121" />
                        </TouchableOpacity>
                    )}
                    {currentTul ? (
                        <View style={styles.tulCard}>
                            <ScrollView contentContainerStyle={styles.tulCardContent} showsVerticalScrollIndicator={false}>
                                <Text style={styles.tulName}>{currentTul.name}</Text>
                                <View style={{ marginBottom: 16 }}>
                                    <BeltDisplay rank={currentTul.rankRequirement} />
                                </View>
                                <View style={styles.videoContainer}>
                                    <YoutubePlayer
                                        key={currentTul.videoId}
                                        height={videoHeight}
                                        play={false}
                                        videoId={currentTul.videoId}
                                    />
                                </View>
                            </ScrollView>
                            <TouchableOpacity style={styles.infoButton} onPress={navigateToDetails}>
                                <Text style={styles.infoButtonText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>{t('home.emptyState')}</Text>
                        </View>
                    )}
                    <View style={[styles.controls, { flexDirection: 'row', gap: 12, alignItems: 'stretch' }]}>
                        <TouchableOpacity style={[styles.chooseTulButton, { flex: 1 }]} onPress={() => setPickerMode('select')}>
                            <Ionicons name="list-outline" size={22} color={theme.colors.primary} />
                            <Text style={styles.chooseTulText}>{t('home.chooseTulButton')}</Text>
                        </TouchableOpacity>
                        <View style={{ flex: 2 }}>
                            <Button title={t('home.generateButton')} onPress={handleRandomize} />
                        </View>
                        {user.organizationId && (
                            <TouchableOpacity style={[styles.inlineGameButton, { flex: 1 }]} onPress={() => navigation.navigate('GameHub', { user, activityType: selectedActivity?.activityType })}>
                                <Ionicons name="game-controller-outline" size={22} color="#FFF" />
                                <Text style={styles.inlineGameText}>{t('home.playWords')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.settings}>
                        <Text style={styles.sectionTitle}>{t('home.practiceRange')}</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity style={styles.rangeButton} onPress={() => setPickerMode('min')}>
                                <Text style={styles.rangeLabel}>{t('home.from')}</Text>
                                <BeltDisplay rank={minRank} showText={true} width={100} height={18} />
                            </TouchableOpacity>
                            <View style={{ justifyContent: 'center' }}>
                                <Ionicons name="arrow-forward" size={20} color={theme.colors.textSecondary} />
                            </View>
                            <TouchableOpacity style={styles.rangeButton} onPress={() => setPickerMode('max')}>
                                <Text style={styles.rangeLabel}>{t('home.to')}</Text>
                                <BeltDisplay rank={maxRank} showText={true} width={100} height={18} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Modal de selección reutilizado tanto para elegir un Tul como para elegir un cinturón (min/max) */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={pickerMode !== null}
                onRequestClose={() => setPickerMode(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {pickerMode === 'select' ? t('home.selectTul') :
                                    pickerMode === 'min' ? t('home.fromBelt') : t('home.toBelt')}
                            </Text>
                            <TouchableOpacity onPress={() => setPickerMode(null)}>
                                <Text style={styles.closeButton}>X</Text>
                            </TouchableOpacity>
                        </View>

                        {pickerMode === 'select' ? (
                            <FlatList
                                data={getPlayableTuls()}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.modalItem}
                                        onPress={() => handleSelectTul(item)}
                                    >
                                        <Text style={styles.modalItemText}>{item.name}</Text>
                                        <View pointerEvents="none">
                                            <BeltDisplay
                                                rank={item.rankRequirement}
                                                showText={false}
                                                width={100}
                                                height={16}
                                            />
                                        </View>
                                    </TouchableOpacity>
                                )}
                                ItemSeparatorComponent={() => <View style={styles.separator} />}
                            />
                        ) : (
                            <FlatList
                                data={Object.keys(BELT_CONFIGS).map(Number).sort((a, b) => a - b)}
                                keyExtractor={item => item.toString()}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.modalItem}
                                        onPress={() => handleSelectRank(item)}
                                    >
                                        <BeltDisplay
                                            rank={item}
                                            showText={true}
                                            width={150}
                                            height={20}
                                        />
                                    </TouchableOpacity>
                                )}
                                ItemSeparatorComponent={() => <View style={styles.separator} />}
                            />
                        )}
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
        overflow: 'hidden',
    },
    headerActivitySwitcherRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
        maxWidth: 220,
    },
    activityPill: {
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: theme.borderRadius.l,
        backgroundColor: theme.colors.surfaceHighlight,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    activityPillSelected: {
        backgroundColor: theme.colors.primary + '22',
        borderColor: theme.colors.primary,
    },
    activityPillText: {
        color: theme.colors.textSecondary,
        fontWeight: '600',
        fontSize: 13,
    },
    activityPillTextSelected: {
        color: theme.colors.primary,
    },
    header: {
        padding: theme.spacing.m,
        paddingTop: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    headerClubLogo: {
        width: 40,
        height: 40,
        borderRadius: 8,
        marginRight: 8,
    },
    greeting: {
        ...theme.typography.header,
        color: theme.colors.text,
        fontSize: 22,
    },
    rank: {
        ...theme.typography.subheader,
        color: theme.colors.primary,
    },
    stats: {
        backgroundColor: theme.colors.background,
        padding: theme.spacing.s,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    statsText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 18,
    },

    content: {
        flex: 1,
        padding: theme.spacing.m,
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
    },
    contentRow: {
        flex: 1,
        flexDirection: 'row',
        padding: theme.spacing.m,
        gap: 16,
        width: '100%',
    },
    sidePanel: {
        width: 280,
        gap: 12,
    },
    tulCard: {
        flex: 1,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        marginBottom: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    tulCardContent: {
        paddingTop: 40,
        paddingHorizontal: theme.spacing.m,
        paddingBottom: theme.spacing.m,
        alignItems: 'center',
    },
    tulName: {
        ...theme.typography.header,
        marginBottom: theme.spacing.xs,
    },
    tulBelt: {
        ...theme.typography.body,
        color: theme.colors.primary,
        marginBottom: theme.spacing.m,
    },
    videoContainer: {
        width: '100%',
        borderRadius: theme.borderRadius.m,
        overflow: 'hidden',
        backgroundColor: '#000',
        marginBottom: theme.spacing.m,
    },
    infoButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: theme.colors.accent,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        elevation: 5,
    },
    infoButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 28,
        marginTop: -2, // Ajuste visual para centrar el símbolo "+"
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        marginBottom: theme.spacing.m,
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: theme.colors.border,
    },
    emptyText: {
        color: theme.colors.textSecondary,
    },
    controls: {
        marginBottom: theme.spacing.l,
    },
    settings: {
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
    },
    sectionTitle: {
        ...theme.typography.subheader,
        marginBottom: theme.spacing.s,
        fontSize: 16,
    },
    rangeButton: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        marginHorizontal: 5,
    },
    rangeLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginBottom: 4,
    },
    settingText: {
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    chooseTulButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    inlineGameButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        justifyContent: 'center',
    },
    chooseTulText: {
        color: theme.colors.primary,
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
    inlineGameText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
        marginLeft: 8,
    },
    // Aqui configuramos los estilos del modal de selección (overlay, contenido, cabecera, items)
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
    modalItemText: {
        color: theme.colors.text,
        fontSize: 18,
    },
    separator: {
        height: 1,
        backgroundColor: theme.colors.border,
    },
    merchantBanner: {
        backgroundColor: '#FCF8E3',
        borderWidth: 2,
        borderColor: '#D69121',
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    merchantTitle: {
        color: '#8A6D3B',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 2
    },
    merchantSub: {
        color: '#A88B58',
        fontSize: 12
    }
});
