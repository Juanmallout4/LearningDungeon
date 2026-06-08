import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { MarketItem } from '../../types';

export const ChestManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [chests, setChests] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isChestModalVisible, setIsChestModalVisible] = useState(false);
    const [isPoolModalVisible, setIsPoolModalVisible] = useState(false);
    const [editingChestId, setEditingChestId] = useState<string | null>(null);
    const [selectedChest, setSelectedChest] = useState<any | null>(null);

    // Campos del formulario de creacion/edicion de cofre (nombre, descripcion e imagen)
    const [chestName, setChestName] = useState('');
    const [chestDesc, setChestDesc] = useState('');
    const [chestImg, setChestImg] = useState('');

    // Estado del pool de recompensas: que items puede dar el cofre y con que peso/probabilidad
    const [poolItems, setPoolItems] = useState<any[]>([]);
    const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
    const [isAddingPoolItem, setIsAddingPoolItem] = useState(false);
    const [selectedPoolItem, setSelectedPoolItem] = useState<string | null>(null);
    const [poolWeight, setPoolWeight] = useState('1');

    // Carga inicial: en cuanto monta la pantalla pedimos los cofres del club
    useEffect(() => {
        loadChests();
    }, []);

    // Pide a ClubService los cofres del club activo y los guarda en el estado para la lista
    const loadChests = async () => {
        setIsLoading(true);
        const clubId = route.params?.clubId || user?.organizationId;
        if (!clubId) return;
        try {
            const data = await ClubService.getChests(clubId);
            setChests(data);
        } catch (error) {
            console.error('Error loading chests', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Valida el nombre y, segun haya editingChestId o no, llama a updateChest o addChest; al terminar cierra el modal y recarga
    const handleSaveChest = async () => {
        const clubId = route.params?.clubId || user?.organizationId;
        if (!chestName) return Alert.alert('Error', 'El nombre es obligatorio');
        try {
            if (editingChestId) {
                await ClubService.updateChest(clubId, editingChestId, chestName, chestDesc, chestImg);
            } else {
                await ClubService.addChest(clubId, chestName, chestDesc, chestImg);
            }
            setIsChestModalVisible(false);
            loadChests();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    // Pide confirmacion con un Alert nativo antes de borrar el cofre y todo su contenido
    const handleDeleteChest = (id: string) => {
        const clubId = route.params?.clubId || user?.organizationId;
        Alert.alert(
            'Eliminar Cofre',
            '¿Estás seguro de que quieres eliminar este cofre y todo su contenido?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: async () => {
                    try {
                        await ClubService.deleteChest(clubId, id);
                        loadChests();
                    } catch (e: any) { Alert.alert('Error', e.message); }
                }}
            ]
        );
    };

    // Abre el modal de contenido del cofre: carga en paralelo (secuencial aqui) el pool actual del cofre y los items del mercado del club para poder añadirlos
    const openPoolManagement = async (chest: any) => {
        setSelectedChest(chest);
        setIsLoading(true);
        try {
            const poolRes = await ClubService.getChestPool(chest.chest_id);
            setPoolItems(poolRes);
            const clubItems = await ClubService.getMarketItems(route.params?.clubId || user?.organizationId);
            setMarketItems(clubItems);
            setIsPoolModalVisible(true);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Añade el item seleccionado al pool con su peso, y refresca la lista del pool para reflejar el cambio
    const handleAddPoolItem = async () => {
        if (!selectedPoolItem) return;
        try {
            await ClubService.addPoolItem(selectedChest.chest_id, selectedPoolItem, parseInt(poolWeight) || 1);
            const poolRes = await ClubService.getChestPool(selectedChest.chest_id);
            setPoolItems(poolRes);
            setIsAddingPoolItem(false);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    // Quita un item del pool del cofre y vuelve a pedir la lista actualizada para refrescar la vista
    const handleRemovePoolItem = async (itemId: string) => {
        try {
            await ClubService.removePoolItem(selectedChest.chest_id, itemId);
            const poolRes = await ClubService.getChestPool(selectedChest.chest_id);
            setPoolItems(poolRes);
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    // Sumamos los pesos de todos los items del pool: nos sirve de base para calcular el % de probabilidad de cada uno al renderizar
    const totalWeight = poolItems.reduce((sum, item) => sum + (item.weight || 0), 0);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.title}>Gestión de Cofres</Text>
                {/* Boton de cabecera para crear cofre nuevo: limpia el formulario (sin editingChestId) y abre el modal */}
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                        setEditingChestId(null);
                        setChestName('');
                        setChestDesc('');
                        setChestImg('');
                        setIsChestModalVisible(true);
                    }}
                >
                    <Ionicons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {isLoading && !isPoolModalVisible ? (
                <View style={styles.loaderContainer}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
            ) : (
                <FlatList
                    data={chests}
                    keyExtractor={(item) => item.chest_id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <View style={styles.chestCard}>
                            <Image 
                                source={{ uri: item.image_url || 'https://cdn-icons-png.flaticon.com/512/3233/3233959.png' }} 
                                style={styles.chestImage} 
                            />
                            <View style={styles.chestInfo}>
                                <Text style={styles.chestName}>{item.name}</Text>
                                <Text style={styles.chestDesc} numberOfLines={2}>{item.description}</Text>
                                <View style={styles.chestActions}>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                                        onPress={() => openPoolManagement(item)}
                                    >
                                        <Text style={styles.actionButtonText}>Contenido</Text>
                                    </TouchableOpacity>
                                    {/* Boton Editar: precarga los datos del cofre seleccionado en el formulario y abre el modal en modo edicion */}
                                    <TouchableOpacity
                                        style={[styles.actionButton, { backgroundColor: theme.colors.surface }]}
                                        onPress={() => {
                                            setEditingChestId(item.chest_id);
                                            setChestName(item.name);
                                            setChestDesc(item.description);
                                            setChestImg(item.image_url);
                                            setIsChestModalVisible(true);
                                        }}
                                    >
                                        <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, { backgroundColor: '#E53E3E' }]}
                                        onPress={() => handleDeleteChest(item.chest_id)}
                                    >
                                        <Ionicons name="trash-outline" size={16} color="#FFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                />
            )}

            {/* Modal de creacion/edicion de cofre: el titulo cambia segun editingChestId y reutiliza los mismos campos para crear o editar */}
            <Modal visible={isChestModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{editingChestId ? 'Editar Cofre' : 'Nuevo Cofre'}</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="Nombre del cofre" 
                            placeholderTextColor={theme.colors.textSecondary}
                            value={chestName}
                            onChangeText={setChestName}
                        />
                        <TextInput 
                            style={[styles.input, { height: 80 }]} 
                            placeholder="Descripción" 
                            placeholderTextColor={theme.colors.textSecondary}
                            multiline
                            value={chestDesc}
                            onChangeText={setChestDesc}
                        />
                        <TextInput 
                            style={styles.input} 
                            placeholder="URL de Imagen" 
                            placeholderTextColor={theme.colors.textSecondary}
                            value={chestImg}
                            onChangeText={setChestImg}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsChestModalVisible(false)}>
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={handleSaveChest}>
                                <Text style={styles.saveButtonText}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal de gestion del pool de recompensas: aqui se elige que items puede soltar el cofre y con que peso */}
            <Modal visible={isPoolModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: '90%', height: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Contenido: {selectedChest?.name}</Text>
                            <TouchableOpacity onPress={() => setIsPoolModalVisible(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity 
                            style={styles.addPoolButton}
                            onPress={() => setIsAddingPoolItem(!isAddingPoolItem)}
                        >
                            <Ionicons name={isAddingPoolItem ? "remove" : "add-circle"} size={20} color="#FFF" />
                            <Text style={styles.addPoolButtonText}>{isAddingPoolItem ? 'Cancelar Selección' : 'Añadir Ítem al Pool'}</Text>
                        </TouchableOpacity>

                        {/* Formulario plegable para añadir un item al pool: se muestra solo cuando isAddingPoolItem esta activo */}
                        {isAddingPoolItem && (
                            <View style={styles.addItemForm}>
                                <Text style={styles.label}>Seleccionar Ítem:</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemPicker}>
                                    {marketItems.map(item => (
                                        <TouchableOpacity 
                                            key={item.id} 
                                            onPress={() => setSelectedPoolItem(item.id)}
                                            style={[styles.pickerItem, selectedPoolItem === item.id && styles.pickerItemSelected]}
                                        >
                                            <Image source={{ uri: item.imageUrl }} style={styles.pickerImage} />
                                            <Text style={[styles.pickerText, selectedPoolItem === item.id && { color: '#FFF' }]} numberOfLines={1}>{item.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                <View style={styles.weightRow}>
                                    <Text style={styles.label}>Peso/Probabilidad (Ej: 1=Raro, 10=Común):</Text>
                                    <TextInput 
                                        style={[styles.input, { width: 60, marginLeft: 10 }]} 
                                        keyboardType="numeric"
                                        value={poolWeight}
                                        onChangeText={setPoolWeight}
                                    />
                                </View>
                                <TouchableOpacity style={styles.confirmAddButton} onPress={handleAddPoolItem}>
                                    <Text style={styles.saveButtonText}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <FlatList
                            data={poolItems}
                            keyExtractor={(item) => item.item_id}
                            renderItem={({ item }) => {
                                // Calculamos el % de probabilidad de cada item dividiendo su peso entre el peso total del pool
                                const probability = ((item.weight / totalWeight) * 100).toFixed(1);
                                return (
                                    <View style={styles.poolCard}>
                                        <Image source={{ uri: item.imageUrl }} style={styles.poolImage} />
                                        <View style={styles.poolInfo}>
                                            <Text style={styles.poolName}>{item.name}</Text>
                                            <Text style={styles.poolWeight}>Peso: {item.weight} ({probability}%)</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleRemovePoolItem(item.item_id)}>
                                            <Ionicons name="trash" size={20} color="#E53E3E" />
                                        </TouchableOpacity>
                                    </View>
                                );
                            }}
                        />
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
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 50 : 16,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: { padding: 8 },
    title: { flex: 1, fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginLeft: 16 },
    addButton: { backgroundColor: theme.colors.primary, padding: 8, borderRadius: 8 },
    listContent: { padding: 16 },
    chestCard: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderBottomWidth: 3,
        borderColor: theme.colors.border,
    },
    chestImage: { width: 80, height: 80, borderRadius: 8 },
    chestInfo: { flex: 1, marginLeft: 12 },
    chestName: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
    chestDesc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
    chestActions: { flexDirection: 'row', marginTop: 12 },
    actionButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginRight: 8,
        justifyContent: 'center',
    },
    actionButtonText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginBottom: 16 },
    input: {
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        color: theme.colors.text,
        marginBottom: 12,
    },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
    cancelButton: { padding: 12, marginRight: 12 },
    cancelButtonText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
    saveButton: { backgroundColor: theme.colors.primary, padding: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontWeight: 'bold' },
    addPoolButton: {
        flexDirection: 'row',
        backgroundColor: '#2D3748',
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    addPoolButtonText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },
    addItemForm: {
        backgroundColor: theme.colors.background,
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    label: { color: theme.colors.text, fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
    itemPicker: { height: 100, marginBottom: 12 },
    pickerItem: {
        width: 80,
        alignItems: 'center',
        marginRight: 10,
        padding: 5,
        borderRadius: 8,
        backgroundColor: theme.colors.surface,
    },
    pickerItemSelected: { backgroundColor: theme.colors.primary },
    pickerImage: { width: 50, height: 50, borderRadius: 4 },
    pickerText: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4, width: '100%', textAlign: 'center' },
    weightRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
    confirmAddButton: {
        backgroundColor: '#38A169',
        padding: 10,
        borderRadius: 6,
        alignItems: 'center',
        marginTop: 8,
    },
    poolCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        padding: 10,
        borderRadius: 8,
        marginBottom: 8,
    },
    poolImage: { width: 40, height: 40, borderRadius: 4 },
    poolInfo: { flex: 1, marginLeft: 12 },
    poolName: { color: theme.colors.text, fontWeight: 'bold' },
    poolWeight: { color: theme.colors.textSecondary, fontSize: 12 },
});
