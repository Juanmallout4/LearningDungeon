import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { AuthService } from '../services/AuthService';
import { apiFetch } from '../utils/apiFetch';
import { UserProfile } from '../types';
import { useTranslation } from 'react-i18next';
import { NotificationService } from '../services/NotificationService';

interface MenuContentProps {
    user: UserProfile;
    onLogout?: () => void;
}

export const MenuContent = ({ user, onLogout }: MenuContentProps) => {
    const navigation = useNavigation<any>();
    const { theme } = useTheme();
    const { t, i18n } = useTranslation();
    const styles = createStyles(theme);
    const [isLanguageMenuOpen, setIsLanguageMenuOpen] = React.useState(false);
    const langs = ['es', 'en', 'fr', 'de', 'it', 'pt'];

    const toggleLanguageMenu = () => {
        setIsLanguageMenuOpen(!isLanguageMenuOpen);
    };

    const handleSelectLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        setIsLanguageMenuOpen(false);
    };

    const handleLogout = async () => {
        await AuthService.logout();
        if (onLogout) {
            onLogout();
        } else {
            navigation.reset({
                index: 0,
                routes: [{ name: 'Login' as never }],
            });
        }
    };

    const [isSupportModalOpen, setIsSupportModalOpen] = React.useState(false);
    const [supportSubject, setSupportSubject] = React.useState('');
    const [supportDesc, setSupportDesc] = React.useState('');
    const [supportLoading, setSupportLoading] = React.useState(false);

    const handleSupportTicket = () => {
        // Assume devRole is fetched inside user profile 'devRole'
        if ((user as any).devRole === 'superadmin') {
            navigation.navigate('AdminSupport' as never);
        } else {
            setIsSupportModalOpen(true);
        }
    };

    const submitSupportTicket = async () => {
        if (!supportSubject || !supportDesc) {
            Alert.alert(t('common.error'), t('support.allFieldsRequired'));
            return;
        }
        setSupportLoading(true);
        try {
            const res = await apiFetch('/api/support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, subject: supportSubject, description: supportDesc })
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert(t('common.success'), t('support.ticketSent'));
                setIsSupportModalOpen(false);
                setSupportSubject('');
                setSupportDesc('');
            } else {
                Alert.alert(t('common.error'), data.error || t('support.ticketError'));
            }
        } catch (e) {
            Alert.alert(t('common.error'), t('support.ticketError'));
        } finally {
            setSupportLoading(false);
        }
    };

    const handleTestNotification = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
            await Notifications.requestPermissionsAsync();
        }

        await NotificationService.scheduleLocalNotification(
            t('settings.notifications'),
            t('settings.testNotificationMessage', { defaultValue: 'This is a local test notification! 🥋' }),
            2
        );
        Alert.alert(t('settings.notifications'), t('settings.testNotificationScheduled'));
    };

    return (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Profile Section Navigation */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.myProfile')}</Text>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('Profile', { user })}
                >
                    <Text style={styles.actionButtonText}>{t('profile.viewProfile', { defaultValue: 'My Profile & Progress' })}</Text>
                    <Text style={styles.arrow}>{'>'}</Text>
                </TouchableOpacity>
            </View>

            {/* Instructor / Student Classes Panel */}
            {(user.role === 'instructor' || user.role === 'club_owner' || user.role === 'student') && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {user.role === 'student' ? t('settings.myClasses') : t('settings.instructorPanel')}
                    </Text>
                    <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ActivityList' as never, { user, initialMode: 'evaluate' } as never)}>
                        <Text style={styles.actionButtonText}>{t('settings.myClasses')}</Text>
                        <Text style={styles.arrow}>{'>'}</Text>
                    </TouchableOpacity>

                    {user.role !== 'student' && (
                        <>
                            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ActivityList' as never, { user, initialMode: 'attendance' } as never)}>
                                <Text style={styles.actionButtonText}>{t('settings.takeAttendance', { defaultValue: 'Take Attendance' })}</Text>
                                <Text style={styles.arrow}>{'>'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ActivityList' as never, { user, initialMode: 'technique' } as never)}>
                                <Text style={styles.actionButtonText}>{t('instructor.requestTechnique', { defaultValue: 'Pedir Técnica' })}</Text>
                                <Text style={styles.arrow}>{'>'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Reports' as never, { user } as never)}>
                                <Text style={styles.actionButtonText}>{t('reports.title', { defaultValue: 'Reports' })}</Text>
                                <Text style={styles.arrow}>{'>'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('GamificationManagement' as never, { user } as never)}>
                                <Text style={styles.actionButtonText}>{t('clan.gamificationManagement')}</Text>
                                <Text style={styles.arrow}>{'>'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}

            {/* Owner Panel Section - ONLY for Club Owners */}
            {user.role === 'club_owner' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('settings.ownerPanel', { defaultValue: 'Owner Panel' })}</Text>

                    {/* Instructor Management */}
                    {(user.plan === 'club_pro' || user.plan === 'club_elite') && (
                        <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.colors.surface, marginBottom: 8 }]} onPress={() => navigation.navigate('InstructorManagement' as never, { user } as never)}>
                            <Text style={[styles.premiumTitle, { color: theme.colors.text }]}>{t('settings.manageInstructors', { defaultValue: 'Manage Instructors' })}</Text>
                            <Text style={styles.premiumDesc}>{t('settings.manageInstructorsDesc', { defaultValue: 'Add or remove instructors who can evaluate students and manage attendance for your club.' })}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Student Management */}
                    {(user.plan === 'club_pro' || user.plan === 'club_elite') && (
                        <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.colors.surface }]} onPress={() => navigation.navigate('StudentManagement' as never, { user } as never)}>
                            <Text style={[styles.premiumTitle, { color: theme.colors.text }]}>{t('settings.manageStudents', { defaultValue: 'Manage Students' })}</Text>
                            <Text style={styles.premiumDesc}>{t('settings.manageStudentsDesc', { defaultValue: 'Register students to your club and assign them to specific class groups.' })}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Subscriptions & Payments Section - Visible to all */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.subscriptionsAndPayments', { defaultValue: 'Subscriptions & Payments' })}</Text>
                <TouchableOpacity style={styles.premiumCard} onPress={() => navigation.navigate('Subscription' as never)}>
                    <Text style={styles.premiumTitle}>{t('settings.manage')}</Text>
                    <Text style={styles.premiumDesc}>{t('settings.manageDesc')}</Text>
                </TouchableOpacity>
            </View>

            {/* Navigation specifically for Web so they can go to HOME if they are not there */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('navigation.practice', { defaultValue: 'Practice' })}</Text>
                <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Home', { user })}>
                    <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>{t('navigation.practice', { defaultValue: 'Practice Tuls' })}</Text>
                    <Ionicons name="play-circle-outline" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Notifications */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
                <TouchableOpacity style={styles.actionButton} onPress={handleTestNotification}>
                    <Text style={styles.actionButtonText}>{t('settings.testNotification')}</Text>
                    <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
                </TouchableOpacity>
            </View>

            {/* Support and Language */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.support')}</Text>

                <TouchableOpacity style={styles.actionButton} onPress={toggleLanguageMenu}>
                    <Text style={styles.actionButtonText}>{t('settings.language')}: {i18n.language.split('-')[0].toUpperCase()}</Text>
                    <Ionicons name={isLanguageMenuOpen ? "chevron-up-outline" : "chevron-down-outline"} size={20} color={theme.colors.text} />
                </TouchableOpacity>

                {isLanguageMenuOpen && (
                    <View style={styles.languageDropdown}>
                        {langs.map((lang) => {
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

                <TouchableOpacity style={[styles.actionButton, { marginTop: 10 }]} onPress={handleSupportTicket}>
                    <Text style={styles.actionButtonText}>{t('settings.openTicket')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionButton, { marginTop: 10 }]} onPress={handleLogout}>
                    <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>{t('settings.logout')}</Text>
                </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />

            {/* Support Modal */}
            <Modal visible={isSupportModalOpen} transparent animationType="slide" onRequestClose={() => setIsSupportModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('support.contactSupport')}</Text>
                        
                        <Text style={styles.label}>{t('support.subject')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('support.subjectPlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={supportSubject}
                            onChangeText={setSupportSubject}
                        />

                        <Text style={styles.label}>{t('support.description')}</Text>
                        <TextInput
                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                            placeholder={t('support.descriptionPlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={supportDesc}
                            onChangeText={setSupportDesc}
                            multiline
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setIsSupportModalOpen(false)}>
                                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={submitSupportTicket} disabled={supportLoading}>
                                {supportLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{t('common.send')}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    content: {
        paddingBottom: 40,
        paddingTop: 16,
    },
    section: {
        marginBottom: theme.spacing.l,
        paddingHorizontal: theme.spacing.m,
    },
    sectionTitle: {
        ...theme.typography.subheader,
        marginBottom: theme.spacing.s,
        color: theme.colors.textSecondary,
    },
    actionButton: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    actionButtonText: {
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
    arrow: {
        color: theme.colors.textSecondary,
        fontSize: 18,
    },
    premiumCard: {
        backgroundColor: theme.isDark ? '#2C2C2C' : theme.colors.background,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    premiumTitle: {
        color: theme.colors.primary,
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    premiumDesc: {
        color: theme.colors.textSecondary,
        fontSize: 14,
    },
    languageDropdown: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'space-between',
        marginTop: -4,
        marginBottom: 8,
    },
    languageOption: {
        width: '31%',
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    languageOptionText: {
        fontSize: 14,
        fontWeight: 'bold',
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
