import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface FullReportData {
    clubName: string;
    periodLabel: string;
    segment?: string;
    notaMedia: number;
    tasaAsistencia: number;
    totalStudents: number;
    avgStudentsPerGroup: number;
    overallCapacityPct: number;
    activities: {
        name: string;
        groupCount: number;
        studentCount: number;
        totalCapacity: number;
        capacityPct: number;
    }[];
    students: {
        studentName: string;
        activityName: string;
        score: number;
        attendanceRate: number;
    }[];
    retention?: {
        nuevosSocios: number;
        bajas: number;
        tasaRetencion: number;
        tasaAbandono: number;
        duracionMedia: number | null;
    };
    gamification?: {
        avgLevel: number;
        totalItemsCollected: number;
        classDist: Record<string, number>;
        levelBuckets: Record<string, number>;
        topStudents: { studentName: string; level: number; rpgClass: string }[];
    };
}

const buildPdfHtml = (d: FullReportData): string => {
    const dateStr = new Date().toLocaleDateString('es-ES');

    const kpiBox = (label: string, value: string) =>
        `<div class="kpi-box"><div class="kpi-val">${value}</div><div class="kpi-label">${label}</div></div>`;

    const sectionTitle = (title: string) =>
        `<h2 class="section-title">${title}</h2>`;

    const activitiesRows = d.activities.map(a => {
        const avg = a.groupCount > 0 ? Math.round(a.studentCount / a.groupCount) : 0;
        return `
        <tr>
            <td>${a.name}</td>
            <td style="text-align:center">${a.groupCount}</td>
            <td style="text-align:center">${a.studentCount}</td>
            <td style="text-align:center">${avg}</td>
            <td style="text-align:center">${a.totalCapacity}</td>
            <td style="text-align:center;color:${a.capacityPct > 80 ? '#388e3c' : '#666'};font-weight:bold">${a.capacityPct}%</td>
        </tr>`;
    }).join('');

    const studentsRows = d.students.map(s => `
        <tr>
            <td>${s.studentName}</td>
            <td>${s.activityName}</td>
            <td style="text-align:center;font-weight:bold">${s.score.toFixed(0)}%</td>
            <td style="text-align:center;color:${s.attendanceRate < 70 ? '#d32f2f' : '#388e3c'};font-weight:bold">${s.attendanceRate.toFixed(0)}%</td>
        </tr>`).join('');

    const retentionSection = d.retention ? `
        ${sectionTitle('Retención')}
        <div class="kpi-row">
            ${kpiBox('Nuevos Socios', `${d.retention.nuevosSocios}`)}
            ${kpiBox('Bajas', `${d.retention.bajas}`)}
            ${kpiBox('Tasa Retención', `${d.retention.tasaRetencion.toFixed(1)}%`)}
            ${kpiBox('Tasa Abandono', `${d.retention.tasaAbandono.toFixed(1)}%`)}
            ${d.retention.duracionMedia != null ? kpiBox('Duración Media Alta', `${d.retention.duracionMedia.toFixed(1)} m`) : ''}
        </div>` : '';

    const gamSection = d.gamification ? (() => {
        const classRows = Object.entries(d.gamification!.classDist).map(([cls, cnt]) =>
            `<tr><td>${cls}</td><td style="text-align:center">${cnt}</td></tr>`).join('');
        const levelRows = Object.entries(d.gamification!.levelBuckets).map(([range, cnt]) =>
            `<tr><td>${range}</td><td style="text-align:center">${cnt}</td></tr>`).join('');
        const topRows = d.gamification!.topStudents.map((s, i) =>
            `<tr><td>${i + 1}. ${s.studentName}</td><td style="text-align:center">${s.level}</td><td>${s.rpgClass}</td></tr>`).join('');

        return `
        ${sectionTitle('Gamificación')}
        <div class="kpi-row">
            ${kpiBox('Nivel Medio', `${d.gamification!.avgLevel}`)}
            ${kpiBox('Items Colectados', `${d.gamification!.totalItemsCollected}`)}
        </div>
        <div class="two-col">
            <div>
                <h3 class="sub-title">Distribución por Clase</h3>
                <table><thead><tr><th>Clase</th><th style="text-align:center">Alumnos</th></tr></thead>
                <tbody>${classRows}</tbody></table>
            </div>
            <div>
                <h3 class="sub-title">Distribución por Nivel</h3>
                <table><thead><tr><th>Rango</th><th style="text-align:center">Alumnos</th></tr></thead>
                <tbody>${levelRows}</tbody></table>
            </div>
        </div>
        <h3 class="sub-title">Top Alumnos</h3>
        <table><thead><tr><th>Alumno</th><th style="text-align:center">Nivel</th><th>Clase</th></tr></thead>
        <tbody>${topRows}</tbody></table>`;
    })() : '';

    return `
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; font-size: 13px; }
        .header { text-align: center; border-bottom: 2px solid #0056b3; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 26px; font-weight: bold; color: #0056b3; margin: 0; }
        .subtitle { font-size: 14px; color: #666; margin-top: 4px; }
        .section-title { font-size: 17px; font-weight: bold; color: #0056b3; border-bottom: 1px solid #dde; padding-bottom: 6px; margin: 28px 0 14px; }
        .sub-title { font-size: 14px; font-weight: bold; color: #444; margin: 14px 0 8px; }
        .kpi-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .kpi-box { background: #f4f6fb; border-radius: 8px; padding: 12px 18px; text-align: center; min-width: 100px; }
        .kpi-val { font-size: 22px; font-weight: bold; color: #0056b3; }
        .kpi-label { font-size: 11px; color: #666; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { padding: 9px 12px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f8f9fa; font-weight: bold; color: #444; font-size: 12px; }
        tr:nth-child(even) { background: #fafafa; }
        .two-col { display: flex; gap: 24px; }
        .two-col > div { flex: 1; }
        .footer { text-align: right; font-size: 11px; color: #aaa; margin-top: 50px; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">Reporte del Club: ${d.clubName}</h1>
        <div class="subtitle">${d.periodLabel}${d.segment ? ` &mdash; ${d.segment}` : ''}</div>
    </div>

    ${sectionTitle('KPIs Generales')}
    <div class="kpi-row">
        ${kpiBox('Alumnos Totales', `${d.totalStudents}`)}
        ${kpiBox('Nota Media', `${d.notaMedia.toFixed(0)}%`)}
        ${kpiBox('Tasa de Asistencia', `${d.tasaAsistencia.toFixed(0)}%`)}
        ${kpiBox('Media por Clase', `${d.avgStudentsPerGroup}`)}
        ${kpiBox('Plazas Ocupadas', `${d.overallCapacityPct}%`)}
    </div>

    ${sectionTitle('Actividades')}
    <table>
        <thead><tr>
            <th>Actividad</th>
            <th style="text-align:center">Grupos</th>
            <th style="text-align:center">Alumnos</th>
            <th style="text-align:center">Media/Grupo</th>
            <th style="text-align:center">Capacidad</th>
            <th style="text-align:center">Ocupación</th>
        </tr></thead>
        <tbody>${activitiesRows}</tbody>
    </table>

    ${sectionTitle('Alumnos (Periodo)')}
    <table>
        <thead><tr>
            <th>Alumno</th>
            <th>Actividad</th>
            <th style="text-align:center">Nota Media</th>
            <th style="text-align:center">Asistencia</th>
        </tr></thead>
        <tbody>${studentsRows}</tbody>
    </table>

    ${retentionSection}
    ${gamSection}

    <div class="footer">Generado automáticamente por Learning Dungeon el ${dateStr}</div>
</body>
</html>`;
};

