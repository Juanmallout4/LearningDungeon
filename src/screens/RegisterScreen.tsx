import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView, Modal, FlatList, Switch, Image } from 'react-native';
import { Button } from '../components/Button';
import { AuthService } from '../services/AuthService';
import { ThemeProvider, useTheme, AppTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HubSpotService } from '../services/HubSpotService';

// Catalogo estatico de paises con su prefijo telefonico, usado por el selector de pais del formulario.
// Se ordena alfabeticamente por nombre justo despues de definirse (ver .sort al final del array).
const COUNTRIES = [
    { code: 'ES', name: 'España', flag: '🇪🇸', dialCode: '+34' },
    { code: 'US', name: 'United States', flag: '🇺🇸', dialCode: '+1' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦', dialCode: '+1' },
    { code: 'MX', name: 'México', flag: '🇲🇽', dialCode: '+52' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷', dialCode: '+54' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴', dialCode: '+57' },
    { code: 'CL', name: 'Chile', flag: '🇨🇱', dialCode: '+56' },
    { code: 'PE', name: 'Perú', flag: '🇵🇪', dialCode: '+51' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪', dialCode: '+58' },
    { code: 'EC', name: 'Ecuador', flag: '🇪🇨', dialCode: '+593' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾', dialCode: '+598' },
    { code: 'BO', name: 'Bolivia', flag: '🇧🇴', dialCode: '+591' },
    { code: 'PY', name: 'Paraguay', flag: '🇵🇾', dialCode: '+595' },
    { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', dialCode: '+506' },
    { code: 'PA', name: 'Panamá', flag: '🇵🇦', dialCode: '+507' },
    { code: 'DO', name: 'Rep. Dominicana', flag: '🇩🇴', dialCode: '+1' },
    { code: 'BR', name: 'Brasil', flag: '🇧🇷', dialCode: '+55' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dialCode: '+44' },
    { code: 'FR', name: 'France', flag: '🇫🇷', dialCode: '+33' },
    { code: 'DE', name: 'Deutschland', flag: '🇩🇪', dialCode: '+49' },
    { code: 'IT', name: 'Italia', flag: '🇮🇹', dialCode: '+39' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹', dialCode: '+351' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱', dialCode: '+31' },
    { code: 'BE', name: 'Belgium', flag: '🇧🇪', dialCode: '+32' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭', dialCode: '+41' },
    { code: 'AT', name: 'Austria', flag: '🇦🇹', dialCode: '+43' },
    { code: 'SE', name: 'Sweden', flag: '🇸🇪', dialCode: '+46' },
    { code: 'NO', name: 'Norway', flag: '🇳🇴', dialCode: '+47' },
    { code: 'DK', name: 'Denmark', flag: '🇩🇰', dialCode: '+45' },
    { code: 'FI', name: 'Finland', flag: '🇫🇮', dialCode: '+358' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪', dialCode: '+353' },
    { code: 'GR', name: 'Greece', flag: '🇬🇷', dialCode: '+30' },
    { code: 'CZ', name: 'Czechia', flag: '🇨🇿', dialCode: '+420' },
    { code: 'PL', name: 'Poland', flag: '🇵🇱', dialCode: '+48' },
    { code: 'RU', name: 'Russia', flag: '🇷🇺', dialCode: '+7' },
    { code: 'UA', name: 'Ukraine', flag: '🇺🇦', dialCode: '+380' },
    { code: 'TR', name: 'Turkey', flag: '🇹🇷', dialCode: '+90' },
    { code: 'IL', name: 'Israel', flag: '🇮🇱', dialCode: '+972' },
    { code: 'AE', name: 'UAE', flag: '🇦🇪', dialCode: '+971' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', dialCode: '+966' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦', dialCode: '+27' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬', dialCode: '+20' },
    { code: 'NG', name: 'Nigeria', flag: '🇳🇬', dialCode: '+234' },
    { code: 'KE', name: 'Kenya', flag: '🇰🇪', dialCode: '+254' },
    { code: 'MA', name: 'Morocco', flag: '🇲🇦', dialCode: '+212' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺', dialCode: '+61' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', dialCode: '+64' },
    { code: 'CN', name: 'China', flag: '🇨🇳', dialCode: '+86' },
    { code: 'IN', name: 'India', flag: '🇮🇳', dialCode: '+91' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵', dialCode: '+81' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷', dialCode: '+82' },
    { code: 'ID', name: 'Indonesia', flag: '🇮🇩', dialCode: '+62' },
    { code: 'TH', name: 'Thailand', flag: '🇹🇭', dialCode: '+66' },
    { code: 'VN', name: 'Vietnam', flag: '🇻🇳', dialCode: '+84' },
    { code: 'PH', name: 'Philippines', flag: '🇵🇭', dialCode: '+63' },
    { code: 'MY', name: 'Malaysia', flag: '🇲🇾', dialCode: '+60' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬', dialCode: '+65' }
].sort((a, b) => a.name.localeCompare(b.name));

export const RegisterScreen = () => {
    // Campos basicos del formulario de registro
    const [name, setName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    // Fecha de nacimiento; se gestiona con un picker nativo en movil y un <input type="date"> en web
    const [dob, setDob] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [password, setPassword] = useState('');
    // Consentimiento explicito para uso de imagen/video en redes y marketing (checkbox tipo switch)
    const [mediaConsent, setMediaConsent] = useState(false);
    const [loading, setLoading] = useState(false);

    // Estado del selector de pais: pais elegido (por defecto el primero del listado ordenado), visibilidad del modal y texto de busqueda
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
    const [countrySearchQuery, setCountrySearchQuery] = useState('');

    // Filtra el listado de paises en tiempo real por nombre o por prefijo telefonico segun lo que escriba el usuario
    const filteredCountries = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
        c.dialCode.includes(countrySearchQuery)
    );

    const navigation = useNavigation<NativeStackNavigationProp<any>>();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const handleRegister = async () => {
        // Validacion de campos obligatorios antes de llamar a la API (evita peticiones innecesarias)
        if (!name || !lastName || !phone || !email || !dob || !password) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('login.errorEmpty', { defaultValue: 'Please fill all fields' }));
            return;
        }

        // Componemos el telefono completo uniendo el prefijo del pais elegido con el numero introducido
        const fullPhone = `${selectedCountry.dialCode} ${phone}`;

        setLoading(true);
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.trim(),
                    surname: lastName.trim(),
                    email: email.trim(),
                    password: password,
                    phone: fullPhone,
                    // Convertimos la fecha a formato ISO 'YYYY-MM-DD' que espera el backend
                    birthday: dob.toISOString().split('T')[0],
                    mediaConsent: mediaConsent,
                    adRemoval: false, // Todo usuario nuevo empieza sin la compra de "sin anuncios"
                    belt: 'Blanco (10º Gup)' // Cinturon inicial asignado a cualquier alumno recien registrado
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Propagamos el mensaje de error especifico del backend (p.ej. email duplicado) al catch
                throw new Error(data.error || 'Registration failed');
            }

            // Identificamos al nuevo usuario en HubSpot para que el CRM de marketing reciba sus datos de contacto
            HubSpotService.identify(email.trim(), {
                firstname: name.trim(),
                lastname: lastName.trim(),
                phone: fullPhone
            });

            // Registro completado: cortamos el estado de carga y navegamos a Login
            setLoading(false);

            if (Platform.OS === 'web') {
                // En web las alertas nativas bloquean el hilo y pueden romper la navegacion,
                // asi que navegamos directamente sin mostrar el Alert
                navigation.navigate('Login');
            } else {
                Alert.alert(
                    t('register.successTitle', { defaultValue: 'Registration Successful' }),
                    t('register.successBody', { defaultValue: 'Your account has been created.' }),
                    [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
                );
            }
            return; // Salimos pronto para que el finally no vuelva a tocar 'loading' innecesariamente
        } catch (error: any) {
            console.error('Registration Error:', error.message);
            Alert.alert(t('common.error', { defaultValue: 'Error' }), error.message || t('login.errorLogin', { defaultValue: 'Registration failed' }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('register.title', { defaultValue: 'Create Account' })}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.logoContainer}>
                    <Text style={styles.title}>Learning Dungeon</Text>
                    <Text style={styles.subtitle}>By AIM Education</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>{t('register.name', { defaultValue: 'Name' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder={t('register.placeholderName')}
                        value={name}
                        onChangeText={setName}
                    />

                    <Text style={styles.label}>{t('register.lastName', { defaultValue: 'Last Name' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder={t('register.placeholderLastName')}
                        value={lastName}
                        onChangeText={setLastName}
                    />

                    {/* Campo de telefono compuesto: boton de pais (con bandera y prefijo) + input numerico */}
                    <Text style={styles.label}>{t('register.phone', { defaultValue: 'Phone Number' })}</Text>
                    <View style={styles.phoneInputContainer}>
                        <TouchableOpacity
                            style={styles.countryPickerButton}
                            onPress={() => setIsCountryModalVisible(true)}
                        >
                            <Image
                                source={{ uri: `https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png` }}
                                style={{ width: 24, height: 16, borderRadius: 2 }}
                            />
                            <Text style={styles.countryCodeText}>{selectedCountry.dialCode}</Text>
                            <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                        </TouchableOpacity>

                        <TextInput
                            style={styles.phoneInput}
                            placeholderTextColor={theme.colors.textSecondary}
                            placeholder={t('register.placeholderPhone')}
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                        />
                    </View>

                    <Text style={styles.label}>{t('register.email', { defaultValue: 'Email Address' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder="juan.perez@email.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                    />

                    {/* Selector de fecha de nacimiento: en web usamos un <input type="date"> nativo del navegador
                        (con estilos CSS inyectados para que combine con el tema); en movil usamos el DateTimePicker nativo */}
                    <Text style={styles.label}>{t('register.dob', { defaultValue: 'Date of Birth' })}</Text>
                    {Platform.OS === 'web' ? (
                        <>
                            <style dangerouslySetInnerHTML={{
                                __html: `
                                .Learning Dungeon-date-picker {
                                    box-sizing: border-box;
                                    outline: none;
                                    height: 52px;
                                }
                                .Learning Dungeon-date-picker::-webkit-calendar-picker-indicator {
                                    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%232ECC71" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>');
                                    cursor: pointer;
                                    width: 20px;
                                    height: 20px;
                                }
                                `
                            }} />
                            <input
                                type="date"
                                className="Learning Dungeon-date-picker"
                                style={{
                                    backgroundColor: theme.colors.surface,
                                    color: dob ? theme.colors.text : theme.colors.textSecondary,
                                    borderRadius: theme.borderRadius.m,
                                    paddingLeft: theme.spacing.m,
                                    paddingRight: theme.spacing.m,
                                    marginBottom: theme.spacing.m,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    borderStyle: 'solid',
                                    width: '100%',
                                }}
                                value={dob ? dob.toISOString().split('T')[0] : ''}
                                onChange={(e) => {
                                    // El input web entrega un string 'YYYY-MM-DD'; lo convertimos a Date o lo limpiamos si esta vacio
                                    const selectedDate = e.target.value ? new Date(e.target.value) : null;
                                    setDob(selectedDate);
                                }}
                                max={new Date().toISOString().split('T')[0]} // No se puede seleccionar una fecha futura (no se puede nacer mañana)
                            />
                        </>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={[styles.input, { justifyContent: 'center' }]}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Text style={{ color: dob ? theme.colors.text : theme.colors.textSecondary }}>
                                    {dob ? dob.toLocaleDateString() : t('register.dob', { defaultValue: 'Date of Birth' })}
                                </Text>
                            </TouchableOpacity>

                            {showDatePicker && (
                                <DateTimePicker
                                    value={dob || new Date(2000, 0, 1)} // Si aun no hay fecha, abrimos el picker en una fecha por defecto razonable
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                                    themeVariant={theme.isDark ? 'dark' : 'light'}
                                    maximumDate={new Date()} // No se puede nacer en el futuro
                                    onChange={(event, selectedDate) => {
                                        // En iOS el picker permanece visible hasta que el usuario pulsa "Hecho"; en Android se cierra solo al elegir
                                        setShowDatePicker(Platform.OS === 'ios');
                                        if (selectedDate) setDob(selectedDate);
                                    }}
                                />
                            )}
                            {Platform.OS === 'ios' && showDatePicker && (
                                <Button
                                    title={t('common.done')}
                                    onPress={() => setShowDatePicker(false)}
                                    style={{ marginBottom: theme.spacing.m }}
                                />
                            )}
                        </>
                    )}

                    <Text style={styles.label}>{t('register.password', { defaultValue: 'Password' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder="********"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />

                    {/* Consentimiento explicito (RGPD) para el uso de imagen/video del alumno en redes sociales y marketing */}
                    <View style={styles.consentRow}>
                        <Switch
                            value={mediaConsent}
                            onValueChange={setMediaConsent}
                            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                        />
                        <Text style={styles.consentText}>
                            {t('register.mediaConsent', { defaultValue: 'I consent to the capture and usage of my image/video for social media and marketing.' })}
                        </Text>
                    </View>

                    <Button
                        title={loading ? t('login.connecting', { defaultValue: 'Connecting...' }) : t('register.submit', { defaultValue: 'Register' })}
                        onPress={handleRegister}
                        style={styles.marginTop}
                    />
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal inferior con buscador para elegir el pais (y por tanto el prefijo telefonico) */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isCountryModalVisible}
                onRequestClose={() => {
                    setIsCountryModalVisible(false);
                    setCountrySearchQuery('');
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('common.selectCountry')}</Text>
                            <TouchableOpacity onPress={() => {
                                setIsCountryModalVisible(false);
                                setCountrySearchQuery('');
                            }}>
                                <Text style={styles.closeButton}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.searchInput}
                            placeholderTextColor={theme.colors.textSecondary}
                            placeholder={t('common.search')}
                            value={countrySearchQuery}
                            onChangeText={setCountrySearchQuery}
                        />

                        <FlatList
                            data={filteredCountries}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.countryItem}
                                    onPress={() => {
                                        setSelectedCountry(item);
                                        setIsCountryModalVisible(false);
                                        setCountrySearchQuery('');
                                    }}
                                >
                                    <Image
                                        source={{ uri: `https://flagcdn.com/w40/${item.code.toLowerCase()}.png` }}
                                        style={{ width: 24, height: 16, borderRadius: 2, marginRight: 8 }}
                                    />
                                    <Text style={styles.countryName}>{item.name}</Text>
                                    <View style={{ flex: 1 }} />
                                    <Text style={styles.countryDialCode}>{item.dialCode}</Text>
                                </TouchableOpacity>
                            )}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
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
        paddingHorizontal: theme.spacing.m,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
        color: theme.colors.text,
    },
    scrollContent: {
        paddingHorizontal: theme.spacing.l,
        paddingBottom: theme.spacing.l,
        paddingTop: theme.spacing.m,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: theme.spacing.xl,
        maxWidth: 500,
        alignSelf: 'center',
    },
    title: {
        ...theme.typography.header,
        fontSize: 36,
        color: theme.colors.primary,
    },
    subtitle: {
        ...theme.typography.caption,
        marginTop: 4,
        fontSize: 16,
    },
    form: {
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    label: {
        ...theme.typography.body,
        marginBottom: theme.spacing.xs,
        marginLeft: theme.spacing.xs,
        fontWeight: 'bold',
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
    phoneInputContainer: {
        flexDirection: 'row',
        marginBottom: theme.spacing.m,
        gap: 8,
    },
    countryPickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.borderRadius.m,
        paddingHorizontal: theme.spacing.m,
        height: 52, // Misma altura que un TextInput normal, para que el conjunto quede alineado
        gap: 6,
    },
    countryFlag: {
        fontSize: 18,
    },
    countryCodeText: {
        color: theme.colors.text,
        fontSize: 16,
    },
    phoneInput: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
        height: 52,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: theme.colors.background,
        borderTopLeftRadius: theme.borderRadius.l,
        borderTopRightRadius: theme.borderRadius.l,
        height: '70%',
        paddingBottom: Platform.OS === 'ios' ? 40 : 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.m,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    modalTitle: {
        ...theme.typography.header,
        fontSize: 18,
    },
    closeButton: {
        fontSize: 18,
        color: theme.colors.textSecondary,
        padding: theme.spacing.s,
    },
    searchInput: {
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        padding: theme.spacing.m,
        marginHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.s,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    countryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.m,
    },
    countryFlagList: {
        fontSize: 24,
        marginRight: theme.spacing.m,
    },
    countryName: {
        ...theme.typography.body,
        color: theme.colors.text,
    },
    countryDialCode: {
        ...theme.typography.body,
        color: theme.colors.textSecondary,
    },
    separator: {
        height: 1,
        backgroundColor: theme.colors.border,
    },
    consentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.m,
        marginBottom: theme.spacing.l,
        paddingHorizontal: 8,
    },
    consentText: {
        flex: 1,
        marginLeft: 12,
        fontSize: 14,
        color: theme.colors.textSecondary,
        lineHeight: 20,
    }
});
