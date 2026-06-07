import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TulDetailScreen } from '../screens/TulDetailScreen';
import { useTheme } from '../theme/ThemeContext';
import { AuthService } from '../services/AuthService';
import { UserProfile } from '../types';
import { WebSidebar } from '../components/WebSidebar';
import { withAuth } from '../components/withAuth';

import { SettingsScreen } from '../screens/SettingsScreen';
import { GroupListScreen } from '../screens/instructor/GroupListScreen';
import { StudentListScreen } from '../screens/instructor/StudentListScreen';
import { TechniqueRequestScreen } from '../screens/instructor/TechniqueRequestScreen';
import { EvaluationScreen } from '../screens/instructor/EvaluationScreen';
import { ActivityListScreen } from '../screens/instructor/ActivityListScreen';
import { AttendanceHistoryScreen } from '../screens/instructor/AttendanceHistoryScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReportsScreen } from '../screens/instructor/ReportsScreen';
import { InstructorManagementScreen } from '../screens/club/InstructorManagementScreen';
import { StudentManagementScreen } from '../screens/club/StudentManagementScreen';
import { VocabularyManagementScreen } from '../screens/club/VocabularyManagementScreen';
import { MarketManagementScreen } from '../screens/club/MarketManagementScreen';
import { GamificationManagementScreen } from '../screens/club/GamificationManagementScreen';
import { BossManagementScreen } from '../screens/club/BossManagementScreen';
import { AdminSupportScreen } from '../screens/AdminSupportScreen';
import { ChestManagementScreen } from '../screens/club/ChestManagementScreen';
import { VocabularyGameScreen } from '../screens/VocabularyGameScreen';
import { TechniqueGameScreen } from '../screens/TechniqueGameScreen';
import { GameHubScreen } from '../screens/GameHubScreen';
import { MarketScreen } from '../screens/MarketScreen';
import { ClanBossBattleScreen } from '../screens/ClanBossBattleScreen';
import { ClanHubScreen } from '../screens/ClanHubScreen';
import { InventoryScreen } from '../screens/InventoryScreen';

const Stack = createNativeStackNavigator();

export const AppNavigator = () => {
    const { theme } = useTheme();
    const [isAppReady, setIsAppReady] = useState(false);
    const [initialRoute, setInitialRoute] = useState<'Login' | 'Home'>('Login');
    const [initialUser, setInitialUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        const checkLogin = async () => {
            const user = await AuthService.getSavedUser();
            if (user) {
                setInitialUser(user);
                setInitialRoute('Home');
            }
            setIsAppReady(true);
        };
        checkLogin();
    }, []);

    if (!isAppReady && Platform.OS !== 'web') {
        return (
            <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
            <WebSidebar />
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <Stack.Navigator
                    initialRouteName={initialRoute}
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: theme.colors.background },
                        animation: Platform.OS === 'web' ? 'none' : 'default',
                    }}
                >
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={RegisterScreen} />
                    <Stack.Screen
                        name="Home"
                        component={HomeScreen}
                        initialParams={initialUser ? { user: initialUser } : undefined}
                    />
                    <Stack.Screen name="GameHub" component={withAuth(GameHubScreen)} />
                    <Stack.Screen name="VocabularyGame" component={withAuth(VocabularyGameScreen)} />
                    <Stack.Screen name="TechniqueGame" component={withAuth(TechniqueGameScreen)} />
                    <Stack.Screen name="ClanBossBattle" component={withAuth(ClanBossBattleScreen)} />
                    <Stack.Screen name="ClanHubScreen" component={withAuth(ClanHubScreen)} />
                    <Stack.Screen name="Market" component={withAuth(MarketScreen)} />
                    <Stack.Screen name="Inventory" component={withAuth(InventoryScreen)} />
                    <Stack.Screen name="Settings" component={withAuth(SettingsScreen)} />
                    <Stack.Screen name="Profile" component={withAuth(ProfileScreen)} />
                    <Stack.Screen name="Subscription" component={withAuth(SubscriptionScreen)} />
                    <Stack.Screen name="InstructorManagement" component={withAuth(InstructorManagementScreen)} />
                    <Stack.Screen name="StudentManagement" component={withAuth(StudentManagementScreen)} />
                    <Stack.Screen name="VocabularyManagement" component={withAuth(VocabularyManagementScreen)} />
                    <Stack.Screen name="MarketManagement" component={withAuth(MarketManagementScreen)} />
                    <Stack.Screen name="GamificationManagement" component={withAuth(GamificationManagementScreen)} />
                    <Stack.Screen name="BossManagement" component={withAuth(BossManagementScreen)} />
                    <Stack.Screen name="AdminSupport" component={withAuth(AdminSupportScreen)} />
                    <Stack.Screen name="ChestManagement" component={withAuth(ChestManagementScreen)} />

                    {/* Instructor Screens */}
                    <Stack.Screen name="ActivityList" component={withAuth(ActivityListScreen)} />
                    <Stack.Screen name="GroupList" component={withAuth(GroupListScreen)} />
                    <Stack.Screen name="StudentList" component={withAuth(StudentListScreen)} />
                    <Stack.Screen name="TechniqueRequest" component={withAuth(TechniqueRequestScreen)} />
                    <Stack.Screen name="Evaluation" component={withAuth(EvaluationScreen)} />
                    <Stack.Screen name="AttendanceHistory" component={withAuth(AttendanceHistoryScreen)} />
                    <Stack.Screen name="Reports" component={withAuth(ReportsScreen)} />

                    <Stack.Screen
                        name="Details"
                        component={TulDetailScreen}
                        options={{
                            headerShown: true,
                            headerTitle: '',
                            headerTintColor: theme.colors.primary,
                            headerStyle: { backgroundColor: theme.colors.surface },
                            headerShadowVisible: false,
                        }}
                    />
                </Stack.Navigator>
            </View>
        </View>
    );
};
