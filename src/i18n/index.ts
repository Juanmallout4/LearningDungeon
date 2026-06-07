import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import it from './locales/it';
import pt from './locales/pt';

const resources = {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    it: { translation: it },
    pt: { translation: pt }
};

// Fallback to Spanish if something goes really wrong, but usually English is the global default.
// The user requested Spanish and English. The app is currently in Spanish, so let's make Spanish the default if 'es' is not exactly detected but we want to be safe, or just use English as fallback.
const fullLocale = getLocales()[0]?.languageCode || 'es';
const deviceLanguage = fullLocale.split('-')[0]; // Extract 'es' from 'es-ES' or 'en' from 'en-US'

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: deviceLanguage, // Use base language (e.g., 'es', 'en', 'fr')
        fallbackLng: 'en', // Fallback to English if device language is not available
        supportedLngs: ['en', 'es', 'fr', 'de', 'it', 'pt'],
        nonExplicitSupportedLngs: true, // Allows 'en-US' to map to 'en'
        interpolation: {
            escapeValue: false // React already safes from XSS
        }
    });

export default i18n;
