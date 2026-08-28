import { useState } from 'react';
import { REPORT_DEFINITIONS, downloadReport } from '../../lib/reports';
import { XIcon } from '../../components/layout/Icons';
import { rangeToApiParams, toLocalDateInput } from './reportsUtils';

interface CustomReportModalProps {
  onClose: () => void;
}

const today = toLocalDateInput(new Date());
const monthAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return toLocalDateInput(d);
})();

const CustomReportModal = ({ onClose }: CustomReportModalProps) => {
  const [reportKey, setReportKey] = useState(REPORT_DEFINITIONS[0].key);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [limit, setLimit] = useState(10);
  const [days, setDays] = useState(90);
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const def = REPORT_DEFINITIONS.find((d) => d.key === reportKey)!;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {};
      if (def.params.dateRange) Object.assign(params, rangeToApiParams({ from, to }));
      if (def.params.limit) params.limit = limit;
      if (def.params.days) params.days = days;
      await downloadReport(def.path, params, format);
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Custom Report</h2>
            <p className="modal-subtitle">Pick a report, a date range, and export it as CSV or PDF.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {done ? (
          <div className="modal-success">
            <div className="modal-success-icon">✓</div>
            <p>Your report downloaded successfully.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="modal-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-grid">
              <div className="modal-field span-2">
                <label>Report</label>
                <select value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
                  {REPORT_DEFINITIONS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {def.params.dateRange && (
                <>
                  <div className="modal-field">
                    <label>From</label>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>To</label>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </>
              )}

              {def.params.limit && (
                <div className="modal-field">
                  <label>Limit</label>
                  <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 10)} />
                </div>
              )}

              {def.params.days && (
                <div className="modal-field">
                  <label>Expiry window (days)</label>
                  <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 90)} />
                </div>
              )}

              <div className="modal-field">
                <label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'pdf')}>
                  <option value="csv">CSV (Excel)</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="modal-btn primary" disabled={generating} onClick={handleGenerate}>
                {generating ? 'Generating…' : 'Generate & Download'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomReportModal;
