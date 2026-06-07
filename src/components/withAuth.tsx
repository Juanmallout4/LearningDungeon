import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthService } from '../services/AuthService';
import { useTheme } from '../theme/ThemeContext';

export function withAuth<P extends object>(WrappedComponent: React.ComponentType<P>) {
    return function WithAuth(props: any) {
        const navigation = useNavigation<any>();
        const { theme } = useTheme();
        const paramUser = props.route?.params?.user;
        const [user, setUser] = useState<any>(paramUser || null);
        const [loading, setLoading] = useState(!paramUser);

        useEffect(() => {
            let mounted = true;
            if (!paramUser) {
                AuthService.getSavedUser().then(u => {
                    if (mounted) {
                        if (u) {
                            setUser(u);
                        } else {
                            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                        }
                        setLoading(false);
                    }
                });
            }
            return () => { mounted = false; };
        }, [paramUser, navigation]);

        if (loading || !user) {
            return (
                <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            );
        }

        // Inject user into props.route.params
        const newRoute = {
            ...props.route,
            params: { ...(props.route?.params || {}), user }
        };

        return <WrappedComponent {...(props as P)} route={newRoute} />;
    };
}
