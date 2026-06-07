export interface EvaluationCategory {
    key: string;
    label: string;
}

// Fixed, app-defined rubrics per activity_type for the category-based evaluation
// flow (Taekwondo ITF keeps its own move-by-move TUL evaluation and is intentionally
// absent here — see EvaluationScreen).
export const EVALUATION_RUBRICS: Record<string, EvaluationCategory[]> = {
    ingles: [
        { key: 'listening', label: 'Listening' },
        { key: 'speaking', label: 'Speaking' },
        { key: 'vocabulary', label: 'Vocabulary' },
        { key: 'grammar', label: 'Grammar' },
        { key: 'writing', label: 'Writing' },
    ],
    ballet: [
        { key: 'postura', label: 'Postura y Alineación' },
        { key: 'tecnica', label: 'Técnica' },
        { key: 'musicalidad', label: 'Musicalidad y Ritmo' },
        { key: 'expresion', label: 'Expresión Artística' },
        { key: 'memoria', label: 'Memoria Coreográfica' },
    ],
};

export const CATEGORY_EVALUATION_MAX_SCORE = 5;
