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

// Detectamos el idioma del dispositivo (p.ej. 'es-ES' o 'en-US') y nos quedamos solo con el codigo
// base ('es', 'en'...) ya que nuestros recursos de traduccion estan organizados por idioma, no por region.
// Si no se puede detectar, usamos español como valor por defecto
const fullLocale = getLocales()[0]?.languageCode || 'es';
const deviceLanguage = fullLocale.split('-')[0]; // Extraemos 'es' de 'es-ES' o 'en' de 'en-US'

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: deviceLanguage, // Usamos el idioma base detectado (p.ej. 'es', 'en', 'fr')
        fallbackLng: 'en', // Si el idioma del dispositivo no esta soportado, recurrimos al ingles
        supportedLngs: ['en', 'es', 'fr', 'de', 'it', 'pt'],
        nonExplicitSupportedLngs: true, // Permite que variantes como 'en-US' se asocien automaticamente a 'en'
        interpolation: {
            escapeValue: false // No hace falta escapar valores: React ya protege contra XSS por defecto
        }
    });

export default i18n;
