// Cada categoría de evaluación tiene una clave interna (usada para guardar la nota) y una etiqueta visible al usuario
export interface EvaluationCategory {
    key: string;
    label: string;
}

// Rúbricas fijas definidas por la app para cada activity_type, usadas en el flujo de evaluación por categorías.
// Taekwondo ITF queda fuera a propósito: mantiene su propia evaluación movimiento a movimiento del TUL (ver EvaluationScreen).
// Aqui podemos configurar qué categorías se evalúan en cada actividad y el texto que ve el instructor
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

// Puntuación máxima posible por categoría en este flujo de evaluación (escala de 0 a este valor)
export const CATEGORY_EVALUATION_MAX_SCORE = 5;
