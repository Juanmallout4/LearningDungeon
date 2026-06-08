import { Platform } from 'react-native';

// Servicio de integración con HubSpot (CRM): identifica visitantes y envía eventos personalizados.
// Solo funciona en web, ya que se apoya en el script de tracking de HubSpot inyectado en window._hsq.
export const HubSpotService = {
    // Crea la cola global window._hsq si todavía no existe (debe llamarse antes de usar el resto de métodos)
    init: () => {
        if (Platform.OS !== 'web') return;
        (window as any)._hsq = (window as any)._hsq || [];
    },

    // Identifica al visitante actual en HubSpot mediante su email y propiedades extra (nombre, etc.),
    // y dispara un trackPageView para sincronizar la identidad de inmediato
    identify: (email: string, properties: Record<string, any> = {}) => {
        if (Platform.OS !== 'web') return;

        const _hsq = (window as any)._hsq = (window as any)._hsq || [];

        _hsq.push(['identify', {
            email: email,
            ...properties
        }]);

        // Disparamos un page view para sincronizar la identidad inmediatamente
        _hsq.push(['trackPageView']);

        console.log('[HubSpot] Identity pushed for:', email);
    },

    // Empuja un evento personalizado a la cola de HubSpot identificado por su id/nombre, con un valor numérico opcional
    trackEvent: (eventId: string, value?: number) => {
        if (Platform.OS !== 'web') return;
        const _hsq = (window as any)._hsq = (window as any)._hsq || [];
        
        const payload: any = { id: eventId };
        if (value !== undefined) payload.value = value;
        
        _hsq.push(['trackEvent', payload]);
    }
};
