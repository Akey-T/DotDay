import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { X } from 'lucide-react';
import type { AkDailyData } from '../../../shared/types';
import { getHabitHistoryInsights, getHabitInsights, type HabitDayAnalytics, type HabitHistoryDay } from '../utils/analytics';

interface InsightsPanelProps {
  data: AkDailyData;
  monthDate: Date;
  today: Date;
  onClose: () => void;
}

interface TooltipPayload {
  payload: HabitDayAnalytics;
}

interface HabitTooltipPayload {
  payload: HabitHistoryDay;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

interface HabitChartTooltipProps {
  active?: boolean;
  payload?: HabitTooltipPayload[];
}

function formatPercent(value: number | null): string {
  return value === null ? 'No data' : `${value}%`;
}

function formatChartPercent(value: number): string {
  return `${value}%`;
}

function ChartTooltip({ active, payload }: ChartTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const day = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <strong>
        {day.weekday}, {day.date}
      </strong>
      {day.hasData ? (
        <>
          <span>{day.percent}% complete</span>
          <span>
            {day.completed}/{day.total} habits
          </span>
        </>
      ) : (
        <span>No habit data</span>
      )}
    </div>
  );
}

function HabitChartTooltip({ active, payload }: HabitChartTooltipProps): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const day = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <strong>{day.date}</strong>
      <span>{day.completed ? 'Completed' : 'Missed'}</span>
    </div>
  );
}

function MetricCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }): React.JSX.Element {
  return (
    <div className="insight-metric-card">
      <span>{label}</span>
      <strong>
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </strong>
    </div>
  );
}

export function InsightsPanel({ data, monthDate, today, onClose }: InsightsPanelProps): React.JSX.Element {
  const [selectedHabitId, setSelectedHabitId] = React.useState(() => data.habits[0]?.id ?? '');
  const insights = React.useMemo(() => getHabitInsights(data, today, monthDate), [data, monthDate, today]);
  const habitHistory = React.useMemo(() => getHabitHistoryInsights(data, selectedHabitId || null, today), [data, selectedHabitId, today]);
  const monthTicks = insights.monthDays.filter((day) => day.day === 1 || day.day % 5 === 0 || day.day === insights.monthDays.length).map((day) => day.day);
  const habitTicks = habitHistory.days
    .filter((day) => day.index === 1 || day.index === habitHistory.days.length || (habitHistory.days.length > 8 && day.index % Math.ceil(habitHistory.days.length / 5) === 0))
    .map((day) => day.index);

  React.useEffect(() => {
    if (data.habits.length === 0) {
      setSelectedHabitId('');
      return;
    }

    if (!data.habits.some((habit) => habit.id === selectedHabitId)) {
      setSelectedHabitId(data.habits[0].id);
    }
  }, [data.habits, selectedHabitId]);

  return (
    <section className="insights-panel" aria-label="Insights">
      <div className="insights-header">
        <div>
          <p className="eyebrow">Habit analytics</p>
          <h2>Insights</h2>
        </div>
        <button className="icon-button close-button" type="button" aria-label="Close insights" title="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="insight-metrics">
        <MetricCard label="This week average" value={formatPercent(insights.weekCompletionRate)} />
        <MetricCard label="This month average" value={formatPercent(insights.monthAverageCompletionRate)} />
        <MetricCard label="Current streak" value={insights.currentStreak} suffix="days" />
        <MetricCard label="Perfect days this month" value={insights.perfectDaysThisMonth} suffix="days" />
      </div>

      <div className="insight-chart-card">
        <div className="insight-chart-head">
          <strong>This week average</strong>
          <span>Mon to Sun</span>
        </div>
        <div className="insight-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={insights.weekDays} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#f3ece6" vertical={false} />
              <XAxis dataKey="weekdayShort" axisLine={false} tickLine={false} tick={{ fill: '#88776a', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={formatChartPercent} axisLine={false} tickLine={false} tick={{ fill: '#88776a', fontSize: 11 }} width={46} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(249, 115, 22, 0.08)' }} />
              <Bar dataKey="percent" fill="#f97316" radius={[8, 8, 4, 4]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="insight-chart-card">
        <div className="insight-chart-head">
          <strong>This month</strong>
          <span>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate)}</span>
        </div>
        <div className="insight-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={insights.monthDays} margin={{ top: 10, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#f3ece6" vertical={false} />
              <XAxis
                dataKey="day"
                ticks={monthTicks}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#88776a', fontSize: 11 }}
              />
              <YAxis domain={[0, 100]} tickFormatter={formatChartPercent} axisLine={false} tickLine={false} tick={{ fill: '#88776a', fontSize: 11 }} width={46} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="percent"
                stroke="#f97316"
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 2, fill: '#ffffff', stroke: '#f97316' }}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#f97316', stroke: '#ffffff' }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="insight-chart-card habit-history-card">
        <div className="insight-chart-head">
          <strong>Habit history</strong>
          <select value={selectedHabitId} onChange={(event) => setSelectedHabitId(event.target.value)} disabled={data.habits.length === 0} aria-label="Choose habit">
            {data.habits.length === 0 ? <option>No habits</option> : null}
            {data.habits.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.title}
              </option>
            ))}
          </select>
        </div>

        <div className="habit-history-summary">
          <div>
            <span>Historical completion</span>
            <strong>{formatPercent(habitHistory.completionRate)}</strong>
          </div>
          <div>
            <span>Effective days</span>
            <strong>
              {habitHistory.completedDays}/{habitHistory.effectiveDays}
            </strong>
          </div>
        </div>

        <div className="insight-chart habit-history-chart">
          {habitHistory.days.length === 0 ? (
            <p className="empty small">No effective habit days yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={habitHistory.days} margin={{ top: 10, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="#f3ece6" vertical={false} />
                <XAxis
                  dataKey="index"
                  ticks={habitTicks}
                  tickFormatter={(value) => habitHistory.days.find((day) => day.index === value)?.label ?? ''}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#88776a', fontSize: 11 }}
                />
                <YAxis domain={[0, 100]} tickFormatter={formatChartPercent} axisLine={false} tickLine={false} tick={{ fill: '#88776a', fontSize: 11 }} width={46} />
                <Tooltip content={<HabitChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="percent"
                  stroke="#f97316"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: '#ffffff', stroke: '#f97316' }}
                  activeDot={{ r: 5, strokeWidth: 2, fill: '#f97316', stroke: '#ffffff' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}
