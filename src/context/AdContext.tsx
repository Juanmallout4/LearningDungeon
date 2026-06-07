import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';
import { VideoAdModal } from '../components/VideoAdModal';

// Frequency of the ad pop-up (1 minute for testing purposes)
// In a real app this would be maybe 5 or 10 minutes (300000ms / 600000ms)
// We will set it to 2 minutes for a realistic feel but fast enough to test
const AD_INTERVAL_MS = 2 * 60 * 1000;

interface AdContextType {
    showAdNow: () => void;
}

const AdContext = createContext<AdContextType>({
    showAdNow: () => { }
});

export const useAdManager = () => useContext(AdContext);

export const AdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [adVisible, setAdVisible] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);

    // Periodically check who is the active user
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
        }, 15000); // Check every 15s

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Only start the ad timer if the user meets the criteria
        let adEngine: NodeJS.Timeout | null = null;

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

    const showAdNow = () => setAdVisible(true);
    const closeAd = () => setAdVisible(false);

    return (
        <AdContext.Provider value={{ showAdNow }}>
            {children}
            <VideoAdModal visible={adVisible} onClose={closeAd} />
        </AdContext.Provider>
    );
};
