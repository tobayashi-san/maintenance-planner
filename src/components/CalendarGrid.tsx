import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type Task } from '../store/useStore';

interface CalendarGridProps {
    currentDate: Date;
    onDateChange: (date: Date) => void;
    tasks: Task[];
    onDayClick: (date: Date) => void;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({ currentDate, onDateChange, tasks, onDayClick }) => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const nextMonth = () => onDateChange(addMonths(currentDate, 1));
    const prevMonth = () => onDateChange(subMonths(currentDate, 1));

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{format(currentDate, 'MMMM yyyy')}</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={prevMonth} className="btn btn-ghost" style={{ padding: '0.25rem' }}>
                        <ChevronLeft size={16} />
                    </button>
                    <button onClick={nextMonth} className="btn btn-ghost" style={{ padding: '0.25rem' }}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                    <div
                        key={day}
                        className={index >= 5 ? 'calendar-weekend-header' : undefined}
                        style={{ padding: '0.375rem 0.5rem', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Days grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {days.map((day, idx) => {
                    const dayTasks = tasks.filter(t => isSameDay(new Date(t.date), day));
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isToday = isSameDay(day, new Date());
                    const isWeekend = [0, 6].includes(getDay(day));
                    const col = idx % 7;
                    const borderRight = col < 6 ? '1px solid var(--border-color)' : 'none';
                    const row = Math.floor(idx / 7);
                    const totalRows = Math.ceil(days.length / 7);
                    const borderBottom = row < totalRows - 1 ? '1px solid var(--border-color)' : 'none';

                    return (
                        <div
                            key={day.toISOString()}
                            onClick={() => onDayClick(day)}
                            className={isWeekend ? 'calendar-weekend-cell' : undefined}
                            style={{
                                minHeight: '88px',
                                padding: '0.375rem 0.5rem',
                                cursor: 'pointer',
                                background: isToday
                                    ? 'var(--primary-light)'
                                    : isWeekend
                                        ? 'var(--calendar-weekend-bg)'
                                        : 'var(--bg-card)',
                                borderRight,
                                borderBottom,
                                opacity: isCurrentMonth ? 1 : 0.4,
                            }}
                        >
                            <div
                                className={isWeekend && !isToday ? 'calendar-weekend-day-number' : undefined}
                                style={{
                                    fontSize: '12px',
                                    fontWeight: isToday ? 700 : 400,
                                    color: isToday ? 'var(--primary)' : 'var(--text-main)',
                                    marginBottom: '0.25rem',
                                    lineHeight: 1
                                }}
                            >
                                {format(day, 'd')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {dayTasks.slice(0, 3).map(task => (
                                    <div key={task.id} style={{
                                        fontSize: '11px',
                                        padding: '1px 4px',
                                        borderRadius: '2px',
                                        background: task.status === 'completed' ? '#f0fdf4' : 'var(--primary-light)',
                                        color: task.status === 'completed' ? 'var(--success)' : 'var(--primary)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontWeight: 500
                                    }}>
                                        {task.title}
                                    </div>
                                ))}
                                {dayTasks.length > 3 && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+{dayTasks.length - 3} more</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CalendarGrid;
