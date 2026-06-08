import React, { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { NotificationService } from './src/services/NotificationService';
import './src/i18n';
import { NavigationContainer, DefaultTheme, DarkTheme, LinkingOptions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AdProvider } from './src/context/AdContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';

const AppContent = () => {
  const { theme } = useTheme();
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Inyectamos el script de tracking de HubSpot solo en la version web
    if (Platform.OS === 'web') {
      // Desactivamos el widget de chat pero mantenemos el tracking de visitas
      (window as any).hsConversationsSettings = {
        loadImmediately: false
      };

      const script = document.createElement('script');
      script.id = 'hs-script-loader';
      script.type = 'text/javascript';
      script.async = true;
      script.defer = true;
      script.src = "//js-eu1.hs-scripts.com/146995303.js";
      document.body.appendChild(script);
      console.log('HubSpot script injected');
    }

    // Pedimos el token de notificaciones push al arrancar la app
    NotificationService.registerForPushNotificationsAsync();

    // Escuchamos cuando el usuario pulsa una notificacion para reaccionar a ella
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // Aqui mezclamos el tema base de React Navigation con los colores de nuestro ThemeContext
  const navigationTheme = theme.isDark ? {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    }
  } : {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    }
  };

  // Aqui configuramos los deep links: cada pantalla queda asociada a una ruta tipo URL (web y app nativa)
  const linking: LinkingOptions<ReactNavigation.RootParamList> = {
    prefixes: ['Learning Dungeon://'],
    config: {
      screens: {
        Login: 'login',
        Register: 'register',
        Home: '',
        Settings: 'settings',
        Profile: 'profile',
        Subscription: 'subscription',
        InstructorManagement: 'instructor-management',
        ActivityList: 'activity-list',
        GroupList: 'group-list',
        StudentList: 'student-list',
        Evaluation: 'evaluation',
        AttendanceHistory: 'attendance',
        Reports: 'reports',
        Details: 'tuls/:id',
      }
    }
  };

  return (
    <AdProvider>
      <NavigationContainer theme={navigationTheme} linking={linking}>
        <StatusBar style={theme.isDark ? "light" : "dark"} backgroundColor={theme.colors.background} />
        <AppNavigator />
      </NavigationContainer>
    </AdProvider>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
