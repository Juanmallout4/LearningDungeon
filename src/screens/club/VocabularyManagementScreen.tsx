import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ClubService } from '../../services/ClubService';
import { apiFetch } from '../../utils/apiFetch';
import { VocabularyTerm } from '../../types';
import { BeltDisplay } from '../../components/BeltDisplay';
import { BELT_CONFIGS } from '../../data/belts';

// Aqui configuramos las actividades disponibles para el vocabulario (clave de traduccion + texto por defecto si falta)
const VOCAB_ACTIVITY_TYPE_OPTIONS: { value: string; labelKey: string; defaultLabel: string }[] = [
    { value: 'taekwondo_itf', labelKey: 'settings.activityTypeTaekwondo', defaultLabel: 'Taekwondo ITF' },
    { value: 'ingles', labelKey: 'settings.activityTypeIngles', defaultLabel: 'Inglés' },
    { value: 'ballet', labelKey: 'settings.activityTypeBallet', defaultLabel: 'Ballet' },
];

// Aqui configuramos los dos modos de contenido del termino: texto (palabra+significado) o imagen (tecnica ilustrada)
const CONTENT_TYPE_OPTIONS: { value: 'text' | 'image'; labelKey: string; defaultLabel: string }[] = [
    { value: 'text', labelKey: 'vocabulary.contentTypeText', defaultLabel: 'Texto' },
    { value: 'image', labelKey: 'vocabulary.contentTypeImage', defaultLabel: 'Imagen' },
];

