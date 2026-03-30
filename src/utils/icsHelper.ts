import { type Task } from '../store/useStore';

export const generateIcsContent = (task: Pick<Task, 'id' | 'title' | 'description' | 'date' | 'recurrence' | 'recurrenceInterval' | 'recurrenceEndDate'>): string => {
    // Format date string to ICS format (YYYYMMDD)
    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toISOString().replace(/[-:]/g, '').split('T')[0];
    };

    // Current timestamp for DTSTAMP and UID
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const startDate = formatDate(task.date);
    // Tasks are full-day events by default in this system based on the date picker
    const endDate = formatDate(new Date(new Date(task.date).setDate(new Date(task.date).getDate() + 1)).toISOString());

    const description = task.description ? task.description.replace(/\n/g, '\\n') : '';

    let rrule = '';
    if (task.recurrence && task.recurrence !== 'none') {
        const freqMap: Record<string, string> = {
            'daily': 'DAILY',
            'weekly': 'WEEKLY',
            'monthly': 'MONTHLY',
            'yearly': 'YEARLY'
        };
        const freq = freqMap[task.recurrence as string];

        if (freq) {
            rrule = `RRULE:FREQ=${freq}`;
            if (task.recurrenceInterval && task.recurrenceInterval > 1) {
                rrule += `;INTERVAL=${task.recurrenceInterval}`;
            }
            if (task.recurrenceEndDate) {
                rrule += `;UNTIL=${formatDate(task.recurrenceEndDate)}`;
            }
        }
    }

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Wartungskalender//Maintenance Task//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${task.id}@wartungskalender.local
DTSTAMP:${now}
DTSTART;VALUE=DATE:${startDate}
DTEND;VALUE=DATE:${endDate}
SUMMARY:${task.title}
DESCRIPTION:${description}
${rrule}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`.replace(/\r?\n/g, '\r\n').trim();
};
