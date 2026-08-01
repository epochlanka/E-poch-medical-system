import { useApiData } from '../../hooks/useApiData';
import { getRevenueTrend } from '../../lib/dashboard';

const formatCurrency = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatAxisDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const RevenueChart = () => {
  const { data, loading, error } = useApiData(() => getRevenueTrend(30));

  const series = data?.series ?? [];
  const max = Math.max(1, ...series.map((d) => d.total));

  const width = 560;
  const height = 170;
  const padding = { top: 10, bottom: 24, left: 4, right: 4 };
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 3;
  const barWidth = series.length ? (width - padding.left - padding.right) / series.length - barGap : 0;

  const axisIndexes = series.length
    ? [0, Math.floor(series.length / 4), Math.floor(series.length / 2), Math.floor((series.length * 3) / 4), series.length - 1]
    : [];

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Revenue Overview</h3>
        <span className="card-subtitle">Last 30 days</span>
      </div>

      {loading && <div className="card-empty">Loading…</div>}
      {error && <div className="card-empty">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="revenue-total">{formatCurrency(data.total)}</div>
          <div className={`revenue-delta ${data.changePct === null ? '' : data.changePct >= 0 ? 'up' : 'down'}`}>
            {data.changePct === null ? (
              <span style={{ color: '#94a3b8' }}>No prior-period data to compare</span>
            ) : (
              <span style={{ color: data.changePct >= 0 ? '#16a34a' : '#dc2626' }}>
                {data.changePct >= 0 ? '↑' : '↓'} {Math.abs(data.changePct).toFixed(1)}% vs previous 30 days
              </span>
            )}
          </div>

          <svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {series.map((d, i) => {
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
                  {formatAxisDate(series[idx].date)}
                </text>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
};

export default RevenueChart;
