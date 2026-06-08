import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform, Alert, Image, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { AuthService } from '../services/AuthService';
import { apiFetch } from '../utils/apiFetch';
import { UserProfile } from '../types';
import { useTranslation } from 'react-i18next';

// Barra lateral de navegacion exclusiva para la version web en pantallas anchas (>768px): muestra
// el usuario activo, los accesos segun su rol, el selector de idioma/tema y el formulario de soporte
export const WebSidebar = () => {
    const { width } = useWindowDimensions();
    const { theme, toggleTheme } = useTheme();
    const navigation = useNavigation<any>();
    const { t, i18n } = useTranslation();
    const styles = createStyles(theme);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
    const langs = ['es', 'en', 'fr', 'de', 'it', 'pt'];
    
    // Estado del modal de contacto con soporte
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
    const [supportSubject, setSupportSubject] = useState('');
    const [supportDesc, setSupportDesc] = useState('');
    const [supportLoading, setSupportLoading] = useState(false);

    useEffect(() => {
        const loadUser = async () => {
            const u = await AuthService.getSavedUser();
            setUser(prev => {
                if (JSON.stringify(prev) === JSON.stringify(u)) {
                    return prev;
                }
                return u;
            });
        };
        loadUser();

        // Mientras no tengamos un Context global que avise de los cambios, comprobamos cada 2s
        // si hubo un login/logout para mantener el usuario mostrado en la barra siempre actualizado
        const interval = setInterval(loadUser, 2000);
        return () => clearInterval(interval);
    }, []);

    const [currentRouteName, setCurrentRouteName] = useState('');

    useEffect(() => {
        const getActiveRouteName = (routeState: any): string => {
            if (!routeState || !routeState.routes || typeof routeState.index !== 'number') return '';
            const route = routeState.routes[routeState.index];
            if (!route) return '';
            if (route.state) {
                return getActiveRouteName(route.state);
            }
            return route.name;
        };

        // Calculamos la ruta activa inicial para resaltar el item de menu correspondiente
        const state = navigation.getState();
        if (state) {
            setCurrentRouteName(getActiveRouteName(state));
        }

        // Nos suscribimos a los cambios de navegacion para mantener el resaltado sincronizado
        const unsubscribe = navigation.addListener('state', (e: any) => {
            if (e && e.data && e.data.state) {
                setCurrentRouteName(getActiveRouteName(e.data.state));
            }
        });

        return unsubscribe;
    }, [navigation]);

    // Esta barra solo se muestra en web con ancho mayor a 768px y con sesion iniciada;
    // en movil o con la sesion cerrada no renderizamos nada
    if (Platform.OS !== 'web' || width <= 768 || !user) {
        return null;
    }

    const navItems = [
        { name: 'Home', params: { user }, icon: 'barbell', label: t('navigation.practice', { defaultValue: 'Practice' }), roles: ['student', 'instructor', 'club_owner'] },
        { name: 'ActivityList', params: { user }, icon: 'people-outline', label: t('navigation.classes', { defaultValue: 'Classes' }), roles: ['student', 'instructor', 'club_owner'] },
        { name: 'GamificationManagement', params: { user }, icon: 'game-controller-outline', label: 'Gestión de Juegos', roles: ['instructor', 'club_owner'] },
        { name: 'Reports', params: { user }, icon: 'document-text-outline', label: t('navigation.reports', { defaultValue: 'Reports' }), roles: ['instructor', 'club_owner'] },
        { name: 'Subscription', params: { user }, icon: 'card-outline', label: t('navigation.subscription', { defaultValue: 'Subscription' }), roles: ['student', 'club_owner'] },
    ];

    if (user.role === 'club_owner' && (user.plan === 'club_pro' || user.plan === 'club_elite')) {
        navItems.splice(3, 0, { name: 'StudentManagement', params: { user }, icon: 'school-outline', label: t('settings.manageStudents', { defaultValue: 'Students' }), roles: ['club_owner'] });
        navItems.splice(3, 0, { name: 'InstructorManagement', params: { user }, icon: 'briefcase-outline', label: t('settings.manageInstructors', { defaultValue: 'Instructors' }), roles: ['club_owner'] });
    }

    const visibleNavItems = navItems.filter(item => item.roles.includes(user.role));

    const handleNavigate = (name: string, params: any) => {
        navigation.navigate(name, params);
    };

    const handleSupportTicket = () => {
        if ((user as any).devRole === 'superadmin') {
            navigation.navigate('AdminSupport' as never);
        } else {
            setIsSupportModalOpen(true);
        }
    };

    const submitSupportTicket = async () => {
        if (!supportSubject || !supportDesc) {
            Alert.alert('Error', 'Por favor llena todos los campos.');
            return;
        }
        setSupportLoading(true);
        try {
            const res = await apiFetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, subject: supportSubject, description: supportDesc })
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert('Éxito', 'El ticket de soporte ha sido enviado a la administración.');
                setIsSupportModalOpen(false);
                setSupportSubject('');
                setSupportDesc('');
            } else {
                Alert.alert('Error', data.error || 'Ocurrió un problema.');
            }
        } catch (e) {
            Alert.alert('Error', 'No se pudo enviar el ticket.');
        } finally {
            setSupportLoading(false);
        }
    };

    const toggleLanguageMenu = () => {
        setIsLanguageMenuOpen(!isLanguageMenuOpen);
    };

    const handleSelectLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        setIsLanguageMenuOpen(false);
    };

    const handleLogout = async () => {
        await AuthService.logout();
        setUser(null);
        navigation.reset({
            index: 0,
            routes: [{ name: 'Login' as never }],
        });
    };

    return (
        <View style={[styles.sidebar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.header}>
                <Text style={[styles.brand, { color: theme.colors.primary }]}>Learning Dungeon</Text>
            </View>

            <TouchableOpacity style={styles.userInfo} onPress={() => handleNavigate('Profile', { user })}>
                {user.profilePicture ? (
                    <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
                        <Text style={[styles.avatarText, { color: '#fff' }]}>{user.name ? user.name.charAt(0) : '?'}</Text>
                    </View>
                )}
                <Text style={[styles.userName, { color: theme.colors.text }]}>{user.name}</Text>
                <Text style={[styles.userRole, { color: theme.colors.textSecondary }]}>
                    {t(`roles.${user.role.toLowerCase()}`, { defaultValue: user.role })}
                </Text>
            </TouchableOpacity>

            <ScrollView style={styles.navContainer} contentContainerStyle={{ paddingBottom: 20 }}>
                {visibleNavItems.map(item => {
                    const isActive = currentRouteName === item.name || (currentRouteName === 'GroupList' && item.name === 'ActivityList') || (currentRouteName === 'StudentList' && item.name === 'ActivityList');
                    return (
                        <TouchableOpacity
                            key={item.name}
                            style={[
                                styles.navItem,
                                isActive ? { backgroundColor: theme.colors.primary + '20' } : null
                            ]}
                            onPress={() => handleNavigate(item.name, item.params)}
                        >
                            <Ionicons
                                name={item.icon as any}
                                size={22}
                                color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                                style={{ width: 24, textAlign: 'center' }}
                            />
                            <Text style={[
                                styles.navText,
                                { color: isActive ? theme.colors.primary : theme.colors.textSecondary, fontWeight: isActive ? '700' : '500' }
                            ]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {isLanguageMenuOpen && (
                <View style={[styles.languageDropdown, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: '#000' }]}>
                    {langs.map(lang => {
                        const isSelected = i18n.language.startsWith(lang);
                        return (
                            <TouchableOpacity
                                key={lang}
                                style={[styles.languageOption, isSelected ? { backgroundColor: theme.colors.primary + '20' } : null]}
                                onPress={() => handleSelectLanguage(lang)}
                            >
                                <Text style={[styles.languageOptionText, { color: isSelected ? theme.colors.primary : theme.colors.textSecondary }]}>
                                    {lang.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
                <View style={styles.footerButtons}>
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: theme.colors.background }]} onPress={toggleLanguageMenu}>
                        <Ionicons name="globe-outline" size={18} color={theme.colors.textSecondary} />
                        <Text style={[styles.footerBtnText, { color: theme.colors.textSecondary }]}>
                            {i18n.language.split('-')[0].toUpperCase()}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: theme.colors.background, maxWidth: 50 }]} onPress={toggleTheme}>
                        <Ionicons name={theme.isDark ? "sunny-outline" : "moon-outline"} size={20} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: theme.colors.background }]} onPress={handleSupportTicket}>
                        <Ionicons name="help-buoy-outline" size={18} color={theme.colors.textSecondary} />
                        <Text style={[styles.footerBtnText, { color: theme.colors.textSecondary }]}>
                            {t('settings.support', { defaultValue: 'Support' })}
                        </Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
                    <Text style={[styles.logoutText, { color: theme.colors.error }]}>
                        {t('auth.logout', { defaultValue: 'Logout' })}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Modal de contacto con soporte para la version de escritorio */}
            <Modal visible={isSupportModalOpen} transparent animationType="fade" onRequestClose={() => setIsSupportModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Contactar a Soporte</Text>
                        
                        <Text style={styles.label}>Asunto</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. Problema con mi cuenta"
                            placeholderTextColor={theme.colors.textSecondary}
                            value={supportSubject}
                            onChangeText={setSupportSubject}
                        />

                        <Text style={styles.label}>Descripción del Problema</Text>
                        <TextInput
                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                            placeholder="Describe el problema detalladamente..."
                            placeholderTextColor={theme.colors.textSecondary}
                            value={supportDesc}
                            onChangeText={setSupportDesc}
                            multiline
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsSupportModalOpen(false)}>
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={submitSupportTicket} disabled={supportLoading}>
                                {supportLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Enviar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const createStyles = (theme: any) => StyleSheet.create({
    sidebar: {
        width: 260,
        borderRightWidth: 1,
        flexDirection: 'column',
    },
    header: {
        padding: 24,
        paddingBottom: 16,
    },
    brand: {
        fontSize: 24,
        fontWeight: '900',
    },
    userInfo: {
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    avatarText: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    userName: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    userRole: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginTop: 4,
        letterSpacing: 0.5,
    },
    navContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        gap: 8,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 12,
    },
    navText: {
        fontSize: 15,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        gap: 12,
    },
    footerButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    footerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    footerBtnText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#ff4b4b15',
        gap: 8,
    },
    logoutText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    languageDropdown: {
        position: 'absolute',
        bottom: 125,
        left: 16,
        width: 140,
        borderRadius: 12,
        borderWidth: 1,
        padding: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        zIndex: 1000,
    },
    languageOption: {
        width: '45%',
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    languageOptionText: {
        fontSize: 13,
        fontWeight: '700',
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
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        marginBottom: 8,
        fontWeight: 'bold',
    },
    input: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 10,
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        minWidth: 100,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: 'transparent',
    },
    cancelButtonText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
    },
    submitButton: {
        backgroundColor: theme.colors.primary,
    },
    submitButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    }
});
