import { UserProfile } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, saveToken, removeToken, getToken } from '../utils/apiFetch';

export { getToken };

const USER_STORAGE_KEY = '@Learning Dungeon_user';

export const AuthService = {
    login: async (email: string, password: string): Promise<UserProfile> => {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            const user: UserProfile = data.user;
            await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
            if (data.token) await saveToken(data.token);
            return user;
        } catch (error: any) {
            console.error('AuthService Login Error:', error.message);
            throw error;
        }
    },

    getSavedUser: async (): Promise<UserProfile | null> => {
        try {
            const userStr = await AsyncStorage.getItem(USER_STORAGE_KEY);
            if (userStr) {
                return JSON.parse(userStr) as UserProfile;
            }
        } catch (e) {
            console.error('Failed to load user', e);
        }
        return null;
    },

    updateUsername: async (userId: string, newUsername: string): Promise<string> => {
        try {
            const response = await apiFetch(`/api/users/${userId}/username`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUsername })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update username');
            }

            const data = await response.json();
            return data.username;
        } catch (error: any) {
            console.error('AuthService UpdateUsername Error:', error.message);
            throw error;
        }
    },

    updateBelt: async (userId: string, beltLevel: number, beltName: string): Promise<boolean> => {
        try {
            const response = await apiFetch(`/api/users/${userId}/belt`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ beltLevel, beltName })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update belt');
            }

            return true;
        } catch (error: any) {
            console.error('AuthService UpdateBelt Error:', error.message);
            throw error;
        }
    },

    updateProfilePicture: async (userId: string, base64Image: string): Promise<string> => {
        try {
            const response = await apiFetch(`/api/users/${userId}/profile-picture`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update profile picture');
            }

            const data = await response.json();
            return data.profilePicture;
        } catch (error: any) {
            console.error('AuthService UpdateProfilePicture Error:', error.message);
            throw error;
        }
    },

    logout: async () => {
        await AsyncStorage.removeItem(USER_STORAGE_KEY);
        await removeToken();
    }
};
