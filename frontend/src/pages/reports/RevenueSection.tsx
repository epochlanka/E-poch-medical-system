import { useMemo, useState } from 'react';
import type { OverviewReport } from '../../lib/reports';
import StockOverviewDonut from '../pharmacy/StockOverviewDonut';
import '../pharmacy/pharmacy.css';
import { formatCurrency, formatCurrencyCompact, formatPct } from './reportsUtils';

type Granularity = 'daily' | 'weekly' | 'monthly';

const CATEGORY_COLORS: Record<string, string> = {
  ConsultationFee: '#2563eb',
  Medicine: '#22c55e',
};
const CATEGORY_LABELS: Record<string, string> = {
  ConsultationFee: 'Consultation Fees',
  Medicine: 'Medicine Sales',
};

const bucketSeries = (series: { date: string; total: number }[], granularity: Granularity) => {
  if (granularity === 'daily') return series;

  const buckets = new Map<string, number>();
  for (const point of series) {
    const d = new Date(`${point.date}T00:00:00`);
    let key: string;
    if (granularity === 'monthly') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      key = weekStart.toISOString().slice(0, 10);
    }
    buckets.set(key, (buckets.get(key) ?? 0) + point.total);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));
};

const formatAxisLabel = (key: string, granularity: Granularity) => {
  if (granularity === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const RevenueSection = ({ overview }: { overview: OverviewReport }) => {
  const [granularity, setGranularity] = useState<Granularity>('daily');

  const bucketed = useMemo(() => bucketSeries(overview.revenueTrend, granularity), [overview.revenueTrend, granularity]);
  const max = Math.max(1, ...bucketed.map((d) => d.total));

  const width = 560;
  const height = 170;
  const padding = { top: 10, bottom: 24, left: 4, right: 4 };
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 3;
  const barWidth = bucketed.length ? (width - padding.left - padding.right) / bucketed.length - barGap : 0;

  const axisIndexes = bucketed.length
    ? [0, Math.floor(bucketed.length / 4), Math.floor(bucketed.length / 2), Math.floor((bucketed.length * 3) / 4), bucketed.length - 1]
    : [];

  const { categories, subtotalBilled, discountTotal, netRevenue } = overview.revenueByCategory;
  const segments = categories.map((c) => ({ label: CATEGORY_LABELS[c.label] ?? c.label, value: c.value, color: CATEGORY_COLORS[c.label] ?? '#94a3b8' }));

  return (
    <div className="rp-section-grid">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Revenue Overview</h3>
          <select className="pat-select" value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="revenue-total">{formatCurrency(overview.kpis.totalRevenue)}</div>
        <div className={`revenue-delta ${overview.kpis.totalRevenueChangePct === null ? '' : overview.kpis.totalRevenueChangePct >= 0 ? 'up' : 'down'}`}>
          <span style={{ color: overview.kpis.totalRevenueChangePct === null ? '#94a3b8' : overview.kpis.totalRevenueChangePct >= 0 ? '#16a34a' : '#dc2626' }}>
            {formatPct(overview.kpis.totalRevenueChangePct)} vs previous period
          </span>
        </div>

        <svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {bucketed.map((d, i) => {
            const barHeight = max > 0 ? (d.total / max) * chartHeight : 0;
            const x = padding.left + i * (barWidth + barGap);
            const y = padding.top + (chartHeight - barHeight);
            return (
              <rect key={d.date} x={x} y={y} width={Math.max(barWidth, 1)} height={Math.max(barHeight, 1)} rx={2}>
                <title>
                  {d.date}: {formatCurrency(d.total)}
                </title>
              </rect>
            );
          })}
          {axisIndexes.map((idx) => {
            const x = padding.left + idx * (barWidth + barGap) + barWidth / 2;
            return (
              <text key={idx} x={x} y={height - 6} textAnchor="middle" className="revenue-axis">
                {formatAxisLabel(bucketed[idx].date, granularity)}
              </text>
            );
          })}
        </svg>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Revenue by Category</h3>
        </div>
        {segments.length === 0 && <div className="card-empty">No billed revenue in this period.</div>}
        {segments.length > 0 && <StockOverviewDonut segments={segments} total={subtotalBilled} />}
        <div className="rp-billed-caption">
          <span>
            Gross billed: <strong>{formatCurrencyCompact(subtotalBilled)}</strong>
          </span>
          <span>
            Discounts: <strong>−{formatCurrencyCompact(discountTotal)}</strong>
          </span>
          <span>
            Net revenue: <strong>{formatCurrencyCompact(netRevenue)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

export default RevenueSection;
