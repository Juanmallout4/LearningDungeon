import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ActivityIndicator, Animated, Easing, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ClubService } from '../services/ClubService';
import { AuthService } from '../services/AuthService';
import { apiFetch, getToken } from '../utils/apiFetch';
import io, { Socket } from 'socket.io-client';
import { RPGClass, UserProfile, VocabularyTerm } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

interface Boss {
    id: string;
    name: string;
    totalHp: number;
    currentHp: number;
    imageUrl?: string;
    rewardPoints: number;
    teamHealingPool?: number;
}

export const ClanBossBattleScreen = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { clanId, lobbyId } = route.params || {};
    const activityType = route.params?.activityType || 'taekwondo_itf';
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [user, setUser] = useState<UserProfile | null>(null);
    const [boss, setBoss] = useState<any>(null);
    const [vocabulary, setVocabulary] = useState<VocabularyTerm[]>([]);

    // Aqui controlamos el ciclo de vida de la pantalla de combate: cargando datos, luchando, o derrotado, y el contador de aciertos
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDead, setIsDead] = useState(false);
    const [correctHits, setCorrectHits] = useState(0);

    // Copia local de las estadísticas de combate del jugador (vida, maná y clase) que se va modificando durante la partida
    const [stats, setStats] = useState({
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        rpgClass: 'unassigned'
    });

    // Aura del Monje activa (curación propia o grupal), puntos de curación añadidos al equipo y bonus de combate del equipo equipado
    const [monkAura, setMonkAura] = useState<'personal' | 'grupal' | null>(null);
    const [addedTeamHeal, setAddedTeamHeal] = useState(0);
    const [inventoryBonus, setInventoryBonus] = useState({ hpBoost: 0, damageMultiplier: 1, healBoost: 0 });

    // Refs espejo de los contadores de combate (aciertos, curación y maná consumido): evitan el problema de "stale closure"
    // dentro de los timers/callbacks del juego, ya que los setState son asíncronos y los timers usan valores capturados
    const hitsRef = useRef(0);
    const healRef = useRef(0);
    const manaConsumedRef = useRef(0);

    // Estado de la pregunta de vocabulario actual: término mostrado, opciones de respuesta y cuál es la correcta
    const [currentTerm, setCurrentTerm] = useState<VocabularyTerm | null>(null);
    const [options, setOptions] = useState<string[]>([]);
    const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);

    // Valores animados (Animated.Value) que controlan las sacudidas del jefe, las barras de HP/maná y los destellos de pantalla
    const bossShake = useRef(new Animated.Value(0)).current;
    const bossLunge = useRef(new Animated.Value(0)).current;
    const hpAnimation = useRef(new Animated.Value(1)).current;
    const playerHpAnim = useRef(new Animated.Value(1)).current;
    const manaAnim = useRef(new Animated.Value(1)).current;
    const screenFlash = useRef(new Animated.Value(0)).current;
    const screenFlashGreen = useRef(new Animated.Value(0)).current;
    
    const socketRef = useRef<Socket | null>(null);
    const attackTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Refs espejo de isPlaying/isDead: los timers de ataque del jefe necesitan leer el valor más reciente
    // sin re-suscribirse, así que no podemos depender únicamente del estado de React dentro de scheduleNextAttack
    const isPlayingRef = useRef(false);
    const isDeadRef = useRef(false);

    // Al entrar en la pantalla cargamos jefe, vocabulario y stats; al salir cerramos el socket y cancelamos el temporizador de ataques
    useEffect(() => {
        loadBattleData();
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (attackTimerRef.current) clearTimeout(attackTimerRef.current);
        };
    }, []);

    // Carga inicial de la batalla: trae en paralelo el jefe activo del clan/club, el vocabulario de preguntas según el rango/actividad
    // del usuario y su inventario; calcula stats de combate (HP/maná) y bonus de equipo, y abre el socket para recibir HP del jefe en vivo
    const loadBattleData = async () => {
        setIsLoading(true);
        try {
            const currentUser = await AuthService.getSavedUser();
            setUser(currentUser);
            
            if (currentUser && currentUser.organizationId) {
                const bossUrl = clanId ? `/api/clans/${clanId}/bosses/active` : `/api/clubs/${currentUser.organizationId}/bosses/active`;
                const [bossRes, vocabRes, rpgRes] = await Promise.all([
                    fetch(bossUrl),
                    ClubService.getVocabulary(currentUser.organizationId, activityType === 'taekwondo_itf' ? currentUser.rank : undefined, activityType),
                    fetch(`/api/users/${currentUser.id}/inventory`).catch(() => null)
                ]);
                
                if (bossRes.ok) {
                    const data = await bossRes.json();
                    setBoss(data.boss);
                    hpAnimation.setValue(data.boss.currentHp / data.boss.totalHp);
                }
                
                if (vocabRes) setVocabulary(vocabRes);

                if (rpgRes && rpgRes.ok) {
                    const rData = await rpgRes.json();
                    if (rData.success && rData.stats) {
                        setStats({
                            hp: rData.stats.current_hp ?? rData.stats.max_hp ?? 100,
                            maxHp: rData.stats.max_hp || 100,
                            mana: rData.stats.mana ?? rData.stats.max_mana ?? 50,
                            maxMana: rData.stats.max_mana || 50,
                            rpgClass: rData.stats.rpg_class
                        });
                        isDeadRef.current = (rData.stats.current_hp ?? 100) <= 0;
                        setIsDead(isDeadRef.current);
                    }
                }
                
                // Calculamos el bono de combate sumando las estadísticas (combatStats) de cada objeto que el jugador tiene EQUIPADO:
                // hp y heal se suman, damageMultiplier se multiplica acumulativamente (parte de 1). Al final aplicamos el bono de
                // HP a las estadísticas locales (sube hp y maxHp) para reflejar el equipo en la barra de vida de la batalla
                try {
                    const invRes = await apiFetch(`/api/users/${currentUser.id}/inventory`);
                    if (invRes.ok) {
                        const invData = await invRes.json();
                        let hp = 0; let dmg = 1; let heal = 0;
                        invData.inventory?.filter((i:any) => i.is_equipped || i.isEquipped).forEach((item:any) => {
                            if (item.combatStats) {
                                try {
                                    const cStats = typeof item.combatStats === 'string' ? JSON.parse(item.combatStats) : item.combatStats;
                                    hp += parseInt(cStats.hpBoost) || 0;
                                    dmg *= parseFloat(cStats.damageMultiplier) || 1;
                                    heal += parseInt(cStats.healBoost) || 0;
                                } catch(e){}
                            }
                        });
                        setInventoryBonus({ hpBoost: hp, damageMultiplier: dmg, healBoost: heal });
                        // Aplicamos el bono de HP del equipo tanto a la vida actual como al máximo
                        setStats(prev => ({ ...prev, hp: prev.hp + hp, maxHp: prev.maxHp + hp }));
                    }
                } catch(e) {}

                // Abrimos (o reutilizamos) el socket autenticado, nos unimos a la sala del clan para recibir eventos de batalla,
                // y escuchamos 'boss_hp_updated': si el jefe resucitó (respawned) reseteamos su HP/nivel directamente,
                // si no, animamos la barra de HP hacia el nuevo valor recibido del servidor
                if (!socketRef.current) {
                    const token = await getToken();
                    const authOpts = { auth: { token } };
                    socketRef.current = Platform.OS === 'web' ? io(authOpts) : io('http://localhost:8080', authOpts);
                }
                socketRef.current.emit('join_clan', clanId);
                socketRef.current.on('boss_hp_updated', (data) => {
                    setBoss((prev: any) => {
                        if (!prev) return prev;
                        if (data.respawned) return { ...prev, currentHp: data.hp, boss_level: data.bossLevel };
                        updateBossHpBar(data.hp, parseInt(prev.totalHp));
                        return { ...prev, currentHp: data.hp };
                    });
                });
            }
        } catch (error) {
            console.error('Error loading boss battle:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Anima una sacudida rápida del jefe (izquierda-derecha-izquierda-centro) cuando el jugador acierta y le golpea
    const triggerBossHitAnimation = () => {
        Animated.sequence([
            Animated.timing(bossShake, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(bossShake, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(bossShake, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(bossShake, { toValue: 0, duration: 50, useNativeDriver: true })
        ]).start();
    };

    // Anima un "embiste" del jefe hacia el jugador (avanza y vuelve) cuando ataca, dando sensación de impacto
    const triggerBossAttackAnimation = () => {
        Animated.sequence([
            Animated.spring(bossLunge, { toValue: 30, speed: 20, bounciness: 0, useNativeDriver: true }),
            Animated.spring(bossLunge, { toValue: 0, speed: 10, bounciness: 0, useNativeDriver: true })
        ]).start();
    };

    // Destello rojo de pantalla completa: feedback visual de que el jugador ha recibido daño
    const triggerDamageFlash = () => {
        Animated.sequence([
            Animated.timing(screenFlash, { toValue: 1, duration: 100, useNativeDriver: false }),
            Animated.timing(screenFlash, { toValue: 0, duration: 150, useNativeDriver: false })
        ]).start();
    };

    // Destello verde de pantalla completa: feedback visual de que el jugador ha respondido bien y golpeado al jefe
    const triggerHitFlash = () => {
        Animated.sequence([
            Animated.timing(screenFlashGreen, { toValue: 1, duration: 100, useNativeDriver: false }),
            Animated.timing(screenFlashGreen, { toValue: 0, duration: 150, useNativeDriver: false })
        ]).start();
    };

    // Anima suavemente la barra de vida del jefe hacia la nueva proporción currentHp/totalHp (nunca por debajo de 0)
    const updateBossHpBar = (newCurrentHp: number, totalHp: number) => {
        Animated.timing(hpAnimation, {
            toValue: Math.max(newCurrentHp / totalHp, 0),
            duration: 500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false
        }).start();
    };

    // Anima la barra de vida del jugador hacia su nueva proporción HP/maxHP
    const updatePlayerHpBar = (newCurrentHp: number, totalHp: number) => {
        Animated.timing(playerHpAnim, {
            toValue: Math.max(newCurrentHp / totalHp, 0),
            duration: 300,
            useNativeDriver: false
        }).start();
    };

    // Anima la barra de maná del jugador (solo visible para la clase Mago) hacia su nueva proporción mana/maxMana
    const updateManaBar = (newMana: number, totalMana: number) => {
        Animated.timing(manaAnim, {
            toValue: Math.max(newMana / totalMana, 0),
            duration: 300,
            useNativeDriver: false
        }).start();
    };

    useEffect(() => {
        updatePlayerHpBar(stats.hp, stats.maxHp);
    }, [stats.hp, stats.maxHp]);

    useEffect(() => {
        updateManaBar(stats.mana, stats.maxMana);
    }, [stats.mana, stats.maxMana]);

    // El jugador elige su clase RPG (Guerrero/Mago/Druida/Monje): la guarda en el backend, actualiza la sesión local
    // (AsyncStorage) y recarga toda la batalla para que el servidor inicialice las estadísticas según la nueva clase
    const pickClass = async (selectedClass: RPGClass) => {
        if (!user) return;
        try {
            const res = await apiFetch(`/api/users/${user.id}/rpg-class`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rpgClass: selectedClass })
            });
            if (res.ok) {
                const updatedUser = { ...user, rpgClass: selectedClass };
                await AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(updatedUser));
                setUser(updatedUser);
                loadBattleData(); // Recargamos para obtener las estadisticas RPG recien inicializadas
            }
        } catch (e) {
            console.error('Error setting class', e);
        }
    };

    // Genera una nueva pregunta de combate: elige un término de vocabulario al azar, decide la respuesta correcta según
    // su tipo de contenido (si es imagen, se pregunta el nombre/término; si es texto, se pregunta el significado),
    // y arma 3 distractores del mismo tipo de contenido (o del pool completo si no hay suficientes) mezclados con la correcta
    const nextQuestion = () => {
        if (vocabulary.length < 4) return;
        const target = vocabulary[Math.floor(Math.random() * vocabulary.length)];
        setCurrentTerm(target);
        const isImage = target.contentType === 'image';
        const answer = isImage ? target.term : target.meaning;
        setCorrectAnswer(answer);
        // Los distractores salen de entradas del mismo tipo de contenido: las preguntas de imagen
        // ofrecen nombres de técnica como opciones, y las de texto ofrecen significados
        let samePool = vocabulary.filter(v => (v.contentType === 'image') === isImage && v.id !== target.id);
        if (samePool.length < 3) {
            // No hay suficientes entradas del mismo tipo para formar distractores — usamos el pool completo como respaldo
            samePool = vocabulary.filter(v => v.id !== target.id);
        }
        const wrongs = samePool.sort(() => 0.5 - Math.random()).slice(0, 3);
        const choices = [answer, ...wrongs.map(w => isImage ? w.term : w.meaning)].sort(() => 0.5 - Math.random());
        setOptions(choices);
    };

    // Arranca la partida: comprueba que haya vocabulario suficiente y que el jugador esté con vida, reinicia
    // todos los contadores de combate (aciertos, maná consumido, curación) y lanza la primera pregunta y el ciclo de ataques del jefe
    const startGame = () => {
        if (vocabulary.length < 4) {
            Alert.alert(t('battle.trainingLocked'), t('battle.lockedDesc'));
            return;
        }

        if (stats.hp <= 0) {
            Alert.alert(
                "¡Estás derrotado!", 
                "Tu vida está a 0. Debes ir al Campamento de Entrenamiento para recuperar fuerzas antes de volver a luchar contra un jefe."
            );
            return;
        }
        
        // Reiniciamos el estado de combate local (tanto el state como sus refs espejo) antes de empezar
        setCorrectHits(0);
        hitsRef.current = 0;
        manaConsumedRef.current = 0;
        setAddedTeamHeal(0);
        healRef.current = 0;
        setIsDead(false);
        isDeadRef.current = false;
        setIsPlaying(true);
        isPlayingRef.current = true;
        nextQuestion();

        // Arrancamos el ciclo de ataques aleatorios del jefe
        scheduleNextAttack(true);
    };

    // Programa el siguiente ataque del jefe en un intervalo aleatorio entre attackIntervalMin/Max (con valores por defecto).
    // SIEMPRE consultamos los refs (isPlayingRef/isDeadRef) en vez del state directamente, porque el setTimeout
    // captura el valor de las variables en el momento de crearse y el estado de React podría haber cambiado para entonces
    const scheduleNextAttack = (isFirstCall = false) => {
        if ((!isPlayingRef.current && !isFirstCall) || isDeadRef.current || !boss) return;

        const minInt = boss.attackIntervalMin || 1000;
        const maxInt = boss.attackIntervalMax || 10000;
        const interval = Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;

        attackTimerRef.current = setTimeout(() => {
            if (isPlayingRef.current && !isDeadRef.current) {
                try {
                    performBossAttack();
                } catch (e) {
                    console.error("Boss attack error", e);
                } finally {
                    scheduleNextAttack();
                }
            }
        }, interval);
    };

    // Calcula el daño del ataque del jefe: una base aleatoria entre su daño mínimo y máximo, más un bonus
    // proporcional a su nivel (bossLevel * 2), y lo aplica al jugador disparando la animación de embiste
    const performBossAttack = () => {
        if (!boss) return;

        const minDmg = boss.minDamage || boss.min_damage || 5;
        const maxDmg = boss.maxDamage || boss.max_damage || minDmg + 10;
        const levelBonus = (boss.bossLevel || boss.boss_level || 1) * 2;

        const randomBase = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
        const totalDamage = randomBase + levelBonus;

        triggerBossAttackAnimation();
        takeDamage(totalDamage);
    };

    // Resta vida al jugador (sin bajar de 0), dispara el destello de daño y, si la vida llega a 0,
    // marca al jugador como muerto (state + ref) y termina la partida forzando hp=0 explícitamente
    // para evitar condiciones de carrera con el valor de stats.hp todavía no actualizado
    const takeDamage = (amount: number) => {
        triggerDamageFlash();
        let isNowDead = false;
        setStats(prev => {
            const next = Math.max(0, prev.hp - amount);
            if (next === 0 && !isDeadRef.current) {
                isDeadRef.current = true;
                setIsDead(true);
                isNowDead = true;
            }
            return { ...prev, hp: next };
        });

        if (isNowDead) {
            endGame(0);
        }
    };

    // Red de seguridad: si el estado isDead cambia a true mientras seguimos "jugando", forzamos el cierre de la partida
    useEffect(() => {
        if (isDead && isPlayingRef.current) {
            endGame();
        }
    }, [isDead]);

    // Procesa la respuesta del jugador a la pregunta de combate: aplica efectos según su clase RPG
    // (consumo/recarga de maná para Magos, curación pasiva para Monjes según su aura) y decide si golpea al jefe o recibe daño
    const handleAnswer = (selected: string) => {
        if (isDead || !isPlaying) return; // Bloquea respuestas si el jugador ya está muerto o la partida terminó

        if (selected === correctAnswer) {
            hitsRef.current += 1;
            setCorrectHits(hitsRef.current);
            triggerBossHitAnimation();
            triggerHitFlash(); // # Green flash feedback

            // Cada acierto consume 5 puntos de maná si la clase es Mago (su mecánica de recurso especial)
            if (stats.rpgClass === 'Mago' || stats.rpgClass === 'Mage') {
                manaConsumedRef.current += 5;
                setStats(prev => ({ ...prev, mana: Math.max(0, prev.mana - 5) }));
            }

            // Curación pasiva del Monje según el aura elegida antes de empezar: 'personal' se cura a sí mismo (+15 HP por acierto),
            // 'grupal' acumula curación para repartir entre el equipo al terminar (healRef se envía al backend en endGame)
            const isLocalizedHealer = stats.rpgClass === 'Monje' || stats.rpgClass === 'Monk';
            if (isLocalizedHealer) {
                if (monkAura === 'personal') {
                    setStats(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 15) }));
                } else if (monkAura === 'grupal') {
                    healRef.current += 5;
                    setAddedTeamHeal(healRef.current);
                }
            }

            // Predicción visual local del HP del jefe: restamos 5 de forma optimista para que la barra reaccione
            // al instante, aunque el valor real (autoritativo) llegará después por el evento de socket 'boss_hp_updated'
            if (boss) {
                const newHp = Math.max(0, boss.currentHp - 5);
                setBoss({ ...boss, currentHp: newHp });
                updateBossHpBar(newHp, boss.totalHp);

                // Si nuestra predicción local indica que el jefe ha muerto, terminamos la partida ya (victoria)
                if (newHp === 0) {
                    endGame();
                    return;
                }
            }

            nextQuestion();
        } else {
            // Respuesta incorrecta: el jugador recibe daño inmediato (10 HP) como penalización; si es Mago,
            // además recupera 10 de maná (mecanismo de "recargar maná respondiendo", incluso fallando)
            if (stats.rpgClass === 'Mago' || stats.rpgClass === 'Mage') {
                setStats(prev => ({ ...prev, mana: Math.min(prev.maxMana, prev.mana + 10) }));
            }
            takeDamage(10);
            nextQuestion();
        }
    };

    // Cierra la partida: detiene el ciclo de ataques, envía al backend el resultado del combate
    // (aciertos, maná consumido, curación de equipo aportada y HP final) para que calcule el daño real al jefe,
    // las recompensas y el botín, y muestra al jugador un resumen (victoria/derrota/retirada) con el botín obtenido
    const endGame = async (explicitHp?: number) => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (attackTimerRef.current) {
            clearTimeout(attackTimerRef.current);
            attackTimerRef.current = null;
        }
        if (!user || !boss) return;
        
        try {
            const hpValue = explicitHp !== undefined ? explicitHp : stats.hp;
            const res = await apiFetch('/api/bosses/attack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clanId: clanId || null,
                    bossId: boss.id,
                    userId: user.id,
                    rpgClass: stats.rpgClass,
                    correctAnswers: hitsRef.current,
                    manaConsumed: manaConsumedRef.current,
                    addedTeamHeal: healRef.current,
                    playerHp: hpValue
                })
            });
            const data = await res.json();
            if (res.ok) {
                setBoss({ ...boss, currentHp: data.currentHp, boss_level: data.bossLevel });
                updateBossHpBar(data.currentHp, boss.totalHp);
                
                // Construimos el texto de botín a partir de la lista que devuelve el backend (ya calculada con su propia
                // lógica de recompensas), formateando cada entrada como "- cantidad x nombre"
                let lootMsg = "";
                if (data.lootEarned && data.lootEarned.length > 0) {
                    lootMsg = `\n\n${t('battle.lootEarned')}\n` + data.lootEarned.map((l: any) => `- ${l.quantity}x ${l.name}`).join('\n');
                }

                // Elegimos el mensaje final según el desenlace: el jugador cayó derrotado, el jefe resucitó (fue derrotado por completo),
                // o simplemente el jugador se retiró tras infligir daño sin acabar con él
                if (isDead || stats.hp <= 0) {
                    Alert.alert(t('battle.fallenTitle'), `${t('battle.fallenDesc')}\n${t('battle.damageDealt', { damage: data.damageDealt })}${lootMsg}`);
                } else if (data.respawned) {
                    Alert.alert(t('battle.victoryTitle'), `${t('battle.victoryDesc')}\n${t('battle.damageInfliged', { damage: data.damageDealt })}${lootMsg}`);
                } else {
                    Alert.alert(t('battle.retreatTitle'), `${t('battle.retreatDesc')}\n${t('battle.damageInfliged', { damage: data.damageDealt })}${lootMsg}`);
                }
            }
        } catch (e) {
            console.error('Error submitting damage', e);
        }
    };

    if (isLoading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

    // Si no hay ningún jefe activo en este momento, mostramos una pantalla de "paz" en lugar del campo de batalla
    if (!boss) {
        return (
            <View style={styles.loadingContainer}>
                <Ionicons name="shield-checkmark" size={64} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16 }}>{t('battle.peaceTitle')}</Text>
                <Text style={{ color: theme.colors.textSecondary, marginTop: 8 }}>{t('battle.noActiveBoss')}</Text>
                <TouchableOpacity style={{ marginTop: 20 }} onPress={() => navigation.goBack()}>
                    <Text style={{ color: theme.colors.primary }}>{t('battle.backToCamp')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const hpWidth = hpAnimation.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    const playerHpWidth = playerHpAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    const manaWidth = manaAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    
    const bgFlash = screenFlash.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0,0,0,0)', 'rgba(255, 0, 0, 0.4)']
    });

    const bgFlashGreen = screenFlashGreen.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0,0,0,0)', 'rgba(0, 255, 0, 0.3)']
    });

    const isUnassigned = stats.rpgClass === 'unassigned';
    const isMage = stats.rpgClass === 'Mago' || stats.rpgClass === 'Mage';
    const isHealer = stats.rpgClass === 'Monje' || stats.rpgClass === 'Monk';
    const isWarrior = stats.rpgClass === 'Guerrero' || stats.rpgClass === 'Warrior';

    return (
        <Animated.View style={styles.container}>
            {/* Capas de destello (rojo al recibir daño, verde al acertar): no interactivas y siempre por encima del resto */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: bgFlash,      zIndex: 98 }]} />
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: bgFlashGreen, zIndex: 99 }]} />

            {/* Cabecera con botón de volver y título de la arena */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('battle.arenaTitle')}</Text>
            </View>

            {/* DURANTE EL COMBATE: layout compacto sin scroll para que toda la acción quepa en pantalla mientras se juega */}
            {isPlaying ? (
                <View style={styles.battleLayout}>

                    {/* Barra compacta del jefe: imagen, nombre, categoría y barra de HP en una fila horizontal */}
                    <View style={[styles.bossBar, boss.category === 'boss' && { borderColor: '#D69E2E' }]}>
                        <Animated.View style={{ transform: [{ translateX: bossShake }, { translateY: bossLunge }] }}>
                            {boss.imageUrl ? (
                                <Image source={{ uri: boss.imageUrl }} style={styles.bossImageSmall} />
                            ) : (
                                <View style={styles.bossImageSmallPlaceholder}>
                                    <Ionicons name="logo-octocat" size={34} color="#FF4B4B" />
                                </View>
                            )}
                        </Animated.View>
                        <View style={styles.bossBarInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                <Text style={styles.bossNameCompact} numberOfLines={1}>{boss.name}</Text>
                                <View style={[styles.categoryBadge, { marginLeft: 8 }]}>
                                    <Text style={styles.categoryText}>{boss.category?.toUpperCase() || t('battle.monster')}</Text>
                                </View>
                            </View>
                            <View style={styles.hpBarContainer}>
                                <Animated.View style={[styles.hpBarFill, { width: hpWidth }]} />
                                <Text style={styles.hpText}>{boss.currentHp}/{boss.totalHp} HP</Text>
                            </View>
                        </View>
                    </View>

                    {/* HUD del jugador: nombre, vida (en rojo si baja del 30%), racha de aciertos y barra de maná si es Mago */}
                    <View style={styles.playerHUD}>
                        <View style={styles.playerHUDRow}>
                            <Text style={styles.playerNameSmall} numberOfLines={1}>{user?.username || 'Héroe'}</Text>
                            <Text style={[styles.hpLabelSmall, stats.hp <= stats.maxHp * 0.3 && { color: '#F56565' }]}>
                                ❤ {stats.hp}/{stats.maxHp}
                            </Text>
                            <View style={styles.comboBadgeSmall}>
                                <Text style={styles.comboTextSmall}>{t('battle.hits', { count: correctHits })}</Text>
                            </View>
                        </View>
                        <View style={styles.playerHpBarBg}>
                            <Animated.View style={[
                                styles.playerHpBarFill,
                                { width: playerHpWidth },
                                stats.hp <= stats.maxHp * 0.3 && { backgroundColor: '#F56565' }
                            ]} />
                        </View>
                        {isMage && (
                            <View style={[styles.playerHpBarBg, { backgroundColor: '#1A202C', marginTop: 5 }]}>
                                <Animated.View style={[styles.playerHpBarFill, { width: manaWidth, backgroundColor: '#4299E1' }]} />
                            </View>
                        )}
                    </View>

                    {/* Pregunta + opciones de respuesta — ocupa el espacio vertical restante */}
                    {currentTerm ? (
                        <>
                            {/* Tarjeta de la pregunta: si el término es de tipo imagen pedimos adivinar la técnica, si es texto pedimos traducir */}
                            <View style={styles.questionCardCompact}>
                                {currentTerm.contentType === 'image' ? (
                                    <>
                                        <Text style={styles.questionLabelCompact}>{t('technique.guessPrompt')}</Text>
                                        {!!currentTerm.imageUrl && (
                                            <Image
                                                source={{ uri: currentTerm.imageUrl }}
                                                style={styles.questionImageCompact}
                                                resizeMode="contain"
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.questionLabelCompact}>{t('battle.translateLabel')}</Text>
                                        <Text style={styles.termCompact} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>
                                            {currentTerm.term}
                                        </Text>
                                    </>
                                )}
                            </View>

                            {/* Opciones de respuesta en cuadrícula 2×2: cada toque dispara handleAnswer con la opción elegida */}
                            <View style={styles.optionsGrid2x2}>
                                {options.map((opt, i) => (
                                    <TouchableOpacity key={i} style={styles.optionBtn2x2} onPress={() => handleAnswer(opt)}>
                                        <Text style={styles.optionText2x2} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
                                            {opt}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator color={theme.colors.primary} />
                        </View>
                    )}
                </View>

            ) : (
            /* ANTES DEL COMBATE (lobby): arena completa del jefe, selección de clase y botón de inicio */
                <ScrollView contentContainerStyle={styles.content}>

                    {/* Arena completa: imagen grande del jefe, nombre, categoría y barra de HP */}
                    <View style={[styles.arena, boss.category === 'boss' && { borderColor: '#D69E2E', borderWidth: 2 }]}>
                        <Animated.View style={{ transform: [{ translateX: bossShake }, { translateY: bossLunge }] }}>
                            {boss.imageUrl ? (
                                <Image source={{ uri: boss.imageUrl }} style={styles.bossImage} />
                            ) : (
                                <View style={styles.bossImagePlaceholder}>
                                    <Ionicons name="logo-octocat" size={80} color="#FF4B4B" />
                                </View>
                            )}
                        </Animated.View>
                        <View style={{ alignItems: 'center' }}>
                            <Text style={styles.bossName}>{boss.name}</Text>
                            <View style={styles.categoryBadge}>
                                <Text style={styles.categoryText}>{boss.category?.toUpperCase() || t('battle.monster')}</Text>
                            </View>
                        </View>
                        <View style={styles.hpBarContainer}>
                            <Animated.View style={[styles.hpBarFill, { width: hpWidth }]} />
                            <Text style={styles.hpText}>{boss.currentHp} / {boss.totalHp} HP</Text>
                        </View>
                    </View>

                    {/* Selector de clase RPG: solo se muestra si el jugador todavía no ha elegido ninguna (rpgClass === 'unassigned') */}
                    {isUnassigned && (
                        <View style={styles.classSelector}>
                            <Text style={styles.subtitle}>{t('battle.pickClass')}</Text>
                            <View style={styles.classGrid}>
                                <TouchableOpacity style={[styles.classCard, { borderColor: '#E53E3E' }]} onPress={() => pickClass('Guerrero')}>
                                    <Ionicons name="shield" size={32} color="#E53E3E" />
                                    <Text style={[styles.classTitle, { color: '#E53E3E' }]}>{t('battle.warrior')}</Text>
                                    <Text style={styles.classDesc}>{t('battle.warriorDesc')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.classCard, { borderColor: '#805AD5' }]} onPress={() => pickClass('Mago')}>
                                    <Ionicons name="flash" size={32} color="#805AD5" />
                                    <Text style={[styles.classTitle, { color: '#805AD5' }]}>{t('battle.mage')}</Text>
                                    <Text style={styles.classDesc}>{t('battle.mageDesc')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.classCard, { borderColor: '#38A169' }]} onPress={() => pickClass('Druida')}>
                                    <Ionicons name="leaf" size={32} color="#38A169" />
                                    <Text style={[styles.classTitle, { color: '#38A169' }]}>{t('battle.druid')}</Text>
                                    <Text style={styles.classDesc}>{t('battle.druidDesc')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.classCard, { borderColor: '#D69E2E' }]} onPress={() => pickClass('Monje')}>
                                    <Ionicons name="body" size={32} color="#D69E2E" />
                                    <Text style={[styles.classTitle, { color: '#D69E2E' }]}>{t('battle.monk')}</Text>
                                    <Text style={styles.classDesc}>{t('battle.monkDesc')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/* Sección de inicio: aparece una vez elegida la clase. Muestra la clase, selector de aura para Monjes,
                        aviso/atajo al campamento si el jugador está derrotado, y el botón para entrar en combate */}
                    {!isUnassigned && (
                        <View style={styles.startSection}>
                            <Text style={styles.classTag}>
                                {t('battle.classLabel')} <Text style={{ color: theme.colors.primary, textTransform: 'uppercase' }}>{stats.rpgClass}</Text>
                            </Text>
                            {isHealer && (
                                <View style={styles.auraSelector}>
                                    <Text style={styles.auraTitle}>{t('battle.protectionAura')}</Text>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity style={[styles.auraBtn, monkAura === 'personal' && styles.auraBtnActive]} onPress={() => setMonkAura('personal')}>
                                            <Text style={[styles.auraBtnText, monkAura === 'personal' && { color: '#FFF' }]}>{t('battle.self')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.auraBtn, monkAura === 'grupal' && styles.auraBtnActive]} onPress={() => setMonkAura('grupal')}>
                                            <Text style={[styles.auraBtnText, monkAura === 'grupal' && { color: '#FFF' }]}>{t('battle.group')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                            {stats.hp <= 0 && (
                                <View style={styles.healthWarning}>
                                    <Ionicons name="warning" size={20} color="#FFF" />
                                    <Text style={styles.healthWarningText}>
                                        ¡ESTÁS DERROTADO! Tu salud es 0. Ve al Campamento de Entrenamiento para recuperarte antes de volver a luchar.
                                    </Text>
                                </View>
                            )}
                            {stats.hp <= 0 && (
                                <TouchableOpacity
                                    style={styles.trainingCampBtn}
                                    onPress={() => navigation.navigate('GameHub', { user, activityType })}
                                >
                                    <Ionicons name="fitness" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.startBtnText}>{t('battle.goToTrainingCamp')}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.startBtn, stats.hp <= 0 && { opacity: 0.5 }]}
                                onPress={startGame}
                                disabled={stats.hp <= 0}
                            >
                                <Text style={styles.startBtnText}>{t('battle.enterBattle')}</Text>
                            </TouchableOpacity>
                            <Text style={styles.disclaimer}>{t('battle.battleDisclaimer')}</Text>
                        </View>
                    )}
                </ScrollView>
            )}
        </Animated.View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
    header: { padding: theme.spacing.l, paddingTop: Platform.OS === 'web' ? theme.spacing.l : theme.spacing.xl, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backButton: { padding: 4, marginRight: 16 },
    headerTitle: { ...theme.typography.header, fontSize: 20, color: theme.colors.text },
    content: { flexGrow: 1, alignItems: 'center', padding: theme.spacing.xl, paddingBottom: 40 },
    arena: { width: '100%', maxWidth: 600, alignItems: 'center', backgroundColor: theme.colors.surface, padding: 25, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20, elevation: 5 },
    bossImagePlaceholder: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#2A1C1C', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 3, borderColor: '#FF4B4B' },
    bossImage: { width: 130, height: 130, borderRadius: 65, marginBottom: 20, borderWidth: 3, borderColor: theme.colors.error },
    bossName: { fontSize: 24, fontWeight: '900', color: theme.colors.error, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    categoryBadge: { backgroundColor: '#4A5568', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, marginBottom: 15 },
    categoryText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    hpBarContainer: { width: '100%', height: 20, backgroundColor: '#333', borderRadius: 10, overflow: 'hidden', position: 'relative' },
    hpBarFill: { height: '100%', backgroundColor: theme.colors.error },
    hpText: { position: 'absolute', width: '100%', textAlign: 'center', color: '#FFF', fontWeight: 'bold', fontSize: 12, lineHeight: 20 },
    classSelector: { width: '100%', maxWidth: 800, marginTop: 10 },
    subtitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginBottom: 16, textAlign: 'center' },
    classGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
    classCard: { width: '45%', minWidth: 140, backgroundColor: theme.colors.surface, padding: 16, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
    classTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
    classDesc: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' },
    startSection: { alignItems: 'center', marginTop: 10, maxWidth: 600, width: '100%' },
    classTag: { fontSize: 16, color: theme.colors.textSecondary, marginBottom: 20, fontWeight: 'bold' },
    auraSelector: { width: '100%', marginBottom: 20, backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, alignItems: 'center' },
    auraTitle: { color: theme.colors.text, fontWeight: 'bold', marginBottom: 10 },
    auraBtn: { flex: 1, borderWidth: 2, borderColor: '#3182CE', padding: 8, borderRadius: 8, alignItems: 'center' },
    auraBtnActive: { backgroundColor: '#3182CE' },
    auraBtnText: { color: '#3182CE', fontWeight: 'bold', fontSize: 12 },
    startBtn: { backgroundColor: theme.colors.error, paddingVertical: 18, paddingHorizontal: 50, borderRadius: 35, elevation: 8, shadowColor: theme.colors.error, shadowOpacity: 0.5, shadowRadius: 10 },
    trainingCampBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30, marginBottom: 15, elevation: 6 },
    startBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    disclaimer: {
        ...theme.typography.caption,
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginTop: 10,
    },
    healthWarning: {
        backgroundColor: '#F56565',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginBottom: 15,
        gap: 10,
        borderWidth: 1,
        borderColor: '#FFF',
    },
    healthWarningText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        flex: 1,
    },
    gameSection: { width: '100%', maxWidth: 600, alignItems: 'center' },
    playerInfoBox: { width: '100%', backgroundColor: theme.colors.surface, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16 },
    playerName: { color: theme.colors.text, fontWeight: 'bold', fontSize: 16 },
    hpLabel: { color: '#48BB78', fontWeight: '900', fontSize: 16 },
    playerHpBarBg: { width: '100%', height: 10, backgroundColor: '#333', borderRadius: 5, overflow: 'hidden' },
    playerHpBarFill: { height: '100%', backgroundColor: '#48BB78' },
    comboBadge: { backgroundColor: theme.colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    comboText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 14 },
    questionCard: { width: '100%', backgroundColor: theme.colors.surface, padding: 35, borderRadius: 25, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: theme.colors.border },
    questionLabel: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
    term: { fontSize: 36, fontWeight: '900', color: theme.colors.text, textAlign: 'center' },
    optionsGrid: { width: '100%', flexDirection: 'column', gap: 12 },
    optionBtn: { width: '100%', backgroundColor: theme.colors.surface, padding: 18, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', elevation: 2 },
    optionText: { fontSize: 18, color: theme.colors.text, fontWeight: '600' },

    // ── Battle playing layout (no-scroll) ──────────────────────────────────
    battleLayout: {
        flex: 1,
        padding: 12,
        maxWidth: 600,
        alignSelf: 'center' as const,
        width: '100%',
    },

    // Barra de vida del jefe en formato compacto y horizontal
    bossBar: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 10,
        marginBottom: 8,
    },
    bossImageSmall: {
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 2,
        borderColor: theme.colors.error,
    },
    bossImageSmallPlaceholder: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: '#2A1C1C',
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        borderWidth: 2,
        borderColor: '#FF4B4B',
    },
    bossBarInfo: {
        flex: 1,
        marginLeft: 12,
    },
    bossNameCompact: {
        fontSize: 16,
        fontWeight: '900' as const,
        color: theme.colors.error,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        flex: 1,
    },

    // Estilos del HUD compacto del jugador (barra de vida/mana reducida durante el combate)
    playerHUD: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 10,
        marginBottom: 8,
    },
    playerHUDRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginBottom: 6,
        gap: 8,
    },
    playerNameSmall: {
        fontSize: 13,
        fontWeight: 'bold' as const,
        color: theme.colors.text,
        flex: 1,
    },
    hpLabelSmall: {
        fontSize: 13,
        fontWeight: '900' as const,
        color: '#48BB78',
    },
    comboBadgeSmall: {
        backgroundColor: theme.colors.primary + '25',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    comboTextSmall: {
        color: theme.colors.primary,
        fontWeight: 'bold' as const,
        fontSize: 12,
    },

    // Question card — flex: 1 to fill remaining space
    questionCardCompact: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        padding: 20,
        marginBottom: 8,
    },
    questionLabelCompact: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontWeight: 'bold' as const,
        marginBottom: 8,
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
    },
    termCompact: {
        fontSize: 28,
        fontWeight: '900' as const,
        color: theme.colors.text,
        textAlign: 'center' as const,
    },
    questionImageCompact: {
        width: '100%',
        flex: 1,
        borderRadius: 16,
        backgroundColor: theme.colors.background,
    },

    // 2×2 options grid
    optionsGrid2x2: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        justifyContent: 'space-between' as const,
    },
    optionBtn2x2: {
        width: '48.5%',
        backgroundColor: theme.colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        minHeight: 56,
        marginBottom: 8,
        padding: 10,
        elevation: 2,
    },
    optionText2x2: {
        fontSize: 15,
        color: theme.colors.text,
        fontWeight: '600' as const,
        textAlign: 'center' as const,
    },
});
