
// Forma de un plan de suscripción para clubes: id interno, textos a mostrar, precio formateado para UI
// y lista de features (cada string es una línea de la lista de ventajas mostrada al usuario)
export interface Plan {
    id: string;
    title: string;
    description: string;
    price: string; // Precio ya formateado para mostrar, ej. "9.99€/mes"
    features: string[];
    recommended?: boolean;
}

// Catálogo estático de planes disponibles (Lite/Pro/Elite). Aqui podemos configurar número de actividades,
// grupos, instructores y alumnos permitidos por cada plan, así como el precio mostrado
export const PLANS: Plan[] = [
    {
        id: 'club_lite',
        title: 'Club Lite',
        description: 'Ideal para profesores independientes',
        price: '15€ / mes',
        features: [
            'Gestión de 3 actividades con hasta 10 grupos cada una',
            'Poder evaluar a los alumnos',
            'Pasar lista en clase',
            'Reportes de progreso básico mensuales',
            'Eliminar anuncios a todos los miembros de tu club',
            'Hasta 50 alumnos'
        ]
    },
    {
        id: 'club_pro',
        title: 'Club Pro',
        description: 'Ideal para clubes pequeños y medianos',
        price: '30€ / mes',
        features: [
            'Gestión de 5 actividades con hasta 15 grupos cada una',
            'Poder evaluar a los alumnos y pasar lista en clase',
            'Hasta 3 instructores/profesores',
            'Reportes de progreso y asistencia mensuales',
            'Eliminar anuncios a todos los miembros',
            'Hasta 100 alumnos',
            'Soporte prioritario 24/7'
        ],
        recommended: true
    },
    {
        id: 'club_elite',
        title: 'Club Elite',
        description: 'Ideal para clubes grandes y que quieran sacar todo su potencial',
        price: '50€ / mes',
        features: [
            'Gestión de 10 actividades con hasta 30 grupos en cada una',
            'Poder evaluar a los alumnos y pasar lista en clase',
            'Hasta 5 instructores/profesores',
            'Reportes de progreso y asistencia muy detallados bisemanales',
            'Personalización de marca in-app (Logo)',
            'Eliminar anuncios a todos los miembros',
            'Hasta 250 alumnos',
            'Soporte prioritario 24/7'
        ]
    }
];

export const SubscriptionService = {

    // Devuelve el catálogo de planes; simula una llamada de red con un retraso de 500ms (no llama a un endpoint real)
    getPlans: async (): Promise<Plan[]> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(PLANS);
            }, 500);
        });
    },

    // Simula el proceso de compra in-app (IAP): busca el plan por id y resuelve éxito/fallo tras 1.5s.
    // No realiza ninguna petición real al backend ni a las tiendas (placeholder a falta de integración real)
    purchasePlan: async (planId: string): Promise<{ success: boolean; message?: string }> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Comprobamos si el plan existe para decidir éxito o error
                const plan = PLANS.find(p => p.id === planId);
                if (plan) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, message: 'Plan no encontrado.' });
                }
            }, 1500);
        });
    },

    // Simula la restauración de compras previas (siempre devuelve true tras 1s); placeholder pendiente de IAP real
    restorePurchases: async (): Promise<boolean> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(true);
            }, 1000);
        });
    }
};
