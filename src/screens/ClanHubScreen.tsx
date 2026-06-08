import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, Platform, Modal, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { apiFetch, getToken } from '../utils/apiFetch';
import { UserProfile } from '../types';
import io, { Socket } from 'socket.io-client';

export const ClanHubScreen = () => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const activityType = route.params?.activityType;
    const { theme } = useTheme();
    const styles = createStyles(theme);

    const [user, setUser] = useState<UserProfile | null>(null);
    const [clan, setClan] = useState<any>(null);
    const [allClans, setAllClans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Aqui controlamos qué pestaña del hub del clan está activa (chat, arena, lobbies, miembros o bóveda)
    const [activeTab, setActiveTab] = useState<'chat' | 'arena' | 'lobbies' | 'members' | 'vault'>('arena');

    // Estado del chat: historial de mensajes, texto del input y referencia al ScrollView para autoscroll
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const scrollViewRef = useRef<ScrollView>(null);

    // Estado del jefe de clan (boss) y de los lobbies/sala actual donde está metido el jugador
    const [boss, setBoss] = useState<any>(null);
    const [publicLobbies, setPublicLobbies] = useState<any[]>([]);
    const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null);

    // Visibilidad de los modales de creación de lobby y de confirmación de borrado de clan
    const [showLobbyModal, setShowLobbyModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Lista de miembros del clan (se rellena con fetchClanMembers, ordenada por nivel)
    const [clanMembers, setClanMembers] = useState<any[]>([]);

    // Estado de la bóveda del clan: objetos guardados, puntos del banco común y modal de depósito
    const [vaultItems, setVaultItems] = useState<any[]>([]);
    const [bankPoints, setBankPoints] = useState(0);
    const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');

    // Estado del reparto de recompensas (líder/oficial regala objetos o puntos del banco a un miembro)
    const [isGrantModalVisible, setIsGrantModalVisible] = useState(false);
    const [selectedVaultItem, setSelectedVaultItem] = useState<any | null>(null);
    const [isGrantingPoints, setIsGrantingPoints] = useState(false);
    const [pointsToGrant, setPointsToGrant] = useState('100');
    const [grantTargetMember, setGrantTargetMember] = useState<any | null>(null);

    // Estado de gestión de jerarquía: miembro seleccionado para ascender/degradar y visibilidad del menú de acciones
    const [selectedMemberActions, setSelectedMemberActions] = useState<any | null>(null);
    const [isActionModalVisible, setIsActionModalVisible] = useState(false);

    // Id del miembro pendiente de expulsión (controla el modal de confirmación de expulsión)
    const [kickTargetId, setKickTargetId] = useState<string | null>(null);

    const socketRef = useRef<Socket | null>(null);

    // Al montar la pantalla cargamos todos los datos del clan; al desmontar cerramos el socket para no dejar conexiones abiertas
    useEffect(() => {
        loadData();
        return () => {
             if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    // Punto de entrada de la pantalla: averigua si el usuario ya pertenece a un clan.
    // Si tiene clan, carga en paralelo el socket, el jefe activo, los lobbies, los miembros y la bóveda.
    // Si no tiene clan, en su lugar trae la lista de clanes disponibles para unirse (de su organización o del club global).
    const loadData = async () => {
        setLoading(true);
        try {
            const currentUser = await AuthService.getSavedUser();
            setUser(currentUser);
            if (!currentUser) return;

            // Consultamos a qué clan pertenece (si pertenece a alguno) este usuario
            const clanRes = await apiFetch(`/api/users/${currentUser.id}/clan`);
            const clanData = await clanRes.json();

            const GLOBAL_CLUB_ID = '00000000-0000-4000-a000-000000000000';
            if (clanData.clan) {
                setClan(clanData.clan);
                await initializeSocket(clanData.clan.clan_id, currentUser);
                await loadBossData(clanData.clan.clan_id);
                fetchPublicLobbies(clanData.clan.clan_id);
                fetchClanMembers(clanData.clan.clan_id);
                fetchVaultData(clanData.clan.clan_id);
            } else {
                // Sin clan propio: traemos los clanes de su organización (o el club global como respaldo) para que pueda unirse a uno
                const targetOrgId = currentUser.organizationId || GLOBAL_CLUB_ID;
                const allRes = await apiFetch(`/api/clubs/${targetOrgId}/clans`);
                const allData = await allRes.json();
                setAllClans(allData.clans || []);
            }
        } catch (e) { console.error('Error in clan hub:', e); }
        setLoading(false);
    };

    // Trae los lobbies públicos abiertos en el clan (salas a las que cualquier miembro puede unirse sin código)
    const fetchPublicLobbies = async (clanId: string) => {
        try {
            const res = await apiFetch(`/api/clans/${clanId}/lobbies`);
            const data = await res.json();
            if (data.success) {
                setPublicLobbies(data.lobbies);
            }
        } catch (e) { }
    };

    // Trae la lista de miembros del clan y la ordena de mayor a menor nivel para mostrar el ranking interno
    const fetchClanMembers = async (clanId: string) => {
        try {
            const res = await apiFetch(`/api/clans/${clanId}/members`);
            const data = await res.json();
            if (data.success) {
                // Orden descendente por nivel (los miembros sin nivel asignado se tratan como nivel 0)
                const sorted = data.members.sort((a: any, b: any) => (b.level || 0) - (a.level || 0));
                setClanMembers(sorted);
            }
        } catch (e) { }
    };

    // Marca a un miembro como objetivo de expulsión, lo que abre el modal de confirmación (no expulsa todavía)
    const handleKickMember = (memberId: string) => {
        if (!user || !clan) return;
        setKickTargetId(memberId);
    };

    // Ejecuta la expulsión confirmada: llama al backend, cierra el modal y refresca la lista de miembros si tiene éxito
    const confirmKick = async () => {
        if (!user || !clan || !kickTargetId) return;
        try {
            const res = await apiFetch(
                `/api/clans/${clan.clan_id}/members/${kickTargetId}?userId=${user.id}`,
                { method: 'DELETE' }
            );
            setKickTargetId(null);
            if (res.ok) {
                fetchClanMembers(clan.clan_id);
            } else {
                const data = await res.json().catch(() => ({}));
                Alert.alert(t('common.error'), data.error || t('clan.kickError'));
            }
        } catch (e) {
            Alert.alert(t('common.error'), t('common.serverError'));
        }
    };

    // Permite al líder cambiar el nombre o el logo del clan mediante un prompt nativo, y envía el cambio (PUT) al backend
    const handleUpdateClan = async (type: 'name' | 'logo') => {
        if (!user || !clan) return;
        const typeLabel = type === 'name' ? t('clan.updateName') : t('clan.updateIcon');
        const newValue = prompt(t('clan.updateLabel', { type: typeLabel }), type === 'name' ? clan.name : (clan.logo || ''));
        if (!newValue) return;
        try {
            const body = type === 'name' ? { name: newValue } : { logo: newValue };
            const res = await apiFetch(`/api/clans/${clan.clan_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, ...body })
            });
            if (res.ok) loadData(); // Recargamos los datos para reflejar el nuevo nombre/logo del clan
            else Alert.alert(t('common.error'), t('clan.updateError'));
        } catch(e) { Alert.alert(t('common.error'), t('common.serverError')); }
    };

    // Crea (si no existe) la conexión websocket compartida del clan, se une a la sala del clan
    // y registra los listeners de chat/lobbies/batalla que mantienen sincronizada la UI en tiempo real
    const initializeSocket = async (clanId: string, currentUser: UserProfile) => {
        if (!socketRef.current) {
            const token = await getToken();
            const authOpts = { auth: { token } };
            // En web usamos ruta relativa (coincide con el host automáticamente); en nativo apuntamos al servidor local explícito
            socketRef.current = Platform.OS === 'web' ? io(authOpts) : io('http://localhost:8080', authOpts);
        }
        const socket = socketRef.current;

        // Avisamos al servidor que este usuario entra en la sala de socket del clan (recibirá sus eventos)
        socket.emit('join_clan', clanId);

        // Cargamos el historial de chat ya guardado en BBDD antes de empezar a recibir mensajes en vivo
        apiFetch(`/api/clans/${clanId}/chat`).then(r => r.json()).then(d => {
            if (d.success) setMessages(d.messages);
        });

        // Nuevo mensaje de chat del clan: lo añadimos al historial y bajamos el scroll al final tras el render
        socket.on('new_message', (msg) => {
            setMessages(prev => [...prev, msg]);
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        });

        // Cambió la lista de lobbies públicos del clan (se creó/cerró alguno): refrescamos desde la API
        socket.on('lobbies_updated', () => {
            fetchPublicLobbies(clanId);
        });

        // Se acaba de crear un lobby (propio o de otro miembro que nos invita): guardamos su id y nos vamos a la pestaña Arena
        socket.on('lobby_created', (lobby) => {
            setCurrentLobbyId(lobby.id);
            setActiveTab('arena');
        });

        // Actualización del lobby actual: si sigue existiendo guardamos su id, si se disolvió limpiamos el estado
        socket.on('lobby_update', (lobby) => {
            if (lobby) setCurrentLobbyId(lobby.id);
            else setCurrentLobbyId(null);
        });

        // El servidor avisa que la batalla va a comenzar: navegamos a la pantalla de combate contra el jefe del clan
        socket.on('game_starting', () => {
            navigation.navigate('ClanBossBattle', { lobbyId: currentLobbyId, clanId, activityType });
        });

        // Error de lobby (código inválido, sala llena, etc.): lo mostramos al usuario en una alerta
        socket.on('lobby_error', (err) => {
            Alert.alert(t('common.error'), err);
        });
    };

    // Consulta si el clan tiene un jefe (boss) activo actualmente y guarda sus datos (HP, nivel, nombre) para la pestaña Arena
    const loadBossData = async (clanId: string) => {
        try {
            const res = await apiFetch(`/api/clans/${clanId}/bosses/active`);
            if (res.ok) {
                const data = await res.json();
                setBoss(data.boss);
            }
        } catch (e) { console.log(e); }
    };

    // --- Gestión del clan: crear, unirse, abandonar y eliminar ---
    // Pide el nombre por prompt y solicita al backend crear un clan nuevo dentro de la organización del usuario
    const createClan = async () => {
        const name = prompt(t('clan.createPrompt'));
        if (!name || !user) return;
        try {
            const res = await apiFetch(`/api/clubs/${user.organizationId}/clans`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, userId: user.id })
            });
            if (res.ok) loadData();
        } catch (e) { Alert.alert(t('common.error'), t('common.serverError')); }
    };

    // Solicita unirse a un clan existente; si el backend lo acepta, recargamos todos los datos del hub
    const joinClan = async (clanId: string) => {
        if (!user) return;
        try {
            const res = await apiFetch(`/api/clans/${clanId}/join`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId: user.id })
            });
            if (res.ok) loadData();
            else Alert.alert(t('common.error'), t('clan.joinError'));
        } catch (e) { Alert.alert(t('common.error'), t('common.serverError')); }
    };

    // Tras confirmar, abandona el clan: limpia el estado local, desconecta el socket y vuelve a cargar (mostrará la lista de clanes)
    const leaveClan = async () => {
        if (!user || !clan) return;
        if (confirm(t('clan.leaveConfirm'))) {
            try {
                const res = await apiFetch(`/api/clans/${clan.clan_id}/leave`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ userId: user.id })
                });
                const data = await res.json();
                if (res.ok) {
                    setClan(null);
                    socketRef.current?.disconnect();
                    socketRef.current = null;
                    loadData();
                } else Alert.alert(t('common.warning'), data.error);
            } catch (e) { Alert.alert(t('common.error'), t('common.serverError')); }
        }
    };

    // Abre el modal de confirmación de borrado (solo disponible para el líder); el borrado real ocurre en confirmDeleteClan
    const requestDeleteClan = () => {
        if (!user || !clan) return;
        setShowDeleteModal(true);
    };

    // Borra el clan definitivamente (DELETE al backend), limpia el estado local y desconecta el socket si tiene éxito
    const confirmDeleteClan = async () => {
        if (!user || !clan) return;
        setShowDeleteModal(false);
        try {
            const res = await apiFetch(`/api/clans/${clan.clan_id}?userId=${user.id}`, { method: 'DELETE' });
            if (res.ok) {
                setClan(null);
                socketRef.current?.disconnect();
                socketRef.current = null;
                loadData();
            } else {
                const data = await res.json();
                Alert.alert(t('common.error'), data.error || t('common.serverError'));
            }
        } catch (e) { Alert.alert(t('common.error'), t('common.serverError')); }
    };

    // Envía el mensaje de chat actual por el socket (el servidor lo retransmitirá a todos como evento 'new_message') y limpia el input
    const sendMessage = () => {
        if (!inputText.trim() || !user || !clan || !socketRef.current) return;
        socketRef.current.emit('send_message', {
            clanId: clan.clan_id,
            userId: user.id,
            userName: user.username,
            message: inputText.trim()
        });
        setInputText('');
    };

    // --- Acciones sobre lobbies (salas de combate previas a la batalla contra el jefe) ---
    // Pide al servidor crear un nuevo lobby (público o privado) vía socket; el evento 'lobby_created' actualizará el estado local
    const createLobby = (isPublic: boolean) => {
        setShowLobbyModal(false);
        if (!socketRef.current || !user || !clan) return;
        socketRef.current.emit('create_lobby', {
            clanId: clan.clan_id,
            userId: user.id,
            userName: user.username,
            isPublic,
            rpgClass: user.rpgClass || 'unassigned' // El servidor pedirá elegir aura/clase más adelante si hace falta
        });
    };

    // Une al usuario a un lobby por código (recibido como parámetro o pedido por prompt); pasamos a la pestaña Arena al solicitarlo
    const joinLobbyCode = (codePrefix?: string) => {
        if (!socketRef.current || !user || !clan) return;
        const code = codePrefix || prompt(t('clan.lobbyCodePrompt'));
        if (code) {
            socketRef.current.emit('join_lobby', {
                lobbyId: code.toUpperCase(),
                userId: user.id,
                userName: user.username,
                rpgClass: user.rpgClass || 'unassigned',
                clanId: clan.clan_id
            });
            setActiveTab('arena');
        }
    };

    // El líder del lobby pide al servidor sincronizar el inicio de la partida para todos los miembros conectados a esa sala
    const startGameSync = () => {
        if (currentLobbyId && socketRef.current) {
            socketRef.current.emit('start_game_sync', currentLobbyId);
        }
    };

    // Atajo para enfrentarse al jefe en solitario: simplemente crea un lobby privado solo para el usuario actual
    const startSolo = () => {
        if (!clan) return;
        createLobby(false);
    };

    // Trae el contenido de la bóveda común del clan: objetos almacenados y puntos depositados en el banco
    const fetchVaultData = async (clanId: string) => {
        try {
            const res = await apiFetch(`/api/clans/${clanId}/vault`);
            const data = await res.json();
            if (data.success) {
                setVaultItems(data.inventory);
                setBankPoints(data.bankPoints);
            }
        } catch (e) { }
    };

    // El líder asciende o degrada a un miembro entre 'member' y 'officer'; al confirmar, cierra el menú y refresca la lista
    const handlePromoteMember = async (memberUserId: string, newRole: 'member' | 'officer') => {
        if (!user || !clan) return;
        try {
            const res = await apiFetch(`/api/clans/${clan.clan_id}/members/${memberUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newRole })
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert("Éxito", "Rango actualizado correctamente.");
                setIsActionModalVisible(false);
                fetchClanMembers(clan.clan_id);
            } else {
                Alert.alert("Error", data.error);
            }
        } catch (e) {
            Alert.alert("Error", "No se pudo actualizar el rango.");
        }
    };

    // Reparte fondos o un objeto de la bóveda del clan a un miembro concreto: arma el body según el modo
    // (isGrantingPoints decide si se envía amountPoints o itemId) y, si tiene éxito, refresca la bóveda
    const handleGrantVault = async () => {
        if (!user || !clan || !grantTargetMember) return;
        try {
            const body = isGrantingPoints
                ? { userId: user.id, targetUserId: grantTargetMember.user_id, amountPoints: parseInt(pointsToGrant) }
                : { userId: user.id, targetUserId: grantTargetMember.user_id, itemId: selectedVaultItem.item_id };

            const res = await apiFetch(`/api/clans/${clan.clan_id}/vault/grant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert("Éxito", "Recompensa entregada.");
                setIsGrantModalVisible(false);
                setGrantTargetMember(null);
                fetchVaultData(clan.clan_id);
            } else {
                Alert.alert("Error", data.error);
            }
        } catch (e) {
            Alert.alert("Error", "No se pudo entregar la recompensa.");
        }
    };

    // El miembro deposita parte de sus puntos personales en el banco común del clan; al confirmar limpia el formulario y refresca la bóveda
    const handleDepositOro = async () => {
        if (!user || !clan || !depositAmount) return;
        try {
            const res = await apiFetch(`/api/clans/${clan.clan_id}/vault/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    amountPoints: parseInt(depositAmount)
                })
            });
            const data = await res.json();
            if (data.success) {
                setIsDepositModalVisible(false);
                setDepositAmount('');
                fetchVaultData(clan.clan_id);
                Alert.alert("Éxito", `Has depositado ${depositAmount} pts`);
            } else {
                Alert.alert("Error", data.error || "No se pudo realizar el depósito");
            }
        } catch (e) { }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;

    // Vista cuando el usuario todavía no pertenece a ningún clan: invita a fundar uno nuevo o a unirse a uno de la lista (allClans)
    if (!clan) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('clan.campTitle')}</Text>
                </View>
                <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
                    <View style={styles.noClanHero}>
                        <Ionicons name="shield-half" size={80} color="#FFF" style={{ marginBottom: 10 }} />
                        <Text style={styles.noClanTitle}>{t('clan.forgeLegend')}</Text>
                        <Text style={styles.noClanDesc}>{t('clan.clanDesc')}</Text>
                        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#F6E05E', marginTop: 20 }]} onPress={createClan}>
                            <Text style={[styles.primaryBtnText, { color: '#000' }]}>{t('clan.foundClan')}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('clan.clansRecruiting', { count: allClans.length })}</Text>
                        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
                    </View>
                    
                    {allClans.length === 0 ? (
                        <Text style={{color: theme.colors.textSecondary, marginTop: 20}}>{t('clan.noClans')}</Text>
                    ) : (
                        allClans.map(c => (
                            <View key={c.clan_id} style={styles.modernCard}>
                                <View style={styles.modernCardIcon}>
                                    <Ionicons name="flag" size={24} color="#FFF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.clanName}>{c.name}</Text>
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{t('clan.openForAll')}</Text>
                                </View>
                                <TouchableOpacity style={styles.joinBtn} onPress={() => joinClan(c.clan_id)}>
                                    <Text style={styles.joinBtnText}>{t('clan.join')}</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    }

    // Vista principal con clan: cabecera + pestañas (chat, arena, lobbies, miembros, bóveda) y sus modales asociados
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('clan.clanPrefix', { defaultValue: 'Clan' })}: {clan.name}</Text>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => {
                    clan.role === 'leader' ? setShowDeleteModal(true) : leaveClan();
                }}>
                    <Ionicons name={clan.role === 'leader' ? "trash-outline" : "exit-outline"} size={24} color={theme.colors.error} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'chat' && styles.tabActive]} onPress={() => setActiveTab('chat')}>
                    <Ionicons name="chatbubbles" size={18} color={activeTab === 'chat' ? theme.colors.primary : theme.colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'chat' && { color: theme.colors.primary }]}>{t('clan.chat')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'arena' && styles.tabActive]} onPress={() => setActiveTab('arena')}>
                    <Ionicons name="skull" size={18} color={activeTab === 'arena' ? theme.colors.error : theme.colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'arena' && { color: theme.colors.error }]}>{t('clan.arena')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'lobbies' && styles.tabActive]} onPress={() => setActiveTab('lobbies')}>
                    <Ionicons name="people" size={18} color={activeTab === 'lobbies' ? '#3182CE' : theme.colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'lobbies' && { color: '#3182CE' }]}>{t('clan.community', { count: publicLobbies.length })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'members' && styles.tabActive]} onPress={() => setActiveTab('members')}>
                    <Ionicons name="person-circle" size={18} color={activeTab === 'members' ? theme.colors.primary : theme.colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'members' && { color: theme.colors.primary }]}>{t('clan.members')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'vault' && styles.tabActive]} onPress={() => setActiveTab('vault')}>
                    <Ionicons name="briefcase" size={18} color={activeTab === 'vault' ? '#D69E2E' : theme.colors.textSecondary} />
                    <Text style={[styles.tabText, activeTab === 'vault' && { color: '#D69E2E' }]}>Bóveda</Text>
                </TouchableOpacity>
            </View>

            {/* Pestaña de chat: historial de mensajes del clan en tiempo real más la barra de envío */}
            {activeTab === 'chat' && (
                <View style={{ flex: 1 }}>
                    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.chatList}>
                        <View style={styles.chatAnnounce}>
                            <Text style={styles.chatAnnounceText}>{t('clan.welcomeChat', { name: clan.name })}</Text>
                        </View>
                        {messages.map((m, i) => (
                            <View key={i} style={[styles.messageBubble, m.user_id === user?.id ? styles.myMessage : styles.theirMessage]}>
                                {m.user_id !== user?.id && <Text style={styles.msgUser}>{m.user_name}</Text>}
                                <Text style={styles.msgText}>{m.message}</Text>
                            </View>
                        ))}
                    </ScrollView>
                    <View style={styles.chatInputBox}>
                        <TextInput 
                            style={styles.input} 
                            placeholder={t('clan.typeMessage')} 
                            placeholderTextColor={theme.colors.textSecondary}
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={sendMessage}
                        />
                        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                            <Ionicons name="send" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Pestaña de Arena: muestra el jefe activo (con su barra de HP) y las opciones para crear/unirse a un lobby de combate */}
            {activeTab === 'arena' && (
                <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
                    {boss ? (
                        <View style={styles.bossBanner}>
                            <Text style={styles.bossLevelTag}>{t('clan.mythicLevel', { level: boss.bossLevel || 1 })}</Text>
                            <Text style={styles.bossTitle}>{boss.name}</Text>
                            <View style={styles.hpBar}>
                                <View style={[styles.hpFill, { width: `${Math.max(0, (boss.currentHp / boss.totalHp) * 100)}%` }]} />
                            </View>
                            <Text style={styles.hpText}>{boss.currentHp} / {boss.totalHp} {t('clan.hpRemaining')}</Text>
                        </View>
                    ) : (
                        <View style={[styles.bossBanner, { borderColor: theme.colors.border }]}>
                            <Ionicons name="sparkles" size={48} color="#FCC" style={{marginBottom: 10}} />
                            <Text style={{ textAlign: 'center', color: theme.colors.text, fontSize: 18, fontWeight: 'bold' }}>{t('clan.arenaUnderConstruction')}</Text>
                            <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 8 }}>{t('clan.noActiveBoss')}</Text>
                        </View>
                    )}

                    <View style={styles.lobbyArea}>
                        {currentLobbyId ? (
                            <View style={[styles.activeLobbyBox, { shadowColor: theme.colors.primary, elevation: 8 }]}>
                                <Text style={styles.lobbyTitle}>{t('clan.tacticalSquad')}</Text>
                                <Text style={styles.lobbyCode}>{t('clan.code', { code: currentLobbyId })}</Text>
                                <Text style={styles.lobbyDesc}>{t('clan.shareCode')}</Text>
                                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.error, marginTop: 25 }]} onPress={startGameSync}>
                                    <Text style={[styles.primaryBtnText, { fontSize: 18, fontWeight: '900' }]}>{t('clan.startFall')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={{ width: '100%', gap: 14, alignItems: 'center' }}>
                                <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowLobbyModal(true)}>
                                    <Ionicons name="add-circle" size={20} color="#FFF" style={{marginRight: 8}} />
                                    <Text style={styles.primaryBtnText}>{t('clan.createSquad')}</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#2C5282' }]} onPress={() => joinLobbyCode()}>
                                    <Ionicons name="key" size={20} color="#FFF" style={{marginRight: 8}} />
                                    <Text style={styles.primaryBtnText}>{t('clan.privateCode')}</Text>
                                </TouchableOpacity>

                                {/* Aqui se permite atacar al jefe en solitario, creando un lobby privado solo para uno mismo */}
                                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.primary }]} onPress={startSolo}>
                                    <Ionicons name="person" size={20} color={theme.colors.primary} style={{marginRight: 8}} />
                                    <Text style={[styles.primaryBtnText, { color: theme.colors.primary }]}>{t('clan.attackSolo')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}

            {/* Pestaña de Lobbies: lista de salas públicas abiertas en el clan a las que cualquiera puede unirse directamente */}
            {activeTab === 'lobbies' && (
                 <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
                     <View style={[styles.sectionHeader, {width: '100%', maxWidth: 600}]}>
                         <Text style={styles.sectionTitle}>{t('clan.publicSquads', { count: publicLobbies.length })}</Text>
                         <TouchableOpacity onPress={() => fetchPublicLobbies(clan.clan_id)}>
                             <Ionicons name="refresh" size={24} color={theme.colors.primary} />
                         </TouchableOpacity>
                     </View>

                     {publicLobbies.length === 0 ? (
                         <View style={{marginTop: 40, alignItems: 'center'}}>
                            <Ionicons name="telescope-outline" size={60} color={theme.colors.border} />
                            <Text style={{color: theme.colors.textSecondary, marginTop: 16}}>{t('clan.noPublicSquads')}</Text>
                            <TouchableOpacity style={{marginTop: 10}} onPress={() => setActiveTab('arena')}>
                                <Text style={{color: theme.colors.primary, fontWeight: 'bold'}}>{t('clan.createOneArena')}</Text>
                            </TouchableOpacity>
                         </View>
                     ) : (
                         <View style={{ width: '100%', maxWidth: 600 }}>
                            {publicLobbies.map(lobby => (
                                <View key={lobby.id} style={styles.modernCard}>
                                    <View style={[styles.modernCardIcon, { backgroundColor: '#3182CE' }]}>
                                        <Ionicons name="people" size={24} color="#FFF" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.clanName}>{t('clan.squadNumber', { id: lobby.id })}</Text>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{t('clan.playersWaiting', { count: lobby.players?.length || 1 })}</Text>
                                    </View>
                                    <TouchableOpacity style={[styles.joinBtn, { backgroundColor: '#3182CE' }]} onPress={() => joinLobbyCode(lobby.id)}>
                                        <Text style={styles.joinBtnText}>{t('clan.join')}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                         </View>
                     )}
                 </ScrollView>
            )}

            {/* Pestaña de Miembros: ranking del clan ordenado por nivel, con controles de gestión para líderes y oficiales */}
            {activeTab === 'members' && (
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t('clan.membersCount', { count: clanMembers.length })}</Text>
                    </View>

                    {/* Estos botones de administración (cambiar nombre, banner, eliminar clan) solo aparecen si el usuario actual es el líder */}
                    {clanMembers.find(m => m.user_id === user?.id)?.role === 'leader' && (
                        <View style={{ marginBottom: 25, backgroundColor: theme.colors.surface + '80', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border }}>
                            <Text style={{ color: theme.colors.text, fontWeight: 'bold', marginBottom: 12, fontSize: 16 }}>{t('clan.adminActions')}</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#48BB78' }]} onPress={() => handleUpdateClan('name')}>
                                    <Ionicons name="pencil" size={18} color="#fff" style={{ marginRight: 6 }} />
                                    <Text style={styles.primaryBtnText}>{t('clan.updateName')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#3182CE' }]} onPress={() => handleUpdateClan('logo')}>
                                    <Ionicons name="image" size={18} color="#fff" style={{ marginRight: 6 }} />
                                    <Text style={styles.primaryBtnText}>{t('clan.banner')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#E53E3E' }]} onPress={() => setShowDeleteModal(true)}>
                                    <Ionicons name="trash" size={18} color="#fff" style={{ marginRight: 6 }} />
                                    <Text style={styles.primaryBtnText}>{t('clan.deleteClan')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    <View style={{ gap: 8, marginTop: 10 }}>
                        {clanMembers.map((member, index) => {
                            const isLeader   = member.role === 'leader';
                            const isOfficer  = member.role === 'officer';
                            const myRole     = clanMembers.find(m => m.user_id === user?.id)?.role;
                            const amILeader  = myRole === 'leader';
                            const amIOfficer = myRole === 'officer';
                            const isMe       = member.user_id === user?.id;
                            // Reglas de permisos de expulsión: el líder puede expulsar a oficiales y miembros;
                            // un oficial solo puede expulsar a miembros normales (nunca a otro oficial ni al líder, ni a sí mismo)
                            const canIKick   = !isMe && !isLeader &&
                                               (amILeader || (amIOfficer && !isOfficer));

                            // Alterna el color de fondo entre filas pares e impares para que la lista se lea mejor (efecto cebra)
                            const isEven = index % 2 === 0;
                            const bgColor = isEven ? theme.colors.surface : theme.colors.background;

                            return (
                                // Usamos un View simple (no una tarjeta pulsable) para que las pulsaciones sobre los botones internos no sean "absorbidas" por el contenedor
                                <View
                                    key={member.user_id}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: bgColor,
                                        paddingVertical: 10,
                                        paddingHorizontal: 12,
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        shadowColor: '#000',
                                        shadowOpacity: 0.05,
                                        shadowRadius: 2,
                                        elevation: 1
                                    }}
                                >
                                    {/* Posición en el ranking del clan (1º, 2º...), calculada por el índice del array ya ordenado por nivel */}
                                    <View style={{ width: 30, alignItems: 'center' }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontWeight: 'bold', fontSize: 16 }}>{index + 1}.</Text>
                                    </View>

                                    {/* Insignia de nivel: escudo con el número de nivel superpuesto, en dorado para el líder y azul para el resto */}
                                    <View style={{ width: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                        <Ionicons name="shield" size={36} color={isLeader ? "#D69E2E" : "#3182CE"} />
                                        <Text style={{ position: 'absolute', color: '#FFF', fontWeight: '900', fontSize: 14 }}>
                                            {member.level || 1}
                                        </Text>
                                    </View>

                                    {/* Foto de perfil del miembro; si no tiene, mostramos un icono genérico de persona como respaldo */}
                                    <View style={{ marginHorizontal: 10 }}>
                                    {member.profile_picture ? (
                                        <Image source={{ uri: member.profile_picture }} style={{ width: 42, height: 42, borderRadius: 8, borderWidth: 1, borderColor: '#555' }} />
                                    ) : (
                                        <View style={{ width: 42, height: 42, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                                            <Ionicons name="person" size={24} color={theme.colors.textSecondary} />
                                        </View>
                                    )}
                                    </View>

                                    {/* Nombre del miembro (con etiqueta "Tú" si es el usuario actual), su rango y su clase RPG si la tiene */}
                                    <View style={{ flex: 1, justifyContent: 'center' }}>
                                        <Text style={{ color: theme.colors.text, fontWeight: 'bold', fontSize: 17, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 1 }}>
                                            {member.username || member.name} {isMe && <Text style={{color: theme.colors.primary, fontSize: 12}}> ({t('common.you', { defaultValue: 'Tú' })})</Text>}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ color: isLeader ? '#D69E2E' : member.role === 'officer' ? "#805AD5" : theme.colors.textSecondary, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                {isLeader ? 'Líder' : member.role === 'officer' ? 'Oficial' : 'Miembro'}
                                            </Text>
                                            {member.rpg_class && (
                                                <View style={{ backgroundColor: theme.colors.primary + '30', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                                                    <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: 'bold' }}>{member.rpg_class}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    {/* Repetimos la clase RPG aquí como columna independiente, con la etiqueta "Clase Mágica"/"Novato" si no tiene */}
                                    <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginBottom: 2 }}>{t('clan.magicClass')}</Text>
                                        <Text style={{ color: theme.colors.text, fontWeight: 'bold', fontSize: 14 }}>
                                            {member.rpg_class || t('clan.novice')}
                                        </Text>
                                    </View>

                                    {/* Botones de acción — cada uno es un touchable independiente para que no haya conflicto de toques anidados */}
                                    {(amILeader || amIOfficer) && !isMe && (
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {/* Gestión (ascender/degradar) — visible solo para el líder */}
                                            {amILeader && (
                                                <TouchableOpacity
                                                    onPress={() => { setSelectedMemberActions(member); setIsActionModalVisible(true); }}
                                                    style={{ padding: 8, backgroundColor: theme.colors.surface, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
                                                >
                                                    <Ionicons name="settings-outline" size={18} color={theme.colors.textSecondary} />
                                                </TouchableOpacity>
                                            )}
                                            {/* Expulsar — visible solo cuando canIKick lo permite según el rol del miembro y el del usuario actual */}
                                            {canIKick && (
                                                <TouchableOpacity
                                                    onPress={() => handleKickMember(member.user_id)}
                                                    style={{ padding: 8, backgroundColor: '#E53E3E', borderRadius: 6 }}
                                                >
                                                    <Ionicons name="person-remove-outline" size={18} color="#FFF" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            )}

            {/* Aqui se elige la visibilidad del lobby a crear: público (cualquiera del clan puede unirse) o privado (solo con código) */}
            <Modal visible={showLobbyModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                         <Text style={styles.modalTitle}>{t('clan.createSquad')}</Text>
                         <Text style={{color: theme.colors.textSecondary, marginBottom: 20, textAlign: 'center'}}>
                            {t('clan.lobbyVisibilityPrompt')}
                         </Text>
                         <TouchableOpacity style={styles.primaryBtn} onPress={() => createLobby(true)}>
                             <Ionicons name="globe" size={20} color="#FFF" style={{marginRight: 8}} />
                             <Text style={styles.primaryBtnText}>{t('clan.publicGroup')}</Text>
                         </TouchableOpacity>
                         <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#4A5568', marginTop: 12 }]} onPress={() => createLobby(false)}>
                             <Ionicons name="lock-closed" size={20} color="#FFF" style={{marginRight: 8}} />
                             <Text style={styles.primaryBtnText}>{t('clan.privateGroup')}</Text>
                         </TouchableOpacity>
                         <TouchableOpacity style={{marginTop: 20}} onPress={() => setShowLobbyModal(false)}>
                             <Text style={{color: theme.colors.error, fontWeight: 'bold'}}>{t('common.cancel')}</Text>
                         </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Confirmación de eliminación del clan: acción irreversible, solo accesible para el líder */}
            <Modal visible={showDeleteModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                         <Ionicons name="warning" size={48} color={theme.colors.error} style={{marginBottom: 10}} />
                         <Text style={styles.modalTitle}>{t('clan.deleteClan')}</Text>
                         <Text style={{color: theme.colors.textSecondary, marginBottom: 20, textAlign: 'center'}}>
                            {t('clan.deleteConfirm')}
                         </Text>
                         <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
                             <TouchableOpacity style={[styles.cancelBtn, {flex: 1}]} onPress={() => setShowDeleteModal(false)}>
                                 <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                             </TouchableOpacity>
                             <TouchableOpacity style={[styles.primaryBtn, {flex: 1, backgroundColor: '#E53E3E'}]} onPress={confirmDeleteClan}>
                                 <Text style={styles.primaryBtnText}>{t('common.confirm')}</Text>
                             </TouchableOpacity>
                         </View>
                    </View>
                </View>
            </Modal>
            {/* VAULT TAB */}
            {activeTab === 'vault' && (
                <View style={{ flex: 1 }}>
                    <View style={styles.vaultHeader}>
                        <View style={styles.bankBox}>
                            <Ionicons name="diamond" size={24} color="#D69E2E" />
                            <View style={{ marginLeft: 12 }}>
                                <Text style={styles.bankLabel}>Banco del Clan</Text>
                                <Text style={styles.bankValue}>{bankPoints} pts</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[styles.distributeBtn, { backgroundColor: '#4A5568' }]} onPress={() => setIsDepositModalVisible(true)}>
                                <Text style={styles.distributeBtnText}>Depositar</Text>
                            </TouchableOpacity>
                            {/* El botón de repartir fondos solo se muestra a líderes y oficiales (control de permisos por rol) */}
                            {(clanMembers.find(m => m.user_id === user?.id)?.role === 'leader' || clanMembers.find(m => m.user_id === user?.id)?.role === 'officer') && (
                                <TouchableOpacity style={styles.distributeBtn} onPress={() => {
                                    setIsGrantingPoints(true);
                                    setIsGrantModalVisible(true);
                                }}>
                                    <Text style={styles.distributeBtnText}>Repartir Fondos</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 15 }]}>Almacén de Objetos</Text>
                        <View style={styles.vaultGrid}>
                            {vaultItems.length === 0 ? (
                                <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>El almacén está vacío.</Text>
                            ) : (
                                vaultItems.map(item => (
                                    <View key={item.item_id} style={styles.vaultItemCard}>
                                        <Image source={{ uri: item.imageUrl }} style={styles.vaultItemImg} />
                                        <View style={styles.vaultItemInfo}>
                                            <Text style={styles.vaultItemName} numberOfLines={1}>{item.name}</Text>
                                            <Text style={styles.vaultItemQty}>Cant: {item.quantity}</Text>
                                        </View>
                                        {(clanMembers.find(m => m.user_id === user?.id)?.role === 'leader' || clanMembers.find(m => m.user_id === user?.id)?.role === 'officer') && (
                                            <TouchableOpacity 
                                                style={styles.grantBtn}
                                                onPress={() => {
                                                    setSelectedVaultItem(item);
                                                    setIsGrantingPoints(false);
                                                    setIsGrantModalVisible(true);
                                                }}
                                            >
                                                <Ionicons name="gift" size={16} color="#FFF" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))
                            )}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* Aqui mostramos el menú de gestión de un miembro: ascender/degradar de rango o expulsarlo del clan */}
            <Modal visible={isActionModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.actionMenu}>
                        <Text style={styles.menuTitle}>Gestión: {selectedMemberActions?.username}</Text>
                        
                        <TouchableOpacity 
                            style={styles.menuItem} 
                            onPress={() => handlePromoteMember(selectedMemberActions.user_id, selectedMemberActions.role === 'officer' ? 'member' : 'officer')}
                        >
                            <Ionicons name="star" size={20} color="#D69E2E" />
                            <Text style={styles.menuItemText}>{selectedMemberActions?.role === 'officer' ? 'Degradar a Miembro' : 'Ascender a Oficial'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => {
                            setIsActionModalVisible(false);
                            handleKickMember(selectedMemberActions.user_id);
                        }}>
                            <Ionicons name="trash" size={20} color={theme.colors.error} />
                            <Text style={[styles.menuItemText, { color: theme.colors.error }]}>Expulsar del Clan</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuClose} onPress={() => setIsActionModalVisible(false)}>
                            <Text style={styles.menuCloseText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Aqui se configura el reparto desde la bóveda: o bien una cantidad de puntos del banco, o bien un objeto guardado, hacia el miembro elegido */}
            <Modal visible={isGrantModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.grantModal}>
                        <Text style={styles.modalTitle}>{isGrantingPoints ? 'Repartir Fondos' : `Regalar: ${selectedVaultItem?.name}`}</Text>
                        
                        {isGrantingPoints && (
                            <View style={{ marginBottom: 20 }}>
                                <Text style={styles.label}>Cantidad a retirar del Clan:</Text>
                                <TextInput 
                                    style={styles.input}
                                    keyboardType="numeric"
                                    value={pointsToGrant}
                                    onChangeText={setPointsToGrant}
                                />
                                <Text style={styles.miniLabel}>Fondos Clan: {bankPoints} pts</Text>
                            </View>
                        )}

                        <Text style={styles.label}>Para el miembro:</Text>
                        <ScrollView style={{ maxHeight: 200, marginBottom: 20 }}>
                            {clanMembers.filter(m => m.user_id !== user?.id).map(m => (
                                <TouchableOpacity 
                                    key={m.user_id}
                                    style={[styles.targetMember, grantTargetMember?.user_id === m.user_id && styles.targetMemberActive]}
                                    onPress={() => setGrantTargetMember(m)}
                                >
                                    <Text style={[styles.targetMemberText, grantTargetMember?.user_id === m.user_id && { color: '#FFF' }]}>{m.username || m.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsGrantModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.confirmBtn, !grantTargetMember && { opacity: 0.5 }]} 
                                disabled={!grantTargetMember}
                                onPress={handleGrantVault}
                            >
                                <Text style={styles.confirmBtnText}>Confirmar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Confirmación de expulsión: solo se dispara la llamada al backend (confirmKick) si el usuario confirma aquí */}
            <Modal visible={kickTargetId !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="warning" size={48} color={theme.colors.error} style={{ marginBottom: 10 }} />
                        <Text style={styles.modalTitle}>{t('clan.kickMember', { defaultValue: 'Expulsar miembro' })}</Text>
                        <Text style={{ color: theme.colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>
                            {t('clan.kickConfirm', { defaultValue: '¿Seguro que quieres expulsar a este miembro del clan?' })}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                            <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setKickTargetId(null)}>
                                <Text style={styles.cancelBtnText}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: theme.colors.error }]} onPress={confirmKick}>
                                <Text style={styles.primaryBtnText}>{t('clan.kickMember', { defaultValue: 'Expulsar' })}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Aqui el miembro indica cuántos puntos personales quiere depositar en el banco común del clan */}
            <Modal visible={isDepositModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.grantModal}>
                        <Text style={styles.modalTitle}>Depositar en el Banco</Text>
                        <Text style={{ color: theme.colors.textSecondary, marginBottom: 20 }}>
                            Puedes depositar tus puntos de oro personales para que el clan pueda realizar compras comunes o repartir premios.
                        </Text>
                        
                        <View style={{ marginBottom: 20 }}>
                            <Text style={styles.label}>Cantidad a depositar:</Text>
                            <TextInput 
                                style={styles.input}
                                keyboardType="numeric"
                                value={depositAmount}
                                onChangeText={setDepositAmount}
                                placeholder="0"
                                placeholderTextColor="#666"
                            />
                        </View>

                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginBottom: 20, fontStyle: 'italic' }}>
                            * Para depositar objetos, hazlo desde la pestaña de "Inventario" seleccionando el objeto y pulsando "Donar al Clan".
                        </Text>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsDepositModalVisible(false)}>
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.confirmBtn, !depositAmount && { opacity: 0.5 }]} 
                                disabled={!depositAmount}
                                onPress={handleDepositOro}
                            >
                                <Text style={styles.confirmBtnText}>Confirmar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
    header: { padding: theme.spacing.l, paddingTop: Platform.OS === 'web' ? theme.spacing.l : theme.spacing.xl, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backButton: { padding: 4, marginRight: 16 },
    headerTitle: { ...theme.typography.header, fontSize: 20, color: theme.colors.text, flex: 1 },
    settingsBtn: { padding: 4 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface },
    tabBtn: { flex: 1, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    tabActive: { borderBottomWidth: 3, borderBottomColor: theme.colors.primary },
    tabText: { fontWeight: 'bold', color: theme.colors.textSecondary, fontSize: 13 },
    
    // Botones de los modales
    cancelBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
    cancelBtnText: { color: theme.colors.textSecondary, fontWeight: 'bold', fontSize: 15 },
    
    // Tarjetas y elementos generales de interfaz
    primaryBtn: { backgroundColor: theme.colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, width: '100%', maxWidth: 400, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', elevation: 2 },
    primaryBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
    
    noClanHero: { backgroundColor: theme.colors.primary, width: '100%', borderRadius: 20, padding: 30, alignItems: 'center', marginBottom: 30, shadowColor: theme.colors.primary, shadowOffset: { width:0, height:6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
    noClanTitle: { fontSize: 28, fontWeight: '900', color: '#FFF', letterSpacing: 1, marginBottom: 8 },
    noClanDesc: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22 },
    
    sectionHeader: { width: '100%', maxWidth: 400, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, color: theme.colors.text, fontWeight: 'bold' },
    
    modernCard: { width: '100%', maxWidth: 600, backgroundColor: theme.colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: theme.colors.border },
    modernCardIcon: { width: 50, height: 50, borderRadius: 12, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    clanName: { fontSize: 16, color: theme.colors.text, fontWeight: 'bold', marginBottom: 4 },
    joinBtn: { backgroundColor: theme.colors.success, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
    joinBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
    
    // Estilos del chat del clan
    chatList: { padding: 16, paddingBottom: 20 },
    chatAnnounce: { width: '100%', alignItems: 'center', marginBottom: 16 },
    chatAnnounceText: { backgroundColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, fontSize: 12, color: theme.colors.textSecondary, overflow: 'hidden' },
    messageBubble: { padding: 12, borderRadius: 16, marginBottom: 8, maxWidth: '80%' },
    myMessage: { backgroundColor: theme.colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    theirMessage: { backgroundColor: theme.colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
    msgUser: { fontWeight: 'bold', color: theme.colors.textSecondary, fontSize: 12, marginBottom: 4 },
    msgText: { color: theme.colors.text, fontSize: 15 },
    chatInputBox: { flexDirection: 'row', padding: 12, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border, alignItems: 'center' },
    input: { flex: 1, backgroundColor: theme.colors.background, borderRadius: 20, paddingHorizontal: 16, color: theme.colors.text, height: 44, borderWidth: 1, borderColor: theme.colors.border },
    sendBtn: { width: 44, height: 44, backgroundColor: theme.colors.primary, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
    
    // Estilos de la arena (combate contra el jefe del clan y lobbies)
    bossBanner: { width: '100%', maxWidth: 600, backgroundColor: theme.colors.surface, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 30, borderWidth: 2, borderColor: theme.colors.error, shadowColor: theme.colors.error, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
    bossLevelTag: { backgroundColor: '#FFD700', color: '#000', fontWeight: '900', padding: 4, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'center', marginBottom: 8, fontSize: 12 },
    bossTitle: { fontSize: 24, fontWeight: 'bold', color: theme.colors.error, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 },
    hpBar: { width: '100%', height: 24, backgroundColor: '#333', borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#111' },
    hpFill: { height: '100%', backgroundColor: theme.colors.error },
    hpText: { color: theme.colors.text, marginTop: 10, fontWeight: 'bold', fontSize: 14 },
    lobbyArea: { width: '100%', maxWidth: 600, alignItems: 'center', backgroundColor: theme.colors.background, borderRadius: 16, padding: 10 },
    activeLobbyBox: { width: '100%', backgroundColor: theme.colors.surface, padding: 25, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#3182CE' },
    lobbyTitle: { fontSize: 20, color: theme.colors.text, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    lobbyCode: { fontSize: 24, fontWeight: 'bold', color: '#3182CE', backgroundColor: 'rgba(49, 130, 206, 0.1)', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
    lobbyDesc: { color: theme.colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 20 },
    
    // Estilos generales de los modales
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: theme.colors.surface, width: '100%', maxWidth: 400, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 16 },
    
    // Estilos del banco/almacen del clan
    vaultHeader: { backgroundColor: theme.colors.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bankBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, padding: 12, borderRadius: 10, flex: 1, marginRight: 15 },
    bankLabel: { color: theme.colors.textSecondary, fontSize: 12 },
    bankValue: { color: "#D69E2E", fontSize: 20, fontWeight: 'bold' },
    distributeBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
    distributeBtnText: { color: '#FFF', fontWeight: 'bold' },
    vaultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    vaultItemCard: { width: '48%', backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border },
    vaultItemImg: { width: '100%', height: 100, borderRadius: 6, marginBottom: 8 },
    vaultItemInfo: { flex: 1 },
    vaultItemName: { color: theme.colors.text, fontWeight: 'bold', fontSize: 14 },
    vaultItemQty: { color: theme.colors.textSecondary, fontSize: 11 },
    grantBtn: { backgroundColor: '#38A169', padding: 8, borderRadius: 6, alignItems: 'center', marginTop: 8 },
    
    // Estilos del menu de acciones
    actionMenu: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, width: '80%', maxWidth: 400 },
    menuTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginBottom: 20, textAlign: 'center' },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 15 },
    menuItemText: { fontSize: 16, color: theme.colors.text, fontWeight: 'bold' },
    menuClose: { marginTop: 10, padding: 15, alignItems: 'center' },
    menuCloseText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
    
    // Estilos del modal para conceder objetos del banco a un miembro
    grantModal: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 24, width: '90%', maxWidth: 500 },
    targetMember: { padding: 12, borderRadius: 8, backgroundColor: theme.colors.background, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
    targetMemberActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    targetMemberText: { color: theme.colors.text, fontWeight: 'bold' },
    confirmBtn: { backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
    confirmBtnText: { color: '#FFF', fontWeight: 'bold' },
    label: { color: theme.colors.text, fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
    miniLabel: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
});
