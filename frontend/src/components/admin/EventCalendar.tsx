import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EventItem } from '../../services/apiTypes';
import { addDays, buildMonthWeeks, formatEventTime, parseDateKey, toDateKey } from '../../utils/eventDates';

interface EventCalendarProps {
  events: EventItem[];
  /** Any date within the month to show. */
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelectEvent: (event: EventItem) => void;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const EventCalendar: React.FC<EventCalendarProps> = ({ events, month, onMonthChange, onSelectEvent }) => {
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weeks = useMemo(() => buildMonthWeeks(month), [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events) {
      const d = new Date(e.startDateTime);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    return map;
  }, [events]);

  const [focusKey, setFocusKey] = useState<string>(() => toDateKey(new Date(month.getFullYear(), month.getMonth(), 1)));
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  // Keep the roving focus target inside the visible month.
  const focusDate = parseDateKey(focusKey);
  const activeKey =
    focusDate && focusDate.getMonth() === month.getMonth() && focusDate.getFullYear() === month.getFullYear()
      ? focusKey
      : toDateKey(new Date(month.getFullYear(), month.getMonth(), 1));

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${activeKey}"]`)?.focus();
  }, [activeKey, month]);

  const goTo = (target: Date) => {
    moveFocus.current = true;
    setFocusKey(toDateKey(target));
    if (target.getMonth() !== month.getMonth() || target.getFullYear() !== month.getFullYear()) {
      onMonthChange(new Date(target.getFullYear(), target.getMonth(), 1));
    }
  };

  const shiftMonth = (delta: number) => {
    const cur = parseDateKey(activeKey) ?? month;
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + delta + 1, 0).getDate();
    goTo(new Date(cur.getFullYear(), cur.getMonth() + delta, Math.min(cur.getDate(), lastDay)));
  };

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLElement>, day: Date) => {
    // Let keys on nested event buttons behave normally.
    if (e.target !== e.currentTarget) return;
    let target: Date | undefined;
    switch (e.key) {
      case 'ArrowLeft': target = addDays(day, -1); break;
      case 'ArrowRight': target = addDays(day, 1); break;
      case 'ArrowUp': target = addDays(day, -7); break;
      case 'ArrowDown': target = addDays(day, 7); break;
      case 'Home': target = addDays(day, -((day.getDay() + 6) % 7)); break;
      case 'End': target = addDays(day, 6 - ((day.getDay() + 6) % 7)); break;
      case 'PageUp': e.preventDefault(); shiftMonth(-1); return;
      case 'PageDown': e.preventDefault(); shiftMonth(1); return;
      default: return;
    }
    e.preventDefault();
    goTo(target);
  };

  const todayKey = toDateKey(new Date());

  return (
    <div className="event-calendar">
      <div className="calendar-nav">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          Previous
        </button>
        <h2 id="calendar-heading" aria-live="polite">
          {monthLabel}
        </h2>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
          Next
        </button>
      </div>
      <div
        role="grid"
        ref={gridRef}
        aria-labelledby="calendar-heading"
        aria-describedby="calendar-help"
      >
        <div role="row">
          {WEEKDAYS.map((name) => (
            <div key={name} role="columnheader" aria-label={name}>
              {name.slice(0, 3)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={toDateKey(week[0])}>
            {week.map((day) => {
              const key = toDateKey(day);
              const inMonth = day.getMonth() === month.getMonth();
              const dayEvents = eventsByDay.get(key) ?? [];
              const label = `${day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${
                dayEvents.length === 0 ? 'no events' : `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`
              }`;
              return (
                <div
                  key={key}
                  role="gridcell"
                  data-date={key}
                  aria-current={key === todayKey ? 'date' : undefined}
                  aria-disabled={inMonth ? undefined : true}
                  tabIndex={key === activeKey ? 0 : -1}
                  className={inMonth ? 'calendar-day' : 'calendar-day calendar-day-outside'}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocusKey(key);
                  }}
                  onKeyDown={(e) => onCellKeyDown(e, day)}
                >
                  <span aria-hidden="true">{day.getDate()}</span>
                  <span className="visually-hidden">{label}</span>
                  <ul>
                    {dayEvents.map((ev) => (
                      <li key={ev.eventId}>
                        <button type="button" onClick={() => onSelectEvent(ev)}>
                          {formatEventTime(ev.startDateTime)} {ev.title}
                          <span className="visually-hidden"> ({ev.status})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p id="calendar-help" className="visually-hidden">
        Use arrow keys to move between days, Page Up and Page Down to change month. Tab to reach events within a day.
      </p>
    </div>
  );
};

export default EventCalendar;
