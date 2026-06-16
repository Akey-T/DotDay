import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  MapPin,
  Maximize2,
  Plus,
  Star,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import type { AkDailyData, DateKey, EventItem, Habit, QuickNote, WidgetMode } from '../../shared/types';
import './styles.css';

const initialData: AkDailyData = {
  habits: [],
  habitRecords: {},
  events: [],
  notes: [],
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeKey(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDisplayDate(dateKey: DateKey): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00`));
}

function getMonthDays(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Date[] = [];

  for (let index = firstWeekday - 1; index >= 0; index -= 1) {
    cells.push(new Date(year, month, -index));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  return cells;
}

function isHabitActiveOnDate(habit: Habit, dateKey: DateKey): boolean {
  const createdDate = toDateKey(new Date(habit.createdAt));
  const archivedDate = habit.archivedAt ? toDateKey(new Date(habit.archivedAt)) : null;

  return createdDate <= dateKey && (!archivedDate || archivedDate > dateKey);
}

function getHabitsForDate(data: AkDailyData, dateKey: DateKey): Habit[] {
  return data.habits.filter((habit) => isHabitActiveOnDate(habit, dateKey));
}

function getHabitSummary(data: AkDailyData, dateKey: DateKey) {
  const habits = getHabitsForDate(data, dateKey);
  const record = data.habitRecords[dateKey] ?? {};
  const completed = habits.filter((habit) => record[habit.id]).length;

  return {
    completed,
    total: habits.length,
    percent: habits.length === 0 ? 0 : Math.round((completed / habits.length) * 100),
  };
}

function getCalendarHabitMarker(data: AkDailyData, dateKey: DateKey, todayKey: DateKey): string {
  if (dateKey > todayKey) {
    return '';
  }

  const summary = getHabitSummary(data, dateKey);

  if (summary.total === 0) {
    return '';
  }

  if (summary.completed === summary.total) {
    return '●';
  }

  if (summary.completed > 0) {
    return '◐';
  }

  return '○';
}

function getEventStart(event: EventItem): Date {
  return new Date(`${event.date}T${event.startTime || '00:00'}:00`);
}

function getEventEnd(event: EventItem): Date {
  const start = getEventStart(event);
  const endTime = event.endTime || '23:59';
  const end = new Date(`${event.date}T${endTime}:00`);

  if (event.startTime && event.endTime && end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function isEventExpired(event: EventItem, now: Date): boolean {
  return getEventEnd(event).getTime() <= now.getTime();
}

function getEventStateRank(event: EventItem, now: Date): number {
  const start = getEventStart(event).getTime();
  const end = getEventEnd(event).getTime();
  const current = now.getTime();

  if (start <= current && current < end) {
    return 0;
  }

  if (current < start) {
    return 1;
  }

  return 2;
}

function sortEvents(events: EventItem[], now: Date): EventItem[] {
  return [...events].sort((first, second) => {
    const firstRank = getEventStateRank(first, now);
    const secondRank = getEventStateRank(second, now);

    if (firstRank !== secondRank) {
      return firstRank - secondRank;
    }

    if (firstRank === 2) {
      return getEventEnd(second).getTime() - getEventEnd(first).getTime();
    }

    const startDiff = getEventStart(first).getTime() - getEventStart(second).getTime();

    if (startDiff !== 0) {
      return startDiff;
    }

    if (Boolean(first.important) !== Boolean(second.important)) {
      return first.important ? -1 : 1;
    }

    return first.title.localeCompare(second.title);
  });
}

function App(): React.JSX.Element {
  const [now, setNow] = React.useState(() => new Date());
  const todayKey = toDateKey(now);
  const [data, setData] = React.useState<AkDailyData>(initialData);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [widgetMode, setWidgetMode] = React.useState<WidgetMode>('collapsed');
  const [habitTitle, setHabitTitle] = React.useState('');
  const [eventForm, setEventForm] = React.useState({
    title: '',
    date: todayKey,
    startTime: '',
    endTime: '',
    location: '',
    notes: '',
    important: false,
  });
  const [eventFormOpen, setEventFormOpen] = React.useState(false);
  const [noteContent, setNoteContent] = React.useState('');
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<DateKey>(todayKey);

  React.useEffect(() => {
    if (!window.akDaily) {
      setLoadError('DotDay preload API did not load. Restart the app.');
      setIsLoading(false);
      return;
    }

    window.akDaily
      .getData()
      .then((savedData) => setData(savedData))
      .catch(() => setLoadError('Local data could not be loaded. Restart the app.'))
      .finally(() => setIsLoading(false));
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (window.akDaily) {
      void window.akDaily.setWidgetMode(widgetMode);
    }
  }, [widgetMode]);

  React.useEffect(() => {
    if (!window.akDaily?.onWidgetModeChanged) {
      return undefined;
    }

    return window.akDaily.onWidgetModeChanged((mode) => {
      setCalendarOpen(false);
      setWidgetMode(mode);
    });
  }, []);

  const commitData = React.useCallback((nextData: AkDailyData) => {
    setData(nextData);
    void window.akDaily.saveData(nextData).then(setData);
  }, []);

  const todayHabits = getHabitsForDate(data, todayKey);
  const todaySummary = getHabitSummary(data, todayKey);
  const todayEvents = sortEvents(data.events.filter((event) => event.date === todayKey), now);
  const nextEvent = todayEvents.find((event) => !isEventExpired(event, now)) ?? todayEvents[0];
  const collapsedEvents = nextEvent ? [nextEvent] : [];
  const todayNotes = data.notes.filter((note) => note.date === todayKey).sort((first, second) => second.createdAt.localeCompare(first.createdAt));

  function setMode(mode: WidgetMode): void {
    setCalendarOpen(false);
    setWidgetMode(mode);
  }

  function addHabit(event: React.FormEvent): void {
    event.preventDefault();
    const title = habitTitle.trim();

    if (!title) {
      return;
    }

    commitData({
      ...data,
      habits: [
        ...data.habits,
        {
          id: createId('habit'),
          title,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setHabitTitle('');
  }

  function toggleHabit(habitId: string): void {
    const currentRecord = data.habitRecords[todayKey] ?? {};

    commitData({
      ...data,
      habitRecords: {
        ...data.habitRecords,
        [todayKey]: {
          ...currentRecord,
          [habitId]: !currentRecord[habitId],
        },
      },
    });
  }

  function archiveHabit(habitId: string): void {
    commitData({
      ...data,
      habits: data.habits.map((habit) => (habit.id === habitId ? { ...habit, archivedAt: new Date().toISOString() } : habit)),
    });
  }

  function addEvent(event: React.FormEvent): void {
    event.preventDefault();
    const title = eventForm.title.trim();

    if (!title || !eventForm.date) {
      return;
    }

    const nextEvent: EventItem = {
      id: createId('event'),
      title,
      date: eventForm.date,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      location: eventForm.location.trim(),
      notes: eventForm.notes.trim(),
      important: eventForm.important,
      createdAt: new Date().toISOString(),
    };

    commitData({
      ...data,
      events: [...data.events, nextEvent],
    });
    setEventForm({
      title: '',
      date: todayKey,
      startTime: '',
      endTime: '',
      location: '',
      notes: '',
      important: false,
    });
    setEventFormOpen(false);
  }

  function deleteEvent(eventId: string): void {
    commitData({
      ...data,
      events: data.events.filter((event) => event.id !== eventId),
    });
  }

  function addNote(event: React.FormEvent): void {
    event.preventDefault();
    const content = noteContent.trim();

    if (!content) {
      return;
    }

    const now = new Date();
    const note: QuickNote = {
      id: createId('note'),
      content,
      createdAt: now.toISOString(),
      date: toDateKey(now),
      time: toTimeKey(now),
    };

    commitData({
      ...data,
      notes: [...data.notes, note],
    });
    setNoteContent('');
  }

  function deleteNote(noteId: string): void {
    commitData({
      ...data,
      notes: data.notes.filter((note) => note.id !== noteId),
    });
  }

  if (isLoading) {
    return (
      <main className="app-shell loading">
        <strong>DotDay</strong>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app-shell loading">
        <div className="error-state">
          <strong>DotDay</strong>
          <span>{loadError}</span>
        </div>
      </main>
    );
  }

  if (widgetMode === 'collapsed') {
    return (
      <main className="app-shell compact-shell">
        <section className="compact-widget">
          <div className="compact-drag drag-region" title="Drag DotDay">
            <GripVertical size={15} />
          </div>
          <div className="compact-top">
            <div>
              <p className="eyebrow">DotDay</p>
              <h1>{formatDisplayDate(todayKey)}</h1>
            </div>
            <div className="compact-score">
              <strong>{todaySummary.percent}%</strong>
              <span>
                {todaySummary.completed}/{todaySummary.total}
              </span>
            </div>
          </div>

          <div className="progress-track">
            <span style={{ width: `${todaySummary.percent}%` }} />
          </div>

          <div className="compact-events">
            {collapsedEvents.length === 0 ? (
              <p>No upcoming events today</p>
            ) : (
              collapsedEvents.map((event) => (
                <div className={`compact-event ${isEventExpired(event, now) ? 'expired-event' : ''}`} key={event.id}>
                  {event.important ? <Star size={13} fill="currentColor" /> : <Clock size={13} />}
                  <span>{event.startTime || 'All day'}</span>
                  <strong>{event.title}</strong>
                </div>
              ))
            )}
          </div>

          <div className="compact-hint">
            <button className="compact-expand no-drag" type="button" onClick={() => setMode('expanded')} aria-label="Expand DotDay">
              <Maximize2 size={14} />
              Open
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header drag-region">
        <div>
          <p className="eyebrow">{formatDisplayDate(todayKey)}</p>
          <h1>DotDay</h1>
        </div>
        <div className="window-actions">
          <button className="icon-button no-drag" type="button" aria-label="Open calendar" title="Calendar" onClick={() => setCalendarOpen(true)}>
            <CalendarDays size={20} />
          </button>
          <button className="icon-button close-button no-drag" type="button" aria-label="Close DotDay" title="Close" onClick={() => void window.akDaily.closeWindow()}>
            <X size={18} />
          </button>
        </div>
      </header>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Today Habits</h2>
            <p>
              {todaySummary.completed}/{todaySummary.total} done · {todaySummary.percent}%
            </p>
          </div>
          <div className="progress-ring" aria-label={`Today progress ${todaySummary.percent}%`}>
            {todaySummary.percent}%
          </div>
        </div>

        <div className="habit-list">
          {todayHabits.length === 0 ? (
            <p className="empty">No habits yet.</p>
          ) : (
            todayHabits.map((habit) => {
              const checked = Boolean(data.habitRecords[todayKey]?.[habit.id]);
              return (
                <div className="habit-row" key={habit.id}>
                  <button className={`check-button ${checked ? 'checked' : ''}`} type="button" aria-label="Toggle habit" onClick={() => toggleHabit(habit.id)}>
                    {checked ? <Check size={16} /> : null}
                  </button>
                  <span className={checked ? 'done' : ''}>{habit.title}</span>
                  <button className="ghost-button" type="button" aria-label="Delete habit" title="Delete" onClick={() => archiveHabit(habit.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <form className="inline-form bottom-form" onSubmit={addHabit}>
          <input value={habitTitle} onChange={(event) => setHabitTitle(event.target.value)} placeholder="Add a habit, e.g. Drink water" />
          <button className="icon-button accent" type="submit" aria-label="Add habit" title="Add">
            <Plus size={18} />
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-title compact section-title-action">
          <div>
            <h2>Today Events</h2>
            <span>{todayEvents.length} items</span>
          </div>
          <button className={`icon-button ${eventFormOpen ? '' : 'accent'}`} type="button" aria-label="Toggle event form" title="Add event" onClick={() => setEventFormOpen((isOpen) => !isOpen)}>
            {eventFormOpen ? <X size={18} /> : <Plus size={18} />}
          </button>
        </div>

        <div className="item-list">
          {todayEvents.length === 0 ? (
            <p className="empty">No events today.</p>
          ) : (
            todayEvents.map((event) => <EventCard event={event} key={event.id} now={now} onDelete={() => deleteEvent(event.id)} />)
          )}
        </div>

        {eventFormOpen ? (
          <form className="event-form bottom-form" onSubmit={addEvent}>
            <input className="wide" value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} placeholder="Event title" />
            <input type="date" value={eventForm.date} onChange={(event) => setEventForm({ ...eventForm, date: event.target.value })} />
            <input type="time" value={eventForm.startTime} onChange={(event) => setEventForm({ ...eventForm, startTime: event.target.value })} />
            <input type="time" value={eventForm.endTime} onChange={(event) => setEventForm({ ...eventForm, endTime: event.target.value })} />
            <input className="wide" value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} placeholder="Location" />
            <textarea className="wide" value={eventForm.notes} onChange={(event) => setEventForm({ ...eventForm, notes: event.target.value })} placeholder="Notes" rows={2} />
            <label className="check-label wide">
              <input type="checkbox" checked={eventForm.important} onChange={(event) => setEventForm({ ...eventForm, important: event.target.checked })} />
              <span>Mark as important</span>
            </label>
            <button className="primary-button wide" type="submit">
              <Plus size={16} />
              Add event
            </button>
          </form>
        ) : null}
      </section>

      <section className="card">
        <div className="section-title compact">
          <h2>Quick Notes</h2>
          <span>{todayNotes.length} notes</span>
        </div>

        <form className="note-form" onSubmit={addNote}>
          <textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="Capture a quick note" rows={3} />
          <button className="primary-button" type="submit">
            <StickyNote size={16} />
            Save note
          </button>
        </form>

        <div className="item-list">
          {todayNotes.length === 0 ? (
            <p className="empty">No notes today.</p>
          ) : (
            todayNotes.map((note) => (
              <div className="note-card" key={note.id}>
                <div>
                  <time>{note.time}</time>
                  <p>{note.content}</p>
                </div>
                <button className="ghost-button" type="button" aria-label="Delete note" title="Delete" onClick={() => deleteNote(note.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {calendarOpen ? (
        <CalendarDialog
          data={data}
          monthDate={calendarMonth}
          now={now}
          selectedDate={selectedDate}
          todayKey={todayKey}
          onClose={() => setCalendarOpen(false)}
          onDeleteEvent={deleteEvent}
          onDeleteNote={deleteNote}
          onMonthChange={setCalendarMonth}
          onSelectedDateChange={setSelectedDate}
        />
      ) : null}
    </main>
  );
}

function EventCard({ event, now, onDelete }: { event: EventItem; now: Date; onDelete: () => void }): React.JSX.Element {
  const timeLabel = event.startTime || event.endTime ? `${event.startTime || '--:--'} - ${event.endTime || '--:--'}` : 'All day';
  const expired = isEventExpired(event, now);

  return (
    <div className={`event-card ${event.important ? 'important-event' : ''} ${expired ? 'expired-event' : ''}`}>
      <div>
        <div className="event-topline">
          <strong>
            {event.important ? <Star size={13} fill="currentColor" /> : null}
            {event.title}
          </strong>
          <time>{timeLabel}</time>
        </div>
        {event.location ? (
          <p className="event-meta">
            <MapPin size={13} />
            {event.location}
          </p>
        ) : null}
        {event.notes ? <p className="event-notes">{event.notes}</p> : null}
      </div>
      <button className="ghost-button" type="button" aria-label="Delete event" title="Delete" onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function CalendarDialog({
  data,
  monthDate,
  now,
  selectedDate,
  todayKey,
  onClose,
  onDeleteEvent,
  onDeleteNote,
  onMonthChange,
  onSelectedDateChange,
}: {
  data: AkDailyData;
  monthDate: Date;
  now: Date;
  selectedDate: DateKey;
  todayKey: DateKey;
  onClose: () => void;
  onDeleteEvent: (eventId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onMonthChange: (date: Date) => void;
  onSelectedDateChange: (date: DateKey) => void;
}): React.JSX.Element {
  const monthDays = getMonthDays(monthDate);
  const selectedSummary = getHabitSummary(data, selectedDate);
  const selectedEvents = sortEvents(data.events.filter((event) => event.date === selectedDate), now);
  const selectedNotes = data.notes.filter((note) => note.date === selectedDate).sort((first, second) => second.createdAt.localeCompare(first.createdAt));

  function moveMonth(offset: number): void {
    onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1));
  }

  return (
    <div className="modal-backdrop no-drag" role="dialog" aria-modal="true" aria-label="Calendar">
      <div className="calendar-modal">
        <div className="calendar-header">
          <button className="icon-button" type="button" aria-label="Previous month" title="Previous month" onClick={() => moveMonth(-1)}>
            <ChevronLeft size={19} />
          </button>
          <strong>
            {new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate)}
          </strong>
          <button className="icon-button" type="button" aria-label="Next month" title="Next month" onClick={() => moveMonth(1)}>
            <ChevronRight size={19} />
          </button>
          <button className="icon-button close-button" type="button" aria-label="Close calendar" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="weekday-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {monthDays.map((date) => {
            const dateKey = toDateKey(date);
            const isCurrentMonth = date.getMonth() === monthDate.getMonth();
            const isSelected = dateKey === selectedDate;
            const hasEvents = data.events.some((event) => event.date === dateKey);
            const marker = getCalendarHabitMarker(data, dateKey, todayKey);

            return (
              <button
                className={`day-cell ${isCurrentMonth ? '' : 'muted'} ${dateKey === todayKey ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-events' : ''}`}
                key={dateKey}
                type="button"
                onClick={() => onSelectedDateChange(dateKey)}
              >
                <span className="day-number">{date.getDate()}</span>
                <small>{marker}</small>
              </button>
            );
          })}
        </div>

        <div className="day-detail">
          <div className="detail-head">
            <strong>{formatDisplayDate(selectedDate)}</strong>
            <span>
              {selectedSummary.completed}/{selectedSummary.total} habits
            </span>
          </div>

          <div className="detail-block">
            <p className="detail-label">Events</p>
            {selectedEvents.length === 0 ? (
              <p className="empty small">No events</p>
            ) : (
              selectedEvents.map((event) => (
                <div className="detail-line detail-line-action" key={event.id}>
                  <span>{event.startTime || 'All day'}</span>
                  {event.important ? '★ ' : ''}
                  {event.title}
                  <button className="detail-delete" type="button" aria-label="Delete event" title="Delete event" onClick={() => onDeleteEvent(event.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="detail-block">
            <p className="detail-label">Notes</p>
            {selectedNotes.length === 0 ? (
              <p className="empty small">No notes</p>
            ) : (
              selectedNotes.map((note) => (
                <div className="detail-line detail-line-action" key={note.id}>
                  <span>{note.time}</span>
                  {note.content}
                  <button className="detail-delete" type="button" aria-label="Delete note" title="Delete note" onClick={() => onDeleteNote(note.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

