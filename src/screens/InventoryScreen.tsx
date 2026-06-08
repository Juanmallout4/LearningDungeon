import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Modal, Alert, Platform, ImageBackground, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { apiFetch } from '../utils/apiFetch';

// Barra de progreso al estilo "ARK" para las estadisticas principales (vida, mana, carga, experiencia):
// recibe el valor actual y el maximo, y dibuja un relleno proporcional con un brillo de neon en modo oscuro
const ArkProgressBar = ({ label, current, max, color, icon, theme }: any) => (
    <View style={styles(theme).barWrapper}>
        <View style={styles(theme).barHeader}>
            <Ionicons name={icon} size={14} color={color} />
            <Text style={[styles(theme).barLabel, { color }]}>{label}</Text>
            <Text style={styles(theme).barValue}>{Math.floor(current)} / {Math.floor(max)}</Text>
        </View>
        <div style={{ position: 'relative', height: 8, width: '100%', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ 
                height: '100%', 
                width: `${Math.min(100, (current / max) * 100)}%`, 
                backgroundColor: color, 
                boxShadow: theme.isDark ? `0 0 10px ${color}` : 'none',
                transition: 'width 0.3s ease'
            }} />
        </div>
    </View>
);

// Fila de atributo RPG (fuerza, agilidad, etc.) que muestra su valor actual sobre el maximo, con un relleno
// de fondo proporcional al porcentaje, y un boton "+" para subirlo si el jugador tiene puntos de habilidad disponibles
const IntegratedStatRow = ({ label, value, max, icon, onUpgrade, canUpgrade, theme }: any) => {
    const fillPercent = Math.min(100, (value / max) * 100);
    const accentColor = theme.isDark ? '#00FFFF' : theme.colors.primary;

    return (
        <View style={styles(theme).statRowContainer}>
            {/* Capa de relleno de fondo que representa visualmente el porcentaje del atributo */}
            <div style={{ 
                position: 'absolute', 
                left: 0, 
                top: 0, 
                bottom: 0, 
                width: `${fillPercent}%`, 
                backgroundColor: theme.isDark ? 'rgba(0, 255, 255, 0.12)' : 'rgba(33, 182, 104, 0.12)',
                transition: 'width 0.3s ease'
            }} />
            
            <View style={styles(theme).statRowContent}>
                <View style={styles(theme).statInfoLeft}>
                    <Ionicons name={icon} size={16} color={accentColor} />
                    <Text style={styles(theme).statLabelText}>{label}</Text>
                </View>
                <View style={styles(theme).statValueRight}>
                    <Text style={styles(theme).statValueText}>{value} <Text style={styles(theme).maxText}>/ {max}</Text></Text>
                    {canUpgrade && value < max && (
                        <TouchableOpacity style={styles(theme).plusBtn} onPress={onUpgrade}>
                            <Ionicons name="add-circle" size={22} color={accentColor} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

// Pantalla de inventario al estilo RPG: muestra el equipo del jugador (armas, armadura), su inventario de objetos,
// sus estadisticas (vida, mana, atributos) y permite equipar objetos, donarlos al clan o venderlos al mercader ambulante
export const InventoryScreen = () => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { theme } = useTheme();
    const currentStyles = useMemo(() => styles(theme), [theme]);

    const [user, setUser] = useState<any>(null);
    const [inventory, setInventory] = useState<any[]>([]);
    const [rpgStats, setRpgStats] = useState<any>(null);
    const [oro, setOro] = useState(0);
    const [totalWeight, setTotalWeight] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [pendingClanDonation, setPendingClanDonation] = useState<any>(null);
    const [pendingSellItem, setPendingSellItem] = useState<any>(null);

    // Al montar la pantalla cargamos el inventario, las estadisticas RPG y el oro del usuario actual
    useEffect(() => {
        loadData();
    }, []);

    // Trae del servidor el inventario completo del usuario junto con sus stats RPG, oro y peso total cargado.
    // Las estadisticas de combate (combatStats) pueden llegar como JSON en texto desde la base de datos,
    // asi que las parseamos aqui para que el resto de la pantalla siempre trabaje con objetos
    const loadData = async () => {
        setLoading(true);
        const currentUser = await AuthService.getSavedUser();
        setUser(currentUser);
        if (currentUser) {
            try {
                const res = await apiFetch(`/api/users/${currentUser.id}/inventory`);
                if (res.ok) {
                    const data = await res.json();
                    const items = (data.inventory || []).map((item: any) => ({
                        ...item,
                        combatStats: typeof item.combatStats === 'string' ? JSON.parse(item.combatStats) : (item.combatStats || {})
                    }));
                    setInventory(items);
                    setRpgStats(data.stats);
                    setOro(data.oro || 0);
                    setTotalWeight(data.totalWeight || 0);
                }
            } catch (e) {
                console.error('Inventory fetch error', e);
            }
        }
        setLoading(false);
    };

    // Gasta un punto de habilidad disponible para subir el atributo indicado (vitalidad, fuerza, etc.)
    // y recarga los datos para reflejar el nuevo valor y el contador de puntos restantes
    const handleUpgradeStat = async (stat: string) => {
        if (!user || !rpgStats || rpgStats.skill_points <= 0) return;
        try {
            const res = await apiFetch(`/api/users/${user.id}/rpg/upgrade`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stat })
            });
            if (res.ok) {
                loadData();
            } else {
                const err = await res.json();
                Alert.alert("Error", err.error || "Could not upgrade stat");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Equipa o desequipa un objeto del inventario. Le decimos al servidor el tipo de objeto y si es un arma
    // a dos manos (isTwoHanded) para que pueda gestionar las reglas de exclusion entre ranuras (p.ej. liberar
    // la mano secundaria al equipar un arma a dos manos)
    const toggleEquip = async (item: any) => {
        if (!user) return;
        const willEquip = !item.is_equipped;
        try {
            const res = await apiFetch(`/api/users/${user.id}/inventory/${item.inventory_id}/equip`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    isEquipped: willEquip,
                    itemType: item.type,
                    isTwoHanded: item.type === 'weapon_2h'
                })
            });
            if (res.ok) {
                setSelectedItem(null);
                loadData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Dona puntos o un objeto del inventario al banco/almacen del clan. Si "points" es mayor que 0 donamos
    // puntos; si no, donamos el objeto actualmente seleccionado (selectedItem). Primero comprobamos que el
    // usuario pertenezca a un clan, ya que sin clan no hay banco al que donar
    const handleClanDeposit = async (points: number = 0) => {
        if (!user) return;

        // Comprobamos primero si el usuario pertenece a algun clan
        const clanRes = await apiFetch(`/api/users/${user.id}/clan`);
        const clanData = await clanRes.json();
        if (!clanData.clan) {
            Alert.alert("Error", "No perteneces a ningún clan.");
            return;
        }

        try {
            const res = await apiFetch(`/api/clans/${clanData.clan.clan_id}/vault/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    inventoryId: points > 0 ? null : selectedItem?.inventory_id,
                    amountPoints: points
                })
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert("Éxito", points > 0 ? `Has donado ${points} pts al clan.` : `Has donado ${selectedItem.name} al clan.`);
                setSelectedItem(null);
                loadData();
            } else {
                Alert.alert("Error", data.error);
            }
        } catch (e) {
            Alert.alert("Error", "No se pudo realizar la donación.");
        }
    };

    // El mercader ambulante (que solo compra objetos los domingos y los martes) adquiere los objetos
    // marcados con is_merchant_buyable; getDay() devuelve 0 para domingo y 2 para martes
    const isMerchantDay = [0, 2].includes(new Date().getDay());

    // Abre el modal de confirmacion de venta guardando el objeto pendiente de vender
    const handleSellToMerchant = (item: any) => {
        if (!user) return;
        setPendingSellItem(item);
    };

    // Confirma la venta del objeto pendiente al mercader: lo envia al servidor, que calcula y devuelve
    // la recompensa en puntos, y recarga el inventario para reflejar que el objeto ya no esta disponible
    const confirmSellToMerchant = async () => {
        if (!user || !pendingSellItem) return;
        const item = pendingSellItem;
        setPendingSellItem(null);
        try {
            const res = await apiFetch('/api/merchant/sell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, inventoryId: item.inventory_id })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                Alert.alert("Éxito", data.message || `Has vendido ${item.name} por ${data.reward} puntos.`);
                setSelectedItem(null);
                loadData();
            } else {
                Alert.alert("Error", data.error || "No se pudo vender el objeto.");
            }
        } catch (e) {
            Alert.alert("Error", "No se pudo vender el objeto.");
        }
    };

    // Confirma la donacion del objeto pendiente al clan, reutilizando handleClanDeposit sin pasar puntos
    // (lo que hace que done el objeto seleccionado en lugar de una cantidad de puntos)
    const confirmClanDonation = async () => {
        if (!pendingClanDonation) return;
        setPendingClanDonation(null);
        await handleClanDeposit();
    };

    // Lista del inventario filtrada por el texto de busqueda (comparando nombres en minusculas)
    const filteredInventory = useMemo(() => {
        return inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [inventory, searchQuery]);

    // Los materiales son fungibles — agrupamos copias identicas en una sola tarjeta con una insignia de
    // cantidad ("x3"), en vez de dejar que inunden la cuadricula con una ranura por cada copia individual.
    // Guardamos los IDs de inventario originales en stackedIds por si se necesitan para acciones individuales
    const stackedInventory = useMemo(() => {
        const stacks = new Map<string, any>();
        const result: any[] = [];
        filteredInventory.forEach(item => {
            if (item.item_type === 'material') {
                const existing = stacks.get(item.item_id);
                if (existing) {
                    existing.quantity += 1;
                    existing.stackedIds.push(item.inventory_id);
                } else {
                    const stack = { ...item, quantity: 1, stackedIds: [item.inventory_id] };
                    stacks.set(item.item_id, stack);
                    result.push(stack);
                }
            } else {
                result.push({ ...item, quantity: 1, stackedIds: [item.inventory_id] });
            }
        });
        return result;
    }, [filteredInventory]);

    // Busca en el inventario el objeto equipado que ocupa una ranura concreta. slotType puede ser un unico
    // tipo (p.ej. 'helmet') o un array de tipos compatibles (p.ej. ['weapon_1h_right', 'weapon_2h'] para la mano principal)
    const getEquippedInSlot = (slotType: string | string[]) => {
        return inventory.find(i => i.is_equipped && (Array.isArray(slotType) ? slotType.includes(i.type) : i.type === slotType));
    };

    // Pinta una ranura de equipo (casco, pecho, arma...): muestra la imagen del objeto equipado o un icono
    // generico vacio, y al pulsarla abre el modal de detalles del objeto equipado en esa ranura
    const renderEquipSlot = (slotTypes: string | string[], icon: any, label: string) => {
        const equipped = getEquippedInSlot(slotTypes);
        const accentColor = theme.isDark ? 'rgba(0, 255, 255, 0.2)' : 'rgba(33, 182, 104, 0.2)';
        
        return (
            <TouchableOpacity 
                style={[currentStyles.slotCard, equipped && currentStyles.slotCardEquipped]} 
                onPress={() => equipped ? setSelectedItem(equipped) : null}
            >
                {equipped ? (
                    <Image source={{ uri: equipped.image_url }} style={currentStyles.slotImage} />
                ) : (
                    <Ionicons name={icon} size={22} color={accentColor} />
                )}
                <View style={currentStyles.slotOverlay}>
                    <Text style={currentStyles.slotLabel}>{label}</Text>
                </View>
            </TouchableOpacity>
        );
    }

    if (loading) {
        return (
            <View style={currentStyles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    const xpNeeded = rpgStats ? 50 * rpgStats.level * (rpgStats.level + 1) : 1000;

    return (
        <View style={currentStyles.fullContainer}>
            {/* Cabecera estilo HUD: nombre del jugador, nivel, clase RPG, oro y boton para donar puntos al clan */}
            <View style={currentStyles.hudHeader}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={currentStyles.backBtn}>
                    <Ionicons name="apps-outline" size={28} color={theme.colors.primary} />
                </TouchableOpacity>
                <View style={currentStyles.titleInfo}>
                    <Text style={currentStyles.playerName}>{user?.name?.toUpperCase() || 'PLAYER'}</Text>
                    <View style={currentStyles.headerRow}>
                        <View style={currentStyles.levelBadge}>
                            <Text style={currentStyles.levelText}>LVL {rpgStats?.level || 1}</Text>
                        </View>
                        {rpgStats?.rpg_class && (
                            <View style={currentStyles.classBadge}>
                                <Ionicons 
                                    name={
                                        rpgStats.rpg_class === 'Guerrero' ? 'shield' :
                                        rpgStats.rpg_class === 'Mago' ? 'flash' :
                                        rpgStats.rpg_class === 'Druida' ? 'leaf' :
                                        rpgStats.rpg_class === 'Monje' ? 'body' : 'sparkles'
                                    } 
                                    size={10} 
                                    color="#FFF" 
                                    style={{marginRight: 4}} 
                                />
                                <Text style={currentStyles.classText}>{rpgStats.rpg_class.toUpperCase()}</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity 
                        style={[currentStyles.currencyBox, { backgroundColor: 'rgba(214, 158, 46, 0.2)', borderWidth: 1, borderColor: '#D69E2E' }]}
                        onPress={() => {
                            const amount = prompt("¿Cuántos puntos quieres donar al banco del clan?");
                            if (amount) handleClanDeposit(parseInt(amount));
                        }}
                    >
                        <Ionicons name="briefcase" size={16} color="#D69E2E" />
                        <Text style={{ color: '#D69E2E', fontWeight: 'bold', marginLeft: 4 }}>DONAR CLAN</Text>
                    </TouchableOpacity>
                    <View style={currentStyles.currencyBox}>
                        <Ionicons name="sparkles" size={18} color="#FFD700" />
                        <Text style={currentStyles.oroText}>{oro} ORO</Text>
                    </View>
                </View>
            </View>

            {/* Areas principales de contenido: en web se distribuyen en tres columnas lado a lado, en movil se apilan */}
            <View style={currentStyles.mainLayout}>
                {/* COLUMNA IZQUIERDA: cuadricula del inventario con buscador */}
                <View style={currentStyles.columnInventory}>
                    <View style={currentStyles.panelHeader}>
                        <Text style={currentStyles.panelTitle}>INVENTARIO</Text>
                        <View style={currentStyles.searchBox}>
                            <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
                            <TextInput 
                                style={currentStyles.searchInput}
                                placeholder="FILTRAR..."
                                placeholderTextColor={theme.colors.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus={false}
                            />
                        </View>
                    </View>
                    <ScrollView contentContainerStyle={currentStyles.inventoryGrid}>
                        {stackedInventory.length === 0 ? (
                            <Text style={{color: theme.colors.textSecondary, marginTop: 20}}>VACÍO</Text>
                        ) : (
                            stackedInventory.map(item => (
                                <TouchableOpacity
                                    key={item.stackedIds[0]}
                                    style={[currentStyles.itemCard, item.is_equipped && currentStyles.itemCardEquipped]}
                                    onPress={() => setSelectedItem(item)}
                                >
                                    {item.image_url ? (
                                        <Image source={{ uri: item.image_url }} style={currentStyles.itemImage} />
                                    ) : (
                                        <Ionicons name="cube-outline" size={32} color={theme.colors.textSecondary} />
                                    )}
                                    <View style={currentStyles.weightBadge}>
                                        <Text style={currentStyles.weightText}>{item.weight}kg</Text>
                                    </View>
                                    {item.quantity > 1 && (
                                        <View style={currentStyles.quantityBadge}>
                                            <Text style={currentStyles.quantityText}>x{item.quantity}</Text>
                                        </View>
                                    )}
                                    {item.is_equipped && <View style={currentStyles.equippedDot} />}
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                </View>

                {/* COLUMNA CENTRAL: ranuras de armadura arriba, barras de estado en medio, atributos RPG abajo */}
                <View style={currentStyles.columnStats}>
                    <View style={currentStyles.panelHeader}>
                        <Text style={currentStyles.panelTitle}>ESTADO Y EQUIPO</Text>
                    </View>
                    
                    <ScrollView style={currentStyles.statsScroll} showsVerticalScrollIndicator={false}>
                        {/* 1. RANURAS DE ARMADURA (arriba): casco, pecho, piernas, manos y pies */}
                        <View style={currentStyles.armorGrid}>
                            <View style={currentStyles.armorRow}>
                                {renderEquipSlot('helmet', 'headset', 'CASCO')}
                                {renderEquipSlot('chest', 'shirt', 'PECHO')}
                                {renderEquipSlot('pants', 'body', 'PIERNAS')}
                            </View>
                            <View style={[currentStyles.armorRow, { marginTop: 10 }]}>
                                {renderEquipSlot('gloves', 'hand-left', 'MANOS')}
                                {renderEquipSlot('boots', 'foot', 'PIES')}
                            </View>
                        </View>

                        <View style={currentStyles.divider} />

                        {/* 2. BARRAS DE ESTADO PRINCIPALES: salud, mana, carga (peso) y experiencia hacia el siguiente nivel */}
                        <ArkProgressBar label="SALUD" current={rpgStats?.current_hp} max={rpgStats?.max_hp} color="#FF4444" icon="heart" theme={theme} />
                        <ArkProgressBar label="MANÁ" current={rpgStats?.mana} max={rpgStats?.max_mana} color="#44AAFF" icon="flash" theme={theme} />
                        <ArkProgressBar label="CARGA" current={totalWeight} max={rpgStats?.max_weight} color="#AAFF44" icon="barbell" theme={theme} />
                        <ArkProgressBar label="EXPERIENCIA" current={rpgStats?.exp} max={xpNeeded} color="#FFD700" icon="star" theme={theme} />

                        {/* 3. ATRIBUTOS RPG: lista de estadisticas mejorables (vitalidad, fuerza, agilidad...) y los puntos de habilidad disponibles para repartir */}
                        <View style={currentStyles.statList}>
                            <Text style={currentStyles.skillPointText}>PUNTOS DISPONIBLES: {rpgStats?.skill_points || 0}</Text>
                            {[
                                { k: 'vitality', l: 'VITALIDAD', i: 'heart' },
                                { k: 'strength', l: 'FUERZA', i: 'fitness' },
                                { k: 'agility', l: 'AGILIDAD', i: 'speedometer' },
                                { k: 'mana_stat', l: 'MANÁ', i: 'flash' },
                                { k: 'potency', l: 'POTENCIA', i: 'flame' },
                                { k: 'focus', l: 'ENFOQUE', i: 'eye' }
                            ].map(s => (
                                <IntegratedStatRow 
                                    key={s.k}
                                    label={s.l}
                                    value={rpgStats?.[s.k] || 5}
                                    max={100}
                                    icon={s.i}
                                    theme={theme}
                                    onUpgrade={() => handleUpgradeStat(s.k)}
                                    canUpgrade={rpgStats?.skill_points > 0}
                                />
                            ))}
                        </View>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>

                {/* COLUMNA DERECHA: silueta del personaje y ranuras de armas (principal y secundaria) */}
                <View style={currentStyles.columnCharacter}>
                    <View style={currentStyles.panelHeader}>
                        <Text style={currentStyles.panelTitle}>VISTA PERSONAJE</Text>
                    </View>
                    
                    <View style={currentStyles.charPreviewBox}>
                        {/* Usamos una silueta generica de una libreria de iconos comun, mas estable que generar un avatar dinamico */}
                        <Image 
                            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3233/3233483.png' }} 
                            style={currentStyles.characterSilhouette} 
                            resizeMode="contain"
                        />
                    </View>

                    {/* Ranuras de armas en la parte inferior: mano principal y mano secundaria */}
                    <View style={currentStyles.weaponSlots}>
                        <View style={currentStyles.weaponSlotWrapper}>
                            {renderEquipSlot(['weapon_1h_right', 'weapon_2h'], 'flash', 'PRINCIPAL')}
                        </View>
                        <View style={currentStyles.weaponSlotWrapper}>
                            {renderEquipSlot('weapon_1h_left', 'shield-outline', 'SECUNDARIA')}
                        </View>
                    </View>
                </View>
            </View>

            {/* MODAL DE DETALLES DEL OBJETO: imagen, descripcion, estadisticas de combate, habilidades especiales
                y acciones disponibles (equipar/desequipar, vender al mercader, donar al clan) */}
            <Modal visible={!!selectedItem} transparent animationType="fade" onRequestClose={() => setSelectedItem(null)}>
                <Pressable style={currentStyles.modalOverlay} onPress={() => setSelectedItem(null)}>
                    <Pressable style={currentStyles.itemDetailsPanel} onPress={e => e.stopPropagation()}>
                        {selectedItem && (
                            <>
                                <View style={currentStyles.detailsHeader}>
                                    <View style={currentStyles.detailsImgWrapper}>
                                        <Image source={{ uri: selectedItem.image_url }} style={currentStyles.detailsImg} />
                                    </View>
                                    <View style={currentStyles.detailsTitleBox}>
                                        <Text style={currentStyles.detailsName}>{selectedItem.name.toUpperCase()}</Text>
                                        <View style={currentStyles.detailsTypeBadge}>
                                            <Text style={currentStyles.detailsTypeText}>{selectedItem.type.replace('_', ' ').toUpperCase()}</Text>
                                        </View>
                                    </View>
                                </View>
                                
                                <ScrollView style={currentStyles.detailsBody} showsVerticalScrollIndicator={false}>
                                    <Text style={currentStyles.detailsDesc}>{selectedItem.description}</Text>
                                    
                                    <View style={currentStyles.detailsStatsBox}>
                                        <Text style={currentStyles.sectionTitle}>EFECTOS Y ATRIBUTOS</Text>
                                        
                                        <View style={currentStyles.detailStatRow}>
                                            <View style={currentStyles.statLabelGroup}>
                                                <Ionicons name="barbell-outline" size={14} color={theme.colors.textSecondary} />
                                                <Text style={currentStyles.detailStatLabel}> PESO:</Text>
                                            </View>
                                            <Text style={currentStyles.detailStatVal}>{selectedItem.weight}kg</Text>
                                        </View>

                                        {selectedItem.quantity > 1 && (
                                            <View style={currentStyles.detailStatRow}>
                                                <View style={currentStyles.statLabelGroup}>
                                                    <Ionicons name="layers-outline" size={14} color={theme.colors.textSecondary} />
                                                    <Text style={currentStyles.detailStatLabel}> CANTIDAD:</Text>
                                                </View>
                                                <Text style={currentStyles.detailStatVal}>x{selectedItem.quantity}</Text>
                                            </View>
                                        )}

                                        {selectedItem.combatStats && Object.entries(selectedItem.combatStats).map(([k, v]: any) => (
                                            v !== 0 ? (
                                                <View key={k} style={currentStyles.detailStatRow}>
                                                    <View style={currentStyles.statLabelGroup}>
                                                        <Ionicons name="add-circle-outline" size={14} color={theme.colors.primary} />
                                                        <Text style={currentStyles.detailStatLabel}> {k.toUpperCase()}:</Text>
                                                    </View>
                                                    <Text style={[currentStyles.detailStatVal, { color: theme.colors.primary }]}>{v > 0 ? '+' : ''}{v}</Text>
                                                </View>
                                            ) : null
                                        ))}
                                    </View>

                                    {/* Seccion de habilidades especiales / lore: texto descriptivo segun el tipo de objeto */}
                                    <View style={currentStyles.abilitiesBox}>
                                        <Text style={currentStyles.sectionTitle}>HABILIDADES ESPECIALES</Text>
                                        <View style={currentStyles.abilityItem}>
                                            <Ionicons name="sparkles" size={14} color="#FFD700" />
                                            <Text style={currentStyles.abilityText}>
                                                {selectedItem.type.includes('weapon') 
                                                    ? 'Canaliza la energía del portador para infligir daño crítico.' 
                                                    : 'Aumenta la resistencia física contra ataques elementales.'}
                                            </Text>
                                        </View>
                                        {(selectedItem.combatStats?.mana > 0 || selectedItem.type.includes('staff')) && (
                                            <View style={currentStyles.abilityItem}>
                                                <Ionicons name="water" size={14} color="#44AAFF" />
                                                <Text style={currentStyles.abilityText}>Sintonía mágica: Reduce el coste de maná de las habilidades.</Text>
                                            </View>
                                        )}
                                    </View>
                                </ScrollView>
                                
                                <View style={currentStyles.detailsActions}>
                                    {selectedItem.item_type !== 'material' && (
                                        <TouchableOpacity
                                            style={[currentStyles.actionBtn, selectedItem.is_equipped && currentStyles.actionBtnUnequip]}
                                            onPress={() => toggleEquip(selectedItem)}
                                        >
                                            <Ionicons name={selectedItem.is_equipped ? 'remove-circle' : 'checkmark-circle'} size={20} color="#FFF" style={{marginRight: 8}} />
                                            <Text style={currentStyles.actionBtnText}>
                                                {selectedItem.is_equipped ? 'DESEQUIPAR' : 'EQUIPAR'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {!selectedItem.is_equipped && selectedItem.is_merchant_buyable && (
                                        isMerchantDay ? (
                                            <TouchableOpacity
                                                style={[currentStyles.actionBtn, { backgroundColor: '#B8860B', marginTop: 10 }]}
                                                onPress={() => handleSellToMerchant(selectedItem)}
                                            >
                                                <Ionicons name="cart" size={20} color="#FFF" style={{marginRight: 8}} />
                                                <Text style={currentStyles.actionBtnText}>VENDER AL MERCADER</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <Text style={[currentStyles.detailStatLabel, { textAlign: 'center', marginTop: 10 }]}>
                                                El Mercader compra este objeto — vuelve el domingo o el martes para vendérselo.
                                            </Text>
                                        )
                                    )}

                                    {!selectedItem.is_equipped && (
                                        <TouchableOpacity
                                            style={[currentStyles.actionBtn, { backgroundColor: '#D69E2E', marginTop: 10 }]}
                                            onPress={() => setPendingClanDonation(selectedItem)}
                                        >
                                            <Ionicons name="briefcase" size={20} color="#FFF" style={{marginRight: 8}} />
                                            <Text style={currentStyles.actionBtnText}>DONAR AL CLAN</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* MODAL DE CONFIRMACION DE DONACION AL CLAN — usamos un Modal propio porque Alert.alert con botones no funciona en web */}
            <Modal visible={pendingClanDonation !== null} transparent animationType="fade">
                <View style={currentStyles.modalOverlay}>
                    <View style={currentStyles.confirmModalBox}>
                        <Ionicons name="briefcase" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
                        <Text style={currentStyles.confirmModalTitle}>Donar al Clan</Text>
                        <Text style={currentStyles.confirmModalDesc}>
                            {`¿Enviar "${pendingClanDonation?.name}" al almacén del clan? No podrás recuperarlo tú mismo.`}
                        </Text>
                        <View style={currentStyles.confirmModalButtons}>
                            <TouchableOpacity style={currentStyles.confirmModalCancelBtn} onPress={() => setPendingClanDonation(null)}>
                                <Text style={currentStyles.confirmModalCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={currentStyles.confirmModalConfirmBtn} onPress={confirmClanDonation}>
                                <Text style={currentStyles.confirmModalConfirmText}>Donar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL DE CONFIRMACION DE VENTA AL MERCADER — igual que arriba, Alert.alert con botones no funciona en web */}
            <Modal visible={pendingSellItem !== null} transparent animationType="fade">
                <View style={currentStyles.modalOverlay}>
                    <View style={currentStyles.confirmModalBox}>
                        <Ionicons name="cart" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
                        <Text style={currentStyles.confirmModalTitle}>Vender al Mercader</Text>
                        <Text style={currentStyles.confirmModalDesc}>
                            {`¿Vender "${pendingSellItem?.name}" al Mercader? Recibirás una cantidad de puntos a cambio y no podrás recuperar el objeto.`}
                        </Text>
                        <View style={currentStyles.confirmModalButtons}>
                            <TouchableOpacity style={currentStyles.confirmModalCancelBtn} onPress={() => setPendingSellItem(null)}>
                                <Text style={currentStyles.confirmModalCancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={currentStyles.confirmModalConfirmBtn} onPress={confirmSellToMerchant}>
                                <Text style={currentStyles.confirmModalConfirmText}>Vender</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = (theme: AppTheme) => StyleSheet.create({
    fullContainer: { 
        flex: 1, 
        backgroundColor: theme.colors.background,
        padding: Platform.OS === 'web' ? 20 : 10 
    },
    loadingContainer: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },
    
    hudHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.isDark ? 'rgba(0,255,255,0.05)' : 'rgba(33,182,104,0.05)', borderRadius: 22 },
    titleInfo: { flex: 1, marginLeft: 20 },
    playerName: { color: theme.colors.primary, fontSize: 24, fontWeight: '900', letterSpacing: 2 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    levelBadge: { backgroundColor: theme.isDark ? 'rgba(0,255,255,0.1)' : 'rgba(33,182,104,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    levelText: { color: theme.colors.primary, fontSize: 12, fontWeight: 'bold' },
    classBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    classText: { color: theme.colors.text, fontSize: 11, fontWeight: 'bold' },
    currencyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,215,0,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    oroText: { color: '#FFD700', fontWeight: 'bold', marginLeft: 6 },

    mainLayout: { flex: 1, flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 15 },

    columnInventory: { flex: 1.2, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 20 },
    columnStats: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 20 },
    columnCharacter: { flex: 1.2, alignItems: 'center', padding: 20, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },

    panelHeader: { marginBottom: 15 },
    panelTitle: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: 'bold', letterSpacing: 2, marginBottom: 15, textAlign: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
    searchInput: { flex: 1, color: theme.colors.text, marginLeft: 10, fontSize: 14, outlineStyle: 'none' } as any,

    inventoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 20, justifyContent: 'center' },
    itemCard: { 
        width: 76, 
        height: 76, 
        backgroundColor: theme.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)', 
        borderRadius: 10, 
        borderWidth: 1.5, 
        borderColor: theme.colors.border, 
        justifyContent: 'center', 
        alignItems: 'center',
        position: 'relative'
    },
    itemCardEquipped: { borderColor: theme.colors.primary, backgroundColor: theme.isDark ? 'rgba(33, 182, 104, 0.08)' : 'rgba(33, 182, 104, 0.08)' },
    itemImage: { width: 56, height: 56 },
    weightBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, borderRadius: 4 },
    weightText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
    quantityBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: theme.colors.primary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    quantityText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    equippedDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary, borderWidth: 1, borderColor: '#FFF' },

    // Disposicion de las ranuras de armadura (parte superior de la columna central)
    armorGrid: { alignItems: 'center', marginBottom: 25 },
    armorRow: { flexDirection: 'row', gap: 18 },
    divider: { height: 1.5, backgroundColor: theme.colors.border, marginVertical: 20, width: '100%' },

    // Contenedor con scroll para las barras de estado y los atributos RPG
    statsScroll: { flex: 1 },
    barWrapper: { marginBottom: 18 },
    barHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    barLabel: { fontSize: 11, fontWeight: 'bold' },
    barValue: { fontSize: 11, color: theme.colors.text, fontWeight: 'bold' },

    statList: { marginTop: 10, paddingTop: 15 },
    skillPointText: { color: '#FFD700', fontSize: 13, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    
    // Filas de atributos con relleno de fondo integrado (IntegratedStatRow)
    statRowContainer: { 
        height: 48, 
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', 
        borderRadius: 8, 
        marginBottom: 10, 
        overflow: 'hidden',
        position: 'relative',
        justifyContent: 'center'
    },
    statRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, zIndex: 1 },
    statInfoLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statLabelText: { color: theme.colors.text, fontSize: 13, fontWeight: 'bold' },
    statValueRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statValueText: { color: theme.colors.text, fontSize: 14, fontWeight: 'bold' },
    maxText: { color: theme.colors.textSecondary, fontSize: 11 },
    plusBtn: { marginLeft: 5 },

    // Columna derecha: vista previa del personaje
    charPreviewBox: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', minHeight: 400 },
    characterSilhouette: { width: '100%', height: '100%', opacity: theme.isDark ? 0.4 : 0.25 },
    weaponSlots: { flexDirection: 'row', justifyContent: 'center', width: '100%', gap: 30, paddingBottom: 10 },
    weaponSlotWrapper: { alignItems: 'center' },
    
    slotCard: { 
        width: 68, 
        height: 68, 
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', 
        borderRadius: 12, 
        borderWidth: 1.5, 
        borderColor: theme.colors.border, 
        justifyContent: 'center', 
        alignItems: 'center',
        position: 'relative'
    },
    slotCardEquipped: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: 'rgba(33, 182, 104, 0.05)' },
    slotImage: { width: 50, height: 50 },
    slotOverlay: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.65)', paddingVertical: 3, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
    slotLabel: { color: '#FFF', fontSize: 8, textAlign: 'center', fontWeight: 'bold' },

    // Estilos del modal de detalles del objeto y de los modales de confirmacion
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center' },
    confirmModalBox: {
        width: Platform.OS === 'web' ? 380 : '85%',
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 24,
        alignItems: 'center'
    },
    confirmModalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
    confirmModalDesc: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
    confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
    confirmModalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
    confirmModalCancelText: { color: theme.colors.text, fontWeight: 'bold' },
    confirmModalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: theme.colors.primary },
    confirmModalConfirmText: { color: '#FFF', fontWeight: 'bold' },
    itemDetailsPanel: { 
        width: Platform.OS === 'web' ? 440 : '92%', 
        backgroundColor: theme.colors.surface, 
        borderRadius: 20, 
        borderWidth: 2, 
        borderColor: theme.colors.primary, 
        padding: 25,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 15
    },
    detailsHeader: { flexDirection: 'row', gap: 20, marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1.5, borderBottomColor: theme.colors.border },
    detailsImgWrapper: { padding: 8, backgroundColor: theme.colors.background, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border },
    detailsImg: { width: 90, height: 90, borderRadius: 10 },
    detailsTitleBox: { flex: 1, justifyContent: 'center' },
    detailsName: { color: theme.colors.primary, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
    detailsTypeBadge: { backgroundColor: 'rgba(33, 182, 104, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 8, alignSelf: 'flex-start' },
    detailsTypeText: { color: theme.colors.primary, fontSize: 11, fontWeight: 'bold' },
    
    detailsBody: { maxHeight: 350, marginBottom: 20 },
    detailsDesc: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 24, marginBottom: 25, fontStyle: 'italic' },
    sectionTitle: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 15, textDecorationLine: 'underline' },
    
    detailsStatsBox: { backgroundColor: theme.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 25 },
    detailStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    detailStatLabel: { color: theme.colors.text, fontSize: 13, fontWeight: 'bold' },
    detailStatVal: { color: theme.colors.text, fontSize: 14, fontWeight: '900' },

    abilitiesBox: { backgroundColor: 'rgba(255,215,0,0.06)', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
    abilityItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    abilityText: { color: theme.colors.text, fontSize: 13, lineHeight: 20, flex: 1 },

    detailsActions: { marginTop: 10 },
    actionBtn: { 
        flexDirection: 'row',
        backgroundColor: theme.colors.primary, 
        paddingVertical: 18, 
        borderRadius: 12, 
        alignItems: 'center', 
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5
    },
    actionBtnUnequip: { backgroundColor: '#D32F2F' },
    actionBtnText: { color: '#FFF', fontWeight: 'bold', letterSpacing: 2, fontSize: 16 }
});