const buildCsvContent = (d: FullReportData): string => {
    const dateStr = new Date().toLocaleDateString('es-ES');
    const lines: string[] = [];

    lines.push(`"REPORTE DEL CLUB: ${d.clubName}"`);
    lines.push(`"Periodo: ${d.periodLabel}${d.segment ? ` — ${d.segment}` : ''}"`);
    lines.push(`"Exportado: ${dateStr}"`);
    lines.push('');

    lines.push('"== KPIs GENERALES =="');
    lines.push(`"Alumnos Totales",${d.totalStudents}`);
    lines.push(`"Nota Media (%)",${d.notaMedia.toFixed(0)}`);
    lines.push(`"Tasa de Asistencia",${d.tasaAsistencia.toFixed(1)}%`);
    lines.push(`"Media por Clase",${d.avgStudentsPerGroup}`);
    lines.push(`"Plazas Ocupadas",${d.overallCapacityPct}%`);
    lines.push('');

    lines.push('"== ACTIVIDADES =="');
    lines.push('"Actividad","Grupos","Alumnos","Media/Grupo","Capacidad","Ocupación (%)"');
    d.activities.forEach(a => {
        const avg = a.groupCount > 0 ? Math.round(a.studentCount / a.groupCount) : 0;
        lines.push(`"${a.name}",${a.groupCount},${a.studentCount},${avg},${a.totalCapacity},${a.capacityPct}`);
    });
    lines.push('');

    lines.push('"== ALUMNOS (PERIODO) =="');
    lines.push('"Alumno","Actividad","Nota Media (%)","Asistencia (%)"');
    d.students.forEach(s => {
        lines.push(`"${s.studentName}","${s.activityName}",${s.score.toFixed(0)},${s.attendanceRate.toFixed(0)}`);
    });
    lines.push('');

    if (d.retention) {
        lines.push('"== RETENCIÓN =="');
        lines.push(`"Nuevos Socios",${d.retention.nuevosSocios}`);
        lines.push(`"Bajas",${d.retention.bajas}`);
        lines.push(`"Tasa de Retención",${d.retention.tasaRetencion.toFixed(1)}%`);
        lines.push(`"Tasa de Abandono",${d.retention.tasaAbandono.toFixed(1)}%`);
        if (d.retention.duracionMedia != null) {
            lines.push(`"Duración Media Alta (meses)",${d.retention.duracionMedia.toFixed(1)}`);
        }
        lines.push('');
    }

    if (d.gamification) {
        lines.push('"== GAMIFICACIÓN =="');
        lines.push(`"Nivel Medio",${d.gamification.avgLevel}`);
        lines.push(`"Items Colectados",${d.gamification.totalItemsCollected}`);
        lines.push('');
        lines.push('"Distribución por Clase"');
        lines.push('"Clase","Alumnos"');
        Object.entries(d.gamification.classDist).forEach(([cls, cnt]) => {
            lines.push(`"${cls}",${cnt}`);
        });
        lines.push('');
        lines.push('"Distribución por Nivel"');
        lines.push('"Rango","Alumnos"');
        Object.entries(d.gamification.levelBuckets).forEach(([range, cnt]) => {
            lines.push(`"${range}",${cnt}`);
        });
        lines.push('');
        lines.push('"Top Alumnos"');
        lines.push('"Alumno","Nivel","Clase"');
        d.gamification.topStudents.forEach(s => {
            lines.push(`"${s.studentName}",${s.level},"${s.rpgClass}"`);
        });
        lines.push('');
    }

    return lines.join('\n');
};

