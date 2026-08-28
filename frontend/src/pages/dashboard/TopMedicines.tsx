import { useApiData } from '../../hooks/useApiData';
import { getTopMedicines } from '../../lib/dashboard';

const TopMedicines = () => {
  const { data, loading, error } = useApiData(() => getTopMedicines(5));
  const max = Math.max(1, ...(data?.map((m) => m.unitsSold) ?? []));

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Top Selling Medicines</h3>
          <div className="card-subtitle">Last 30 days</div>
        </div>
      </div>

      {loading && <div className="card-empty">Loading…</div>}
      {error && <div className="card-empty">{error}</div>}
      {!loading && !error && !data?.length && <div className="card-empty">No dispensed medicines yet.</div>}

      {data?.map((m, i) => (
        <div className="med-row" key={m.medicineId}>
          <span className="med-rank">{i + 1}</span>
          <div className="med-info">
            <div className="med-name">{m.name}</div>
            <div className="med-bar-track">
              <div className="med-bar-fill" style={{ width: `${(m.unitsSold / max) * 100}%` }} />
            </div>
          </div>
          <span className="med-count">{m.unitsSold}</span>
        </div>
      ))}
    </div>
  );
};

export default TopMedicines;
