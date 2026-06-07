
// Types for Subscription
export interface Plan {
    id: string;
    title: string;
    description: string;
    price: string; // Display price e.g. "9.99€/mes"
    features: string[];
    recommended?: boolean;
}

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

    getPlans: async (): Promise<Plan[]> => {
        // Simulate API delay
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(PLANS);
            }, 500);
        });
    },

    purchasePlan: async (planId: string): Promise<{ success: boolean; message?: string }> => {
        // Simulate IAP process
        return new Promise((resolve) => {
            setTimeout(() => {
                // Handle success/failure
                const plan = PLANS.find(p => p.id === planId);
                if (plan) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, message: 'Plan no encontrado.' });
                }
            }, 1500);
        });
    },

    restorePurchases: async (): Promise<boolean> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(true); // Simulate restoring previous purchases
            }, 1000);
        });
    }
};
