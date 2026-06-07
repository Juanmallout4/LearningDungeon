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
    // HubSpot Tracking Code Injection (Web only)
    if (Platform.OS === 'web') {
      // Disable the chat widget but keep tracking
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

    // Register token on start
    NotificationService.registerForPushNotificationsAsync();

    // Listen to notification tap events
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // Combine React Navigation theme with our custom colors
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
