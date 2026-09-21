import type { OverviewReport } from '../../lib/reports';
import { formatCurrency } from './reportsUtils';

const DEMO_COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#7c3aed', '#ef4444'];

const PerformanceSection = ({ overview }: { overview: OverviewReport }) => {
  const totalDemo = overview.patientDemographics.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rp-perf-grid">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Top Performing Doctors</h3>
          <span className="card-subtitle">By billed revenue, this period</span>
        </div>
        {overview.topDoctors.length === 0 && <div className="card-empty">No finalized consultations in this period.</div>}
        {overview.topDoctors.map((d, i) => (
          <div className="rp-doctor-row" key={d.doctorId}>
            <span className="med-rank">{i + 1}</span>
            <span className="rp-doctor-name">{d.doctorName}</span>
            <span className="rp-doctor-stat">{d.consultations} visits</span>
            <span className="rp-doctor-stat">{d.patients} patients</span>
            <span className="rp-doctor-stat" style={{ fontWeight: 700, color: '#0f172a' }}>
              {formatCurrency(d.revenue)}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Patient Demographics</h3>
          <span className="card-subtitle">By age group, current roster</span>
        </div>
        {overview.patientDemographics.map((d, i) => (
          <div className="med-row" key={d.label}>
            <div className="med-info">
              <div className="med-name">{d.label}</div>
              <div className="med-bar-track">
                <div
                  className="med-bar-fill"
                  style={{ width: `${totalDemo ? (d.count / totalDemo) * 100 : 0}%`, background: DEMO_COLORS[i % DEMO_COLORS.length] }}
                />
              </div>
            </div>
            <span className="med-count">
              {d.count} ({totalDemo ? ((d.count / totalDemo) * 100).toFixed(1) : '0.0'}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PerformanceSection;
