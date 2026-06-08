import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform, Image, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { MarketItem } from '../../types';

// Aqui definimos las etiquetas de actividad que se pueden asignar a un item del mercado (compartido o por disciplina)
const MARKET_ACTIVITY_TYPE_OPTIONS: { value: string; labelKey: string; defaultLabel: string }[] = [
    { value: 'shared', labelKey: 'market.activityTagShared', defaultLabel: 'Compartido' },
    { value: 'taekwondo_itf', labelKey: 'settings.activityTypeTaekwondo', defaultLabel: 'Taekwondo ITF' },
    { value: 'ingles', labelKey: 'settings.activityTypeIngles', defaultLabel: 'Inglés' },
    { value: 'ballet', labelKey: 'settings.activityTypeBallet', defaultLabel: 'Ballet' },
];

export const MarketManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Devuelve el color asociado a cada rareza para pintar las insignias de los items RPG
    const getRarityColor = (rarity: string) => {
        switch (rarity) {
            case 'rare': return '#3182CE';
            case 'epic': return '#805AD5';
            case 'legendary': return '#D69E2E';
            default: return theme.colors.textSecondary;
        }
    };

    const [items, setItems] = useState<MarketItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    // Aqui controlamos la pestaña activa (tienda base / mercader ambulante / catálogo general) y el spinner de restauración
    const [activeTab, setActiveTab] = useState<'base' | 'merchant' | 'catalog'>('base');
    const [isRestoring, setIsRestoring] = useState(false);

    // Aqui guardamos los filtros de la lista: texto de búsqueda, tipo de item, rareza y slot de equipo (estos dos últimos solo para RPG)
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'physical' | 'virtual' | 'rpg'>('all');
    const [rarityFilter, setRarityFilter] = useState('all');
    const [slotFilter, setSlotFilter] = useState('all');

    // Aqui se guardan los campos del formulario de creación/edición de un item del mercado
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newCost, setNewCost] = useState('100');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newType, setNewType] = useState('virtual');
    const [itemType, setItemType] = useState('equippable'); // equippable, material, consumable
    const [rarity, setRarity] = useState('common');
    const [itemActivityType, setItemActivityType] = useState('shared');

    // Aqui configuramos en qué "escaparates" aparece el item: tienda base del club, y como vendible/comprable/exclusivo del mercader
    const [isInBaseStore, setIsInBaseStore] = useState(true);
    const [isMerchantSellable, setIsMerchantSellable] = useState(false);
    const [isMerchantBuyable, setIsMerchantBuyable] = useState(false);
    const [isMerchantExclusive, setIsMerchantExclusive] = useState(false);

    // Aqui definimos los rangos de precio (mín-máx) que el mercader usará al comprar o vender este item al alumno
    const [sellPriceMin, setSellPriceMin] = useState('10');
    const [sellPriceMax, setSellPriceMax] = useState('50');
    const [buyPriceMin, setBuyPriceMin] = useState('100');
    const [buyPriceMax, setBuyPriceMax] = useState('500');

    // Aqui configuramos las estadísticas de combate del item cuando se marca como equipable en el RPG
    const [isCombatItem, setIsCombatItem] = useState(false);
    const [combatSlot, setCombatSlot] = useState('weapon_1h_right');
    const [hpBoost, setHpBoost] = useState('0');
    const [damageMultiplier, setDamageMultiplier] = useState('1');
    const [healBoost, setHealBoost] = useState('0');
    const [specialAbilityName, setSpecialAbilityName] = useState('');
    const [specialAbilityDesc, setSpecialAbilityDesc] = useState('');
    const [specialEffects, setSpecialEffects] = useState<any[]>([]);

    // Aqui guardamos la lista de cofres del club, necesaria para que un efecto de tipo "chest" pueda elegir cuál otorgar
    const [chests, setChests] = useState<any[]>([]);

    // Carga inicial de los items del mercado y los cofres del club al montar la pantalla
    useEffect(() => {
        loadData();
    }, []);

    // Trae del backend los items de mercado y los cofres disponibles para el club activo (por ruta o por el club del usuario)
    const loadData = async () => {
        setIsLoading(true);
        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await ClubService.getMarketItems(targetClubId);
            setItems(data);
            const chestData = await ClubService.getChests(targetClubId);
            setChests(chestData);
        } catch (error) {
            console.error('Error loading market data', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Resetea el formulario a sus valores por defecto y abre el modal en modo "creación"
    const handleCreateItem = () => {
        setEditingId(null);
        setNewName('');
        setNewDescription('');
        setNewCost('100');
        setNewImageUrl('');
        setNewType('virtual');
        setItemType('equippable');
        setRarity('common');
        setItemActivityType('shared');
        setIsInBaseStore(true);
        setIsMerchantSellable(false);
        setIsMerchantBuyable(false);
        setIsMerchantExclusive(false);
        setSellPriceMin('10');
        setSellPriceMax('50');
        setBuyPriceMin('100');
        setBuyPriceMax('500');
        setIsCombatItem(false);
        setHpBoost('0');
        setDamageMultiplier('1');
        setHealBoost('0');
        setSpecialAbilityName('');
        setSpecialAbilityDesc('');
        setSpecialEffects([]);
        setIsModalVisible(true);
    };

    // Vuelca los datos de un item existente en el formulario (incluidas estadísticas de combate y efectos especiales) y abre el modal en modo "edición"
    const handleEditItem = (item: any) => {
        setEditingId(item.id);
        setNewName(item.name);
        setNewDescription(item.description || '');
        setNewCost(item.costPoints.toString());
        setNewImageUrl(item.imageUrl || '');
        setNewType(item.type === 'physical' ? 'physical' : 'virtual');
        setItemType(item.itemType || 'equippable');
        setRarity(item.rarity || 'common');
        setItemActivityType(item.activityType || 'shared');
        setIsInBaseStore(item.is_in_base_store ?? true);
        setIsMerchantSellable(!!item.is_merchant_sellable);
        setIsMerchantBuyable(!!item.is_merchant_buyable);
        setIsMerchantExclusive(!!item.is_merchant_exclusive);
        setSellPriceMin(item.sell_price_min?.toString() || '10');
        setSellPriceMax(item.sell_price_max?.toString() || '50');
        setBuyPriceMin(item.buy_price_min?.toString() || '100');
        setBuyPriceMax(item.buy_price_max?.toString() || '500');
        setIsCombatItem(!!item.combatStats);
        if (item.combatStats) {
            setCombatSlot(item.combatStats.slot || 'weapon_1h_right');
            setHpBoost(item.combatStats.hpBoost?.toString() || '0');
            setDamageMultiplier(item.combatStats.damageMultiplier?.toString() || '1');
            setHealBoost(item.combatStats.healBoost?.toString() || '0');
            setSpecialAbilityName(item.combatStats.specialAbilityName || '');
            setSpecialAbilityDesc(item.combatStats.specialAbilityDesc || '');
        }
        setSpecialEffects(Array.isArray(item.specialEffects) ? item.specialEffects : []);
        setIsModalVisible(true);
    };

    // Añade un nuevo efecto especial al consumible con un tipo y valor por defecto (luego se puede cambiar el tipo pulsándolo)
    const addEffect = () => {
        setSpecialEffects([...specialEffects, { type: 'heal_hp', value: 0 }]);
    };

    // Combina los nuevos campos (content) con el efecto existente en la posición "index", manteniendo el resto intacto
    const updateEffect = (index: number, content: any) => {
        const newEffects = [...specialEffects];
        newEffects[index] = { ...newEffects[index], ...content };
        setSpecialEffects(newEffects);
    };

    // Elimina el efecto en la posición "index" filtrándolo fuera del array
    const removeEffect = (index: number) => {
        setSpecialEffects(specialEffects.filter((_, i) => i !== index));
    };

    // Valida y guarda el item (creación o edición), construyendo el payload con estadísticas de combate y efectos especiales
    const saveItem = async () => {
        if (!newName.trim() || !newCost.trim()) {
            Alert.alert(t('common.error'), t('market.errorBuy')); // Reutilizamos errorBuy; podría sustituirse por un mensaje más específico
            return;
        }

        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) {
            Alert.alert(t('common.error'), "Club context error");
            return;
        }

        try {
            // Solo construimos el bloque de estadísticas de combate si el item está marcado como equipable de combate
            const combatStats = isCombatItem ? {
                slot: combatSlot,
                hpBoost: parseInt(hpBoost) || 0,
                damageMultiplier: parseFloat(damageMultiplier) || 1,
                healBoost: parseInt(healBoost) || 0,
                specialAbilityName: specialAbilityName.trim() || undefined,
                specialAbilityDesc: specialAbilityDesc.trim() || undefined
            } : null;

            // Payload final que se envía al backend, normalizando textos, números y flags de visibilidad/precio
            const itemData = {
                name: newName.trim(),
                description: newDescription.trim(),
                costPoints: parseInt(newCost),
                imageUrl: newImageUrl.trim() || undefined,
                type: isCombatItem ? combatSlot : newType,
                itemType: itemType,
                rarity: rarity,
                activityType: itemActivityType === 'shared' ? null : itemActivityType,
                isMerchantExclusive: isMerchantExclusive,
                isInBaseStore: isInBaseStore,
                isMerchantSellable: isMerchantSellable,
                isMerchantBuyable: isMerchantBuyable,
                sellPriceMin: parseInt(sellPriceMin) || null,
                sellPriceMax: parseInt(sellPriceMax) || null,
                buyPriceMin: parseInt(buyPriceMin) || null,
                buyPriceMax: parseInt(buyPriceMax) || null,
                combatStats,
                stock: -1, 
                specialEffects
            };

            if (editingId) {
                // Edición: actualizamos en backend y recargamos toda la lista para reflejar los cambios
                await ClubService.updateMarketItem(targetClubId, editingId, itemData);
                loadData();
                setIsModalVisible(false);
            } else {
                // Creación: insertamos el item devuelto por el backend al principio de la lista local sin recargar todo
                const savedItem = await ClubService.addMarketItem(targetClubId, itemData);
                setItems([savedItem, ...items]);
                setIsModalVisible(false);
            }
        } catch (error: any) {
            console.error('Error saving market item:', error);
            const msg = error.message || t('common.error');
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert(t('common.error'), msg);
            }
        }
    };

    // Borra un item del mercado, pidiendo confirmación nativa del navegador en web antes de llamar al backend
    const deleteItem = async (itemId: string) => {
        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) return;

        const confirmMessage = t('market.deleteConfirmBody');
        if (typeof window !== 'undefined' && window.confirm) {
            if (!window.confirm(confirmMessage)) return;
        }

        try {
            await ClubService.deleteMarketItem(targetClubId, itemId);
            setItems(items.filter(i => i.id !== itemId));
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || t('common.error'));
        }
    };

    // Restaura los items "de sistema" del club (p.ej. Piedra de Reinicio) a sus valores por defecto, previa confirmación
    const handleRestoreSystemItems = async () => {
        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) return;

        Alert.alert(
            t('common.confirm'),
            "¿Deseas restaurar los ítems básicos del sistema (Piedra de Reinicio, etc.)? Si ya existen, se actualizarán a sus valores por defecto.",
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: "Restaurar",
                    onPress: async () => {
                        setIsRestoring(true);
                        try {
                            await ClubService.restoreSystemItems(targetClubId);
                            Alert.alert(t('common.success'), "Ítems restaurados con éxito.");
                            loadData();
                        } catch (error: any) {
                            Alert.alert(t('common.error'), error.message || t('common.error'));
                        } finally {
                            setIsRestoring(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('market.manage')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity 
                        onPress={handleRestoreSystemItems} 
                        style={[styles.addButton, { marginRight: 15 }]}
                        disabled={isRestoring}
                    >
                        {isRestoring ? (
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                            <Ionicons name="sync-outline" size={28} color={theme.colors.primary} />
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCreateItem} style={styles.addButton}>
                        <Ionicons name="add" size={28} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.filterContainer}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('market.searchPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    <TouchableOpacity 
                        style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]} 
                        onPress={() => setTypeFilter('all')}
                    >
                        <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>{t('market.filterAll')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.filterChip, typeFilter === 'physical' && styles.filterChipActive]} 
                        onPress={() => setTypeFilter('physical')}
                    >
                        <Text style={[styles.filterChipText, typeFilter === 'physical' && styles.filterChipTextActive]}>{t('market.filterPhysical')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.filterChip, typeFilter === 'virtual' && styles.filterChipActive]} 
                        onPress={() => setTypeFilter('virtual')}
                    >
                        <Text style={[styles.filterChipText, typeFilter === 'virtual' && styles.filterChipTextActive]}>{t('market.filterVirtual')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.filterChip, typeFilter === 'rpg' && styles.filterChipActive]} 
                        onPress={() => setTypeFilter('rpg')}
                    >
                        <Text style={[styles.filterChipText, typeFilter === 'rpg' && styles.filterChipTextActive]}>{t('market.filterRPG')}</Text>
                    </TouchableOpacity>
                </ScrollView>

                {/* Estos sub-filtros de rareza y slot solo tienen sentido cuando se está filtrando por items RPG */}
                {typeFilter === 'rpg' && (
                    <View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { paddingTop: 0 }]}>
                            <Ionicons name="color-filter-outline" size={16} color={theme.colors.textSecondary} style={{ alignSelf: 'center', marginRight: 5 }} />
                            {['all', 'common', 'rare', 'epic', 'legendary'].map(r => (
                                <TouchableOpacity 
                                    key={r} 
                                    style={[styles.miniChip, rarityFilter === r && styles.miniChipActive]} 
                                    onPress={() => setRarityFilter(r)}
                                >
                                    <Text style={[styles.miniChipText, rarityFilter === r && styles.miniChipTextActive]}>{r.toUpperCase()}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { paddingTop: 0 }]}>
                            <Ionicons name="shield-outline" size={16} color={theme.colors.textSecondary} style={{ alignSelf: 'center', marginRight: 5 }} />
                            {['all', 'unassigned', 'helmet', 'body', 'legs', 'neck', 'ring', 'weapon_1h_right', 'arm_right', 'arm_left'].map(s => (
                                <TouchableOpacity 
                                    key={s} 
                                    style={[styles.miniChip, slotFilter === s && styles.miniChipActive]} 
                                    onPress={() => setSlotFilter(s)}
                                >
                                    <Text style={[styles.miniChipText, slotFilter === s && styles.miniChipTextActive]}>{s.toUpperCase()}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>
            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tabBtn, activeTab === 'base' && styles.tabBtnActive]} 
                    onPress={() => setActiveTab('base')}
                >
                    <Ionicons name="storefront-outline" size={20} color={activeTab === 'base' ? '#FFF' : theme.colors.textSecondary} />
                    <Text style={[styles.tabBtnText, activeTab === 'base' && styles.tabBtnTextActive]}>{t('market.tabStore')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tabBtn, activeTab === 'merchant' && styles.tabBtnActive]} 
                    onPress={() => setActiveTab('merchant')}
                >
                    <Ionicons name="cart-outline" size={20} color={activeTab === 'merchant' ? '#FFF' : theme.colors.textSecondary} />
                    <Text style={[styles.tabBtnText, activeTab === 'merchant' && styles.tabBtnTextActive]}>{t('market.tabMerchant')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tabBtn, activeTab === 'catalog' && styles.tabBtnActive]} 
                    onPress={() => setActiveTab('catalog')}
                >
                    <Ionicons name="archive-outline" size={20} color={activeTab === 'catalog' ? '#FFF' : theme.colors.textSecondary} />
                    <Text style={[styles.tabBtnText, activeTab === 'catalog' && styles.tabBtnTextActive]}>{t('market.tabCatalog')}</Text>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    key={Platform.OS === 'web' ? 'grid-3' : 'list-1'}
                    data={items.filter(i => {
                        // Filtro de pestaña: "base" muestra items de la tienda del club, "merchant" los del mercader (venta/compra/exclusivos)
                        // y "catalog" el resto (items que no aparecen en ningún escaparate activo)
                        if (activeTab === 'base' && !i.is_in_base_store) return false;
                        if (activeTab === 'merchant' && (!i.is_merchant_sellable && !i.is_merchant_buyable && !i.is_merchant_exclusive)) return false;
                        if (activeTab === 'catalog' && (i.is_in_base_store || i.is_merchant_sellable || i.is_merchant_buyable || i.is_merchant_exclusive)) return false;

                        // Filtro de texto: comparación insensible a mayúsculas sobre el nombre del item
                        if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

                        // Filtro de tipo: separamos físico, virtual "puro" (sin estadísticas de combate) y RPG (con estadísticas de combate)
                        if (typeFilter !== 'all') {
                            if (typeFilter === 'physical' && i.type !== 'physical') return false;
                            if (typeFilter === 'virtual' && (i.type !== 'virtual' || !!i.combatStats)) return false;
                            if (typeFilter === 'rpg' && !i.combatStats) return false;
                        }

                        // Sub-filtros adicionales solo aplicables cuando el filtro principal es RPG: rareza y slot de equipo
                        if (typeFilter === 'rpg') {
                            if (rarityFilter !== 'all' && i.rarity !== rarityFilter) return false;
                            if (slotFilter !== 'all') {
                                if (slotFilter === 'unassigned' && i.combatStats?.slot) return false;
                                if (slotFilter !== 'unassigned' && i.combatStats?.slot !== slotFilter) return false;
                            }
                        }

                        return true;
                    })}
                    keyExtractor={item => item.id}
                    numColumns={Platform.OS === 'web' ? 3 : 1}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardTop}>
                                {item.imageUrl ? (
                                    <Image source={{uri: item.imageUrl}} style={styles.itemImage} resizeMode="contain" />
                                ) : (
                                    <View style={styles.iconContainer}>
                                        <Ionicons name={item.type === 'physical' ? "ticket" : !!item.combatStats ? "shield" : "color-palette"} size={48} color={theme.colors.primary} />
                                    </View>
                                )}
                                <View style={styles.actionButtons}>
                                    <TouchableOpacity onPress={() => handleEditItem(item)} style={styles.actionBtn}>
                                        <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.actionBtn}>
                                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.cardBody}>
                                <Text style={styles.term} numberOfLines={1}>{item.name}</Text>
                                
                                {/* La insignia de precio cambia según la pestaña: precio de tienda, rango de compra del mercader o rango de venta al mercader */}
                                <View style={styles.badgesRow}>
                                    {activeTab === 'base' ? (
                                        <View style={styles.priceBadge}>
                                            <Text style={styles.priceText}>{item.costPoints} pts</Text>
                                        </View>
                                    ) : (activeTab === 'merchant' && item.is_merchant_sellable) ? (
                                        <View style={[styles.priceBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                                            <Text style={[styles.priceText, { color: theme.colors.primary }]}>{item.buy_price_min}-{item.buy_price_max} pts</Text>
                                        </View>
                                    ) : (activeTab === 'merchant' && item.is_merchant_buyable) ? (
                                        <View style={[styles.priceBadge, { backgroundColor: theme.colors.error + '20' }]}>
                                            <Text style={[styles.priceText, { color: theme.colors.error }]}>{item.sell_price_min}-{item.sell_price_max} pts</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.priceBadge}>
                                            <Text style={styles.priceText}>{item.costPoints} pts</Text>
                                        </View>
                                    )}
                                    
                                    {item.combatStats && (
                                        <View style={styles.rarityBadgeContainer}>
                                            <View style={[styles.rarityBadge, { backgroundColor: getRarityColor(item.rarity || 'common'), marginLeft: 0 }]}>
                                                <Text style={styles.rarityText}>{item.rarity?.toUpperCase() || 'COMMON'}</Text>
                                            </View>
                                        </View>
                                    )}
                                </View>

                                {item.description ? <Text style={styles.meaning} numberOfLines={2}>{item.description}</Text> : null}
                                
                                <View style={styles.cardFooter}>
                                    <Text style={styles.itemCategoryText}>
                                        {item.combatStats ? t('market.filterRPG') : item.type === 'physical' ? t('market.filterPhysical') : t('market.filterVirtual')}
                                    </Text>
                                    {item.activityType && (
                                        <View style={styles.slotBadge}>
                                            <Ionicons name="pricetag-outline" size={10} color={theme.colors.textSecondary} />
                                            <Text style={styles.slotBadgeText}>
                                                {t(MARKET_ACTIVITY_TYPE_OPTIONS.find(o => o.value === item.activityType)?.labelKey || '', { defaultValue: item.activityType }).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                    {item.combatStats && (
                                        <View style={styles.slotBadge}>
                                            <Ionicons name="shield-half" size={10} color={theme.colors.textSecondary} />
                                            <Text style={styles.slotBadgeText}>{item.combatStats.slot?.toUpperCase() || 'UNASSIGNED'}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                    )}
                     ListEmptyComponent={
                         <View style={styles.emptyContainer}>
                             <Text style={styles.emptyText}>{t('market.noItems')}</Text>
                         </View>
                     }
                 />
             )}
 
             <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setIsModalVisible(false)}>
                 <View style={styles.modalOverlay}>
                     <View style={styles.modalContent}>
                         <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                             <Text style={styles.modalTitle}>{editingId ? t('market.editItem') : t('market.newItem')}</Text>
 
                         <Text style={styles.label}>{t('market.itemName')}</Text>
                         <TextInput
                             style={styles.input}
                             placeholder="Ej: Elegir el juego de hoy"
                             placeholderTextColor={theme.colors.textSecondary}
                             value={newName}
                             onChangeText={setNewName}
                         />
 
                         <Text style={styles.label}>{t('market.description')}</Text>
                         <TextInput
                             style={styles.input}
                             placeholder="Detalles sobre qué hace o para qué sirve"
                             placeholderTextColor={theme.colors.textSecondary}
                             value={newDescription}
                             onChangeText={setNewDescription}
                         />
 
                         <Text style={styles.label}>{t('market.imageUrl')}</Text>
                         <TextInput
                             style={styles.input}
                             placeholder="https://ejemplo.com/imagen.png"
                             placeholderTextColor={theme.colors.textSecondary}
                             value={newImageUrl}
                             onChangeText={setNewImageUrl}
                         />
 
                         <View style={{ flexDirection: 'row', gap: 10 }}>
                             <View style={{ flex: 1 }}>
                                 <Text style={styles.label}>{t('market.costPoints')}</Text>
                                 <TextInput
                                     style={styles.input}
                                     keyboardType="numeric"
                                     value={newCost}
                                     onChangeText={text => setNewCost(text.replace(/[^0-9]/g, ''))}
                                 />
                             </View>
                             <View style={{ flex: 1 }}>
                                 <Text style={styles.label}>{t('market.type')}</Text>
                                 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                                     {['virtual', 'physical'].map(t_type => (
                                         <TouchableOpacity 
                                             key={t_type}
                                             style={[styles.typeButton, newType === t_type && { backgroundColor: theme.colors.primary }]}
                                             onPress={() => setNewType(t_type as any)}
                                         >
                                             <Text style={[styles.typeButtonText, newType === t_type && { color: '#FFF' }]}>{t_type === 'virtual' ? t('market.appType') : t('market.physicalType')}</Text>
                                         </TouchableOpacity>
                                     ))}
                                 </View>
                             </View>
                         </View>

                         <Text style={styles.label}>{t('market.category')}</Text>
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 15 }}>
                             {['equippable', 'material', 'consumable'].map(cat => (
                                 <TouchableOpacity 
                                     key={cat}
                                     style={[styles.typeButton, itemType === cat && { backgroundColor: theme.colors.primary }]}
                                     onPress={() => setItemType(cat as any)}
                                 >
                                     <Text style={[styles.typeButtonText, itemType === cat && { color: '#FFF' }]}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                                 </TouchableOpacity>
                             ))}
                         </View>

                         <Text style={styles.label}>{t('market.rarity')}</Text>
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 20 }}>
                             {['common', 'rare', 'epic', 'legendary'].map(r => (
                                 <TouchableOpacity 
                                     key={r}
                                     style={[styles.typeButton, rarity === r && { backgroundColor: getRarityColor(r) }]}
                                     onPress={() => setRarity(r as any)}
                                 >
                                     <Text style={[styles.typeButtonText, rarity === r && { color: '#FFF' }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                                 </TouchableOpacity>
                             ))}
                         </View>

                         <Text style={styles.label}>{t('market.activityTag', { defaultValue: 'Actividad' })}</Text>
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                             {MARKET_ACTIVITY_TYPE_OPTIONS.map(option => (
                                 <TouchableOpacity
                                     key={option.value}
                                     style={[styles.typeButton, itemActivityType === option.value && { backgroundColor: theme.colors.primary }]}
                                     onPress={() => setItemActivityType(option.value)}
                                 >
                                     <Text style={[styles.typeButtonText, itemActivityType === option.value && { color: '#FFF' }]}>
                                         {t(option.labelKey, { defaultValue: option.defaultLabel })}
                                     </Text>
                                 </TouchableOpacity>
                             ))}
                         </View>
                         <Text style={[styles.checkboxLabel, { fontSize: 12, marginBottom: 15 }]}>
                             {t('market.activityTagHint', { defaultValue: 'Los ítems "Compartidos" son visibles para todos los alumnos. Los ítems de una actividad concreta solo aparecerán para quienes la practiquen — útil sobre todo para recompensas físicas.' })}
                         </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 5 }}>
                             <TouchableOpacity
                                 style={[styles.checkbox, isInBaseStore && styles.checkboxChecked]}
                                 onPress={() => setIsInBaseStore(!isInBaseStore)}
                             >
                                 {isInBaseStore && <Ionicons name="checkmark" size={16} color="#FFF" />}
                             </TouchableOpacity>
                             <Text style={styles.checkboxLabel}>{t('market.inBaseStore')}</Text>
                         </View>

                         <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
                             <TouchableOpacity 
                                 style={[styles.checkbox, isMerchantSellable && styles.checkboxChecked]} 
                                 onPress={() => setIsMerchantSellable(!isMerchantSellable)}
                             >
                                 {isMerchantSellable && <Ionicons name="checkmark" size={16} color="#FFF" />}
                             </TouchableOpacity>
                             <Text style={styles.checkboxLabel}>{t('market.merchantSellable')}</Text>
                         </View>

                         {/* Si el item se puede vender al mercader, configuramos el rango de precio que el mercader pagará por él (usa los estados buyPrice*) */}
                         {isMerchantSellable && (
                             <View style={styles.merchantPriceBox}>
                                 <Text style={styles.miniLabel}>{t('market.sellRange')}</Text>
                                 <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Mín" value={buyPriceMin} onChangeText={setBuyPriceMin} keyboardType="numeric" />
                                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Máx" value={buyPriceMax} onChangeText={setBuyPriceMax} keyboardType="numeric" />
                                 </View>
                             </View>
                         )}

                         <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
                             <TouchableOpacity 
                                 style={[styles.checkbox, isMerchantBuyable && styles.checkboxChecked]} 
                                 onPress={() => setIsMerchantBuyable(!isMerchantBuyable)}
                             >
                                 {isMerchantBuyable && <Ionicons name="checkmark" size={16} color="#FFF" />}
                             </TouchableOpacity>
                             <Text style={styles.checkboxLabel}>{t('market.merchantBuyable')}</Text>
                         </View>

                         {/* Si el item se puede comprar al mercader, configuramos el rango de precio que el alumno pagará por él (usa los estados sellPrice*) */}
                         {isMerchantBuyable && (
                             <View style={styles.merchantPriceBox}>
                                 <Text style={styles.miniLabel}>{t('market.buyRange')}</Text>
                                 <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Mín" value={sellPriceMin} onChangeText={setSellPriceMin} keyboardType="numeric" />
                                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Máx" value={sellPriceMax} onChangeText={setSellPriceMax} keyboardType="numeric" />
                                 </View>
                             </View>
                         )}

                         <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 10 }}>
                             <TouchableOpacity 
                                 style={[styles.checkbox, isMerchantExclusive && styles.checkboxChecked]} 
                                 onPress={() => setIsMerchantExclusive(!isMerchantExclusive)}
                             >
                                 {isMerchantExclusive && <Ionicons name="checkmark" size={16} color="#FFF" />}
                             </TouchableOpacity>
                             <Text style={styles.checkboxLabel}>{t('market.merchantExclusive')}</Text>
                         </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 10 }}>
                             <TouchableOpacity style={[styles.checkbox, isCombatItem && styles.checkboxChecked]} onPress={() => setIsCombatItem(!isCombatItem)}>
                                 {isCombatItem && <Ionicons name="checkmark" size={16} color="#FFF" />}
                             </TouchableOpacity>
                             <Text style={styles.label}>{t('market.isCombatItem')}</Text>
                         </View>

                        {/* Configuración exclusiva de items de combate: slot de equipo, bonificadores numéricos y habilidad especial pasiva */}
                        {isCombatItem && (
                            <View style={styles.combatSection}>
                                <Text style={styles.label}>{t('market.slot')}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15}}>
                                    {[
                                        {id: 'weapon_1h_right', name: 'Arma Der.'}, 
                                        {id: 'weapon_1h_left', name: 'Arma Izq.'},
                                        {id: 'weapon_2h', name: 'Arma 2-Manos'},
                                        {id: 'helmet', name: 'Casco'}, 
                                        {id: 'chest', name: 'Peto'}, 
                                        {id: 'pants', name: 'Pantalón'}, 
                                        {id: 'gloves', name: 'Guantes'}, 
                                        {id: 'boots', name: 'Botas'}
                                    ].map(slot => (
                                        <TouchableOpacity 
                                            key={slot.id} 
                                            style={[styles.slotBtn, combatSlot === slot.id && styles.slotBtnActive]} 
                                            onPress={() => setCombatSlot(slot.id)}
                                        >
                                            <Text style={[styles.slotBtnText, combatSlot === slot.id && {color: '#FFF'}]}>{slot.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>{t('market.hpBoost')}</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={hpBoost} onChangeText={text => setHpBoost(text.replace(/[^0-9]/g, ''))} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>{t('market.damageMultiplier')}</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={damageMultiplier} onChangeText={text => setDamageMultiplier(text.replace(/[^0-9.]/g, ''))} placeholder="Ej: 1.5" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.label}>{t('market.healBoost')}</Text>
                                        <TextInput style={styles.input} keyboardType="numeric" value={healBoost} onChangeText={text => setHealBoost(text.replace(/[^0-9]/g, ''))} />
                                    </View>
                                </View>

                                {/* Habilidad pasiva especial que se activa en el modo arcade al equipar este item */}
                                <Text style={[styles.label, {marginTop: 15, color: '#F6E05E'}]}>{t('market.specialAbility')}</Text>
                                <TextInput 
                                    style={[styles.input, {borderColor: '#F6E05E', borderWidth: 1}]} 
                                    placeholder="Nombre: Ej. Cólera de Fuego" 
                                    placeholderTextColor={theme.colors.textSecondary} 
                                    value={specialAbilityName} 
                                    onChangeText={setSpecialAbilityName} 
                                />
                                <TextInput 
                                    style={[styles.input, {borderColor: '#F6E05E', borderWidth: 1}]} 
                                    placeholder="Descripción. Ej. El daño ardiente..." 
                                    placeholderTextColor={theme.colors.textSecondary} 
                                    value={specialAbilityDesc} 
                                    onChangeText={setSpecialAbilityDesc} 
                                />
                            </View>
                        )}
                        {/* Editor de efectos especiales: solo se muestra para items de tipo "consumable" y permite definir qué hace cada efecto al usarlo */}
                        {itemType === 'consumable' && (
                            <View style={styles.effectsSection}>
                                <Text style={[styles.label, { color: theme.colors.primary }]}>Efectos del Consumible</Text>
                                {specialEffects.map((eff, index) => (
                                    <View key={index} style={styles.effectCard}>
                                        <View style={styles.effectRow}>
                                            <TouchableOpacity
                                                style={styles.effectTypeBtn}
                                                onPress={() => {
                                                    // Al pulsar el botón, rotamos al siguiente tipo de efecto disponible en la lista (ciclo circular)
                                                    const types = ['heal_hp', 'heal_mana', 'full_restore', 'add_stat', 'add_xp', 'add_points', 'buff', 'clan_points', 'chest'];
                                                    const currentIdx = types.indexOf(eff.type);
                                                    const nextType = types[(currentIdx + 1) % types.length];
                                                    updateEffect(index, { type: nextType });
                                                }}
                                            >
                                                <Text style={styles.effectTypeText}>{eff.type.toUpperCase()}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => removeEffect(index)}>
                                                <Ionicons name="trash" size={20} color={theme.colors.error} />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Inputs dinámicos según el tipo de efecto seleccionado */}
                                        {/* Efectos numéricos simples: solo necesitan un valor entero (curación, maná, experiencia, puntos...) */}
                                        {(['heal_hp', 'heal_mana', 'add_xp', 'add_points', 'clan_points'].includes(eff.type)) && (
                                            <TextInput 
                                                style={styles.miniInput}
                                                placeholder="Valor"
                                                keyboardType="numeric"
                                                value={eff.value?.toString()}
                                                onChangeText={v => updateEffect(index, { value: parseInt(v) || 0 })}
                                            />
                                        )}

                                        {/* Efecto que aumenta una estadística concreta (texto libre, p.ej. strength/focus) en una cantidad numérica */}
                                        {eff.type === 'add_stat' && (
                                            <View style={styles.effectRow}>
                                                <TextInput 
                                                    style={[styles.miniInput, { flex: 1.5 }]}
                                                    placeholder="Stat (strength, focus...)"
                                                    value={eff.stat}
                                                    onChangeText={v => updateEffect(index, { stat: v })}
                                                />
                                                <TextInput 
                                                    style={[styles.miniInput, { flex: 1 }]}
                                                    placeholder="Valor"
                                                    keyboardType="numeric"
                                                    value={eff.value?.toString()}
                                                    onChangeText={v => updateEffect(index, { value: parseInt(v) || 0 })}
                                                />
                                            </View>
                                        )}

                                        {/* Efecto temporal tipo "buff": multiplicador de bonificación y duración en minutos */}
                                        {eff.type === 'buff' && (
                                            <View style={styles.effectRow}>
                                                <TextInput 
                                                    style={[styles.miniInput, { flex: 1 }]}
                                                    placeholder="Mult (Ej: 2)"
                                                    keyboardType="numeric"
                                                    value={eff.multiplier?.toString()}
                                                    onChangeText={v => updateEffect(index, { multiplier: parseFloat(v) || 1 })}
                                                />
                                                <TextInput 
                                                    style={[styles.miniInput, { flex: 1 }]}
                                                    placeholder="Minutos"
                                                    keyboardType="numeric"
                                                    value={eff.durationMinutes?.toString()}
                                                    onChangeText={v => updateEffect(index, { durationMinutes: parseInt(v) || 1 })}
                                                />
                                            </View>
                                        )}

                                        {/* Efecto que otorga un cofre concreto: listamos los cofres del club para elegir cuál se entregará */}
                                        {eff.type === 'chest' && (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 5 }}>
                                                {chests.map(c => (
                                                    <TouchableOpacity 
                                                        key={c.chest_id}
                                                        style={[styles.chestOption, eff.chestId === c.chest_id && { borderColor: theme.colors.primary }]}
                                                        onPress={() => updateEffect(index, { chestId: c.chest_id })}
                                                    >
                                                        <Text style={[styles.chestOptionText, eff.chestId === c.chest_id && { color: theme.colors.primary }]}>{c.name}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        )}
                                    </View>
                                ))}
                                <TouchableOpacity style={styles.addEffectBtn} onPress={addEffect}>
                                    <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
                                    <Text style={styles.addEffectBtnText}>Añadir Efecto</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsModalVisible(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={saveItem}>
                                <Text style={styles.saveButtonText}>{t('market.saveItem')}</Text>
                            </TouchableOpacity>
                        </View>
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
        padding: theme.spacing.l,
        paddingTop: Platform.OS === 'web' ? theme.spacing.l : theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: {
        padding: 4,
        marginRight: 16,
    },
    addButton: {
        padding: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        padding: 10,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    tabBtnActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    tabBtnText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 14,
    },
    tabBtnTextActive: {
        color: '#FFF',
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
    },
    listContent: {
        padding: theme.spacing.m,
        alignSelf: 'center',
        width: '100%',
        maxWidth: 1200,
    },
    filterContainer: {
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        padding: 5,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: 12,
        paddingHorizontal: 15,
        marginHorizontal: 10,
        marginVertical: 10,
        height: 45,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    searchInput: {
        flex: 1,
        color: theme.colors.text,
        fontSize: 16,
    },
    filterRow: {
        paddingHorizontal: 10,
        paddingBottom: 10,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    filterChipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    filterChipText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 13,
    },
    filterChipTextActive: {
        color: '#FFF',
    },
    miniChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginRight: 5,
    },
    miniChipActive: {
        backgroundColor: theme.colors.secondary || theme.colors.primary + '40',
        borderColor: theme.colors.primary,
    },
    miniChipText: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        fontWeight: 'bold',
    },
    miniChipTextActive: {
        color: theme.colors.primary,
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l || 16,
        padding: 0,
        margin: 8,
        flex: 1,
        minWidth: Platform.OS === 'web' ? 250 : '100%',
        maxWidth: Platform.OS === 'web' ? 380 : '100%',
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
        // Sombra sutil para dar sensación premium a la tarjeta
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardTop: {
        height: 160,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    cardBody: {
        padding: 15,
    },
    actionButtons: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    rarityBadgeContainer: {
        flex: 1,
        alignItems: 'flex-end',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    itemCategoryText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: theme.colors.primary,
        letterSpacing: 1,
    },
    slotBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.background,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    slotBadgeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: theme.colors.textSecondary,
    },
    itemInfo: {
        flex: 1,
    },
    itemImage: {
        width: 100,
        height: 100,
        borderRadius: 12,
        backgroundColor: '#2D3748',
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 12,
        backgroundColor: theme.colors.primary + '15',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    term: {
        color: theme.colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    meaning: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: 8,
    },
    itemFooter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    priceBadge: {
        backgroundColor: '#FFD700' + '20',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    priceText: {
        color: '#B8860B',
        fontWeight: 'bold',
        fontSize: 12,
    },
    typeBadge: {
        backgroundColor: theme.colors.border,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginLeft: 10,
    },
    typeText: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    stockBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginLeft: 10,
    },
    stockText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 12,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        fontStyle: 'italic',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 24,
        maxWidth: 500,
        width: '100%',
        alignSelf: 'center',
        maxHeight: '90%',
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 20,
    },
    label: {
        color: theme.colors.textSecondary,
        marginBottom: 8,
        fontWeight: 'bold',
    },
    miniLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginBottom: 4,
        fontWeight: 'bold',
    },
    merchantPriceBox: {
        backgroundColor: theme.colors.background,
        padding: 10,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: 8,
    },
    typeButtonText: {
        color: theme.colors.primary,
        fontWeight: 'bold',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 10,
    },
    cancelButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    cancelButtonText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    saveButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.primary, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
    checkboxChecked: { backgroundColor: theme.colors.primary },
    checkboxLabel: { color: theme.colors.text, fontSize: 14, flex: 1 },
    combatSection: { backgroundColor: theme.colors.background, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 15 },
    slotBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, marginRight: 8, backgroundColor: theme.colors.surface },
    slotBtnActive: { backgroundColor: '#E53E3E', borderColor: '#E53E3E' },
    slotBtnText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold' },
    statsBadge: { backgroundColor: '#3182CE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 10 },
    statsBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    rarityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    rarityText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    effectsSection: {
        marginTop: 20,
        backgroundColor: theme.colors.background,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    effectCard: {
        backgroundColor: theme.colors.surface,
        padding: 10,
        borderRadius: 6,
        marginBottom: 10,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.primary,
    },
    effectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    effectTypeBtn: { flex: 1, backgroundColor: theme.colors.background, padding: 8, borderRadius: 4 },
    effectTypeText: { color: theme.colors.text, fontSize: 12, fontWeight: 'bold' },
    miniInput: {
        backgroundColor: theme.colors.background,
        padding: 6,
        borderRadius: 4,
        color: theme.colors.text,
        marginTop: 5,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    addEffectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8 },
    addEffectBtnText: { color: theme.colors.primary, fontWeight: 'bold' },
    chestOption: { padding: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4, marginRight: 8 },
    chestOptionText: { color: theme.colors.textSecondary, fontSize: 10 },
});
