import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

// Convertimos una cadena de emoji (que internamente son pares de "surrogates" UTF-16) en su
// codigo hexadecimal Unicode, que es el nombre de archivo que usa la CDN de Twemoji para sus imagenes
const toCodePoint = (unicodeSurrogates: string, sep = '-') => {
    const r = [];
    let c = 0, p = 0, i = 0;
    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++);
        if (p) {
            r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
            p = 0;
        } else if (0xD800 <= c && c <= 0xDBFF) {
            p = c;
        } else {
            r.push(c.toString(16));
        }
    }
    return r.join(sep);
};

const getTwemojiHex = (emoji: string) => {
    let hex = toCodePoint(emoji);
    // Quitamos el selector de variacion U+FE0F salvo que forme parte de una secuencia ZWJ (emojis combinados),
    // ya que la CDN de Twemoji no incluye ese sufijo en el nombre de archivo de los emojis "simples"
    if (hex.indexOf('200d') < 0) {
        hex = hex.replace(/-fe0f/g, '');
    }
    return hex;
};

export interface TwemojiProps {
    emoji: string;
    size?: number;
    style?: StyleProp<ImageStyle>;
}

// Aqui dibujamos un emoji como imagen (en vez de como texto/fuente del sistema) para que se vea igual
// en todas las plataformas: calculamos su codigo hexadecimal y cargamos el PNG correspondiente desde la CDN de Twemoji
export const Twemoji: React.FC<TwemojiProps> = ({ emoji, size = 24, style }) => {
    const hexId = getTwemojiHex(emoji);
    return (
        <Image
            source={{ uri: `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${hexId}.png` }}
            style={[{ width: size, height: size }, style]}
            resizeMode="contain"
        />
    );
};
