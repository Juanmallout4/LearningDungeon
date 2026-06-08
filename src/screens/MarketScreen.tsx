import React, { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Platform, Image, ScrollView, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { ClubService } from '../services/ClubService';
import { apiFetch } from '../utils/apiFetch';
import { MarketItem } from '../types';
import { AuthService } from '../services/AuthService';

const ACTIVITY_TYPE_LABEL_KEYS: Record<string, { labelKey: string; defaultLabel: string }> = {
    taekwondo_itf: { labelKey: 'settings.activityTypeTaekwondo', defaultLabel: 'Taekwondo ITF' },
    ingles: { labelKey: 'settings.activityTypeIngles', defaultLabel: 'Inglés' },
    ballet: { labelKey: 'settings.activityTypeBallet', defaultLabel: 'Ballet' },
};

export const MarketScreen = () => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { theme } = useTheme();
    const styles = createStyles(theme);
    // Aqui mapeamos cada rareza de objeto RPG a su color distintivo para insignias y bordes
    const getRarityColor = (rarity: string) => {
        switch (rarity) {
            case 'rare': return '#3182CE';
            case 'epic': return '#805AD5';
            case 'legendary': return '#D69E2E';
            default: return theme.colors.textSecondary;
        }
    };

    // Catálogo de la tienda del club, ofertas especiales del mercader ambulante (solo domingos) y objetos
    // del inventario del jugador que el mercader está dispuesto a comprarle (sellableItems)
    const [items, setItems] = useState<MarketItem[]>([]);
    const [merchantDeals, setMerchantDeals] = useState<MarketItem[]>([]);
    const [sellableItems, setSellableItems] = useState<any[]>([]);
    const [isSellableLoading, setIsSellableLoading] = useState(false);
    const [merchantMode, setMerchantMode] = useState<'buy' | 'sell'>('buy');
    const [points, setPoints] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isMerchantLoading, setIsMerchantLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    // Conjunto de tipos de actividad que el usuario practica (taekwondo/inglés/ballet); se usa para no mostrarle objetos que no le aplican
    const [practicedTypes, setPracticedTypes] = useState<Set<string>>(new Set());
    const [category, setCategory] = useState<'all' | 'physical' | 'virtual' | 'rpg'>('all');
    // El mercader ambulante solo aparece domingos y martes (días 0 y 2 de la semana)
    const [isSunday, setIsSunday] = useState([0, 2].includes(new Date().getDay()));
    const [activeSection, setActiveSection] = useState<'store' | 'merchant'>('store');
    // Objeto pendiente de confirmar compra/venta: usamos modales propios porque Alert.alert con botones no funciona en web
    const [pendingBuyItem, setPendingBuyItem] = useState<MarketItem | null>(null);
    const [pendingSellItem, setPendingSellItem] = useState<{ group: any; qty: number } | null>(null);

    // Filtros avanzados de la tienda: búsqueda por texto (con debounce para no filtrar en cada pulsación), rareza y slot de equipo
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 250);
    const [rarityFilter, setRarityFilter] = useState('all');
    const [slotFilter, setSlotFilter] = useState('all');

    // Lista de la tienda ya filtrada según: tipo de actividad practicada, texto de búsqueda, categoría
    // (físico/virtual/rpg) y, si la categoría es 'rpg', también por rareza y slot de equipo.
    // Memoizada para recalcularse solo cuando cambian sus dependencias, no en cada render
    const filteredItems = useMemo(() => items.filter(i => {
        if (i.activityType && !practicedTypes.has(i.activityType)) return false;
        if (debouncedSearch && !i.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        if (category === 'physical' && i.type !== 'physical') return false;
        if (category === 'virtual' && (i.type !== 'virtual' || !!i.combatStats)) return false;
        if (category === 'rpg' && !i.combatStats) return false;
        if (category === 'rpg') {
            if (rarityFilter !== 'all' && i.rarity !== rarityFilter) return false;
            if (slotFilter !== 'all' && i.combatStats?.slot !== slotFilter) return false;
        }
        return true;
    }), [items, debouncedSearch, category, rarityFilter, slotFilter, practicedTypes]);

    useEffect(() => {
        loadData();
    }, []);

    // Carga inicial: trae usuario, catálogo de la tienda del club, puntos del usuario y tipos de actividad que practica.
    // Si es día de mercader (domingo/martes), además carga sus ofertas y los objetos que compraría del inventario del jugador
    const loadData = async () => {
        setIsLoading(true);
        try {
            const user = await AuthService.getSavedUser();
            setCurrentUser(user);
            const GLOBAL_CLUB_ID = '00000000-0000-4000-a000-000000000000';
            const targetOrgId = user?.organizationId || GLOBAL_CLUB_ID;

            if (user) {
                console.log('Loading market for club:', targetOrgId, 'user:', user.id);
                try {
                    const [marketItems, userPoints, practiced] = await Promise.all([
                        ClubService.getMarketItems(targetOrgId),
                        ClubService.getUserPoints(user.id),
                        ClubService.getPracticedActivityTypes(user)
                    ]);
                    setItems(marketItems);
                    setPracticedTypes(practiced);
                    // Algunos endpoints antiguos devuelven "oro" en vez de "points"; usamos el que esté disponible
                    setPoints(userPoints.points !== undefined ? userPoints.points : (userPoints as any).oro || 0);

                    if (isSunday) {
                        loadMerchantDeals(user.id, targetOrgId);
                        loadSellableItems(user.id);
                    }
                } catch (innerError: any) {
                    console.error('Inner error fetching market data:', innerError);
                    const errorMsg = innerError.message || 'Unknown network error';
                    if (Platform.OS === 'web') {
                        window.alert('Error de red: ' + errorMsg);
                    } else {
                        Alert.alert('Error', errorMsg);
                    }
                }
            }
        } catch (error: any) {
            console.error('Critical error in loadData:', error);
            if (Platform.OS === 'web') {
                window.alert('Error crítico: ' + error.message);
            } else {
                Alert.alert('Error crítico', error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Trae las ofertas especiales del mercader ambulante para este usuario y club (solo disponibles los días que aparece)
    const loadMerchantDeals = async (userId: string, clubId: string) => {
        setIsMerchantLoading(true);
        try {
            const res = await apiFetch(`/api/merchant/deals?userId=${userId}&clubId=${clubId}`);
            const data = await res.json();
            if (res.ok) {
                setMerchantDeals(data.deals || []);
            }
        } catch (error) {
            console.error('Error loading merchant deals', error);
        } finally {
            setIsMerchantLoading(false);
        }
    };

    // Trae el inventario completo del jugador y filtra los objetos que el mercader está dispuesto a comprarle:
    // deben estar marcados como is_merchant_buyable en el catálogo y no estar equipados actualmente (no se pueden vender objetos en uso)
    const loadSellableItems = async (userId: string) => {
        setIsSellableLoading(true);
        try {
            const res = await apiFetch(`/api/users/${userId}/inventory`);
            const data = await res.json();
            if (res.ok) {
                const sellable = (data.inventory || []).filter((i: any) => i.is_merchant_buyable && !i.is_equipped);
                setSellableItems(sellable);
            }
        } catch (error) {
            console.error('Error loading sellable items', error);
        } finally {
            setIsSellableLoading(false);
        }
    };

    // Agrupa las copias idénticas del inventario vendible por item_id (p.ej. varios "Un Palo") en una sola tarjeta
    // con selector de cantidad, en lugar de mostrar un botón de venta por cada copia individual.
    // Cada grupo guarda además la lista de inventoryIds (las filas reales de inventario) para poder vender unidad por unidad
    const groupedSellableItems = useMemo(() => {
        const groups = new Map<string, any>();
        sellableItems.forEach(item => {
            const existing = groups.get(item.item_id);
            if (existing) {
                existing.quantity += 1;
                existing.inventoryIds.push(item.inventory_id);
            } else {
                groups.set(item.item_id, { ...item, quantity: 1, inventoryIds: [item.inventory_id] });
            }
        });
        return Array.from(groups.values());
    }, [sellableItems]);

    // Cantidad a vender seleccionada por el usuario para cada item_id (sellQty), siempre acotada entre 1 y el máximo disponible en ese grupo
    const [sellQty, setSellQty] = useState<Record<string, number>>({});
    const getSellQty = (itemId: string, max: number) => Math.min(Math.max(sellQty[itemId] || 1, 1), max);
    const adjustSellQty = (itemId: string, delta: number, max: number) => {
        setSellQty(prev => ({ ...prev, [itemId]: Math.min(Math.max(getSellQty(itemId, max) + delta, 1), max) }));
    };

    // Prepara la venta: calcula la cantidad elegida para este grupo y abre el modal de confirmación (la venta real ocurre en confirmSell)
    const handleSellToMerchant = (group: any) => {
        if (!currentUser) return;
        const qty = getSellQty(group.item_id, group.quantity);
        setPendingSellItem({ group, qty });
    };

    // Ejecuta la venta confirmada: por cada unidad pedida llama al endpoint de venta con su inventoryId concreto
    // (uno a uno, deteniéndose si alguna falla), suma las recompensas recibidas, retira del estado local los objetos
    // ya vendidos, refresca el saldo de puntos del jugador y muestra el resultado (éxito total, parcial o fallo)
    const confirmSell = async () => {
        if (!currentUser || !pendingSellItem) return;
        const { group, qty } = pendingSellItem;
        setPendingSellItem(null);

        let totalReward = 0;
        const soldIds: string[] = [];
        try {
            for (let i = 0; i < qty; i++) {
                const inventoryId = group.inventoryIds[i];
                const res = await apiFetch('/api/merchant/sell', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, inventoryId })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    totalReward += data.reward;
                    soldIds.push(inventoryId);
                } else {
                    break;
                }
            }
        } catch (e) {
            console.error('Error selling to merchant', e);
        }

        if (soldIds.length > 0) {
            setSellableItems(prev => prev.filter(i => !soldIds.includes(i.inventory_id)));
            setSellQty(prev => {
                const next = { ...prev };
                delete next[group.item_id];
                return next;
            });
            const userPoints = await ClubService.getUserPoints(currentUser.id);
            setPoints(userPoints.points !== undefined ? userPoints.points : (userPoints as any).oro || 0);
            Alert.alert("Éxito", `Has vendido ${soldIds.length} x ${group.name} por ${totalReward} puntos.`);
        }
        if (soldIds.length < qty) {
            Alert.alert("Aviso", soldIds.length > 0 ? "Algunos objetos no se pudieron vender." : "No se pudo vender el objeto.");
        }
    };

    // Antes de abrir el modal de confirmación de compra, comprobamos que el jugador tenga puntos suficientes
    const handleBuy = (item: MarketItem) => {
        if (!currentUser) return;
        if (points < item.costPoints) {
            Alert.alert(t('market.insufficientPointsTitle'), t('market.insufficientPoints'));
            return;
        }
        setPendingBuyItem(item);
    };

    // Ejecuta la compra confirmada a través de ClubService, actualiza el saldo de puntos con el valor que devuelve el backend y avisa al usuario
    const confirmBuy = async () => {
        if (!currentUser || !pendingBuyItem) return;
        const item = pendingBuyItem;
        setPendingBuyItem(null);
        try {
            const result = await ClubService.buyMarketItem(currentUser.id, item.id, item.costPoints);
            setPoints(result.remainingPoints);
            Alert.alert(t('market.successTitle'), t('market.successMessage', { name: item.name }));
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || t('market.errorBuy'));
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('market.title')}</Text>
                </View>
                <View style={styles.walletBadge}>
                    <Ionicons name="star" size={16} color="#000" />
                    <Text style={styles.walletText}>{points} PTS</Text>
                </View>
            </View>

            {isSunday && (
                <View style={styles.sectionTabs}>
                    <TouchableOpacity 
                        style={[styles.sectionTab, activeSection === 'store' && styles.sectionTabActive]} 
                        onPress={() => setActiveSection('store')}
                    >
                        <Text style={[styles.sectionTabText, activeSection === 'store' && styles.sectionTabTextActive]}>{t('market.tabStore')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.sectionTab, activeSection === 'merchant' && styles.sectionTabActive, { borderColor: '#B8860B' }]} 
                        onPress={() => setActiveSection('merchant')}
                    >
                        <Ionicons name="cart" size={16} color={activeSection === 'merchant' ? '#FFF' : '#B8860B'} />
                        <Text style={[styles.sectionTabText, activeSection === 'merchant' && styles.sectionTabTextActive, activeSection === 'merchant' && { color: '#FFF' }, activeSection !== 'merchant' && { color: '#B8860B' }]}>{t('market.tabMerchant')}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isSunday && activeSection === 'merchant' && (
                <View style={[styles.sectionTabs, { marginTop: 0 }]}>
                    <TouchableOpacity
                        style={[styles.filterBtn, merchantMode === 'buy' && styles.filterBtnActive, { flex: 1, alignItems: 'center' }]}
                        onPress={() => setMerchantMode('buy')}
                    >
                        <Text style={[styles.filterBtnText, merchantMode === 'buy' && { color: '#FFF' }]}>{t('market.buy', { defaultValue: 'Comprar' })}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterBtn, merchantMode === 'sell' && styles.filterBtnActive, { flex: 1, alignItems: 'center' }]}
                        onPress={() => setMerchantMode('sell')}
                    >
                        <Text style={[styles.filterBtnText, merchantMode === 'sell' && { color: '#FFF' }]}>{t('inventory.sellToMerchant', { defaultValue: 'Vender' })}</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.filterContainer}>
                {activeSection === 'store' && (
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
                )}

                {activeSection === 'store' && (
                    <View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                            <TouchableOpacity style={[styles.filterBtn, category === 'all' && styles.filterBtnActive]} onPress={() => setCategory('all')}>
                                <Text style={[styles.filterBtnText, category === 'all' && {color: '#FFF'}]}>{t('market.filterAll')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.filterBtn, category === 'physical' && styles.filterBtnActive]} onPress={() => setCategory('physical')}>
                                <Text style={[styles.filterBtnText, category === 'physical' && {color: '#FFF'}]}>{t('market.filterPhysical')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.filterBtn, category === 'virtual' && styles.filterBtnActive]} onPress={() => setCategory('virtual')}>
                                <Text style={[styles.filterBtnText, category === 'virtual' && {color: '#FFF'}]}>{t('market.filterVirtual')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.filterBtn, category === 'rpg' && styles.filterBtnActive]} onPress={() => setCategory('rpg')}>
                                <Text style={[styles.filterBtnText, category === 'rpg' && {color: '#FFF'}]}>{t('market.filterRPG')}</Text>
                            </TouchableOpacity>
                        </ScrollView>

                        {category === 'rpg' && (
                            <View style={{ paddingBottom: 10 }}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { paddingTop: 0 }]}>
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
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { paddingTop: 0 }]}>
                                    <Ionicons name="shield-outline" size={16} color={theme.colors.textSecondary} style={{ alignSelf: 'center', marginRight: 5 }} />
                                    {['all', 'helmet', 'body', 'legs', 'neck', 'ring', 'weapon_1h_right', 'arm_right', 'arm_left'].map(s => (
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
                )}
            </View>

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : items.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="storefront-outline" size={64} color={theme.colors.textSecondary} />
                    <Text style={{ color: theme.colors.textSecondary, marginTop: 16, fontSize: 18 }}>{t('market.empty')}</Text>
                </View>
            ) : activeSection === 'merchant' && merchantMode === 'sell' ? (
                <FlatList
                    data={groupedSellableItems}
                    key={Platform.OS === 'web' ? 'grid-3-sell' : 'list-1-sell'}
                    keyExtractor={item => item.item_id}
                    numColumns={Platform.OS === 'web' ? 3 : 1}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        isSellableLoading ? (
                            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
                        ) : (
                            <View style={{ alignItems: 'center', padding: 40 }}>
                                <Ionicons name="cart-outline" size={64} color={theme.colors.textSecondary} />
                                <Text style={{ color: theme.colors.textSecondary, marginTop: 16, fontSize: 16, textAlign: 'center' }}>
                                    No tienes objetos que el Mercader quiera comprarte hoy.
                                </Text>
                            </View>
                        )
                    }
                    renderItem={({ item }) => {
                        const qty = getSellQty(item.item_id, item.quantity);
                        return (
                            <View style={styles.card}>
                                <View style={styles.cardTop}>
                                    {item.image_url ? (
                                        <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="contain" />
                                    ) : (
                                        <View style={styles.iconContainer}>
                                            <Ionicons name={item.type === 'physical' ? "ticket" : !!item.combatStats ? "shield" : "color-palette"} size={48} color={theme.colors.primary} />
                                        </View>
                                    )}
                                    <View style={[styles.priceTag, { backgroundColor: '#B8860B' }]}>
                                        <Text style={styles.priceText}>{item.sell_price_min || 5}-{item.sell_price_max || 50} PTS c/u</Text>
                                    </View>
                                    {item.quantity > 1 && (
                                        <View style={[styles.priceTag, { left: 10, right: undefined, backgroundColor: theme.colors.primary }]}>
                                            <Text style={styles.priceText}>x{item.quantity}</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.cardBody}>
                                    <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
                                    <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>

                                    {item.quantity > 1 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 14 }}>
                                            <TouchableOpacity onPress={() => adjustSellQty(item.item_id, -1, item.quantity)} disabled={qty <= 1}>
                                                <Ionicons name="remove-circle" size={28} color={qty <= 1 ? theme.colors.border : theme.colors.textSecondary} />
                                            </TouchableOpacity>
                                            <Text style={{ color: theme.colors.text, fontWeight: 'bold', fontSize: 16, minWidth: 50, textAlign: 'center' }}>
                                                {qty} / {item.quantity}
                                            </Text>
                                            <TouchableOpacity onPress={() => adjustSellQty(item.item_id, 1, item.quantity)} disabled={qty >= item.quantity}>
                                                <Ionicons name="add-circle" size={28} color={qty >= item.quantity ? theme.colors.border : theme.colors.textSecondary} />
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <View style={{ height: item.quantity > 1 ? 14 : 70 }} />
                                    <TouchableOpacity
                                        style={[styles.buyBtn, { backgroundColor: '#B8860B', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]}
                                        onPress={() => handleSellToMerchant(item)}
                                    >
                                        <Ionicons name="cart" size={16} color="#FFF" style={{ marginRight: 6 }} />
                                        <Text style={styles.buyBtnText}>{t('inventory.sellToMerchant')}{item.quantity > 1 ? ` (x${qty})` : ''}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                />
            ) : (
                <FlatList
                    data={activeSection === 'store' ? filteredItems : merchantDeals}
                    key={Platform.OS === 'web' ? 'grid-3-' + category : 'list-1'}
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
                                <View style={styles.priceTag}>
                                    <Text style={styles.priceText}>{item.costPoints} PTS</Text>
                                </View>
                            </View>

                            <View style={styles.cardBody}>
                                <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>

                                {item.combatStats ? (
                                    <View style={styles.statsPanel}>
                                        {item.combatStats.hpBoost > 0 && <Text style={styles.statLine}>+{item.combatStats.hpBoost} HP</Text>}
                                        {item.combatStats.damageMultiplier > 1 && <Text style={styles.statLine}>x{item.combatStats.damageMultiplier} DMG</Text>}
                                        {item.combatStats.healBoost > 0 && <Text style={styles.statLine}>+{item.combatStats.healBoost} HEAL</Text>}
                                    </View>
                                ) : <View style={{height: 18}} />}

                                <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>

                                {item.combatStats && item.combatStats.specialAbilityName ? (
                                    <View style={styles.loreBox}>
                                        <Text style={styles.loreTitle}>✨ {item.combatStats.specialAbilityName}</Text>
                                        <Text style={styles.loreDesc} numberOfLines={1}>{item.combatStats.specialAbilityDesc}</Text>
                                    </View>
                                ) : <View style={{height: 52}} />}

                                <View style={styles.cardFooter}>
                                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                                        <Text style={styles.itemType}>{item.combatStats ? t('market.filterRPG') : item.type === 'physical' ? t('market.filterPhysical') : t('market.filterVirtual')}</Text>
                                        {item.combatStats && (
                                            <View style={[styles.rarityBadge, {backgroundColor: getRarityColor(item.rarity || 'common')}]}>
                                                <Text style={styles.rarityText}>{item.rarity?.toUpperCase()}</Text>
                                            </View>
                                        )}
                                        {item.activityType && (
                                            <View style={styles.slotBadge}>
                                                <Text style={styles.slotBadgeText}>
                                                    {t(ACTIVITY_TYPE_LABEL_KEYS[item.activityType]?.labelKey || '', { defaultValue: ACTIVITY_TYPE_LABEL_KEYS[item.activityType]?.defaultLabel || item.activityType }).toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    {item.combatStats && (
                                        <View style={styles.slotBadge}>
                                            <Text style={styles.slotBadgeText}>{item.combatStats.slot?.toUpperCase()}</Text>
                                        </View>
                                    )}
                                </View>

                                <TouchableOpacity 
                                    style={[styles.buyBtn, points < item.costPoints ? styles.buyBtnDisabled : null]}
                                    onPress={() => handleBuy(item)}
                                    disabled={points < item.costPoints}
                                >
                                    <Text style={styles.buyBtnText}>{t('market.buy')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            )}

            {/* MODAL DE CONFIRMACION DE COMPRA — usamos un modal propio porque Alert.alert con botones no funciona en web */}
            <Modal visible={pendingBuyItem !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="cart" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
                        <Text style={styles.modalTitle}>{t('common.confirm', { defaultValue: 'Confirmar compra' })}</Text>
                        <Text style={styles.modalDesc}>
                            {t('market.buyConfirm', {
                                name: pendingBuyItem?.name,
                                cost: pendingBuyItem?.costPoints,
                                defaultValue: `¿Comprar "${pendingBuyItem?.name}" por ${pendingBuyItem?.costPoints} pts?`
                            })}
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPendingBuyItem(null)}>
                                <Text style={styles.modalCancelText}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmBuy}>
                                <Text style={styles.modalConfirmText}>{t('market.buy', { defaultValue: 'Comprar' })}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL DE CONFIRMACION DE VENTA — usamos un modal propio porque Alert.alert con botones no funciona en web */}
            <Modal visible={pendingSellItem !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Ionicons name="cash" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
                        <Text style={styles.modalTitle}>{t('inventory.sellToMerchant', { defaultValue: 'Vender al Mercader' })}</Text>
                        <Text style={styles.modalDesc}>
                            {`¿Vender ${pendingSellItem?.qty} x ${pendingSellItem?.group?.name} al Mercader? Recibirás puntos a cambio y no podrás recuperar ${(pendingSellItem?.qty || 0) > 1 ? 'los objetos' : 'el objeto'}.`}
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPendingSellItem(null)}>
                                <Text style={styles.modalCancelText}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmSell}>
                                <Text style={styles.modalConfirmText}>{t('inventory.sellToMerchant', { defaultValue: 'Vender' })}</Text>
                            </TouchableOpacity>
                        </View>
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
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
    },
    walletBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFD700',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 4,
    },
    walletText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16,
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
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: 12,
        paddingHorizontal: 15,
        marginHorizontal: 15,
        marginTop: 15,
        height: 45,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    searchInput: {
        flex: 1,
        color: theme.colors.text,
        fontSize: 16,
    },
    filterScroll: {
        padding: theme.spacing.m,
        gap: 10,
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
        borderRadius: 16,
        padding: 0,
        margin: 8,
        flex: 1,
        minWidth: Platform.OS === 'web' ? 250 : '100%',
        maxWidth: Platform.OS === 'web' ? 380 : '100%',
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
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
    itemImage: {
        width: 100,
        height: 100,
        borderRadius: 12,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 12,
        backgroundColor: theme.colors.primary + '15',
        justifyContent: 'center',
        alignItems: 'center',
    },
    priceTag: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: '#FFD700',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    priceText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 14,
    },
    itemTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    itemDesc: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: 12,
        height: 40,
    },
    itemType: {
        fontSize: 10,
        color: theme.colors.primary,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    buyBtn: {
        backgroundColor: theme.colors.primary,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buyBtnDisabled: {
        backgroundColor: theme.colors.border,
        opacity: 0.5,
    },
    buyBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    statsPanel: {
        flexDirection: 'row',
        gap: 5,
        marginBottom: 10,
    },
    statLine: {
        fontSize: 9,
        fontWeight: 'bold',
        color: theme.colors.error,
        backgroundColor: theme.colors.error + '15',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    loreBox: {
        marginBottom: 10,
        backgroundColor: theme.colors.background,
        padding: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    loreTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#B8860B',
        marginBottom: 2,
    },
    loreDesc: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    rarityBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    rarityText: {
        color: '#FFF',
        fontSize: 8,
        fontWeight: 'bold',
    },
    slotBadge: {
        backgroundColor: theme.colors.background,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    slotBadgeText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: theme.colors.textSecondary,
    },
    filterBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
    },
    filterBtnActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    filterBtnText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    sectionTabs: {
        flexDirection: 'row',
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        gap: 12,
    },
    sectionTab: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sectionTabActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    sectionTabText: {
        fontWeight: 'bold',
        color: theme.colors.textSecondary,
    },
    sectionTabTextActive: {
        color: '#FFF',
    },
    // Estilos del modal de confirmacion de compra
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        width: '100%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    modalDesc: {
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 15,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modalCancelText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        fontSize: 15,
    },
    modalConfirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
    },
    modalConfirmText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
});
