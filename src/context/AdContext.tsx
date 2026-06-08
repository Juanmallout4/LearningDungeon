import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';
import { VideoAdModal } from '../components/VideoAdModal';

// Aqui podemos configurar cada cuanto tiempo aparece el anuncio emergente (en milisegundos).
// Lo dejamos en 2 minutos: suficientemente realista para producción pero rapido para poder probarlo
const AD_INTERVAL_MS = 2 * 60 * 1000;

interface AdContextType {
    showAdNow: () => void;
}

// Contexto global que expone una funcion para forzar la aparicion del anuncio bajo demanda
const AdContext = createContext<AdContextType>({
    showAdNow: () => { }
});

export const useAdManager = () => useContext(AdContext);

// Proveedor que envuelve la app y gestiona cuando mostrar el modal de video-anuncio: vigila quien es
// el usuario activo y, si no pertenece a una organizacion (club) ni ha comprado la eliminacion de anuncios,
// programa la aparicion periodica del anuncio cada AD_INTERVAL_MS milisegundos
export const AdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [adVisible, setAdVisible] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);

    // Comprobamos periodicamente (cada 15s) quien es el usuario activo leyendo el perfil guardado en
    // el almacenamiento local, ya que el usuario puede cambiar (login/logout) sin que este componente se remonte
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const storedUser = await AsyncStorage.getItem('@user_profile');
                if (storedUser) {
                    setUser(JSON.parse(storedUser));
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error('Error fetching user for ad manager:', error);
            }
        }, 15000); // Comprobamos cada 15 segundos

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Solo arrancamos el temporizador de anuncios si el usuario cumple los criterios para verlos
        let adEngine: NodeJS.Timeout | null = null;

        // Aqui podemos configurar quien ve anuncios: los usuarios de un club (organizationId) o que
        // ya hayan comprado la eliminacion de anuncios quedan exentos
        const isEligibleForAds = user !== null && !user.organizationId && !user.hasPurchasedAdRemoval;

        if (isEligibleForAds) {
            adEngine = setInterval(() => {
                setAdVisible(true);
            }, AD_INTERVAL_MS);
        }

        return () => {
            if (adEngine) {
                clearInterval(adEngine);
            }
        };
    }, [user]);

    // Permite a cualquier pantalla forzar la aparicion inmediata del anuncio (por ejemplo, antes de una recompensa)
    const showAdNow = () => setAdVisible(true);
    const closeAd = () => setAdVisible(false);

    return (
        <AdContext.Provider value={{ showAdNow }}>
            {children}
            <VideoAdModal visible={adVisible} onClose={closeAd} />
        </AdContext.Provider>
    );
};
