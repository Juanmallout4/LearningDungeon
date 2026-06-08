import AsyncStorage from '@react-native-async-storage/async-storage';

// Clave bajo la que se persiste el token de sesión en AsyncStorage
const TOKEN_KEY = '@Learning Dungeon_token';

// Guarda el token de autenticación recibido tras el login
export const saveToken = async (token: string): Promise<void> => {
    await AsyncStorage.setItem(TOKEN_KEY, token);
};

// Lee el token guardado; devuelve null tanto si no existe como si AsyncStorage falla
export const getToken = async (): Promise<string | null> => {
    try {
        return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
};

// Elimina el token (usado en logout)
export const removeToken = async (): Promise<void> => {
    await AsyncStorage.removeItem(TOKEN_KEY);
};

// Sustituto directo de fetch(): añade automáticamente la cabecera Authorization: Bearer <token>
// (si el usuario está autenticado) y Content-Type: application/json por defecto a cada petición a la API
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
