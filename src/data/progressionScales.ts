export interface ProgressionLevel {
    order: number;
    name: string;
    color: string;
    textColor?: string;
}

// Fixed, app-defined catalogs per activity_type (not customizable per club —
// these are standardized systems). Taekwondo ITF is intentionally absent here:
// it keeps using BELT_CONFIGS + BeltDisplay (src/data/belts.ts).
// Names/colors are placeholders and can be freely edited in this single file.
export const PROGRESSION_SCALES: Record<string, ProgressionLevel[]> = {
    ingles: [
        { order: 0, name: 'Starters', color: '#A0C4FF' },
        { order: 1, name: 'Movers', color: '#9BF6FF' },
        { order: 2, name: 'Flyers', color: '#CAFFBF' },
        { order: 3, name: 'A1', color: '#FDFFB6' },
        { order: 4, name: 'A2', color: '#FFD6A5' },
        { order: 5, name: 'B1', color: '#FFADAD' },
        { order: 6, name: 'B2', color: '#FFC6FF' },
        { order: 7, name: 'C1', color: '#BDB2FF' },
        { order: 8, name: 'C2', color: '#000000', textColor: '#FFFFFF' },
    ],
    ballet: [
        { order: 0, name: 'Pre-Ballet', color: '#FFFFFF', textColor: '#333333' },
        { order: 1, name: 'Grado 1', color: '#FFD1DC' },
        { order: 2, name: 'Grado 2', color: '#FFB6C1' },
        { order: 3, name: 'Grado 3', color: '#FF69B4' },
        { order: 4, name: 'Grado 4', color: '#DB7093' },
        { order: 5, name: 'Grado 5', color: '#C71585', textColor: '#FFFFFF' },
        { order: 6, name: 'Grado 6', color: '#8B008B', textColor: '#FFFFFF' },
        { order: 7, name: 'Grado 7', color: '#4B0082', textColor: '#FFFFFF' },
        { order: 8, name: 'Grado 8', color: '#000000', textColor: '#FFFFFF' },
    ],
};
