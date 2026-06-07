import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, Image, TouchableOpacity, Platform } from 'react-native';
import { AuthService } from '../services/AuthService';
import { Button } from '../components/Button';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { HubSpotService } from '../services/HubSpotService';

export const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { theme, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const styles = createStyles(theme);

    const toggleLanguage = () => {
        const langs = ['es', 'en', 'fr', 'de', 'it', 'pt'];
        const currentIndex = langs.indexOf(i18n.language.split('-')[0]);
        const nextIndex = (currentIndex + 1) % langs.length;
        i18n.changeLanguage(langs[nextIndex]);
    };

    const handleLogin = async () => {
        if (!email || !password) {
            setErrorMessage(t('login.errorEmpty', { defaultValue: 'Email and password are required.' }));
            return;
        }

        setErrorMessage(null);
        setLoading(true);
        try {
            const user = await AuthService.login(email, password);
            
            // # HubSpot Identification
            HubSpotService.identify(user.email, {
                firstname: user.name,
                lastname: user.surname
            });

            // Navigate to Home and pass user param to context or params
            // For simplicity in this v1, passing via params
            navigation.replace('Home', { user });
        } catch (error: any) {
            const errorMsg = error.message || t('login.errorLogin');
            setErrorMessage(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    handleLogin();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [email, password]);

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <TouchableOpacity style={styles.iconButton} onPress={toggleLanguage}>
                    <Text style={styles.languageText}>{i18n.language.split('-')[0].toUpperCase()}</Text>
                    <Ionicons name="globe-outline" size={20} color={theme.colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={toggleTheme}>
                    <Ionicons name={theme.isDark ? "sunny-outline" : "moon-outline"} size={22} color={theme.colors.text} />
                </TouchableOpacity>
            </View>

            <View style={styles.logoContainer}>
                <Text style={styles.title}>Learning Dungeon</Text>
                <Text style={styles.subtitle}>By AIM Education</Text>
            </View>


            <View style={styles.form}>
                <Text style={styles.label}>{t('login.usernameOrEmail')}</Text>
                <TextInput
                    style={styles.input}
                    placeholderTextColor={theme.colors.textSecondary}
                    placeholder={t('login.placeholderEmail')}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    onSubmitEditing={handleLogin}
                />

                <Text style={styles.label}>{t('login.password')}</Text>
                <TextInput
                    style={styles.input}
                    placeholderTextColor={theme.colors.textSecondary}
                    placeholder="********"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handleLogin}
                />

                {errorMessage ? (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                ) : null}

                <Button
                    title={loading ? t('login.connecting') : t('login.connectButton')}
                    onPress={handleLogin}
                    style={styles.marginTop}
                />

                <View style={styles.registerContainer}>
                    <Text style={styles.noAccountText}>{t('login.noAccount', { defaultValue: "Don't have an account?" })}</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                        <Text style={styles.registerText}>{t('login.registerButton', { defaultValue: 'Sign Up' })}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.l,
        justifyContent: 'center',
        paddingBottom: '10%', // Optical centering (lifts the form slightly up so it doesn't feel heavy on the bottom)
    },
    topBar: {
        position: 'absolute',
        top: 20,
        right: 20,
        flexDirection: 'row',
        gap: 12,
        zIndex: 10,
    },
    iconButton: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    languageText: {
        ...theme.typography.body,
        fontWeight: 'bold',
        fontSize: 14,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: theme.spacing.xl,
        alignSelf: 'center',
    },
    title: {
        ...theme.typography.header,
        fontSize: 48,
        color: theme.colors.primary,
    },
    subtitle: {
        ...theme.typography.caption,
        marginTop: theme.spacing.s,
        fontSize: 18,
    },
    form: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        alignSelf: 'center',
    },
    errorText: {
        color: theme.colors.error,
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: theme.spacing.m,
        textAlign: 'center',
    },
    label: {
        ...theme.typography.body,
        marginBottom: theme.spacing.xs,
        marginLeft: theme.spacing.xs,
    },
    input: {
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    marginTop: {
        marginTop: theme.spacing.m,
    },

    registerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: theme.spacing.xl,
        gap: theme.spacing.xs,
    },
    noAccountText: {
        ...theme.typography.body,
        color: theme.colors.textSecondary,
    },
    registerText: {
        ...theme.typography.body,
        color: theme.colors.primary,
        fontWeight: 'bold',
    }
});
