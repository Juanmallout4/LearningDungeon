import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@Learning Dungeon_token';

export const saveToken = async (token: string): Promise<void> => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
};

export const removeToken = async (): Promise<void> => {
    await AsyncStorage.removeItem(TOKEN_KEY);
};

/**
 * Drop-in replacement for fetch() that automatically adds
 * Authorization: Bearer <token> if the user is logged in.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
};
