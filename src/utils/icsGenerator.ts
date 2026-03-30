import type { Task } from '../store/useStore';

export const generateICS = (tasks: Task[]): string => {
    const formatDate = (dateStr: string) => {
        // Convert YYYY-MM-DD to YYYYMMDD
        return dateStr.replace(/-/g, '');
    };

    const escapeIcsText = (text: string) =>
        text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Wartungskalender//Maintenance App//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    tasks.forEach(task => {
        // Skip tasks without dates
        if (!task.date) return;

        const startDate = formatDate(task.date.split('T')[0]);
        // All day events: DTSTART;VALUE=DATE:YYYYMMDD
        // For simplicity, treating all maintenance tasks as all-day events

        icsContent.push('BEGIN:VEVENT');
        icsContent.push(`UID:${task.id}@wartungskalender`);
        icsContent.push(`DTSTAMP:${now}`);
        icsContent.push(`DTSTART;VALUE=DATE:${startDate}`);
        icsContent.push(`SUMMARY:${escapeIcsText(task.title)}`);

        if (task.description) {
            icsContent.push(`DESCRIPTION:${escapeIcsText(task.description)}`);
        }

        icsContent.push('STATUS:CONFIRMED');
        icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    return icsContent.join('\r\n');
};

export const downloadICS = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/calendar' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};
