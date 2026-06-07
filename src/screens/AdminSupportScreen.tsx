import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, Alert, ScrollView, Modal, Platform, Clipboard } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AuthService } from '../services/AuthService';
import { apiFetch } from '../utils/apiFetch';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export const AdminSupportScreen = () => {
    const { theme } = useTheme();
    const styles = createStyles(theme);
    const navigation = useNavigation<any>();

    const [tickets, setTickets] = useState<any[]>([]);
    const [superadmins, setSuperadmins] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('open');
    const [filterOnlyMe, setFilterOnlyMe] = useState<boolean>(false);
    const [sortIdOrder, setSortIdOrder] = useState<'desc' | 'asc'>('desc');
    const [sortByPriority, setSortByPriority] = useState<boolean>(false);

    const apps = ['Aim Education', 'Learning Dungeon', 'Aim Training', 'Aim Brickslab', 'Aim Artemis', 'Aim Eventos'];

    // Tab and Creation State
    const [activeTab, setActiveTab] = useState<'list' | 'create' | 'global'>('list');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Modal Management
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [devResponse, setDevResponse] = useState('');
    const [ticketPriority, setTicketPriority] = useState('low');
    const [ticketDueDate, setTicketDueDate] = useState('');
    const [ticketAssignedId, setTicketAssignedId] = useState('');
    const [ticketAppLabels, setTicketAppLabels] = useState<string[]>(['Learning Dungeon']);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        fetchTickets();
        fetchSuperadmins();
        AuthService.getSavedUser().then(u => {
            if (u) setUserId(u.id);
        });
    }, []);

    const fetchSuperadmins = async () => {
        try {
            const res = await apiFetch('/api/admin/superadmins');
            const data = await res.json();
            if (data.success) setSuperadmins(data.superadmins);
        } catch (e) {
            console.error('Error fetching superadmins:', e);
        }
    };

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/support');
            const data = await res.json();
            if (data.success) setTickets(data.tickets);
        } catch (e) {
            console.error('Error fetching tickets:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenTicket = (ticket: any) => {
        setSelectedTicket(ticket);
        setDevResponse(ticket.dev_response || '');
        setTicketPriority(ticket.priority || 'low');

        let formattedDate = '';
        if (ticket.due_date) {
            const d = new Date(ticket.due_date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            formattedDate = `${day}-${month}-${year}`;
        }
        setTicketDueDate(formattedDate);

        setTicketAssignedId(ticket.assigned_to || '');
        // Handle both old string format and new array format
        const labels = Array.isArray(ticket.app_label) ? ticket.app_label : (ticket.app_label ? [ticket.app_label] : ['Learning Dungeon']);
        setTicketAppLabels(labels);
        setShowDetailModal(true);
    };

    const updateTicketDetails = async (newStatus?: string) => {
        if (!selectedTicket) return;

        let finalDueDate = null;
        if (ticketDueDate) {
            const parts = ticketDueDate.split('-');
            if (parts.length === 3) {
                // DD-MM-YYYY to YYYY-MM-DD for backend
                finalDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        setIsUpdating(true);
        console.log('[SUPPORT] Updating ticket', selectedTicket.id, {
            status: newStatus || selectedTicket.status,
            devResponse,
            ticketPriority,
            ticketDueDate,
            ticketAppLabels
        });

        const showFeedback = (title: string, msg: string) => {
            if (Platform.OS === 'web') {
                window.alert(`${title}: ${msg}`);
            } else {
                Alert.alert(title, msg);
            }
        };

        try {
            const res = await apiFetch(`/api/support/${selectedTicket.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: newStatus || selectedTicket.status,
                    devResponse,
                    priority: ticketPriority,
                    dueDate: finalDueDate,
                    assignedTo: ticketAssignedId || null,
                    appLabel: ticketAppLabels
                })
            });
            const data = await res.json();
            console.log('[SUPPORT] Update response:', data);

            if (data.success) {
                setShowDetailModal(false);
                fetchTickets();
            } else {
                showFeedback('Error', data.error || 'No se pudo actualizar el ticket.');
            }
        } catch (e: any) {
            console.error('[SUPPORT] Update catch error:', e);
            showFeedback('Error', 'Error de red o de servidor: ' + e.message);
        } finally {
            setIsUpdating(false);
        }
    };

    const submitSupportTicket = async () => {
        if (!subject || !description) {
            Alert.alert('Error', 'Por favor, rellena todos los campos.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await apiFetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, subject, description })
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert('Enviado', 'Ticket de soporte creado correctamente.');
                setSubject('');
                setDescription('');
                setActiveTab('list');
                fetchTickets();
            } else {
                Alert.alert('Error', data.error || 'Problema al enviar el ticket.');
            }
        } catch (e) {
            Alert.alert('Error', 'No se pudo contactar con soporte.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleGlobalSync = async () => {
        setSyncing(true);
        try {
            const res = await apiFetch('/api/admin/global-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceClubName: 'Aim Education' })
            });
            const data = await res.json();
            if (res.ok) {
                const { stats } = data;
                Alert.alert(
                    'Éxito',
                    `Sincronización completada:\n- ${stats.vocabulary} palabras\n- ${stats.bosses} jefes\n- ${stats.market} objetos`
                );
            } else {
                Alert.alert('Error', data.error || 'Fallo en la sincronización.');
            }
        } catch (e) {
            Alert.alert('Error', 'No se pudo contactar con el servidor de sincronización.');
        } finally {
            setSyncing(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'resolved': return theme.colors.success;
            case 'closed': return theme.colors.textSecondary;
            case 'open': default: return '#FFD700';
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'high': return theme.colors.error;
            case 'medium': return '#FFD700'; // Yellowish / Gold
            case 'low': default: return '#4CAF50'; // Greenish
        }
    };

    const copyTicketsToClipboard = async () => {
        const filtered = tickets
            .filter(t =>
                (filterPriority === 'all' || t.priority === filterPriority) &&
                (filterStatus === 'all' || t.status === filterStatus) &&
                (!filterOnlyMe || t.assigned_to === userId)
            )
            .sort((a, b) => {
                if (sortByPriority) {
                    const weights: any = { 'high': 3, 'medium': 2, 'low': 1 };
                    const weightA = weights[a.priority?.toLowerCase()] || 0;
                    const weightB = weights[b.priority?.toLowerCase()] || 0;
                    if (weightA !== weightB) return weightB - weightA;
                }
                return sortIdOrder === 'desc' ? b.id - a.id : a.id - b.id;
            });

        if (filtered.length === 0) {
            Alert.alert('Aviso', 'No hay tickets para copiar.');
            return;
        }

        let text = `REPORTE DE TICKETS - ${new Date().toLocaleDateString()}\n`;
        text += `Filtros: Estado: ${filterStatus}, Prioridad: ${filterPriority}\n`;
        text += `--------------------------------------------------\n\n`;

        filtered.forEach(t => {
            const apps = Array.isArray(t.app_label) ? t.app_label.join(', ') : (t.app_label || 'Learning Dungeon');
            text += `[#${t.id}] ${t.subject.toUpperCase()}\n`;
            text += `Prioridad: ${t.priority?.toUpperCase()} | Estado: ${t.status?.toUpperCase()}\n`;
            text += `Apps: ${apps}\n`;
            text += `Creado por: ${t.name} ${t.surname || ''} (${t.email})\n`;
            text += `Asignado a: ${t.assignee_username || 'Sin asignar'}\n`;
            text += `Fecha de Entrega: ${t.due_date ? new Date(t.due_date).toLocaleDateString() : 'N/A'}\n`;
            text += `Descripción: ${t.description}\n`;
            if (t.dev_response) text += `Respuesta Dev: ${t.dev_response}\n`;
            text += `\n--------------------------------------------------\n\n`;
        });

        if (Platform.OS === 'web') {
            try {
                await navigator.clipboard.writeText(text);
                Alert.alert('Éxito', 'Listado copiado al portapapeles.');
            } catch (err) {
                console.error('Clipboard error:', err);
                Alert.alert('Error', 'No se pudo copiar automáticamente.');
            }
        } else {
            Clipboard.setString(text);
            Alert.alert('Éxito', 'Listado copiado al portapapeles.');
        }
    };

    const exportFilteredTickets = async () => {
        const filtered = tickets
            .filter(t =>
                (filterPriority === 'all' || t.priority === filterPriority) &&
                (filterStatus === 'all' || t.status === filterStatus) &&
                (!filterOnlyMe || t.assigned_to === userId)
            )
            .sort((a, b) => {
                if (sortByPriority) {
                    const weights: any = { 'high': 3, 'medium': 2, 'low': 1 };
                    const weightA = weights[a.priority?.toLowerCase()] || 0;
                    const weightB = weights[b.priority?.toLowerCase()] || 0;
                    if (weightA !== weightB) return weightB - weightA;
                }
                return sortIdOrder === 'desc' ? b.id - a.id : a.id - b.id;
            });

        if (filtered.length === 0) {
            Alert.alert('Aviso', 'No hay tickets para exportar con los filtros actuales.');
            return;
        }

        const html = `
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; background: white; }
                .header { text-align: center; border-bottom: 2px solid #5d3fd3; padding-bottom: 10px; margin-bottom: 20px; }
                .title { font-size: 24px; font-weight: bold; color: #5d3fd3; }
                .filters { font-size: 12px; color: #666; margin-bottom: 20px; font-style: italic; }
                .ticket { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; page-break-inside: avoid; background: white; }
                .ticket-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                .ticket-id { font-weight: bold; color: #5d3fd3; }
                .priority { font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px; text-transform: uppercase; }
                .prio-high { color: #f44336 !important; background: #ffebee !important; border: 1px solid #f44336; }
                .prio-medium { color: #ff9800 !important; background: #fff3e0 !important; border: 1px solid #ff9800; }
                .prio-low { color: #4caf50 !important; background: #e8f5e9 !important; border: 1px solid #4caf50; }
                .subject { font-size: 18px; font-weight: bold; margin: 10px 0; color: #000; }
                .status { font-size: 12px; font-weight: bold; text-transform: uppercase; }
                .description { font-size: 14px; line-height: 1.6; margin-bottom: 15px; white-space: pre-wrap; color: #333; }
                .metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; color: #555; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #eee; }
                .label { font-weight: bold; color: #888; text-transform: uppercase; font-size: 9px; margin-bottom: 2px; }
                .apps { margin-top: 10px; }
                .app-tag { display: inline-block; background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 5px; color: #444; border: 1px solid #ccc; }
                .response { margin-top: 15px; padding: 10px; border-left: 3px solid #5d3fd3; background: #f5f3ff; font-style: italic; font-size: 13px; color: #444; }
                
                @media print {
                    body { padding: 0; }
                    .ticket { border: 1px solid #ccc; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">REPORTE DE SOPORTE - LEARNING DUNGEON</div>
                <div class="filters">
                    LISTADO DE TAREAS FILTRADO | Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
                </div>
            </div>
            ${filtered.map(t => `
                <div class="ticket">
                    <div class="ticket-header">
                        <div>
                            <span class="ticket-id">#${t.id}</span>
                            <span class="priority prio-${t.priority?.toLowerCase()}">${t.priority}</span>
                        </div>
                        <div class="status" style="color: ${t.status === 'open' ? '#ccac00' : t.status === 'resolved' ? '#2e7d32' : '#666'}">
                            ${t.status.toUpperCase()}
                        </div>
                    </div>
                    <div class="subject">${t.subject}</div>
                    <div class="description">${t.description}</div>
                    <div class="metadata">
                        <div>
                            <div class="label">Informado por</div>
                            <div style="font-weight: bold;">${t.name} ${t.surname || ''}</div>
                            <div style="font-size: 10px;">${t.email}</div>
                        </div>
                        <div>
                            <div class="label">Asignado a</div>
                            <div style="font-weight: bold;">${t.assignee_username || 'PENDIENTE'}</div>
                        </div>
                        <div>
                            <div class="label">Fecha Inicio</div>
                            <div>${new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                        <div>
                            <div class="label">Fecha Límite</div>
                            <div style="font-weight: bold; color: ${t.due_date ? '#d32f2f' : 'inherit'}">${t.due_date ? new Date(t.due_date).toLocaleDateString() : 'SIN FECHA'}</div>
                        </div>
                    </div>
                    <div class="apps">
                        <div class="label">Proyectos Relacionados</div>
                        ${(Array.isArray(t.app_label) ? t.app_label : [t.app_label || 'Learning Dungeon']).map(l => `<span class="app-tag">${l}</span>`).join('')}
                    </div>
                    ${t.dev_response ? `
                        <div class="response">
                            <div class="label">Comentarios Dev</div>
                            ${t.dev_response}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </body>
        </html>
        `;

        if (Platform.OS === 'web') {
            // THE ULTIMATE CLEAN PRINT TECHNIQUE FOR WEB
            // 1. Create a style that hides EVERYTHING when printing
            const style = document.createElement('style');
            style.id = 'print-isolation-style';
            style.innerHTML = `
                @media print {
                    body > * { display: none !important; }
                    #support-print-root { display: block !important; position: absolute; left: 0; top: 0; width: 100%; background: white; z-index: 999999; }
                }
            `;
            document.head.appendChild(style);

            // 2. Create the hidden print container
            const printRoot = document.createElement('div');
            printRoot.id = 'support-print-root';
            printRoot.innerHTML = html;
            document.body.appendChild(printRoot);

            // 3. Print
            window.print();

            // 4. Cleanup
            setTimeout(() => {
                document.getElementById('print-isolation-style')?.remove();
                document.getElementById('support-print-root')?.remove();
            }, 1000);
        } else {
            try {
                await Print.printAsync({ html });
            } catch (error) {
                console.error('Error printing:', error);
                Alert.alert('Error', 'No se pudo generar el documento.');
            }
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Panel de Soporte (Superadmin)</Text>
            </View>

            <View style={styles.tabsContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'list' && styles.activeTab]} onPress={() => setActiveTab('list')}>
                    <Text style={[styles.tabText, activeTab === 'list' && styles.activeTabText]}>Ver Registros</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'create' && styles.activeTab]} onPress={() => setActiveTab('create')}>
                    <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Crear Reporte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'global' && styles.activeTab]} onPress={() => setActiveTab('global')}>
                    <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>Club Global</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 50 }} />
            ) : activeTab === 'list' ? (
                <View style={{ flex: 1 }}>
                    {/* Filters Bar */}
                    <View style={styles.filterBar}>
                        <View style={styles.filterWrap}>
                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Prioridad:</Text>
                                <TouchableOpacity style={[styles.filterBtn, filterPriority === 'all' && styles.filterBtnActive]} onPress={() => setFilterPriority('all')}>
                                    <Text style={[styles.filterBtnText, filterPriority === 'all' && styles.filterBtnTextActive]}>Todas</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterPriority === 'low' && styles.filterBtnActive]} onPress={() => setFilterPriority('low')}>
                                    <Text style={[styles.filterBtnText, filterPriority === 'low' && styles.filterBtnTextActive]}>Baja</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterPriority === 'medium' && styles.filterBtnActive]} onPress={() => setFilterPriority('medium')}>
                                    <Text style={[styles.filterBtnText, filterPriority === 'medium' && styles.filterBtnTextActive]}>Media</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterPriority === 'high' && styles.filterBtnActive]} onPress={() => setFilterPriority('high')}>
                                    <Text style={[styles.filterBtnText, filterPriority === 'high' && styles.filterBtnTextActive]}>Alta</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Estado:</Text>
                                <TouchableOpacity style={[styles.filterBtn, filterStatus === 'all' && styles.filterBtnActive]} onPress={() => setFilterStatus('all')}>
                                    <Text style={[styles.filterBtnText, filterStatus === 'all' && styles.filterBtnTextActive]}>Todos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterStatus === 'open' && styles.filterBtnActive]} onPress={() => setFilterStatus('open')}>
                                    <Text style={[styles.filterBtnText, filterStatus === 'open' && styles.filterBtnTextActive]}>Abiertos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterStatus === 'resolved' && styles.filterBtnActive]} onPress={() => setFilterStatus('resolved')}>
                                    <Text style={[styles.filterBtnText, filterStatus === 'resolved' && styles.filterBtnTextActive]}>Resueltos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.filterBtn, filterStatus === 'closed' && styles.filterBtnActive]} onPress={() => setFilterStatus('closed')}>
                                    <Text style={[styles.filterBtnText, filterStatus === 'closed' && styles.filterBtnTextActive]}>Cerrados</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Mis Tareas:</Text>
                                <TouchableOpacity style={[styles.filterBtn, filterOnlyMe && styles.filterBtnActive]} onPress={() => setFilterOnlyMe(!filterOnlyMe)}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name={filterOnlyMe ? "person" : "person-outline"} size={14} color={filterOnlyMe ? "#FFF" : theme.colors.textSecondary} />
                                        <Text style={[styles.filterBtnText, filterOnlyMe && styles.filterBtnTextActive]}>Solo las mías</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Orden ID:</Text>
                                <TouchableOpacity style={styles.filterBtn} onPress={() => setSortIdOrder(sortIdOrder === 'desc' ? 'asc' : 'desc')}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name={sortIdOrder === 'desc' ? "arrow-down" : "arrow-up"} size={14} color={theme.colors.textSecondary} />
                                        <Text style={styles.filterBtnText}>{sortIdOrder.toUpperCase()}</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Ordenar:</Text>
                                <TouchableOpacity style={[styles.filterBtn, sortByPriority && styles.filterBtnActive]} onPress={() => setSortByPriority(!sortByPriority)}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="alert-circle" size={14} color={sortByPriority ? "#FFF" : theme.colors.textSecondary} />
                                        <Text style={[styles.filterBtnText, sortByPriority && styles.filterBtnTextActive]}>Prioridad</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.filterGroup}>
                                <Text style={styles.filterLabel}>Tareas:</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity style={[styles.filterBtn, { backgroundColor: theme.colors.primary }]} onPress={exportFilteredTickets}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Ionicons name="print-outline" size={16} color="#FFF" />
                                            <Text style={[styles.filterBtnText, { color: '#FFF' }]}>Listado PDF</Text>
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.filterBtn, { backgroundColor: '#4CAF50' }]} onPress={copyTicketsToClipboard}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Ionicons name="copy-outline" size={16} color="#FFF" />
                                            <Text style={[styles.filterBtnText, { color: '#FFF' }]}>Copiar Texto</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>

                    <FlatList
                        data={tickets
                            .filter(t =>
                                (filterPriority === 'all' || t.priority === filterPriority) &&
                                (filterStatus === 'all' || t.status === filterStatus) &&
                                (!filterOnlyMe || t.assigned_to === userId)
                            )
                            .sort((a, b) => {
                                if (sortByPriority) {
                                    const weights: any = { 'high': 3, 'medium': 2, 'low': 1 };
                                    const weightA = weights[a.priority?.toLowerCase()] || 0;
                                    const weightB = weights[b.priority?.toLowerCase()] || 0;
                                    if (weightA !== weightB) return weightB - weightA;
                                }
                                // Second-level sort by ID
                                return sortIdOrder === 'desc' ? b.id - a.id : a.id - b.id;
                            })
                        }
                        keyExtractor={t => t.id.toString()}
                        contentContainerStyle={{ padding: 20 }}
                        ListEmptyComponent={<Text style={{ color: theme.colors.textSecondary, textAlign: 'center' }}>No hay tickets que coincidan con los filtros.</Text>}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={[styles.ticketCard, { borderLeftWidth: 5, borderLeftColor: getPriorityColor(item.priority) }]} onPress={() => handleOpenTicket(item)}>
                                <View style={styles.ticketHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                                        <Text style={styles.ticketId}>#{item.id}</Text>
                                        {/* Flatten and filter invalid data for robust badge rendering */}
                                        {(Array.isArray(item.app_label) ? (item.app_label.flat(Infinity) as string[]) : [item.app_label || 'Learning Dungeon']).map((label: string) => (
                                            <View key={label} style={[styles.appBadge, { backgroundColor: theme.colors.primary + '20', marginRight: 4 }]}>
                                                <Text style={styles.appBadgeText}>{label}</Text>
                                            </View>
                                        ))}
                                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + '20', borderColor: getPriorityColor(item.priority) }]}>
                                            <Text style={[styles.priorityBadgeText, { color: getPriorityColor(item.priority) }]}>
                                                {item.priority?.toLowerCase() === 'high' ? 'ALTA' : item.priority?.toLowerCase() === 'medium' ? 'MEDIA' : 'BAJA'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.ticketStatus, { color: getStatusColor(item.status) }]}>{item.status.toUpperCase()}</Text>
                                </View>
                                <Text style={styles.ticketSubject}>{item.subject}</Text>
                                <Text style={styles.ticketDesc} numberOfLines={2}>{item.description}</Text>

                                <View style={styles.ticketFooter}>
                                    <View>
                                        <Text style={styles.ticketUser}>De: {item.name} {item.surname || ''}</Text>
                                        <Text style={styles.ticketDate}>
                                            {new Date(item.created_at).toLocaleDateString()}
                                            {item.due_date && (
                                                <Text style={{ color: theme.colors.error }}>
                                                    {' '}• Vence: {(() => {
                                                        const d = new Date(item.due_date);
                                                        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                                                    })()}
                                                </Text>
                                            )}
                                        </Text>
                                    </View>

                                    {item.assignee_username && (
                                        <View style={styles.assigneeSmall}>
                                            <View style={styles.assigneeInfoSmall}>
                                                <Text style={styles.assigneeNameSmall}>{item.assignee_username}</Text>
                                            </View>
                                            {item.assignee_picture ? (
                                                <View style={styles.assigneePicPlaceholderSmall}>
                                                    <Text style={{ fontSize: 10, color: '#FFF' }}>{item.assignee_username.substring(0, 1).toUpperCase()}</Text>
                                                </View>
                                            ) : (
                                                <Ionicons name="person-circle" size={24} color={theme.colors.textSecondary} />
                                            )}
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            ) : activeTab === 'create' ? (
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                    <Text style={styles.label}>Asunto del Reporte</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej. Bug detectado"
                        placeholderTextColor={theme.colors.textSecondary}
                        value={subject}
                        onChangeText={setSubject}
                    />

                    <Text style={styles.label}>Descripción</Text>
                    <TextInput
                        style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                        placeholder="Describe el problema de forma detallada..."
                        placeholderTextColor={theme.colors.textSecondary}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                    />

                    <TouchableOpacity style={[styles.submitButton, submitting && { opacity: 0.7 }]} onPress={submitSupportTicket} disabled={submitting}>
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Enviar Reporte</Text>}
                    </TouchableOpacity>
                </ScrollView>
            ) : (
                <View style={{ padding: 20 }}>
                    <View style={styles.globalCard}>
                        <View style={styles.globalHeader}>
                            <Ionicons name="earth" size={32} color={theme.colors.primary} />
                            <Text style={styles.globalTitle}>Gestión Club Global</Text>
                        </View>
                        <Text style={styles.globalDesc}>El ID del Club Global es 00000000-0000-4000-a000-000000000000. Los usuarios sin club ven este contenido.</Text>

                        <TouchableOpacity style={[styles.globalActionBtn, syncing && { opacity: 0.5 }]} onPress={handleGlobalSync} disabled={syncing}>
                            <Ionicons name="refresh-circle" size={24} color="#FFF" />
                            <Text style={styles.globalActionText}>{syncing ? 'Sincronizando...' : 'Sincronizar desde Aim Education'}</Text>
                        </TouchableOpacity>

                        <Text style={[styles.label, { marginTop: 30 }]}>Editar Contenido Global</Text>
                        <View style={styles.buttonGrid}>
                            <TouchableOpacity style={styles.gridBtn} onPress={() => navigation.navigate('VocabularyManagement', { clubId: '00000000-0000-4000-a000-000000000000' })}>
                                <Ionicons name="book" size={20} color={theme.colors.primary} />
                                <Text style={styles.gridBtnText}>Vocabulario</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.gridBtn} onPress={() => navigation.navigate('MarketManagement', { clubId: '00000000-0000-4000-a000-000000000000' })}>
                                <Ionicons name="cart" size={20} color={theme.colors.primary} />
                                <Text style={styles.gridBtnText}>Tienda</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.gridBtn} onPress={() => navigation.navigate('BossManagement', { clubId: '00000000-0000-4000-a000-000000000000' })}>
                                <Ionicons name="skull" size={20} color={theme.colors.primary} />
                                <Text style={styles.gridBtnText}>Jefes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            <Modal visible={showDetailModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Detalle del Ticket #{selectedTicket?.id}</Text>
                            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                                <Ionicons name="close" size={28} color={theme.colors.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            <Text style={styles.modalLabel}>ESTADO ACTUAL</Text>
                            <Text style={[styles.modalValue, { color: getStatusColor(selectedTicket?.status || ''), fontWeight: 'bold' }]}>
                                {selectedTicket?.status.toUpperCase()}
                            </Text>

                            <Text style={styles.modalLabel}>USUARIO</Text>
                            <Text style={styles.modalValue}>{selectedTicket?.name} {selectedTicket?.surname || ''}</Text>
                            <Text style={[styles.modalValue, { fontSize: 13, color: theme.colors.textSecondary }]}>{selectedTicket?.email}</Text>

                            <Text style={styles.modalLabel}>ASUNTO</Text>
                            <Text style={styles.modalValue}>{selectedTicket?.subject}</Text>

                            <Text style={styles.modalLabel}>DESCRIPCIÓN</Text>
                            <Text style={styles.modalValue}>{selectedTicket?.description}</Text>

                            <Text style={styles.modalLabel}>RESPUESTA DEL DESARROLLADOR</Text>
                            <TextInput
                                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                placeholder="Escribe aquí tu respuesta..."
                                placeholderTextColor={theme.colors.textSecondary}
                                value={devResponse}
                                onChangeText={setDevResponse}
                                multiline
                            />

                            <Text style={styles.modalLabel}>CAMBIAR ESTADO A:</Text>
                            <View style={styles.statusButtonGrid}>
                                <TouchableOpacity
                                    style={[styles.statusBtn, { backgroundColor: '#FFD700' }]}
                                    onPress={() => updateTicketDetails('open')}
                                >
                                    <Text style={styles.statusBtnText}>ABIERTO</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.statusBtn, { backgroundColor: theme.colors.success }]}
                                    onPress={() => updateTicketDetails('resolved')}
                                >
                                    <Text style={styles.statusBtnText}>RESUELTO</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.statusBtn, { backgroundColor: theme.colors.textSecondary }]}
                                    onPress={() => updateTicketDetails('closed')}
                                >
                                    <Text style={styles.statusBtnText}>CERRAR</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            <Text style={styles.modalLabel}>GESTIÓN INTERNA</Text>

                            <Text style={styles.labelSmall}>PRIORIDAD</Text>
                            <View style={styles.prioritySelector}>
                                {['low', 'medium', 'high'].map(p => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[styles.prioBtn, ticketPriority === p && { backgroundColor: getPriorityColor(p) }]}
                                        onPress={() => setTicketPriority(p)}
                                    >
                                        <Text style={[styles.prioBtnText, ticketPriority === p && { color: '#FFF' }]}>{p === 'low' ? 'BAJA' : p === 'medium' ? 'MEDIA' : 'ALTA'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.labelSmall}>ENCARGADO (Solo Superadmins)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assigneeScroll}>
                                <TouchableOpacity
                                    style={[styles.assigneeOption, !ticketAssignedId && styles.assigneeOptionActive]}
                                    onPress={() => setTicketAssignedId('')}
                                >
                                    <Ionicons name="person-outline" size={20} color={!ticketAssignedId ? '#FFF' : theme.colors.textSecondary} />
                                    <Text style={[styles.assigneeOptionText, !ticketAssignedId && { color: '#FFF' }]}>Sin asignar</Text>
                                </TouchableOpacity>
                                {superadmins.map(sa => (
                                    <TouchableOpacity
                                        key={sa.id}
                                        style={[styles.assigneeOption, ticketAssignedId === sa.id && styles.assigneeOptionActive]}
                                        onPress={() => setTicketAssignedId(sa.id)}
                                    >
                                        <Text style={[styles.assigneeOptionText, ticketAssignedId === sa.id && { color: '#FFF' }]}>{sa.username || sa.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={styles.labelSmall}>FECHA DE ENTREGA (DD-MM-YYYY)</Text>
                            <TextInput
                                style={styles.inputSmall}
                                placeholder="31-12-2024"
                                placeholderTextColor={theme.colors.textSecondary}
                                value={ticketDueDate}
                                onChangeText={setTicketDueDate}
                            />

                            <Text style={styles.labelSmall}>APLICACIONES ASOCIADAS (Selecciona varias)</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                                {apps.map(app => {
                                    const isSelected = ticketAppLabels.includes(app);
                                    return (
                                        <TouchableOpacity
                                            key={app}
                                            style={[
                                                styles.assigneeOption, 
                                                isSelected && styles.assigneeOptionActive,
                                                { marginBottom: 0 }
                                            ]}
                                            onPress={() => {
                                                if (isSelected) {
                                                    // Don't allow zero apps if possible, or just toggle
                                                    setTicketAppLabels(prev => prev.filter(l => l !== app));
                                                } else {
                                                    setTicketAppLabels(prev => [...prev, app]);
                                                }
                                            }}
                                        >
                                            <Text style={[styles.assigneeOptionText, isSelected && { color: '#FFF' }]}>{app}</Text>
                                            {isSelected && <Ionicons name="checkmark-circle" size={14} color="#FFF" style={{ marginLeft: 4 }} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity style={[styles.saveAllBtn, isUpdating && { opacity: 0.7 }]} onPress={() => updateTicketDetails()} disabled={isUpdating}>
                                {isUpdating ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.saveAllBtnText}>GUARDAR CAMBIOS INTERNOS</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (theme: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: {
        marginRight: 15,
    },
    title: {
        color: theme.colors.text,
        fontSize: 20,
        fontWeight: 'bold',
    },
    ticketCard: {
        backgroundColor: theme.colors.surface,
        padding: 15,
        borderRadius: 8,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    ticketId: {
        color: theme.colors.primary,
        fontWeight: 'bold',
    },
    ticketStatus: {
        color: '#FFD700',
        fontSize: 12,
        fontWeight: 'bold',
    },
    ticketSubject: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    ticketDesc: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: 10,
    },
    ticketUser: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontStyle: 'italic',
    },
    ticketDate: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 5,
        textAlign: 'right',
    },
    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
    },
    tab: {
        flex: 1,
        padding: 15,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.colors.primary,
    },
    tabText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    activeTabText: {
        color: theme.colors.primary,
    },
    label: {
        color: theme.colors.text,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 15,
        marginBottom: 20,
    },
    submitButton: {
        backgroundColor: theme.colors.primary,
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
    },
    submitButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Global Club Styles
    globalCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    globalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    globalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    globalDesc: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 20,
    },
    globalActionBtn: {
        backgroundColor: theme.colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        borderRadius: 10,
        gap: 10,
    },
    globalActionText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 15,
    },
    buttonGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 10,
    },
    gridBtn: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: theme.colors.background,
        padding: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    gridBtnText: {
        color: theme.colors.text,
        fontWeight: 'bold',
        fontSize: 13,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '85%',
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingBottom: 15,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    modalBody: {
        flex: 1,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.primary,
        marginBottom: 5,
        marginTop: 15,
    },
    modalValue: {
        fontSize: 16,
        color: theme.colors.text,
        lineHeight: 22,
    },
    statusButtonGrid: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 10,
        marginBottom: 30,
    },
    statusBtn: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    statusBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    // New Styles for Upgraded Support
    filterBar: {
        backgroundColor: theme.colors.surface,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    filterWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        rowGap: 12,
        columnGap: 20,
    },
    filterGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    filterLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 4,
    },
    filterScroll: {
        flexDirection: 'row',
    },
    filterBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: theme.colors.background,
        marginRight: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    filterBtnActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    filterBtnText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: 'bold',
    },
    filterBtnTextActive: {
        color: '#FFF',
    },
    appBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    appBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
    },
    priorityBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    ticketFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: 10,
    },
    assigneeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.background,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    assigneeInfoSmall: {
        alignItems: 'flex-end',
    },
    assigneeNameSmall: {
        fontSize: 11,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    assigneePicPlaceholderSmall: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: 20,
    },
    labelSmall: {
        fontSize: 12,
        fontWeight: 'bold',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        marginTop: 10,
    },
    prioritySelector: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 15,
    },
    prioBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
    },
    prioBtnText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: theme.colors.textSecondary,
    },
    assigneeScroll: {
        marginBottom: 15,
    },
    assigneeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.background,
        marginRight: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 6,
    },
    assigneeOptionActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    assigneeOptionText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    inputSmall: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 10,
        fontSize: 14,
        marginBottom: 20,
    },
    saveAllBtn: {
        backgroundColor: theme.colors.primary,
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 40,
    },
    saveAllBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    }
});
