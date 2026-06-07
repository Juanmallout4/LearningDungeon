import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

interface TulDiagramProps {
    type?: 'plus' | 'I' | 'scholar' | 'inverted_T' | 'other';
    size?: number;
    color?: string;
}

export const TulDiagram: React.FC<TulDiagramProps> = ({
    type = 'other',
    size = 200,
    color
}) => {
    const { theme } = useTheme();
    const { t: trans } = useTranslation();
    const resolvedColor = color || theme.colors.primary;

    // Line thickness
    const t = 4;
    const half = size / 2;

    const renderPlus = () => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Vertical */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Horizontal */}
            <View style={{ position: 'absolute', width: size, height: t, backgroundColor: resolvedColor }} />
            {/* Start text */}
            <Text style={[styles.label, { bottom: 0 }]}>C</Text>
        </View>
    );

    const renderI = () => (
        <View style={{ width: size / 2, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Top Bar */}
            <View style={{ position: 'absolute', top: 0, width: size / 2, height: t, backgroundColor: resolvedColor }} />
            {/* Vertical */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Bottom Bar */}
            <View style={{ position: 'absolute', bottom: 0, width: size / 2, height: t, backgroundColor: resolvedColor }} />
        </View>
    );

    const renderInvertedT = () => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Vertical (Half) */}
            <View style={{ position: 'absolute', bottom: 0, width: t, height: size / 2, backgroundColor: resolvedColor }} />
            {/* Horizontal */}
            <View style={{ position: 'absolute', bottom: 0, width: size, height: t, backgroundColor: resolvedColor }} />
        </View>
    );

    // Placeholder for Scholar/Complex
    const renderScholar = () => (
        <View style={{ width: size / 1.5, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Top Bar */}
            <View style={{ position: 'absolute', top: 0, width: size / 1.5, height: t, backgroundColor: resolvedColor }} />
            {/* Vertical */}
            <View style={{ position: 'absolute', width: t, height: size, backgroundColor: resolvedColor }} />
            {/* Middle Bar (Scholar symbol often has this) */}
            <View style={{ position: 'absolute', width: size / 2, height: t, backgroundColor: resolvedColor }} />
            {/* Bottom - Scholar often implies 'Man' shape or specific Chinese character. 
                For Yul-Gok (Scholar), diagram is usually 'Scholar' (士). 
                Top bar longer than bottom bar.
             */}
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
