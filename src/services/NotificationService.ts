import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Set default behavior for incoming notifications when app is foregrounded
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
    /**
     * Registers for Expo push notifications.
     * Needs to be called usually on app mount.
     */
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

            // In Expo Go SDK 53+, push notifications (remote) are completely removed.
            // We bypass the token generation entirely to prevent Expo Go from throwing the uncaught error.
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

    /**
     * Schedule a local push notification
     * Useful for class reminders, streak goals, etc.
     */
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

    /**
     * Send a notification to the user right now (simulating API usage)
     */
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
