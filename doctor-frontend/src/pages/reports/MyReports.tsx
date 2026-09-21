import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { REPORT_DEFS, getReport, downloadReport } from '../../lib/reports';
import type { ReportKind, ReportResult } from '../../lib/reports';
import {
  RefreshIcon,
  DownloadIcon,
  EyeIcon,
  CalendarIcon,
  StethoscopeIcon,
  ClipboardIcon,
  PatientsIcon,
  PrescriptionIcon,
  PillIcon,
  ClockIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../patients/patients.css';
import './reports.css';

const ROW_ICON: Record<ReportKind, { icon: React.ReactNode; bg: string; color: string }> = {
  consultations: { icon: <StethoscopeIcon />, bg: '#eaf1fe', color: '#2563eb' },
  diagnoses: { icon: <ClipboardIcon />, bg: '#dcfce7', color: '#16a34a' },
  'patient-visits': { icon: <PatientsIcon />, bg: '#f3e8ff', color: '#7c3aed' },
  prescriptions: { icon: <PrescriptionIcon />, bg: '#dbeafe', color: '#1d4ed8' },
  'top-medicines': { icon: <PillIcon />, bg: '#dcfce7', color: '#16a34a' },
  'follow-ups-due': { icon: <ClockIcon />, bg: '#fef3c7', color: '#b45309' },
  appointments: { icon: <CalendarIcon />, bg: '#eaf1fe', color: '#2563eb' },
  'clinical-statistics': { icon: <StethoscopeIcon />, bg: '#e0f2fe', color: '#0369a1' },
};

const TYPE_BADGE: Record<string, string> = { Summary: 'badge-blue', Analytics: 'badge-green', Operational: 'badge-purple' };

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const formatCell = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
  return String(value);
};
const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_');

const REPORT_KINDS = REPORT_DEFS.map((d) => d.kind);
const isReportKind = (v: string | null): v is ReportKind => !!v && (REPORT_KINDS as string[]).includes(v);

