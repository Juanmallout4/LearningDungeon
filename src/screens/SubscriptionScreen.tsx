import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Plan, SubscriptionService } from '../services/SubscriptionService';
import { useTranslation } from 'react-i18next';
import { PaymentModal } from '../components/PaymentModal';

export const SubscriptionScreen = () => {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);
    // Lista de planes disponibles, obtenida del servicio (probablemente desde backend o configuracion remota)
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    // Guarda el id del plan que se esta comprando ahora mismo (o 'ad_removal'); permite mostrar el spinner solo en ese boton y bloquear el resto
    const [purchasing, setPurchasing] = useState<string | null>(null);
    // Controla la visibilidad y el importe mostrado en el modal de pago simulado
    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    // Guardamos la accion a ejecutar (compra de plan o de eliminacion de anuncios) para lanzarla cuando el modal confirme el pago
    const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

    // Cargamos los planes una sola vez al montar la pantalla
    useEffect(() => {
        loadPlans();
    }, []);

    // Pide los planes al servicio de suscripciones; si falla, mostramos una alerta traducida y dejamos de cargar
    const loadPlans = async () => {
        try {
            const data = await SubscriptionService.getPlans();
            setPlans(data);
        } catch (error) {
            Alert.alert(t('common.error', { defaultValue: 'Error' }), t('subscription.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    // Prepara la compra de un plan: guarda el importe y encapsula la logica real de compra como "accion pendiente"
    // que se disparara solo si el usuario confirma el pago en el modal (evita cobrar antes de la confirmacion)
    const handlePurchase = async (plan: Plan) => {
        setPaymentAmount(plan.price);
        setPendingAction(() => async () => {
            setPurchasing(plan.id);
            setPaymentModalVisible(false);
            try {
                const result = await SubscriptionService.purchasePlan(plan.id);
                if (result.success) {
                    Alert.alert(t('subscription.subscribeSuccess'), t('subscription.subscribeMessage', { plan: plan.title }), [
                        { text: 'OK', onPress: () => navigation.goBack() }
                    ]);
                } else {
                    Alert.alert(t('common.error', { defaultValue: 'Error' }), result.message || t('subscription.errorPurchase'));
                }
            } catch (error) {
                Alert.alert(t('common.error', { defaultValue: 'Error' }), t('subscription.errorProcess'));
            } finally {
                setPurchasing(null);
            }
        });
        setPaymentModalVisible(true);
    };

    // Restaura compras previas (relevante en iOS/Android para no duplicar cobros) y avisa del resultado
    const handleRestore = async () => {
        setLoading(true);
        await SubscriptionService.restorePurchases();
        setLoading(false);
        Alert.alert(t('subscription.restoreTitle'), t('subscription.restoreSuccess'));
    };

    // Igual que handlePurchase pero para la compra unica de "sin anuncios"; de momento simula la espera de pago
    // con un timeout (no hay integracion real con backend/almacenamiento persistente todavia)
    const handlePurchaseAdRemoval = async () => {
        setPaymentAmount('€10.00');
        setPendingAction(() => async () => {
            setPurchasing('ad_removal');
            setPaymentModalVisible(false);
            try {
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Simulamos una compra exitosa (pendiente de conectar con el backend real)
                Alert.alert(
                    t('subscription.removeAdsSuccessTitle', { defaultValue: 'Cero Anuncios' }),
                    t('subscription.removeAdsSuccessDesc', { defaultValue: 'Has desbloqueado la versión sin anuncios de forma permanente.' }),
                    [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
            } catch (error) {
                Alert.alert(t('common.error', { defaultValue: 'Error' }), t('subscription.errorProcess'));
            } finally {
                setPurchasing(null);
            }
        });
        setPaymentModalVisible(true);
    };

    // Mientras se cargan los planes mostramos solo un spinner centrado, sin renderizar el resto de la pantalla
    if (loading) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
                    <Ionicons name="close" size={28} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('subscription.title')}</Text>
                <View style={{ width: 44 }} />
            </View>

            <View style={styles.content}>
                <Text style={styles.subtitle}>
                    {t('subscription.subtitle')}
                </Text>

                {/* Recorremos los planes recibidos del servicio; cada texto intenta traducirse por id de plan
                    y cae al valor por defecto del propio plan si no existe traduccion especifica */}
                {plans.map((plan) => (
                    <View key={plan.id} style={[styles.planCard, plan.recommended && styles.recommendedCard]}>
                        {/* La insignia de "recomendado" y el resaltado del borde solo aparecen en el plan marcado como tal */}
                        {plan.recommended && (
                            <View style={styles.recommendedBadge}>
                                <Text style={styles.recommendedText}>{t('subscription.recommended')}</Text>
                            </View>
                        )}

                        <Text style={[styles.planTitle, plan.recommended && { color: theme.colors.primary }]}>
                            {t(`subscription.plans.${plan.id}.title`, { defaultValue: plan.title }).toUpperCase()}
                        </Text>
                        <Text style={styles.planPrice}>{t(`subscription.plans.${plan.id}.price`, { defaultValue: plan.price })}</Text>
                        <Text style={styles.planDescription}>{t(`subscription.plans.${plan.id}.description`, { defaultValue: plan.description })}</Text>

                        <View style={styles.featuresContainer}>
                            {plan.features.map((feature, index) => (
                                <View key={index} style={styles.featureRow}>
                                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                                    <Text style={styles.featureText}>{t(`subscription.plans.${plan.id}.features_${index}`, { defaultValue: feature })}</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.purchaseButton, plan.recommended ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}
                            onPress={() => handlePurchase(plan)}
                            disabled={purchasing !== null}
                        >
                            {/* Mostramos el spinner solo en el boton del plan que se esta comprando; el resto queda deshabilitado */}
                            {purchasing === plan.id ? (
                                <ActivityIndicator color={plan.recommended ? theme.colors.background : theme.colors.text} />
                            ) : (
                                <Text style={[styles.purchaseButtonText, plan.recommended ? { color: theme.colors.background } : { color: theme.colors.text }]}>
                                    {t('subscription.subscribe')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Compra unica (no recurrente) para eliminar anuncios permanentemente */}
                <View style={styles.adRemovalCard}>
                    <View style={styles.planHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.planTitle}>{t('subscription.removeAds', { defaultValue: 'Remove Ads' })}</Text>
                            <Text style={styles.planPrice}>€10.00 <Text style={styles.planPeriod}>{t('subscription.oneOff', { defaultValue: '/ one-off' })}</Text></Text>
                        </View>
                        <Ionicons name="star" size={32} color={theme.colors.warning} />
                    </View>
                    <Text style={styles.planDescription}>
                        {t('subscription.removeAdsDesc', { defaultValue: 'Permanently remove all advertisements from the app with a single payment.' })}
                    </Text>
                    <TouchableOpacity
                        style={styles.adRemovalButton}
                        onPress={handlePurchaseAdRemoval}
                        disabled={purchasing !== null}
                    >
                        {purchasing === 'ad_removal' ? (
                            <ActivityIndicator color={theme.colors.background} />
                        ) : (
                            <Text style={styles.adRemovalButtonText}>
                                {t('subscription.purchaseNow', { defaultValue: 'Purchase Now' })}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
                    <Text style={styles.restoreText}>{t('subscription.restore')}</Text>
                </TouchableOpacity>

                <Text style={styles.disclaimer}>
                    {t('subscription.disclaimer')}
                </Text>

                <PaymentModal
                    visible={paymentModalVisible}
                    amount={paymentAmount}
                    onClose={() => {
                        setPaymentModalVisible(false);
                        setPendingAction(null);
                    }}
                    onSuccess={() => {
                        if (pendingAction) {
                            pendingAction();
                        }
                    }}
                />
            </View>
        </ScrollView>
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
        justifyContent: 'space-between',
        padding: theme.spacing.m,
        paddingTop: theme.spacing.xl,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    headerTitle: {
        ...theme.typography.header,
        fontSize: 20,
    },
    content: {
        padding: theme.spacing.m,
        paddingBottom: 40,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
    },
    subtitle: {
        ...theme.typography.body,
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.l,
    },
    planCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
        position: 'relative',
    },
    recommendedCard: {
        borderColor: theme.colors.primary,
        borderWidth: 2,
    },
    recommendedBadge: {
        position: 'absolute',
        top: -12,
        alignSelf: 'center',
        backgroundColor: theme.colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    recommendedText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: theme.colors.background,
    },
    planTitle: {
        ...theme.typography.subheader,
        textAlign: 'center',
        marginBottom: 8,
    },
    planPrice: {
        fontSize: 32,
        fontWeight: 'bold',
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    planDescription: {
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.m,
    },
    featuresContainer: {
        marginBottom: theme.spacing.l,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    featureText: {
        color: theme.colors.text,
        marginLeft: 10,
        flex: 1,
    },
    purchaseButton: {
        padding: 16,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    purchaseButtonText: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    restoreButton: {
        padding: 16,
        alignItems: 'center',
    },
    restoreText: {
        color: theme.colors.textSecondary,
        textDecorationLine: 'underline',
    },
    disclaimer: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 20,
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.m,
    },
    planPeriod: {
        fontSize: 16,
        fontWeight: 'normal',
        color: theme.colors.textSecondary,
    },
    adRemovalCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: theme.colors.warning,
        shadowColor: theme.colors.warning,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    adRemovalButton: {
        backgroundColor: theme.colors.warning,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        alignItems: 'center',
        marginTop: theme.spacing.m,
    },
    adRemovalButtonText: {
        fontWeight: 'bold',
        fontSize: 16,
        color: theme.colors.background,
    }
});
