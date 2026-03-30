import { addDays, addWeeks, addMonths, addYears, isAfter, isSameDay } from 'date-fns';
import { type Task, type TaskOccurrenceOverride } from '../store/useStore';

export interface TaskInstance extends Task {
    originalTaskId: string;
    occurrenceDate: string;
    isRecurringInstance: boolean;
    hasOverride: boolean;
    skipped?: boolean;
}

const overrideKey = (taskId: string, occurrenceDate: string) => `${taskId}::${new Date(occurrenceDate).toISOString()}`;

const isInRange = (date: Date, start: Date, end: Date) => date >= start && date <= end;

export const getTasksForRange = (
    tasks: Task[],
    overrides: TaskOccurrenceOverride[],
    start: Date,
    end: Date
): TaskInstance[] => {
    const instances: TaskInstance[] = [];
    const overrideMap = new Map(overrides.map((override) => [overrideKey(override.taskId, override.occurrenceDate), override]));

    tasks.forEach((task) => {
        const taskDate = new Date(task.date);

        if (task.recurrence === 'none') {
            if (isInRange(taskDate, start, end)) {
                instances.push({
                    ...task,
                    originalTaskId: task.id,
                    occurrenceDate: task.date,
                    isRecurringInstance: false,
                    hasOverride: false,
                });
            }
            return;
        }

        let currentDate = new Date(taskDate);
        const endDate = task.recurrenceEndDate ? new Date(task.recurrenceEndDate) : end;
        const effectiveEnd = isAfter(endDate, end) ? end : endDate;

        while (currentDate <= effectiveEnd) {
            const occurrenceDate = currentDate.toISOString();
            const override = overrideMap.get(overrideKey(task.id, occurrenceDate));
            const displayDate = override?.date ? new Date(override.date) : new Date(currentDate);

            if (!override?.skipped && isInRange(displayDate, start, end)) {
                instances.push({
                    ...task,
                    id: `${task.id}__recur__${occurrenceDate}`,
                    originalTaskId: task.id,
                    occurrenceDate,
                    date: displayDate.toISOString(),
                    status: override?.status || (isSameDay(currentDate, taskDate) ? task.status : 'pending'),
                    completionNote: override?.completionNote ?? task.completionNote,
                    isRecurringInstance: true,
                    hasOverride: Boolean(override),
                });
            }

            switch (task.recurrence) {
                case 'daily':
                    currentDate = addDays(currentDate, task.recurrenceInterval);
                    break;
                case 'weekly':
                    currentDate = addWeeks(currentDate, task.recurrenceInterval);
                    break;
                case 'monthly':
                    currentDate = addMonths(currentDate, task.recurrenceInterval);
                    break;
                case 'yearly':
                    currentDate = addYears(currentDate, task.recurrenceInterval);
                    break;
            }
        }
    });

    overrides.forEach((override) => {
        if (!override.date || override.skipped) return;
        const task = tasks.find((entry) => entry.id === override.taskId);
        if (!task || task.recurrence === 'none') return;

        const alreadyIncluded = instances.some(
            (instance) => instance.originalTaskId === override.taskId && instance.occurrenceDate === override.occurrenceDate
        );
        const movedDate = new Date(override.date);
        if (!alreadyIncluded && isInRange(movedDate, start, end)) {
            instances.push({
                ...task,
                id: `${task.id}__recur__${override.occurrenceDate}`,
                originalTaskId: task.id,
                occurrenceDate: new Date(override.occurrenceDate).toISOString(),
                date: movedDate.toISOString(),
                status: override.status || 'pending',
                completionNote: override.completionNote ?? task.completionNote,
                isRecurringInstance: true,
                hasOverride: true,
            });
        }
    });

    return instances.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
