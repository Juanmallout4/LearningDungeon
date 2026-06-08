import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme, AppTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

// Calendario sencillo para mostrar el historial de asistencia de Learning Dungeon
interface AttendanceData {
    [dateString: string]: 'present' | 'absent' | 'late' | 'excused';
}

interface AttendanceCalendarProps {
    data: AttendanceData;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ data }) => {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = createStyles(theme);

    // Guardamos el mes que se esta visualizando actualmente (navegable con los botones de flecha)
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = domingo

    // Convertimos para que la semana empiece en lunes (0 = lunes, 6 = domingo)
    const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Pendiente: localizar estas iniciales segun el idioma

    const renderDays = useMemo(() => {
        const days = [];
        // Casillas vacias para alinear el dia 1 con su columna correspondiente
        for (let i = 0; i < startingDay; i++) {
            days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
        }

        // Pintamos cada dia del mes coloreando la celda segun el estado de asistencia (presente/ausente/tarde)
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const status = data[dateStr];

            days.push(
                <View
                    key={i}
                    style={[
                        styles.dayCell,
                        status === 'present' && styles.dayPresent,
                        status === 'absent' && styles.dayAbsent,
                        status === 'late' && styles.dayLate
                    ]}
                >
                    <Text
                        style={[
                            styles.dayText,
                            status === 'present' && styles.textPresent,
                            status === 'absent' && styles.textAbsent,
                            status === 'late' && styles.textLate
                        ]}
                    >
                        {i}
                    </Text>
                </View>
            );
        }

        return days;
    }, [data, month, year, theme, startingDay, daysInMonth]);

    return (
        <View style={styles.container}>
            <View style={styles.monthHeader}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
                    <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.monthText}>
                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
                    <Ionicons name="chevron-forward" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
            </View>
            <View style={styles.weekHeader}>
                {daysOfWeek.map((d, index) => (
                    <Text key={index} style={styles.weekDayText}>{d}</Text>
                ))}
            </View>
            <View style={styles.daysGrid}>
                {renderDays}
            </View>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
    },
    monthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.m,
        paddingHorizontal: theme.spacing.s,
    },
    navButton: {
        padding: 4,
    },
    monthText: {
        ...theme.typography.subheader,
        color: theme.colors.text,
        textTransform: 'capitalize',
    },
    weekHeader: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 8,
    },
    weekDayText: {
        color: theme.colors.textSecondary,
        fontWeight: 'bold',
        width: 32,
        textAlign: 'center',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    dayCell: {
        width: `${100 / 7}%`,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 1,
    },
    dayText: {
        color: theme.colors.text,
        fontSize: 14,
    },
    dayPresent: {
        backgroundColor: `${theme.colors.success}30`, // Verde tenue (30 = opacidad en hex)
        borderRadius: 20,
    },
    textPresent: {
        color: theme.colors.success,
        fontWeight: 'bold',
    },
    dayAbsent: {
        backgroundColor: `${theme.colors.error}30`, // Rojo tenue
        borderRadius: 20,
    },
    textAbsent: {
        color: theme.colors.error,
        fontWeight: 'bold',
    },
    dayLate: {
        backgroundColor: `${theme.colors.warning}30`, // Naranja tenue
        borderRadius: 20,
    },
    textLate: {
        color: theme.colors.warning,
        fontWeight: 'bold',
    },
});
