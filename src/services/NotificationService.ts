import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configura el comportamiento por defecto de las notificaciones entrantes cuando la app está en primer plano
// (mostrar alerta, sonido y badge)
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    } as any),
});

export const NotificationService = {
    // Solicita permisos y registra el dispositivo para notificaciones push de Expo (normalmente al montar la app).
    // Crea el canal "default" en Android, pide permisos si faltan y devuelve el token de Expo Push (o undefined si no aplica)
    registerForPushNotificationsAsync: async (): Promise<string | undefined> => {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.log('Failed to get push token for push notification!');
                return undefined;
            }

            // En Expo Go SDK 53+ las notificaciones push remotas se eliminaron por completo.
            // Evitamos generar el token para que Expo Go no lance un error no controlado.
            if (Constants.appOwnership === 'expo') {
                console.log("Running in Expo Go: Remote Push Notifications are disabled. Local notifications will still work.");
            } else {
                try {
                    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
                    if (projectId) {
                        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
                        console.log("EXPO PUSH TOKEN: ", token);
                    } else {
                        token = (await Notifications.getExpoPushTokenAsync()).data;
                    }
                } catch (e) {
                    console.log("Failed to process push token:", e);
                }
            }
        } else {
            console.log('Must use physical device for Push Notifications');
        }

        return token;
    },

    // Programa una notificación local que se dispara tras "triggerSeconds" segundos
    // (recordatorios de clase, rachas, etc., sin pasar por el backend)
    scheduleLocalNotification: async (title: string, body: string, triggerSeconds: number = 2) => {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
            },
            trigger: { seconds: triggerSeconds } as any,
        });
    },

    // Envía una notificación push de prueba directamente al endpoint de Expo (https://exp.host/.../push/send)
    // usando el token del destinatario; pensado para pruebas manuales, no para flujo de producción
    sendPushNotification: async (expoPushToken: string, title: string, body: string) => {
        const message = {
            to: expoPushToken,
            sound: 'default',
            title,
            body,
            data: { someData: 'goes here' },
        };

        try {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });
            console.log("Push notification sent successfully!");
        } catch (error) {
            console.error("Error sending push notification: ", error);
        }
    }
};
