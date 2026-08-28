import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getReport, downloadReport } from '../../lib/reports';
import type { ReportDefinition } from '../../lib/reports';
import { DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/layout/Icons';
import { formatCell, formatSummaryValue, rangeToApiParams } from './reportsUtils';
import type { DateRangeInput } from './reportsUtils';

interface ReportPanelProps {
  def: ReportDefinition;
  dateRange: DateRangeInput;
}

const ReportPanel = ({ def, dateRange }: ReportPanelProps) => {
  const [limit, setLimit] = useState(10);
  const [days, setDays] = useState(90);
  const [doctorId, setDoctorId] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (def.params.dateRange) Object.assign(p, rangeToApiParams(dateRange));
    if (def.params.limit) p.limit = limit;
    if (def.params.days) p.days = days;
    if (def.params.doctorId && doctorId) p.doctorId = doctorId;
    if (def.params.auditFilters) {
      if (entity) p.entity = entity;
      if (action) p.action = action;
      p.page = page;
      p.limit = 15;
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, dateRange, limit, days, doctorId, entity, action, page]);

  const { data, loading, error } = useApiData(() => getReport(def.path, params), [def.path, JSON.stringify(params)]);

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    try {
      await downloadReport(def.path, params, format);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="rp-panel-header">
        <div>
          <h3 className="card-title">{def.label}</h3>
          {data?.range?.from && <span className="card-subtitle">{formatCell('date', data.range.from)} – {formatCell('date', data.range.to)}</span>}
        </div>

        <div className="rp-panel-controls">
          {def.params.limit && (
            <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 10)} title="Limit" />
          )}
          {def.params.days && <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 90)} title="Days" />}
          {def.params.doctorId && (
            <input placeholder="Doctor ID (optional)" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} />
          )}
          {def.params.auditFilters && (
            <>
              <input placeholder="Entity" value={entity} onChange={(e) => setEntity(e.target.value)} />
              <input placeholder="Action" value={action} onChange={(e) => setAction(e.target.value)} />
            </>
          )}

          <div className="rp-export-group">
            <button className="pat-btn" disabled={exporting !== null} onClick={() => handleExport('csv')}>
              <DownloadIcon /> {exporting === 'csv' ? 'Exporting…' : 'CSV'}
            </button>
            <button className="pat-btn" disabled={exporting !== null} onClick={() => handleExport('pdf')}>
              <DownloadIcon /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load this report: {error}</div>}

      {data && (
        <div className="rp-summary-chips">
          {Object.entries(data.summary).map(([key, value]) => (
            <div className="rp-chip" key={key}>
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
              <strong>{formatSummaryValue(key, value)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              {data?.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={data?.columns.length ?? 1} className="pat-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={data?.columns.length ?? 1}>
                  <div className="pat-empty">No data for this range.</div>
                </td>
              </tr>
            )}
            {!loading &&
              data?.rows.map((row, i) => (
                <tr key={i}>
                  {data.columns.map((c) => (
                    <td key={c.key}>{formatCell(c.key, row[c.key])}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="pat-pagination">
          <div className="pat-pagination-info">
            Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} entries
          </div>
          <div className="pat-pagination-pages">
            <button className="pat-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeftIcon />
            </button>
            <button className="pat-page-btn" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportPanel;
