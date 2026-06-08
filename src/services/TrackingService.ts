import { apiFetch } from '../utils/apiFetch';

// Servicio de seguimiento (evaluaciones, asistencia y reportes de club). Todos los métodos usan apiFetch
// (que añade el token de auth), parsean la respuesta JSON y lanzan un Error con data.error si response.ok es falso.

export const TrackingService = {
    // GET /api/users/:userId/evaluations[?month=&year=]: lista de evaluaciones de técnica del alumno,
    // opcionalmente filtradas por mes/año; devuelve data.evaluations
    getEvaluations: async (userId: string, month?: number, year?: number) => {
        try {
            const query = (month !== undefined && year !== undefined) ? `?month=${month}&year=${year}` : '';
            const response = await apiFetch(`/api/users/${userId}/evaluations${query}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.evaluations;
        } catch (error: any) {
            console.error('TrackingService getEvaluations:', error.message);
            throw error;
        }
    },

    // GET /api/users/:userId/attendance[?month=&year=]: historial de asistencia del alumno, devuelve data.attendance
    getAttendance: async (userId: string, month?: number, year?: number) => {
        try {
            const query = (month !== undefined && year !== undefined) ? `?month=${month}&year=${year}` : '';
            const response = await apiFetch(`/api/users/${userId}/attendance${query}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.attendance;
        } catch (error: any) {
            console.error('TrackingService getAttendance:', error.message);
            throw error;
        }
    },

    // POST /api/groups/:groupId/technique-requests: crea una solicitud de evaluación de técnica para el grupo
    // (instructor, técnica/actividad/vocabulario y opcionalmente una imagen); devuelve data.request
    requestTechnique: async (groupId: string, payload: { instructorId: string; activityId?: string; vocabularyId?: string; techniqueName: string; imageUrl?: string }) => {
        try {
            const response = await apiFetch(`/api/groups/${groupId}/technique-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create technique request');
            return data.request;
        } catch (error: any) {
            console.error('TrackingService requestTechnique:', error.message);
            throw error;
        }
    },

    // POST /api/technique-requests/:requestId/evaluations: registra la evaluación (puntuación, comentario y
    // puntos otorgados) que resuelve una solicitud de técnica pendiente; devuelve data.evaluation
    submitTechniqueEvaluation: async (requestId: string, payload: { studentId: string; instructorId: string; score: number; comment?: string; pointsAwarded?: number }) => {
        try {
            const response = await apiFetch(`/api/technique-requests/${requestId}/evaluations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save technique evaluation');
            return data.evaluation;
        } catch (error: any) {
            console.error('TrackingService submitTechniqueEvaluation:', error.message);
            throw error;
        }
    },

    // POST /api/evaluations: guarda una evaluación genérica (estructura libre vía evaluationData); devuelve la respuesta cruda
    saveEvaluation: async (evaluationData: any) => {
        try {
            const response = await apiFetch('/api/evaluations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save evaluation');
            return data;
        } catch (error: any) {
            console.error('TrackingService saveEvaluation:', error.message);
            throw error;
        }
    },

    // POST /api/category-evaluations: guarda una evaluación por categoría (rúbrica agrupada); devuelve la respuesta cruda
    saveCategoryEvaluation: async (evaluationData: any) => {
        try {
            const response = await apiFetch('/api/category-evaluations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evaluationData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save evaluation');
            return data;
        } catch (error: any) {
            console.error('TrackingService saveCategoryEvaluation:', error.message);
            throw error;
        }
    },

    // PUT /api/groups/:groupId/attendance: registra/actualiza la asistencia de un alumno en una fecha concreta
    // (status: presente/ausente/tarde); usado al pasar lista
    syncAttendance: async (groupId: string, studentId: string, date: string, status: string) => {
        try {
            const response = await apiFetch(`/api/groups/${groupId}/attendance`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, date, status })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService syncAttendance:', error.message);
            throw error;
        }
    },

    // POST /api/groups/:groupId/attendance/verify: marca como verificada/cerrada la lista de asistencia de una fecha
    verifyAttendance: async (groupId: string, date: string) => {
        try {
            const response = await apiFetch(`/api/groups/${groupId}/attendance/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService verifyAttendance:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/evaluations: evaluaciones del club, filtrables por rango from/to o por mes,
    // y opcionalmente por actividad/instructor; devuelve data.evaluations
    getClubEvaluations: async (clubId: string, month: number, from?: string, to?: string, activityId?: string, instructorId?: string) => {
        try {
            // Si se da un rango de fechas se prioriza sobre el filtro por mes
            const base = from && to
                ? `/api/clubs/${clubId}/evaluations?from=${from}&to=${to}`
                : `/api/clubs/${clubId}/evaluations?month=${month}`;
            const extra = (activityId ? `&activityId=${activityId}` : '') + (instructorId ? `&instructorId=${instructorId}` : '');
            const response = await apiFetch(base + extra);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.evaluations;
        } catch (error: any) {
            console.error('TrackingService getClubEvaluations:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/attendance: asistencia agregada del club, mismos filtros que getClubEvaluations; devuelve data.attendance
    getClubAttendance: async (clubId: string, month: number, from?: string, to?: string, activityId?: string, instructorId?: string) => {
        try {
            const base = from && to
                ? `/api/clubs/${clubId}/attendance?from=${from}&to=${to}`
                : `/api/clubs/${clubId}/attendance?month=${month}`;
            const extra = (activityId ? `&activityId=${activityId}` : '') + (instructorId ? `&instructorId=${instructorId}` : '');
            const response = await apiFetch(base + extra);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.attendance;
        } catch (error: any) {
            console.error('TrackingService getClubAttendance:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/report/overview: resumen general de alumnos del club (filtrable por actividad/instructor); devuelve el objeto completo de la respuesta
    getClubStudentsOverview: async (clubId: string, activityId?: string, instructorId?: string) => {
        try {
            const extra = (activityId ? `?activityId=${activityId}` : '') + (instructorId ? `${activityId ? '&' : '?'}instructorId=${instructorId}` : '');
            const response = await apiFetch(`/api/clubs/${clubId}/report/overview${extra}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService getClubStudentsOverview:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/report/roster-changes: altas/bajas de alumnos en un rango de fechas, filtrable por actividad/instructor
    getClubRosterChanges: async (clubId: string, from: string, to: string, activityId?: string, instructorId?: string) => {
        try {
            const extra = (activityId ? `&activityId=${activityId}` : '') + (instructorId ? `&instructorId=${instructorId}` : '');
            const response = await apiFetch(`/api/clubs/${clubId}/report/roster-changes?from=${from}&to=${to}${extra}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService getClubRosterChanges:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/report/monthly-churn: tasa de abandono mensual del club, filtrable por actividad/instructor
    getClubMonthlyChurn: async (clubId: string, activityId?: string, instructorId?: string) => {
        try {
            const extra = (activityId ? `?activityId=${activityId}` : '') + (instructorId ? `${activityId ? '&' : '?'}instructorId=${instructorId}` : '');
            const response = await apiFetch(`/api/clubs/${clubId}/report/monthly-churn${extra}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService getClubMonthlyChurn:', error.message);
            throw error;
        }
    },

    // GET /api/clubs/:clubId/report/gamification: estadísticas de gamificación del club (puntos, logros, participación, etc.)
    getClubGamificationStats: async (clubId: string) => {
        try {
            const response = await apiFetch(`/api/clubs/${clubId}/report/gamification`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
        } catch (error: any) {
            console.error('TrackingService getClubGamificationStats:', error.message);
            throw error;
        }
    },

    // GET /api/groups/:groupId/attendance/history: historial completo de fechas de asistencia pasadas por lista en el grupo
    getGroupAttendanceHistory: async (groupId: string) => {
        try {
            const response = await apiFetch(`/api/groups/${groupId}/attendance/history`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.history;
        } catch (error: any) {
            console.error('TrackingService getGroupAttendanceHistory:', error.message);
            throw error;
        }
    },

    // GET /api/groups/:groupId/attendance/date/:date: registros de asistencia de esa fecha concreta,
    // como mapa studentId -> 'present' | 'absent' | 'late' (data.records)
    getGroupAttendanceByDate: async (groupId: string, date: string): Promise<Record<string, 'present' | 'absent' | 'late'>> => {
        try {
            const response = await apiFetch(`/api/groups/${groupId}/attendance/date/${date}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.records;
        } catch (error: any) {
            console.error('TrackingService getGroupAttendanceByDate:', error.message);
            throw error;
        }
    }
};
