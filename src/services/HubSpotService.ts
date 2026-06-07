import { Platform } from 'react-native';

/**
 * HubSpot Tracking Service
 * Handles user identification and event tracking for the CRM.
 */
export const HubSpotService = {
    /**
     * Initializes the tracking queue if not present.
     */
    init: () => {
        if (Platform.OS !== 'web') return;
        (window as any)._hsq = (window as any)._hsq || [];
    },

    /**
     * Identifies the current visitor in HubSpot CRM.
     * @param email The user's email address.
     * @param properties Optional additional properties (name, etc).
     */
    identify: (email: string, properties: Record<string, any> = {}) => {
        if (Platform.OS !== 'web') return;
        
        const _hsq = (window as any)._hsq = (window as any)._hsq || [];
        
        _hsq.push(['identify', {
            email: email,
            ...properties
        }]);

        // Trigger a page view to sync the identity immediately
        _hsq.push(['trackPageView']);
        
        console.log('[HubSpot] Identity pushed for:', email);
    },

    /**
     * Tracks a custom event.
     * @param eventId The HubSpot event ID or name.
     * @param value Optional numerical value for the event.
     */
    trackEvent: (eventId: string, value?: number) => {
        if (Platform.OS !== 'web') return;
        const _hsq = (window as any)._hsq = (window as any)._hsq || [];
        
        const payload: any = { id: eventId };
        if (value !== undefined) payload.value = value;
        
        _hsq.push(['trackEvent', payload]);
    }
};
