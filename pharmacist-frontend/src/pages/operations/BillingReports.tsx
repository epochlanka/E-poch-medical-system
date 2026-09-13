import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getInvoices, getReport } from '../../lib/operations';
import type { Invoice, Report } from '../../lib/operations';
import { Empty, Notice, PageHeader, Panel } from './Shared';
import { dateText, errorText, money } from './format';

export default function BillingReports({ mode }: { mode: 'billing' | 'reports' }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [reportType, setReportType] = useState<'low-stock' | 'expiring-batches' | 'dispensing-volume'>('low-stock');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const task = mode === 'billing' ? getInvoices({ search: search || undefined, page, limit: 20 }) : getReport(reportType);
    task.then(result => {
      if (!active) return;
      if (mode === 'billing') { const r = result as Awaited<ReturnType<typeof getInvoices>>; setInvoices(r.data); setTotalPages(r.pagination.totalPages || 1); }
      else setReport(result as Report);
    }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, reportType, search, page, revision]);

  return <div className="ops-page">
    <PageHeader title={mode === 'billing' ? 'Pharmacy charges' : 'Pharmacy reports'} help={mode === 'billing' ? 'See medicine charges on patient invoices. Reception handles creating invoices and recording payments.' : 'Check stock and dispensing activity. These numbers come from the current system records.'} action={<button className="ops-btn" onClick={() => setRevision(n => n + 1)} disabled={loading}>Refresh data</button>} />
    <nav className="ops-tabs" aria-label="Billing and reports"><NavLink to="/billing" className={mode === 'billing' ? 'active' : ''}>Charges</NavLink><NavLink to="/reports" className={mode === 'reports' ? 'active' : ''}>Reports</NavLink></nav>
    {error && <Notice tone="error">{error}</Notice>}
    {mode === 'billing' ? <>
      <Notice tone="warn">Use this page to check charges only. If an invoice was made before pharmacy dispensing finished, ask reception to verify the charge before payment.</Notice>
      <Panel title="Patient invoices"><div className="ops-toolbar"><input className="ops-search" aria-label="Find invoice or patient" placeholder="Find patient or invoice number" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>{loading ? <Empty text="Loading invoices…" /> : invoices.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Medicine lines</th><th>Total invoice</th><th>Payment</th><th></th></tr></thead><tbody>{invoices.map(i => <tr key={i.invoice_id}><td><strong>INV-{i.invoice_id}</strong></td><td>{i.patient.full_name}</td><td>{dateText(i.created_at)}</td><td>{i.items.filter(x => x.item_type === 'Medicine').length}</td><td>{money(i.total_amount)}</td><td><span className="ops-pill">{i.payment_status}</span></td><td><button className="ops-btn" onClick={() => setSelected(i)}>View lines</button></td></tr>)}</tbody></table></div> : <Empty text="No invoices match your search." />}<div className="ops-toolbar"><button className="ops-btn" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Previous</button><span className="ops-muted">Page {page} of {totalPages}</span><button className="ops-btn" disabled={page >= totalPages} onClick={() => setPage(n => n + 1)}>Next</button></div></Panel>
      {selected && <Panel title={`Invoice INV-${selected.invoice_id} · ${selected.patient.full_name}`} action={<button className="ops-btn" onClick={() => setSelected(null)}>Close details</button>}><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Charge</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>{selected.items.map(item => <tr key={item.invoice_item_id}><td>{item.description} <span className="ops-muted">({item.item_type})</span></td><td>{item.qty}</td><td>{money(item.line_total)}</td></tr>)}</tbody></table></div></Panel>}
    </> : <>
      <Panel title="Choose a report"><div className="ops-panel-body ops-grid"><div className="ops-field"><label htmlFor="report-type">What do you need to see?</label><select id="report-type" value={reportType} onChange={e => setReportType(e.target.value as typeof reportType)}><option value="low-stock">Medicines running low</option><option value="expiring-batches">Batches nearing expiry</option><option value="dispensing-volume">Dispensing activity</option></select></div></div></Panel>
      <Panel title={report?.title || 'Report'}>{loading ? <Empty text="Loading report…" /> : report?.rows?.length ? <><div className="ops-table-wrap"><table className="ops-table"><thead><tr>{report.columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{report.rows.map((row, i) => <tr key={i}>{report.columns.map(c => <td key={c.key}>{row[c.key] === null || row[c.key] === undefined ? '—' : String(row[c.key])}</td>)}</tr>)}</tbody></table></div><div className="ops-toolbar"><span className="ops-muted">{report.rows.length} row{report.rows.length === 1 ? '' : 's'}</span></div></> : <Empty text="No records for this report." />}</Panel>
    </>}
  </div>;
}
