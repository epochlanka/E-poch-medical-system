interface Segment {
  label: string;
  value: number;
  color: string;
}

interface StockOverviewDonutProps {
  segments: Segment[];
  total: number;
}

const SIZE = 170;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const StockOverviewDonut = ({ segments, total }: StockOverviewDonutProps) => {
  let acc = 0;

  return (
    <div className="ph-donut-row">
      <div className="ph-donut-wrap">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#eef2f8" strokeWidth={STROKE} />
          {total > 0 &&
            segments.map((s) => {
              if (s.value <= 0) return null;
              const dash = (s.value / total) * CIRCUMFERENCE;
              const el = (
                <circle
                  key={s.label}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-acc}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                >
                  <title>
                    {s.label}: {s.value}
                  </title>
                </circle>
              );
              acc += dash;
              return el;
            })}
        </svg>
        <div className="ph-donut-center">
          <div className="ph-donut-total">{total.toLocaleString()}</div>
          <div className="ph-donut-total-label">Total</div>
        </div>
      </div>

      <div className="ph-donut-legend">
        {segments.map((s) => (
          <div className="ph-donut-legend-row" key={s.label}>
            <span className="ph-donut-dot" style={{ background: s.color }} />
            <span className="ph-donut-legend-label">{s.label}</span>
            <span className="ph-donut-legend-value">
              {s.value} {total > 0 ? `(${((s.value / total) * 100).toFixed(1)}%)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockOverviewDonut;
