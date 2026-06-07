import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { Button } from './Button';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface PaymentModalProps {
    visible: boolean;
    amount: string;
    onClose: () => void;
    onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ visible, amount, onClose, onSuccess }) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvv, setCvv] = useState('');
    const [name, setName] = useState('');
    const [processing, setProcessing] = useState(false);

    const handlePay = async () => {
        if (!cardNumber || !expiry || !cvv || !name) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('subscription.paymentErrorEmpty', { defaultValue: 'Please fill out all payment fields' }));
            return;
        }

        setProcessing(true);
        try {
            // Simulate API request to payment gateway
            await new Promise(resolve => setTimeout(resolve, 2000));
            onSuccess();
        } catch (error) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('subscription.paymentErrorProcess', { defaultValue: 'Payment failed to process' }));
        } finally {
            setProcessing(false);
            // Reset fields
            setCardNumber('');
            setExpiry('');
            setCvv('');
            setName('');
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('subscription.paymentTitle', { defaultValue: 'Secure Checkout' })}</Text>
                        <TouchableOpacity onPress={onClose} disabled={processing}>
                            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.amountDisplay}>{t('subscription.total', { defaultValue: 'Total' })}: {amount}</Text>

                    <Text style={styles.label}>{t('subscription.cardName', { defaultValue: 'Name on Card' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder="John Doe"
                        value={name}
                        onChangeText={setName}
                        editable={!processing}
                    />

                    <Text style={styles.label}>{t('subscription.cardNumber', { defaultValue: 'Card Number' })}</Text>
                    <TextInput
                        style={styles.input}
                        placeholderTextColor={theme.colors.textSecondary}
                        placeholder="0000 0000 0000 0000"
                        keyboardType="numeric"
                        maxLength={19}
                        value={cardNumber}
                        onChangeText={setCardNumber}
                        editable={!processing}
                    />

                    <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.label}>{t('subscription.cardExpiry', { defaultValue: 'Expiry' })}</Text>
                            <TextInput
                                style={styles.input}
                                placeholderTextColor={theme.colors.textSecondary}
                                placeholder="MM/YY"
                                keyboardType="numeric"
                                maxLength={5}
                                value={expiry}
                                onChangeText={setExpiry}
                                editable={!processing}
                            />
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.label}>CVV</Text>
                            <TextInput
                                style={styles.input}
                                placeholderTextColor={theme.colors.textSecondary}
                                placeholder="123"
                                keyboardType="numeric"
                                maxLength={4}
                                secureTextEntry
                                value={cvv}
                                onChangeText={setCvv}
                                editable={!processing}
                            />
                        </View>
                    </View>

                    <View style={styles.secureBadge}>
                        <Ionicons name="lock-closed" size={16} color={theme.colors.success} style={{ marginRight: 6 }} />
                        <Text style={styles.secureText}>{t('subscription.securePayment', { defaultValue: 'Payments are secure and encrypted' })}</Text>
                    </View>

                    {processing ? (
                        <View style={styles.processingContainer}>
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                            <Text style={styles.processingText}>{t('subscription.processing', { defaultValue: 'Processing Payment...' })}</Text>
                        </View>
                    ) : (
                        <Button
                            title={`${t('subscription.payNow', { defaultValue: 'Pay' })} ${amount}`}
                            onPress={handlePay}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: theme.colors.background,
        borderTopLeftRadius: theme.borderRadius.l,
        borderTopRightRadius: theme.borderRadius.l,
        padding: theme.spacing.xl,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.l,
    },
    title: {
        ...theme.typography.header,
        fontSize: 20,
    },
    amountDisplay: {
        ...theme.typography.subheader,
        fontSize: 24,
        color: theme.colors.primary,
        textAlign: 'center',
        marginBottom: theme.spacing.xl,
    },
    label: {
        ...theme.typography.body,
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: theme.spacing.s,
    },
    input: {
        backgroundColor: theme.colors.surface,
        color: theme.colors.text,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    secureBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.xl,
    },
    secureText: {
        ...theme.typography.caption,
        color: theme.colors.success,
    },
    processingContainer: {
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
    },
    processingText: {
        ...theme.typography.body,
        marginTop: theme.spacing.s,
        color: theme.colors.textSecondary,
    }
});
