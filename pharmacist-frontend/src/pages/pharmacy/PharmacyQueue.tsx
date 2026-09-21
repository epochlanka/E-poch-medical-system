import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getPharmacyQueue, statusLabel } from '../../lib/pharmacy';
import type { QueueItem } from '../../lib/pharmacy';
import { formatDateTime } from '../prescriptions/patientUtils';
import './guidedDispensing.css';
import './pharmacyQueue.css';

const filters = [
  { key: 'waiting', label: 'To prepare' },
  { key: 'ready', label: 'Ready for handover' },
  { key: 'completed', label: 'Handed over' },
  { key: 'all', label: 'All prescriptions' },
] as const;
type Filter = typeof filters[number]['key'];

export default function PharmacyQueue() {
  const { data: board, loading, error, reload, reloadInBackground } = useApiData(({ background }) => getPharmacyQueue(background));
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const filter: Filter = filters.find(item => item.key === params.get('view'))?.key || 'waiting';
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (board) setUpdated(new Date()); }, [board]);
  useEffect(() => {
    // The timer refresh is background traffic (must not keep an unattended session alive); a tab
    // becoming visible again is a person, so that one counts as activity.
    const onTimer = () => { if (!document.hidden) reloadInBackground(); };
    const onVisible = () => { if (!document.hidden) reload(); };
    const timer = window.setInterval(onTimer, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload, reloadInBackground]);
  const groups = useMemo(() => {
    const waiting = [...(board?.Pending || []), ...(board?.Preparing || [])].sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt));
    const ready = board?.Dispensed || [];
    const completed = [...(board?.Collected || [])].reverse();
    return { waiting, ready, completed, all: [...waiting, ...ready, ...completed] };
  }, [board]);
  const matching = (item: QueueItem) => `${item.patientName} ${item.patientId || ''} ${item.code} ${item.doctorName}`.toLowerCase().includes(search.trim().toLowerCase());
  const rows = groups[filter].filter(matching);
  const update = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  return <main className="gd-page pq-worklist">
    <div className="gd-heading"><div><span className="gd-eyebrow">PHARMACY COUNTER</span><h1>Waiting prescriptions</h1><p>Find the patient in front of you. Open their prescription, pick each medicine, then hand it over.</p></div><button className="gd-button secondary" disabled={loading} onClick={reload}>{loading ? 'Updating…' : 'Refresh'}</button></div>
    <div className="pq-flow" aria-label="Pharmacy workflow"><span><b>1</b> Find patient</span><span><b>2</b> Pick & check medicines</span><span><b>3</b> Record & hand over</span></div>
    {error && <div className="gd-alert danger" role="alert"><strong>Could not update prescriptions.</strong> {error}{board && ' Showing the last loaded list.'} <button className="gd-button secondary" onClick={reload}>Try again</button></div>}
    <section className="gd-panel">
      <label className="pq-search-label" htmlFor="patient-search">Find a patient or prescription</label>
      <div className="pq-search-line"><input id="patient-search" className="gd-input" type="search" placeholder="Patient name, patient ID or RX number" value={search} onChange={e => update('q', e.target.value)} />{search && <button className="gd-button secondary" onClick={() => update('q', '')}>Clear search</button>}</div>
      <div className="pq-view-filters" role="group" aria-label="Prescription status">{filters.map(item => <button key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => update('view', item.key)}>{item.label}<span>{board ? groups[item.key].filter(matching).length : '—'}</span></button>)}</div>
      <div className="pq-list-caption"><span>{filter === 'waiting' ? 'Oldest prescriptions first • Includes unfinished medicines' : filter === 'ready' ? 'Medicine recorded • Physical handover still needs confirmation' : filter === 'completed' ? 'Completed handovers • Open a record to reprint instructions' : 'Search across every stage of the prescription'}</span><span>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
      {!board ? <div className="pq-empty" role="status">{loading ? 'Loading prescriptions…' : 'The prescription list is unavailable. Try again above.'}</div> : rows.length ? <div className="pq-patient-list">{rows.map(rx => <article className="pq-patient-row" key={rx.prescriptionId}>
        <div className="pq-patient-info"><h2>{rx.patientName}</h2><p><strong>{rx.code}</strong> · {rx.patientId || 'Temporary patient'}</p><small>Dr. {rx.doctorName} · Issued {formatDateTime(rx.issuedAt)}</small></div>
        <div className="pq-medicine-summary"><span className={`pq-status ${rx.status.toLowerCase()}`}>{statusLabel(rx.status)}</span><p>{rx.itemCount === 0 ? 'No medicines on prescription — check with doctor' : rx.status === 'Pending' || rx.status === 'Preparing' ? `${rx.pendingItemCount} of ${rx.itemCount} medicines still to prepare` : `${rx.itemCount} medicine${rx.itemCount === 1 ? '' : 's'} recorded`}</p><small>{rx.items.map(item => item.medicine).join(' · ')}</small></div>
        <Link className={`gd-button ${rx.status === 'Collected' ? 'secondary' : 'primary'}`} aria-label={`${rx.status === 'Dispensed' ? 'Check handover' : rx.status === 'Collected' ? 'View record' : 'Open prescription'} for ${rx.patientName}, ${rx.code}`} to={`/pharmacy/dispensing/${rx.prescriptionId}`}>{rx.status === 'Dispensed' ? 'Check handover →' : rx.status === 'Collected' ? 'View record' : rx.status === 'Preparing' ? 'Continue picking →' : 'Open prescription →'}</Link>
      </article>)}</div> : <div className="pq-empty"><h2>{search ? 'No matching prescriptions in this view' : filter === 'waiting' ? 'No medicines waiting to be prepared' : filter === 'ready' ? 'No handovers waiting' : 'No prescriptions in this view'}</h2><p>{search ? 'Check the spelling or RX number, or search all prescriptions.' : 'New prescriptions from the doctor appear here automatically.'}</p>{search && filter !== 'all' && <button className="gd-button secondary" onClick={() => update('view', 'all')}>Search all prescriptions</button>}</div>}
    </section>
    <p className="gd-muted">Updates every 15 seconds while this page is visible. If a prescription has not arrived, check with the doctor that it was submitted.</p>
  </main>;
}
