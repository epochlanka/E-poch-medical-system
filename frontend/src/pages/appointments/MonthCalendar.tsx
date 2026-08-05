import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getCalendarSummary } from '../../lib/appointments';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/layout/Icons';

interface MonthCalendarProps {
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Local YYYY-MM-DD, not toISOString() — that converts to UTC first and would shift every
// date by a day in timezones ahead of UTC (midnight local on the 5th is still the 4th in UTC).
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MonthCalendar = ({ selectedDate, onSelectDate }: MonthCalendarProps) => {
  const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const initialYear = base.getFullYear();
  const initialMonth = base.getMonth() + 1;

  const [cursor, setCursor] = useState({ year: initialYear, month: initialMonth });
  const { data: summary } = useApiData(() => getCalendarSummary(cursor.year, cursor.month), [cursor.year, cursor.month]);

  const summaryByDay = useMemo(() => {
    const map = new Map<string, { total: number; cancelled: number; noShow: number }>();
    (summary ?? []).forEach((d) => map.set(d.date, d));
    return map;
  }, [summary]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month - 1, 1);
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const leading = firstOfMonth.getDay();
    const items: { date: Date | null }[] = [];
    for (let i = 0; i < leading; i++) items.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) items.push({ date: new Date(cursor.year, cursor.month - 1, d) });
    return items;
  }, [cursor]);

  const todayKey = toDateKey(new Date());

  return (
    <div className="apt-calendar">
      <div className="apt-calendar-header">
        <button className="apt-calendar-nav" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="Previous month">
          <ChevronLeftIcon />
        </button>
        <span className="apt-calendar-title">
          {MONTH_NAMES[cursor.month - 1]} {cursor.year}
        </span>
        <button className="apt-calendar-nav" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="Next month">
          <ChevronRightIcon />
        </button>
      </div>

      <div className="apt-calendar-grid apt-calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="apt-calendar-grid">
        {cells.map((cell, i) => {
          if (!cell.date) return <span key={i} />;
          const key = toDateKey(cell.date);
          const entry = summaryByDay.get(key);
          const isSelected = selectedDate === key;
          const isToday = key === todayKey;
          const dotColor = entry ? (entry.cancelled + entry.noShow > 0 ? '#ef4444' : '#2563eb') : null;

          return (
            <button
              key={key}
              className={`apt-calendar-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onSelectDate(isSelected ? null : key)}
            >
              {cell.date.getDate()}
              {dotColor && <span className="apt-calendar-dot" style={{ background: dotColor }} />}
            </button>
          );
        })}
      </div>

      <div className="apt-calendar-legend">
        <span>
          <i style={{ background: '#2563eb' }} /> Has appointments
        </span>
        <span>
          <i style={{ background: '#ef4444' }} /> Cancelled / No Show
        </span>
      </div>
    </div>
  );
};

const shiftMonth = (c: { year: number; month: number }, delta: number) => {
  let month = c.month + delta;
  let year = c.year;
  if (month < 1) {
    month = 12;
    year -= 1;
  } else if (month > 12) {
    month = 1;
    year += 1;
  }
  return { year, month };
};

export default MonthCalendar;