export const VocabularyManagementScreen = ({ route }: any) => {
    const navigation = useNavigation<any>();
    const { user } = route.params || {};

    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [vocabulary, setVocabulary] = useState<VocabularyTerm[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTerm, setNewTerm] = useState('');
    const [newMeaning, setNewMeaning] = useState('');
    const [newBeltLevel, setNewBeltLevel] = useState(0);
    const [modalActivityType, setModalActivityType] = useState('taekwondo_itf');
    const [filterActivityType, setFilterActivityType] = useState('taekwondo_itf');
    const [modalContentType, setModalContentType] = useState<'text' | 'image'>('text');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newTopic, setNewTopic] = useState('');
    const [topicFilter, setTopicFilter] = useState<string | null>(null);

    // Extraemos del vocabulario cargado los temas (topic) unicos y no vacios, para pintar los chips de filtro por tema
    const topics = useMemo(
        () => Array.from(new Set(vocabulary.map(v => v.topic).filter((t): t is string => !!t))),
        [vocabulary]
    );
    // Lista que realmente se pinta en el FlatList: si hay un tema seleccionado filtramos, si no mostramos todo el vocabulario
    const visibleVocabulary = useMemo(
        () => topicFilter ? vocabulary.filter(v => v.topic === topicFilter) : vocabulary,
        [vocabulary, topicFilter]
    );

    // Cada vez que cambia el tipo de actividad filtrado recargamos el vocabulario de esa actividad desde el backend
    useEffect(() => {
        loadVocabulary();
    }, [filterActivityType]);

    // Pide a ClubService el vocabulario del club para la actividad seleccionada y lo guarda en el estado
    const loadVocabulary = async () => {
        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await ClubService.getVocabulary(targetClubId, undefined, filterActivityType);
            setVocabulary(data);
        } catch (error) {
            console.error('Failed to load vocabulary', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Resetea el formulario del modal a sus valores por defecto (heredando el filtro de actividad actual) y lo abre en modo creacion
    const handleCreateTerm = () => {
        setEditingId(null);
        setNewTerm('');
        setNewMeaning('');
        setNewBeltLevel(0);
        setModalActivityType(filterActivityType);
        setModalContentType('text');
        setNewImageUrl('');
        setNewTopic('');
        setIsModalVisible(true);
    };

    // Carga los datos del termino seleccionado en el formulario del modal para editarlo
    const handleEditTerm = (item: VocabularyTerm) => {
        setEditingId(item.id);
        setNewTerm(item.term);
        setNewMeaning(item.meaning);
        setNewBeltLevel(item.beltLevel || 0);
        setModalActivityType(item.activityType || 'taekwondo_itf');
        setModalContentType(item.contentType === 'image' ? 'image' : 'text');
        setNewImageUrl(item.imageUrl || '');
        setNewTopic(item.topic || '');
        setIsModalVisible(true);
    };

    // Valida, arma el body y crea o actualiza el termino segun editingId; si el termino guardado pertenece a otra actividad lo retira de la lista visible
    const saveTerm = async () => {
        const isImageMode = modalContentType === 'image';
        // En modo imagen exigimos URL de imagen; en modo texto exigimos el significado
        if (!newTerm.trim() || (isImageMode ? !newImageUrl.trim() : !newMeaning.trim())) {
            Alert.alert(t('common.error'), t('vocabulary.errorEmpty'));
            return;
        }

        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) {
            Alert.alert(t('common.error'), t('vocabulary.errorContext'));
            return;
        }

        // En modo imagen reutilizamos el termino como "significado" porque el campo meaning es obligatorio en el backend
        const body = {
            term: newTerm.trim(),
            meaning: isImageMode ? newTerm.trim() : newMeaning.trim(),
            beltLevel: newBeltLevel,
            activityType: modalActivityType,
            contentType: modalContentType,
            imageUrl: isImageMode ? newImageUrl.trim() : null,
            topic: newTopic.trim() || null,
        };

        try {
            if (editingId) {
                // Edición: actualizamos el término existente; si tras el cambio queda fuera del filtro de actividad activo, lo retiramos de la lista visible
                const res = await apiFetch(`/api/clubs/${targetClubId}/vocabulary/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (res.ok) {
                    if (modalActivityType === filterActivityType) {
                        setVocabulary(vocabulary.map(v => v.id === editingId ? data.vocabulary : v));
                    } else {
                        setVocabulary(vocabulary.filter(v => v.id !== editingId));
                    }
                    setIsModalVisible(false);
                } else {
                    throw new Error(data.error);
                }
            } else {
                // Creación: insertamos el nuevo término al principio de la lista solo si pertenece a la actividad que estamos viendo
                const res = await apiFetch(`/api/clubs/${targetClubId}/vocabulary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (res.ok) {
                    if (modalActivityType === filterActivityType) {
                        setVocabulary([data.vocabulary, ...vocabulary]);
                    }
                    setIsModalVisible(false);
                } else {
                    throw new Error(data.error);
                }
            }
            setNewTerm('');
            setNewMeaning('');
            setNewBeltLevel(0);
            setNewImageUrl('');
            setNewTopic('');
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || t('vocabulary.errorSave'));
        }
    };

    // Borra un término de vocabulario, pidiendo confirmación nativa del navegador en web antes de llamar al backend
    const deleteTerm = async (vocabId: string) => {
        const targetClubId = route.params?.clubId || user?.organizationId;
        if (!targetClubId) return;
        
        const confirmMessage = t('vocabulary.deleteConfirm');
        if (typeof window !== 'undefined' && window.confirm) {
            if (!window.confirm(confirmMessage)) return;
        } 

        try {
            await ClubService.deleteVocabularyTerm(targetClubId, vocabId);
            setVocabulary(vocabulary.filter(v => v.id !== vocabId));
        } catch (error: any) {
            Alert.alert(t('common.error'), error.message || t('vocabulary.errorDelete'));
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('vocabulary.manage')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={handleCreateTerm} style={styles.addButton}>
                        <Ionicons name="add" size={28} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Pestañas para filtrar el vocabulario por tipo de actividad (recargan los datos vía el efecto de loadVocabulary) */}
            <View style={styles.filterTabsRow}>
                {VOCAB_ACTIVITY_TYPE_OPTIONS.map(option => {
                    const isSelected = filterActivityType === option.value;
                    return (
                        <TouchableOpacity
                            key={option.value}
                            onPress={() => setFilterActivityType(option.value)}
                            style={[styles.activityTypeChip, isSelected && styles.activityTypeChipSelected]}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.activityTypeChipText, isSelected && styles.activityTypeChipTextSelected]}>
                                {t(option.labelKey, { defaultValue: option.defaultLabel })}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Fila de chips para filtrar por tema; solo se muestra si el vocabulario cargado tiene algún tema definido */}
            {topics.length > 0 && (
                <View style={styles.filterTabsRow}>
                    <TouchableOpacity
                        onPress={() => setTopicFilter(null)}
                        style={[styles.activityTypeChip, topicFilter === null && styles.activityTypeChipSelected]}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.activityTypeChipText, topicFilter === null && styles.activityTypeChipTextSelected]}>
                            {t('vocabulary.allTopics', { defaultValue: 'Todos los temas' })}
                        </Text>
                    </TouchableOpacity>
                    {topics.map(topic => {
                        const isSelected = topicFilter === topic;
                        return (
                            <TouchableOpacity
                                key={topic}
                                onPress={() => setTopicFilter(topic)}
                                style={[styles.activityTypeChip, isSelected && styles.activityTypeChipSelected]}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.activityTypeChipText, isSelected && styles.activityTypeChipTextSelected]}>
                                    {topic}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={visibleVocabulary}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            {/* En modo imagen mostramos la miniatura de la técnica; en modo texto mostramos el significado en su lugar */}
                            {item.contentType === 'image' && item.imageUrl && (
                                <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode="cover" />
                            )}
                            <View style={styles.cardContent}>
                                <Text style={styles.term}>{item.term}</Text>
                                {item.contentType !== 'image' && (
                                    <Text style={styles.meaning}>{item.meaning}</Text>
                                )}
                                {!!item.topic && (
                                    <Text style={styles.topicBadge}>{item.topic}</Text>
                                )}
                                {/* El cinturón requerido solo tiene sentido para vocabulario de Taekwondo ITF */}
                                {(item.activityType || 'taekwondo_itf') === 'taekwondo_itf' && (
                                    <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
                                        <BeltDisplay rank={item.beltLevel || 0} width={100} height={12} showText={false} />
                                    </View>
                                )}
                            </View>
                            <View style={{ flexDirection: 'row' }}>
                                <TouchableOpacity onPress={() => handleEditTerm(item)} style={{ padding: 8 }}>
                                    <Ionicons name="create-outline" size={24} color={theme.colors.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteTerm(item.id)} style={{ padding: 8 }}>
                                    <Ionicons name="trash-outline" size={24} color={theme.colors.error} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>{t('vocabulary.noTerms')}</Text>
                        </View>
                    }
                />
            )}

            <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setIsModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {editingId ? t('vocabulary.editTerm') : t('vocabulary.addTerm')}
                        </Text>

                        <Text style={styles.label}>{t('vocabulary.contentTypeLabel', { defaultValue: 'Tipo de contenido' })}</Text>
                        <View style={styles.activityTypeRow}>
                            {CONTENT_TYPE_OPTIONS.map(option => {
                                const isSelected = modalContentType === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => setModalContentType(option.value)}
                                        style={[styles.activityTypeChip, isSelected && styles.activityTypeChipSelected]}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.activityTypeChipText, isSelected && styles.activityTypeChipTextSelected]}>
                                            {t(option.labelKey, { defaultValue: option.defaultLabel })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={styles.label}>
                            {modalContentType === 'image'
                                ? t('vocabulary.techniqueNameLabel', { defaultValue: 'Nombre de la técnica' })
                                : t('vocabulary.termLabel')}
                        </Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('vocabulary.termPlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={newTerm}
                            onChangeText={setNewTerm}
                        />

                        {/* Formulario condicional: en modo imagen pedimos URL (con previsualización), en modo texto pedimos el significado */}
                        {modalContentType === 'image' ? (
                            <>
                                <Text style={styles.label}>{t('vocabulary.imageUrlLabel', { defaultValue: 'URL de la imagen' })}</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('vocabulary.imageUrlPlaceholder', { defaultValue: 'https://...' })}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={newImageUrl}
                                    onChangeText={setNewImageUrl}
                                    autoCapitalize="none"
                                />
                                {!!newImageUrl.trim() && (
                                    <Image source={{ uri: newImageUrl.trim() }} style={styles.imagePreview} resizeMode="contain" />
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={styles.label}>{t('vocabulary.meaningLabel')}</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('vocabulary.meaningPlaceholder')}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    value={newMeaning}
                                    onChangeText={setNewMeaning}
                                    onSubmitEditing={saveTerm}
                                />
                            </>
                        )}

                        <Text style={styles.label}>{t('vocabulary.topicLabel', { defaultValue: 'Tema (opcional)' })}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('vocabulary.topicPlaceholder', { defaultValue: 'p. ej. Tema 1, Irregular verbs...' })}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={newTopic}
                            onChangeText={setNewTopic}
                        />

                        <Text style={styles.label}>{t('settings.chooseActivityType', { defaultValue: 'Tipo de Actividad' })}</Text>
                        <View style={styles.activityTypeRow}>
                            {VOCAB_ACTIVITY_TYPE_OPTIONS.map(option => {
                                const isSelected = modalActivityType === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => setModalActivityType(option.value)}
                                        style={[styles.activityTypeChip, isSelected && styles.activityTypeChipSelected]}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.activityTypeChipText, isSelected && styles.activityTypeChipTextSelected]}>
                                            {t(option.labelKey, { defaultValue: option.defaultLabel })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* El selector de cinturón requerido solo aplica cuando el término pertenece a Taekwondo ITF */}
                        {modalActivityType === 'taekwondo_itf' && (
                            <>
                                <Text style={styles.label}>{t('vocabulary.beltRequired')}</Text>
                                <View style={styles.beltSelector}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {Object.entries(BELT_CONFIGS).map(([rank, config]) => (
                                            <TouchableOpacity
                                                key={rank}
                                                style={[
                                                    styles.beltOption,
                                                    newBeltLevel === parseInt(rank) && styles.beltOptionActive
                                                ]}
                                                onPress={() => setNewBeltLevel(parseInt(rank))}
                                            >
                                                <Text style={[
                                                    styles.beltOptionText,
                                                    newBeltLevel === parseInt(rank) && { color: theme.colors.primary, fontWeight: 'bold' }
                                                ]}>
                                                    {config.name}
                                                </Text>
                                                <BeltDisplay rank={parseInt(rank)} width={60} height={8} showText={false} />
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            </>
                        )}

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsModalVisible(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={saveTerm}>
                                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
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
        paddingTop: theme.spacing.xl,
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
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
    },
    listContent: {
        padding: theme.spacing.m,
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    cardContent: {
        flex: 1,
    },
    term: {
        color: theme.colors.primary,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    meaning: {
        color: theme.colors.textSecondary,
        fontSize: 16,
    },
    topicBadge: {
        color: theme.colors.primary,
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    thumbnail: {
        width: 56,
        height: 56,
        borderRadius: theme.borderRadius.s,
        marginRight: theme.spacing.m,
        backgroundColor: theme.colors.background,
    },
    imagePreview: {
        width: '100%',
        height: 140,
        borderRadius: theme.borderRadius.s,
        marginTop: 8,
        backgroundColor: theme.colors.background,
    },
    filterTabsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
    },
    activityTypeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    activityTypeChip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    activityTypeChipSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: `${theme.colors.primary}20`,
    },
    activityTypeChipText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    activityTypeChipTextSelected: {
        color: theme.colors.primary,
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
        padding: 20,
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 20,
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
        marginBottom: 10,
        fontWeight: 'bold',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
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
    beltSelector: {
        marginBottom: 20,
        height: 80,
    },
    beltOption: {
        padding: 10,
        marginRight: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    beltOptionActive: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '10',
    },
    beltOptionText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginBottom: 5,
    },
});