const MyReports = () => {
  const [searchParams] = useSearchParams();
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);

  // Supports deep-linking from other pages (e.g. Clinical Statistics' "View Full Report" links)
  // straight into a preselected report row via ?report=<kind>.
  const deepLinkedKind = searchParams.get('report');
  const [selectedKind, setSelectedKind] = useState<ReportKind | null>(isReportKind(deepLinkedKind) ? deepLinkedKind : null);
  const [selectedReport, setSelectedReport] = useState<ReportResult | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [downloadingKind, setDownloadingKind] = useState<ReportKind | null>(null);

  // Four real KPI cards — pulled from the same doctor-scoped report endpoints the table rows use,
  // not tracked "report generation" metrics the data model has no way to record.
  const { data: kpi, loading: kpiLoading, error: kpiError, reload: reloadKpi } = useApiData(
    () =>
      Promise.all([
        getReport('consultations', { from: appliedFrom, to: appliedTo }),
        getReport('prescriptions', { from: appliedFrom, to: appliedTo }),
        getReport('patient-visits', { from: appliedFrom, to: appliedTo }),
        getReport('follow-ups-due', {}),
      ]).then(([consultations, prescriptions, patientVisits, followUps]) => ({ consultations, prescriptions, patientVisits, followUps })),
    [appliedFrom, appliedTo]
  );

  const applyRange = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
    setSelectedReport(null);
    setSelectedKind(null);
  };
  const clearRange = () => {
    setFrom(isoDaysAgo(29));
    setTo(todayIso());
    setAppliedFrom(isoDaysAgo(29));
    setAppliedTo(todayIso());
    setSelectedReport(null);
    setSelectedKind(null);
  };

  const viewReport = (kind: ReportKind) => {
    setSelectedKind(kind);
  };

  useEffect(() => {
    if (!selectedKind) return;
    let cancelled = false;
    setSelectedLoading(true);
    getReport(selectedKind, { from: appliedFrom, to: appliedTo })
      .then((r) => {
        if (!cancelled) setSelectedReport(r);
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKind, appliedFrom, appliedTo]);

  const handleDownload = async (kind: ReportKind, name: string, format: 'csv' | 'pdf') => {
    setDownloadingKind(kind);
    try {
      await downloadReport(kind, { from: appliedFrom, to: appliedTo }, format, `${slug(name)}.${format}`);
    } finally {
      setDownloadingKind(null);
    }
  };

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      for (const def of REPORT_DEFS) {
        await downloadReport(def.kind, { from: appliedFrom, to: appliedTo }, 'csv', `${slug(def.name)}.csv`);
      }
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>My Reports</h1>
          <p>View and export your clinical reports for the selected period.</p>
        </div>
        <button className="pat-icon-btn" onClick={reloadKpi} aria-label="Refresh" title="Refresh">
          <RefreshIcon />
        </button>
      </div>

      {kpiError && <div className="dash-error-banner">Couldn't load report data: {kpiError}</div>}

      <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard
          icon={<StethoscopeIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Consultations"
          value={String(kpi?.consultations.summary.totalConsultations ?? 0)}
          loading={kpiLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Selected period</span>}
        />
        <KpiCard
          icon={<PrescriptionIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Prescriptions Issued"
          value={String(kpi?.prescriptions.summary.totalPrescriptions ?? 0)}
          loading={kpiLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Selected period</span>}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Patients Seen"
          value={String(kpi?.patientVisits.summary.distinctPatients ?? 0)}
          loading={kpiLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Selected period</span>}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Follow-ups Due"
          value={String(kpi?.followUps.summary.total ?? 0)}
          loading={kpiLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>As of today</span>}
        />
      </div>

      <div className="pat-filter-bar">
        <div className="q-filter-field">
          <span className="q-filter-label">From</span>
          <input type="date" className="q-filter-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="q-filter-field">
          <span className="q-filter-label">To</span>
          <input type="date" className="q-filter-input" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="pat-btn" onClick={clearRange}>
          <RefreshIcon /> Reset
        </button>
        <button className="pat-btn primary" onClick={applyRange}>
          Apply
        </button>
        <button className="pat-btn" style={{ marginLeft: 'auto' }} disabled={exportingAll} onClick={handleExportAll}>
          <DownloadIcon /> {exportingAll ? 'Exporting…' : 'Export All (CSV)'}
        </button>
      </div>

      <div className="rpt-layout">
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {REPORT_DEFS.map((def) => {
                  const meta = ROW_ICON[def.kind];
                  const isSelected = selectedKind === def.kind;
                  return (
                    <tr key={def.kind} className={`pat-clickable-row${isSelected ? ' selected' : ''}`} onClick={() => viewReport(def.kind)}>
                      <td>
                        <div className="rpt-name-cell">
                          <span className="rpt-row-icon" style={{ background: meta.bg, color: meta.color }}>
                            {meta.icon}
                          </span>
                          <div>
                            <div className="pat-name">{def.name}</div>
                            <span className="pat-muted" style={{ fontSize: 11.5 }}>
                              {def.description}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[def.type]}`}>{def.type}</span>
                      </td>
                      <td className="pat-muted">{def.rangeScoped ? `${formatDate(appliedFrom)} – ${formatDate(appliedTo)}` : 'As of today'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="pat-icon-btn" title="View" onClick={(e) => { e.stopPropagation(); viewReport(def.kind); }}>
                            <EyeIcon />
                          </button>
                          <button
                            className="pat-icon-btn"
                            title="Download CSV"
                            disabled={downloadingKind === def.kind}
                            onClick={(e) => { e.stopPropagation(); handleDownload(def.kind, def.name, 'csv'); }}
                          >
                            <DownloadIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card rpt-detail-card">
          <div className="card-header">
            <h3 className="card-title">Report Details</h3>
          </div>

          {!selectedKind && (
            <div className="rpt-detail-empty">
              <ClipboardIcon />
              <p>Select a report from the list to view details, preview and export it.</p>
            </div>
          )}

          {selectedKind && (selectedLoading || !selectedReport) && <div className="card-empty">Loading…</div>}

          {selectedKind && !selectedLoading && selectedReport && (
            <>
              <div className="rpt-detail-title">{selectedReport.title}</div>
              <div className="pat-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                {selectedReport.range.from || selectedReport.range.to
                  ? `${formatDate(selectedReport.range.from)} – ${formatDate(selectedReport.range.to)}`
                  : 'As of today'}
              </div>

              <div className="rpt-summary-grid">
                {Object.entries(selectedReport.summary).map(([key, value]) => (
                  <div className="rpt-summary-box" key={key}>
                    <div className="rpt-summary-label">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</div>
                    <div className="rpt-summary-value">{formatCell(value)}</div>
                  </div>
                ))}
              </div>

              <div className="rpt-preview-scroll">
                <table className="pat-table rpt-preview-table">
                  <thead>
                    <tr>
                      {selectedReport.columns.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.rows.length === 0 && (
                      <tr>
                        <td colSpan={selectedReport.columns.length} className="pat-muted">
                          No data in this range.
                        </td>
                      </tr>
                    )}
                    {selectedReport.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        {selectedReport.columns.map((c) => (
                          <td key={c.key}>{formatCell(row[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedReport.rows.length > 8 && (
                  <div className="pat-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                    Showing 8 of {selectedReport.rows.length} rows — download for the full report.
                  </div>
                )}
              </div>

              {(() => {
                const def = REPORT_DEFS.find((d) => d.kind === selectedKind)!;
                return (
                  <div className="rpt-detail-actions">
                    <button className="pat-btn" disabled={downloadingKind === def.kind} onClick={() => handleDownload(def.kind, def.name, 'csv')}>
                      <DownloadIcon /> CSV
                    </button>
                    <button className="pat-btn primary" disabled={downloadingKind === def.kind} onClick={() => handleDownload(def.kind, def.name, 'pdf')}>
                      <DownloadIcon /> PDF
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyReports;
