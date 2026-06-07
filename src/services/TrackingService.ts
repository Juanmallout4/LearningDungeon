import { apiFetch } from '../utils/apiFetch';

export const TrackingService = {
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

    getClubEvaluations: async (clubId: string, month: number, from?: string, to?: string, activityId?: string, instructorId?: string) => {
        try {
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
