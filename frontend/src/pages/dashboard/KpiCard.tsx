import type { ReactNode } from 'react';

interface KpiCardProps {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  changePct?: number | null;
  compareLabel?: string;
  loading?: boolean;
  footer?: ReactNode;
}

const KpiCard = ({ icon, iconBg, iconColor, label, value, changePct, compareLabel = 'yesterday', loading, footer }: KpiCardProps) => {
  const hasDelta = changePct !== undefined;

  return (
    <div className="kpi-card">
      <div className="kpi-card-top">
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{loading ? '—' : value}</div>
        </div>
        <div className="kpi-icon" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
      </div>

      {footer}

      {hasDelta && !footer && !loading && (
        <span className={`kpi-delta ${changePct === null ? 'flat' : changePct >= 0 ? 'up' : 'down'}`}>
          {changePct === null ? (
            <span className="kpi-delta-note">No data for {compareLabel}</span>
          ) : (
            <>
              {changePct >= 0 ? '↑' : '↓'} {Math.abs(changePct).toFixed(1)}%
              <span className="kpi-delta-note">from {compareLabel}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
};

export default KpiCard;
