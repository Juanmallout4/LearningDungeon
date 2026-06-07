import { Activity, Group, GroupSession, VocabularyTerm } from '../types';
import { apiFetch } from '../utils/apiFetch';

export const ClubService = {
    // Activities
    getActivities: async (clubId: string): Promise<Activity[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activities;
    },
    addActivity: async (clubId: string, name: string, icon: string, activityType?: string): Promise<Activity> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon, activityType })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activity;
    },
    updateActivity: async (clubId: string, activityId: string, name: string, icon: string, activityType?: string): Promise<Activity> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities/${activityId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon, activityType })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activity;
    },
    deleteActivity: async (clubId: string, activityId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities/${activityId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // Groups
    getGroups: async (clubId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    getStudentGroups: async (userId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/users/${userId}/groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    addGroup: async (
        clubId: string, activityId: string, name: string, time: string,
        maxStudents?: number | null, sessions?: GroupSession[], minAge?: number | null, maxAge?: number | null
    ): Promise<Group> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityId, name, time, maxStudents, sessions, minAge, maxAge })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.group;
    },
    updateGroup: async (
        clubId: string, groupId: string, name: string, time: string,
        maxStudents?: number | null, sessions?: GroupSession[], minAge?: number | null, maxAge?: number | null
    ): Promise<Group> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, time, maxStudents, sessions, minAge, maxAge })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.group;
    },
    deleteGroup: async (clubId: string, groupId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups/${groupId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // Instructors
    getInstructors: async (clubId: string): Promise<{ id: string; email: string; name: string }[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.instructors;
    },
    addInstructor: async (clubId: string, email: string): Promise<{ success: boolean; user?: any; error?: string }> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, user: data.user };
    },
    updateInstructorActivities: async (clubId: string, instructorId: string, activityIds: string[]): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors/${instructorId}/activities`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityIds }),
        });
        if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
    },

    deleteInstructor: async (clubId: string, instructorId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors/${instructorId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // Students
    getGroupStudents: async (groupId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/groups/${groupId}/students`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.students;
    },
    // --- Student Management ---
    getClubStudents: async (clubId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.students;
    },
    getAllClubGroups: async (clubId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/all_groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    createStudent: async (
        clubId: string,
        data: { name: string; surname: string; email: string; phone?: string; birthday?: string }
    ): Promise<{ success: boolean; student?: any; tempPassword?: string; error?: string }> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await response.json();
        if (!response.ok) return { success: false, error: json.error };
        return { success: true, student: json.student, tempPassword: json.tempPassword };
    },
    addStudentToClub: async (clubId: string, email: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, user: data.student };
    },
    removeStudentFromClub: async (clubId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students/${studentId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    enrollStudentInGroup: async (groupId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/groups/${groupId}/students/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    unenrollStudentFromGroup: async (groupId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/groups/${groupId}/students/${studentId}/enroll`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    getBelts: async (): Promise<any[]> => {
        const response = await apiFetch('/api/belts');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.belts;
    },
    // Promotes an instructor's own personal Taekwondo Dan rank (qualification, not student progression)
    updateUserBelt: async (userId: string, newBeltLevel: number, newBeltName: string, assignedByUserId: string): Promise<void> => {
        const response = await apiFetch(`/api/users/${userId}/belt`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                beltLevel: newBeltLevel,
                beltName: newBeltName,
                assigned_by_user_id: assignedByUserId
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update belt');
    },
    updateUserProgression: async (userId: string, activityId: string, levelOrder: number, levelName: string, assignedByUserId: string): Promise<void> => {
        const response = await apiFetch(`/api/users/${userId}/progression`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activityId,
                levelOrder,
                levelName,
                assigned_by_user_id: assignedByUserId
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update progression');
    },
    // Returns every per-activity progression record a user has. Unlike getStudentGroups
    // (which surfaces progression via group enrollment), this works for any user — needed
    // for instructors, who are linked to activities via activity_ids, not enrollment.
    getUserProgressions: async (userId: string): Promise<{ activityId: string; activityType: string; levelOrder: number; levelName: string; activityName: string }[]> => {
        const response = await apiFetch(`/api/users/${userId}/progression`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load progression');
        return data.progressions;
    },

    // --- Vocabulary ---
    getVocabulary: async (clubId: string, maxBeltLevel?: number, activityType?: string, contentType?: string, topic?: string): Promise<VocabularyTerm[]> => {
        let url = `/api/clubs/${clubId}/vocabulary`;
        const params = new URLSearchParams();
        if (maxBeltLevel !== undefined) params.set('maxBeltLevel', String(maxBeltLevel));
        if (activityType) params.set('activityType', activityType);
        if (contentType) params.set('contentType', contentType);
        if (topic) params.set('topic', topic);
        if ([...params].length > 0) url += `?${params.toString()}`;
        const response = await apiFetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.vocabulary;
    },
    // What activity types does this user practice? Mirrors the merge logic in HomeScreen's
    // practice-dashboard detection (live enrollment + personal progression + legacy belt rank),
    // minus the club-owner "see everything" expansion which is specific to that dashboard's UX.
    // Reused anywhere we need to filter content (e.g. market rewards) to "things this student practices".
    getPracticedActivityTypes: async (user: { id: string; rank?: number }): Promise<Set<string>> => {
        const types = new Set<string>();
        try {
            const [groups, progressions] = await Promise.all([
                ClubService.getStudentGroups(user.id),
                ClubService.getUserProgressions(user.id),
            ]);
            groups.forEach(g => { if (g.activityType) types.add(g.activityType); });
            progressions.forEach(p => { if (p.activityType) types.add(p.activityType); });
            if ((user.rank || 0) > 0) types.add('taekwondo_itf');
        } catch (error) {
            console.error('Failed to compute practiced activity types', error);
        }
        return types;
    },
    addVocabularyTerm: async (clubId: string, term: string, meaning: string): Promise<VocabularyTerm> => {
        const response = await apiFetch(`/api/clubs/${clubId}/vocabulary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ term, meaning })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.vocabulary;
    },
    deleteVocabularyTerm: async (clubId: string, vocabularyId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/vocabulary/${vocabularyId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Market ---
    getMarketItems: async (clubId: string): Promise<import('../types').MarketItem[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.items;
    },
    addMarketItem: async (clubId: string, itemData: any): Promise<import('../types').MarketItem> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.item;
    },
    updateMarketItem: async (clubId: string, itemId: string, itemData: any): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    deleteMarketItem: async (clubId: string, itemId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/${itemId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    restoreSystemItems: async (clubId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/restore-system-items`, { method: 'POST' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    buyMarketItem: async (userId: string, itemId: string, costPoints: number): Promise<{ remainingPoints: number }> => {
        const response = await apiFetch(`/api/market/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, itemId, costPoints })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    },

    // --- Points & Gamification ---
    getUserPoints: async (userId: string): Promise<{ points: number, streak: number }> => {
        const response = await apiFetch(`/api/users/${userId}/points`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return { points: data.points, streak: data.streak };
    },
    addGamePoints: async (userId: string, basePoints: number = 1): Promise<{ added: number, total: number, streak: number, multiplier: number }> => {
        const response = await apiFetch(`/api/users/${userId}/points/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basePoints })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    },

    // --- Loot Chests ---
    getChests: async (clubId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.chests;
    },
    addChest: async (clubId: string, name: string, description: string, imageUrl: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, imageUrl })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.chest;
    },
    updateChest: async (clubId: string, chestId: string, name: string, description: string, imageUrl: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests/${chestId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, imageUrl })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    deleteChest: async (clubId: string, chestId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests/${chestId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    getChestPool: async (chestId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.pool;
    },
    addPoolItem: async (chestId: string, itemId: string, weight: number): Promise<void> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, weight })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    removePoolItem: async (chestId: string, itemId: string): Promise<void> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool/${itemId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Aulas (rooms) ---
    getAulas: async (clubId: string): Promise<{ id: string; name: string; capacity?: number | null; description?: string | null; color?: string }[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aulas;
    },
    addAula: async (clubId: string, name: string, capacity?: number | null, description?: string | null, color?: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, capacity, description, color })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aula;
    },
    updateAula: async (clubId: string, aulaId: string, name: string, capacity?: number | null, description?: string | null, color?: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas/${aulaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, capacity, description, color })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aula;
    },
    deleteAula: async (clubId: string, aulaId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas/${aulaId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
};
