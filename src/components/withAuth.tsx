import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthService } from '../services/AuthService';
import { useTheme } from '../theme/ThemeContext';

// Funcion de orden superior (HOC) que protege una pantalla exigiendo un usuario autenticado: si los
// parametros de ruta ya traen un usuario lo usamos directamente, y si no, lo recuperamos del almacenamiento
// local; mientras tanto mostramos un indicador de carga, y si no hay sesion guardada redirigimos a "Login"
export function withAuth<P extends object>(WrappedComponent: React.ComponentType<P>) {
    return function WithAuth(props: any) {
        const navigation = useNavigation<any>();
        const { theme } = useTheme();
        const paramUser = props.route?.params?.user;
        const [user, setUser] = useState<any>(paramUser || null);
        const [loading, setLoading] = useState(!paramUser);

        useEffect(() => {
            // Si no nos llego el usuario por parametros, lo buscamos en el almacenamiento local;
            // si tampoco existe alli, significa que no hay sesion activa y mandamos al usuario al Login
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

        // Inyectamos el usuario ya resuelto dentro de route.params para que la pantalla envuelta
        // pueda acceder a "user" exactamente igual que si se lo hubieran pasado por navegacion
        const newRoute = {
            ...props.route,
            params: { ...(props.route?.params || {}), user }
        };

        return <WrappedComponent {...(props as P)} route={newRoute} />;
    };
}
