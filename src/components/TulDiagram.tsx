import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

interface TulDiagramProps {
    type?: 'plus' | 'I' | 'scholar' | 'inverted_T' | 'other';
    size?: number;
    color?: string;
}

// Dibuja una representacion simplificada (con barras de View) del trazado/diagrama que sigue un Tul
// sobre el suelo durante su ejecucion. Como no disponemos de imagenes reales para cada diagrama, los
// "tipos" mas comunes (cruz, I, T invertida, erudito) se aproximan combinando barras rectangulares;
// cualquier otro tipo cae en un recuadro generico con la etiqueta "Diagrama"
export const TulDiagram: React.FC<TulDiagramProps> = ({
    type = 'other',
    size = 200,
    color
}) => {
    const { theme } = useTheme();
    const { t: trans } = useTranslation();
    const resolvedColor = color || theme.colors.primary;

    // Grosor de las barras que forman el diagrama
    const t = 4;
    const half = size / 2;

    const renderPlus = () => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Barra vertical */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Barra horizontal */}
            <View style={{ position: 'absolute', width: size, height: t, backgroundColor: resolvedColor }} />
            {/* Marca de inicio del trazado */}
            <Text style={[styles.label, { bottom: 0 }]}>C</Text>
        </View>
    );

    const renderI = () => (
        <View style={{ width: size / 2, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Barra superior */}
            <View style={{ position: 'absolute', top: 0, width: size / 2, height: t, backgroundColor: resolvedColor }} />
            {/* Barra vertical central */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Barra inferior */}
            <View style={{ position: 'absolute', bottom: 0, width: size / 2, height: t, backgroundColor: resolvedColor }} />
        </View>
    );

    const renderInvertedT = () => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Barra vertical (a media altura) */}
            <View style={{ position: 'absolute', bottom: 0, width: t, height: size / 2, backgroundColor: resolvedColor }} />
            {/* Barra horizontal inferior */}
            <View style={{ position: 'absolute', bottom: 0, width: size, height: t, backgroundColor: resolvedColor }} />
        </View>
    );

    // Aproximacion del simbolo "Erudito" (士), usado por ejemplo en el Tul Yul-Gok: combina una barra
    // superior, una vertical central, una barra intermedia y una inferior mas corta que la superior
    const renderScholar = () => (
        <View style={{ width: size / 1.5, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Barra superior */}
            <View style={{ position: 'absolute', top: 0, width: size / 1.5, height: t, backgroundColor: resolvedColor }} />
            {/* Barra vertical central */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Barra intermedia (caracteristica del simbolo de erudito) */}
            <View style={{ position: 'absolute', width: size / 2, height: t, backgroundColor: resolvedColor }} />
            {/* Barra inferior, mas corta que la superior para imitar la proporcion real del caracter */}
            <View style={{ position: 'absolute', bottom: 0, width: size / 2.5, height: t, backgroundColor: resolvedColor }} />
        </View>
    );


    switch (type) {
        case 'plus': return renderPlus();
        case 'I': return renderI();
        case 'inverted_T': return renderInvertedT();
        case 'scholar': return renderScholar();
        default: return (
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: resolvedColor, borderRadius: 8, borderStyle: 'dashed' }}>
                <Text style={{ color: resolvedColor }}>{trans('tulDetail.diagram', { defaultValue: 'Diagram' })}</Text>
            </View>
        );
    }
};

const styles = StyleSheet.create({
    label: {
        color: '#888',
        fontSize: 12,
        position: 'absolute',
    }
});
