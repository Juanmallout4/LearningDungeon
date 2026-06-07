import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Platform, ActivityIndicator, Image, ScrollView, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../utils/apiFetch';

export const BossManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};
    const targetClubId = route.params?.clubId || user?.organizationId;
    const { theme } = useTheme();
    const styles = createStyles(theme);

    const [bosses, setBosses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [bossName, setBossName] = useState('');
    const [bossHp, setBossHp] = useState('1000');
    const [bossReward, setBossReward] = useState('500');
    const [bossImage, setBossImage] = useState('');
    const [minDamage, setMinDamage] = useState('10');
    const [maxDamage, setMaxDamage] = useState('20');
    const [minInterval, setMinInterval] = useState('1');
    const [maxInterval, setMaxInterval] = useState('10');
    const [category, setCategory] = useState('monster');
    const [expReward, setExpReward] = useState('50');
    const [lootTable, setLootTable] = useState<any[]>([]); // [{itemId, name, chance, quantity}]
    
    const [isCreating, setIsCreating] = useState(false);
    const [showLootModal, setShowLootModal] = useState(false);
    const [availableMarketItems, setAvailableMarketItems] = useState<any[]>([]);

    useEffect(() => {
        if (targetClubId) fetchBosses();
    }, [targetClubId]);

    const fetchBosses = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch(`/api/clubs/${targetClubId}/bosses`);
            const data = await res.json();
            if (res.ok) setBosses(data.bosses);
        } catch (e) {
            console.error('Fetch bosses fail', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setBossName(item.name);
        setBossHp(item.totalHp.toString());
        setBossReward(item.rewardPoints.toString());
        setBossImage(item.imageUrl || '');
        setCategory(item.category || 'monster');
        setExpReward(item.expReward?.toString() || '50');
        setMinDamage(item.baseDamage?.toString() || '10');
        setMaxDamage(item.maxDamage?.toString() || '20');
        setMinInterval((parseInt(item.attackIntervalMin) / 1000).toString() || '1');
        setMaxInterval((parseInt(item.attackIntervalMax) / 1000).toString() || '10');
        setLootTable(item.lootTable || []);
    };

    const fetchMarketItems = async () => {
        try {
            const res = await apiFetch(`/api/clubs/${targetClubId}/market?isAdmin=true`);
            const data = await res.json();
            if (data.items) {
                // Only materials for loot
                setAvailableMarketItems(data.items.filter((i: any) => i.itemType === 'material'));
            }
        } catch (e) { console.error(e); }
    };

    const toggleLootModal = () => {
        if (!showLootModal) fetchMarketItems();
        setShowLootModal(!showLootModal);
    };

    const addItemToLoot = (item: any) => {
        if (lootTable.find(l => l.itemId === item.id)) return;
        setLootTable([...lootTable, { itemId: item.id, name: item.name, chance: 1, quantity: 1 }]);
    };
    
    const updateLootItem = (itemId: string, field: string, value: any) => {
        setLootTable(prev => prev.map(l => l.itemId === itemId ? { ...l, [field]: value } : l));
    };

    const removeLootItem = (itemId: string) => {
        setLootTable(prev => prev.filter(l => l.itemId !== itemId));
    };

    const handleCreateOrUpdate = async () => {
        if (!bossName || !bossHp) {
            Alert.alert('Error', 'Nombre y Vida son obligatorios');
            return;
        }

        setIsCreating(true);
        try {
            const payload = {
                name: bossName,
                totalHp: parseInt(bossHp, 10),
                rewardPoints: parseInt(bossReward, 10) || 0,
                imageUrl: bossImage || 'https://via.placeholder.com/150/2A1C1C/FF4B4B?text=BOSS',
                category,
                expReward: parseInt(expReward, 10) || 50,
                minDamage: parseInt(minDamage, 10) || 10,
                maxDamage: parseInt(maxDamage, 10) || 20,
                attackIntervalMin: (parseFloat(minInterval) * 1000) || 1000,
                attackIntervalMax: (parseFloat(maxInterval) * 1000) || 10000,
                lootTable: lootTable,
                isActive: editingId ? bosses.find(b => b.id === editingId)?.isActive : true
            };

            const url = editingId 
                ? `/api/clubs/${targetClubId}/bosses/${editingId}`
                : `/api/clubs/${targetClubId}/bosses`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setEditingId(null);
                setBossName('');
                setBossHp('1000');
                setBossReward('500');
                setBossImage('');
                setCategory('monster');
                setExpReward('50');
                setMinDamage('10');
                setMaxDamage('20');
                setMinInterval('1');
                setMaxInterval('10');
                Alert.alert('¡Éxito!', editingId ? 'Jefe actualizado.' : 'Nuevo Jefe invocado.');
                fetchBosses();
            } else {
                Alert.alert('Error', 'No se pudo procesar la solicitud.');
            }
        } catch (error) {
            Alert.alert('Error', 'Error de red.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteBoss = async (bossId: string) => {
        const confirmStr = '¿Estás seguro de eliminar este jefe de la historia del club?';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (!window.confirm(confirmStr)) return;
        }

        try {
            const res = await apiFetch(`/api/clubs/${targetClubId}/bosses/${bossId}`, { method: 'DELETE' });
            if (res.ok) {
                setBosses(prev => prev.filter(b => b.id !== bossId));
            }
        } catch (e) {
            console.error('Delete boss error', e);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Gestión de Jefes</Text>
            </View>

            <FlatList
                ListHeaderComponent={
                    <View style={styles.formContainer}>
                        <Text style={styles.formTitle}>{editingId ? 'Editar Jefe' : 'Invocar Nuevo Jefe'}</Text>
                        <Text style={styles.formDesc}>Define las estadísticas del jefe. Recuerda que los Mini-Jefes y Jefes Únicos tienen límites de aparición semanal.</Text>
                        
                        <TextInput style={styles.input} placeholder="Nombre del Jefe" placeholderTextColor={theme.colors.textSecondary} value={bossName} onChangeText={setBossName} />
                        
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1.5 }]} placeholder="Salud (HP)" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={bossHp} onChangeText={setBossHp} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Daño Mín" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={minDamage} onChangeText={setMinDamage} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Daño Máx" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={maxDamage} onChangeText={setMaxDamage} />
                        </View>

                        <Text style={styles.miniLabel}>Intervalos de Ataque (Segundos) - Ej: 1 a 10</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Int. Mín (seg)" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={minInterval} onChangeText={setMinInterval} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Int. Máx (seg)" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={maxInterval} onChangeText={setMaxInterval} />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="XP Recompensa" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={expReward} onChangeText={setExpReward} />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Pts Recompensa" placeholderTextColor={theme.colors.textSecondary} keyboardType="numeric" value={bossReward} onChangeText={setBossReward} />
                        </View>

                        <Text style={[styles.label, { marginTop: 0 }]}>Categoría del Enemigo</Text>
                        <View style={styles.categoryContainer}>
                            {['monster', 'creature', 'miniboss', 'unique'].map(cat => (
                                <TouchableOpacity 
                                    key={cat} 
                                    style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]} 
                                    onPress={() => setCategory(cat)}
                                >
                                    <Text style={[styles.categoryBtnText, category === cat && styles.categoryBtnTextActive]}>
                                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput style={styles.input} placeholder="URL de la Imagen" placeholderTextColor={theme.colors.textSecondary} value={bossImage} onChangeText={setBossImage} />

                        <TouchableOpacity style={styles.lootBtn} onPress={toggleLootModal}>
                            <Ionicons name="gift-outline" size={20} color="#F3E5AB" />
                            <Text style={styles.lootBtnText}>Configurar Botín ({lootTable.length} items)</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[styles.submitButton, { flex: 1 }]} onPress={handleCreateOrUpdate} disabled={isCreating}>
                                {isCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{editingId ? 'Guardar Cambios' : 'Invocar Jefe'}</Text>}
                            </TouchableOpacity>
                            {editingId && (
                                <TouchableOpacity style={[styles.cancelBtn, { flex: 0.5 }]} onPress={() => setEditingId(null)}>
                                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                }
                data={bosses}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <View style={[styles.bossCard, item.isActive && styles.bossCardActive]}>
                        <Image source={{ uri: item.imageUrl || 'https://via.placeholder.com/100' }} style={styles.bossAvatar} />
                        <View style={styles.bossInfo}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.bossNameText}>{item.name}</Text>
                                <View style={styles.catBadge}><Text style={styles.catBadgeText}>{item.category}</Text></View>
                            </View>
                            <Text style={styles.bossHpText}>HP: {item.totalHp} | DMG: {item.minDamage}-{item.maxDamage} | XP: {item.expReward || 50}</Text>
                            {item.isActive && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Jefe Semanal Activo</Text></View>}
                        </View>
                        <View style={{ flexDirection: 'row' }}>
                            <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(item)}>
                                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteBoss(item.id)}>
                                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                ListEmptyComponent={!isLoading ? <Text style={styles.emptyText}>No hay jefes registrados.</Text> : null}
            />

            {/* LOOT TABLE MODAL */}
            <Modal visible={showLootModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Configurar Botín de {bossName || 'nuevo jefe'}</Text>
                            <TouchableOpacity onPress={() => setShowLootModal(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ flex: 1 }}>
                            <Text style={styles.modalSectionTitle}>Items del Botín</Text>
                            {lootTable.map(item => (
                                <View key={item.itemId} style={styles.lootRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.lootItemName}>{item.name}</Text>
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.miniLabel}>Cant.</Text>
                                                <TextInput 
                                                    style={styles.miniInput} 
                                                    value={item.quantity.toString()} 
                                                    keyboardType="numeric"
                                                    onChangeText={v => updateLootItem(item.itemId, 'quantity', parseInt(v) || 1)}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.miniLabel}>Prob. (0-1.0)</Text>
                                                <TextInput 
                                                    style={styles.miniInput} 
                                                    value={item.chance.toString()} 
                                                    keyboardType="numeric"
                                                    onChangeText={v => updateLootItem(item.itemId, 'chance', parseFloat(v) || 0)}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => removeLootItem(item.itemId)} style={{ padding: 10 }}>
                                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                    </TouchableOpacity>
                                </View>
                            ))}

                            <Text style={[styles.modalSectionTitle, { marginTop: 20 }]}>Añadir Materiales</Text>
                            {availableMarketItems.filter(m => !lootTable.find(l => l.itemId === m.id)).map(m => (
                                <TouchableOpacity key={m.id} style={styles.addItemRow} onPress={() => addItemToLoot(m)}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.addItemName}>{m.name}</Text>
                                        <Text style={styles.addItemDesc}>{m.description}</Text>
                                    </View>
                                    <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowLootModal(false)}>
                            <Text style={styles.closeBtnText}>Hecho</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { padding: theme.spacing.l, paddingTop: Platform.OS === 'web' ? theme.spacing.l : theme.spacing.xl, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backButton: { padding: 4, marginRight: 16 },
    headerTitle: { ...theme.typography.header, fontSize: 20, color: theme.colors.text },
    listContent: { padding: theme.spacing.m, paddingBottom: 40, alignSelf: 'center', width: '100%', maxWidth: 800 },
    formContainer: { backgroundColor: theme.colors.surface, padding: 24, borderRadius: 12, marginBottom: 30, borderWidth: 1, borderColor: theme.colors.border },
    formTitle: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8 },
    formDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
    input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, padding: 16, borderRadius: 8, color: theme.colors.text, marginBottom: 12, fontSize: 16 },
    submitButton: { backgroundColor: theme.colors.error, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    submitButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
    cancelBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    cancelBtnText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
    bossCard: { backgroundColor: theme.colors.surface, flexDirection: 'row', padding: 16, borderRadius: 12, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, opacity: 0.8 },
    bossCardActive: { borderColor: theme.colors.error, borderWidth: 2, opacity: 1 },
    bossAvatar: { width: 60, height: 60, borderRadius: 10, marginRight: 16 },
    bossInfo: { flex: 1 },
    bossNameText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
    bossHpText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    activeBadge: { backgroundColor: theme.colors.error, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start', marginTop: 4 },
    activeBadgeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    catBadge: { backgroundColor: theme.colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    catBadgeText: { color: theme.colors.primary, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
    categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    categoryBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
    categoryBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    categoryBtnText: { fontSize: 12, color: theme.colors.textSecondary },
    categoryBtnTextActive: { color: '#FFF', fontWeight: 'bold' },
    editBtn: { padding: 10 },
    deleteBtn: { padding: 10 },
    emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40 },
    label: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginLeft: 4 },
    lootBtn: { backgroundColor: '#1F1511', borderStyle: 'dashed', borderWidth: 1, borderColor: '#D69121', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 10 },
    lootBtnText: { color: '#F3E5AB', fontWeight: 'bold' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: theme.colors.surface, width: '100%', maxWidth: 500, height: '80%', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.colors.primary },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 10 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, flex: 1 },
    modalSectionTitle: { color: '#B7791F', fontSize: 16, fontWeight: 'bold', marginBottom: 15, textTransform: 'uppercase' },
    
    lootRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.background, padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.border },
    lootItemName: { color: theme.colors.text, fontWeight: 'bold', fontSize: 15 },
    miniLabel: { color: theme.colors.textSecondary, fontSize: 10, marginBottom: 2 },
    miniInput: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 4, borderRadius: 4, color: theme.colors.text, fontSize: 12, textAlign: 'center' },
    
    addItemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    addItemName: { color: theme.colors.text, fontSize: 14, fontWeight: 'bold' },
    addItemDesc: { color: theme.colors.textSecondary, fontSize: 12 },
    
    closeBtn: { backgroundColor: theme.colors.primary, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
    closeBtnText: { color: '#FFF', fontWeight: 'bold' }
});