export const ExportService = {
    exportToPDF: async (data: FullReportData) => {
        try {
            const html = buildPdfHtml(data);

            if (Platform.OS === 'web') {
                const iframe = document.createElement('iframe');
                iframe.style.position = 'absolute';
                iframe.style.width = '0px';
                iframe.style.height = '0px';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);
                const iframeWindow = iframe.contentWindow;
                const doc = iframe.contentDocument || (iframeWindow && iframeWindow.document);
                if (doc && iframeWindow) {
                    doc.open(); doc.write(html); doc.close();
                    setTimeout(() => {
                        iframeWindow.focus();
                        iframeWindow.print();
                        setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 2000);
                    }, 250);
                }
                return;
            }

            const { uri } = await Print.printToFileAsync({ html });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            }
        } catch (error) {
            console.error('Failed to export PDF:', error);
            throw error;
        }
    },

    exportToCSV: async (data: FullReportData) => {
        try {
            const csvData = buildCsvContent(data);
            const filename = `Reporte_${data.clubName.replace(/\s+/g, '_')}_${data.periodLabel.replace(/\s+/g, '_')}.csv`;

            if (Platform.OS === 'web') {
                const blob = new Blob(['﻿' + csvData], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }

            // @ts-ignore
            const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            if (!baseDir) throw new Error('No available directory for saving CSV');
            const fileUri = baseDir + filename;
            // @ts-ignore
            await FileSystem.writeAsStringAsync(fileUri, csvData, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { UTI: 'public.comma-separated-values-text', mimeType: 'text/csv' });
            }
        } catch (error) {
            console.error('Failed to export CSV:', error);
            throw error;
        }
    },
};
