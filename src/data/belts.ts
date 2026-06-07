export interface BeltConfig {
    name: string;
    gup: string;
    mainColor: string;
    textColor: string;
    tipColor?: string;
    borderColor?: string; // For white belt visibility on white bg (if applicable)
}

export const BELT_CONFIGS: Record<number, BeltConfig> = {
    0: {
        name: 'Blanco',
        gup: '10º Gup',
        mainColor: '#FFFFFF',
        textColor: 'theme',
        borderColor: '#333333'
    },
    1: {
        name: 'Blanco-Amarillo',
        gup: '9º Gup',
        mainColor: '#FFFFFF',
        tipColor: '#FFE135', // Yellow
        textColor: '#FFE135', // Yellow text
        borderColor: '#333333'
    },
    2: {
        name: 'Amarillo',
        gup: '8º Gup',
        mainColor: '#FFE135',
        textColor: '#FFE135'
    },
    3: {
        name: 'Amarillo-Verde',
        gup: '7º Gup',
        mainColor: '#FFE135',
        tipColor: '#2E8B57', // Green
        textColor: '#2E8B57' // Green text
    },
    4: {
        name: 'Verde',
        gup: '6º Gup',
        mainColor: '#2E8B57',
        textColor: '#2E8B57'
    },
    5: {
        name: 'Verde-Azul',
        gup: '5º Gup',
        mainColor: '#2E8B57',
        tipColor: '#0057B7', // Blue
        textColor: '#0057B7' // Blue text
    },
    6: {
        name: 'Azul',
        gup: '4º Gup',
        mainColor: '#0057B7',
        textColor: '#0057B7'
    },
    7: {
        name: 'Azul-Rojo',
        gup: '3º Gup',
        mainColor: '#0057B7',
        tipColor: '#CE1126', // Red
        textColor: '#CE1126' // Red text
    },
    8: {
        name: 'Rojo',
        gup: '2º Gup',
        mainColor: '#CE1126',
        textColor: '#CE1126'
    },
    9: {
        name: 'Rojo-Negro',
        gup: '1º Gup',
        mainColor: '#CE1126',
        tipColor: '#000000',
        textColor: 'theme'
    },
    10: {
        name: 'I Dan',
        gup: 'Negro',
        mainColor: '#000000',
        textColor: 'theme',
        borderColor: '#333333'
    },
    11: { name: 'II Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    12: { name: 'III Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    13: { name: 'IV Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    14: { name: 'V Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    15: { name: 'VI Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    16: { name: 'VII Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    17: { name: 'VIII Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' },
    18: { name: 'IX Dan', gup: 'Negro', mainColor: '#000000', textColor: 'theme', borderColor: '#333333' }
};

// Helper mapping for BELT_RANKS to keep types/index.ts compatible if needed,
// or we just switch to using this config.
