import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPrescription, downloadPrescriptionPdf, displayDetailPatient } from '../../lib/prescriptions';
import type { PrescriptionDetail, PrescriptionItemDetail } from '../../lib/prescriptions';
import { getBatchSuggestions, dispensePrescription, downloadDispenseLabel, getPharmacyQueue, collectPrescription } from '../../lib/pharmacy';
import type { BatchSuggestion, BatchOption, DispenseItemInput } from '../../lib/pharmacy';
import { formatDateTime } from '../prescriptions/patientUtils';
import './guidedDispensing.css';

type Selection = { batchId: number; qty: string; reason: string };
const remaining = (item: PrescriptionItemDetail) => Math.max(0, item.qty - item.external_qty - item.dispensed_qty);
const externalOnly = (item: PrescriptionItemDetail) => item.external_qty >= item.qty;
const code = (id: number) => `RX${String(id).padStart(6, '0')}`;
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const message = (error: unknown) => {
  const value = error as { response?: { data?: { message?: string } }; message?: string };
  return value.response?.data?.message || value.message || 'Something went wrong. Please try again.';
};

function DispensingPicker() {
  const [board, setBoard] = useState<Awaited<ReturnType<typeof getPharmacyQueue>> | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(() => getPharmacyQueue().then(data => { setBoard(data); setError(''); }).catch(e => setError(message(e))), []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const waiting = [...(board?.Preparing ?? []), ...(board?.Pending ?? [])]
    .filter(rx => rx.pendingItemCount > 0)
    .filter(rx => `${rx.code} ${rx.patientName} ${rx.doctorName}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="gd-page">
    <div className="gd-heading"><div><span className="gd-eyebrow">PHARMACY</span><h1>Give medicine</h1><p>Choose a waiting prescription. Full and partial quantities are handled on the same screen.</p></div><Link className="gd-button secondary" to="/pharmacy/queue">View queue</Link></div>
    {error && <div className="gd-alert danger" role="alert">{error}</div>}
    <section className="gd-panel"><div className="gd-section-heading"><h2>Waiting prescriptions</h2><button type="button" className="gd-button secondary" onClick={() => void refresh()}>Refresh list</button></div><input className="gd-input gd-search" aria-label="Search prescriptions" placeholder="Search patient or prescription number" value={search} onChange={e => setSearch(e.target.value)} />
      {!board && !error ? <p>Loading prescriptions…</p> : waiting.length ? <div className="gd-picker-list">{waiting.map(rx => <Link key={rx.prescriptionId} to={`/pharmacy/dispensing/${rx.prescriptionId}`} className="gd-picker-row"><span><strong>{rx.patientName}</strong><small>{rx.code} · Dr. {rx.doctorName}</small></span><span>{rx.pendingItemCount} medicine{rx.pendingItemCount === 1 ? '' : 's'} waiting</span><b>Open →</b></Link>)}</div> : <p className="gd-muted">No matching prescriptions are waiting.</p>}
    </section>
  </main>;
}

function MedicineChecklistRow({ item, batches, choice, expanded, externalMarked, onChoose, onChange, onClear, onExpand, onExternal }:
  { item: PrescriptionItemDetail; batches: BatchOption[]; choice?: Selection; expanded: boolean; externalMarked: boolean;
    onChoose: (batchId: number) => void; onChange: (field: 'qty' | 'reason', value: string) => void;
    onClear: () => void; onExpand: () => void; onExternal: (checked: boolean) => void }) {
  const balance = remaining(item);
  const recommendedFull = batches.find(batch => batch.qtyOnHand >= balance);
  const pickedBatch = batches.find(batch => batch.batchId === choice?.batchId);
  const firstUsable = batches.find(batch => batch.qtyOnHand >= Number(choice?.qty || balance));
  const done = !!item.dispensed_at;
  return <article className={`gd-medicine ${choice || externalMarked ? 'chosen' : ''}`}>
    <div className="gd-medicine-top"><div><h3>{item.medicine.name}</h3><p>{[item.dosage, item.frequency, item.duration, item.route, item.instructions].filter(Boolean).join(' · ') || 'No instructions recorded'}</p></div><span className="gd-pill">{done ? 'Already recorded' : choice || externalMarked ? 'Picked' : item.dispensed_qty > 0 ? 'Partly given' : externalOnly(item) ? 'External' : 'To pick'}</span></div>
    <p className="gd-need-line"><strong>{balance} {item.medicine.unit} needed now</strong>{item.dispensed_qty > 0 && <> · {item.dispensed_qty} already recorded</>}{item.external_qty > 0 && <> · {item.external_qty} to obtain outside</>}</p>
    {done ? <p className="gd-muted">Already recorded. No further action needed.</p> : externalOnly(item) ? <label className="gd-pick-row"><input type="checkbox" checked={externalMarked} onChange={e => onExternal(e.target.checked)} /><span><strong>Confirmed obtained outside the clinic</strong><small>No clinic medicine or stock is used.</small></span></label> : <>
      {(recommendedFull || choice) && <label className="gd-pick-row"><input type="checkbox" checked={!!choice} onChange={e => e.target.checked ? recommendedFull && onChoose(recommendedFull.batchId) : onClear()} /><span><strong>I picked {choice ? `${choice.qty} ` : `${balance} `}{item.medicine.unit}</strong><small>{choice && pickedBatch ? `Batch ${pickedBatch.batchNo} · Expires ${date(pickedBatch.expiryDate)}` : recommendedFull ? `Use batch ${recommendedFull.batchNo} · Expires ${date(recommendedFull.expiryDate)}. Check the package.` : 'Check the selected batch below.'}</small></span></label>}
      {!recommendedFull && <div className="gd-alert neutral">{batches.length ? `No single batch has all ${balance} ${item.medicine.unit}. Give part now, then return for the rest, or leave it waiting.` : 'No usable clinic stock is available. Leave this medicine waiting and arrange stock.'}</div>}
      {batches.length > 0 && <button type="button" className="gd-link gd-exception-toggle" aria-expanded={expanded} onClick={onExpand}>{expanded ? 'Hide stock options' : recommendedFull ? 'Change batch or give part' : 'Give part / view available batches'}</button>}
      {expanded && batches.length > 0 && <div className="gd-exception"><div className="gd-batch-heading"><strong>Available batches</strong><span>Choose the package you actually picked. Earliest usable expiry is preferred.</span></div><div className="gd-batches">{batches.map(batch => <label className={`gd-batch ${choice?.batchId === batch.batchId ? 'active' : ''}`} key={batch.batchId}><input type="radio" name={`batch-${item.rx_item_id}`} checked={choice?.batchId === batch.batchId} onChange={() => onChoose(batch.batchId)} /><span><strong>{batch.batchNo}</strong><small>Expires {date(batch.expiryDate)} · {batch.qtyOnHand} {item.medicine.unit} available</small></span>{batch.batchId === firstUsable?.batchId && <em>Earliest usable</em>}</label>)}</div>
        {choice && pickedBatch && <div className="gd-quantity-entry"><label>Quantity giving now <input className="gd-input" type="number" min="1" max={Math.min(balance, pickedBatch.qtyOnHand)} step="1" value={choice.qty} onChange={e => onChange('qty', e.target.value)} /></label><span>Still waiting after this: <strong>{Math.max(0, balance - (Number(choice.qty) || 0))} {item.medicine.unit}</strong></span><button type="button" className="gd-link" onClick={onClear}>Not giving this now</button></div>}
        {choice && pickedBatch && firstUsable?.batchId !== pickedBatch.batchId && <label className="gd-reason">Why not the earliest usable batch? <span>(required)</span><textarea className="gd-input" rows={2} maxLength={200} placeholder="For example: earlier batch is damaged" value={choice.reason} onChange={e => onChange('reason', e.target.value)} /></label>}
      </div>}
    </>}
  </article>;
}

function DispensingWorkspace({ prescriptionId }: { prescriptionId: number }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PrescriptionDetail | null>(null);
  const [suggestions, setSuggestions] = useState<BatchSuggestion[]>([]);
  const [selected, setSelected] = useState<Record<number, Selection>>({});
  const [externalSelected, setExternalSelected] = useState<number[]>([]);
  const [patientChecked, setPatientChecked] = useState(false);
  const [expandedItems, setExpandedItems] = useState<number[]>([]);
  const [review, setReview] = useState<DispenseItemInput[] | null>(null);
  const [partialAcknowledged, setPartialAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [collectBusy, setCollectBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [needsReload, setNeedsReload] = useState(false);

  const load = async () => {
    const [rx, batchOptions] = await Promise.all([getPrescription(prescriptionId), getBatchSuggestions(prescriptionId)]);
    setDetail(rx); setSuggestions(batchOptions);
    return rx;
  };
  useEffect(() => {
    let active = true;
    Promise.all([getPrescription(prescriptionId), getBatchSuggestions(prescriptionId)])
      .then(([rx, options]) => { if (active) { setDetail(rx); setSuggestions(options); } })
      .catch(e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [prescriptionId]);

  const optionsByItem = useMemo(() => new Map(suggestions.map(s => [s.rxItemId, s])), [suggestions]);
  const patient = detail ? displayDetailPatient(detail) : null;
  const finished = detail?.status === 'Dispensed' || detail?.status === 'Collected';
  const pending = detail?.items.filter(item => !item.dispensed_at) ?? [];
  const recorded = detail?.items.flatMap(item => item.dispenses.map(event => ({ ...event, instructions: [item.dosage, item.frequency, item.duration, item.route, item.instructions].filter(Boolean).join(' · ') }))) ?? [];
  const selectedCount = Object.keys(selected).length + externalSelected.length;
  const reviewHasUnfinished = !!review && pending.some(item => {
    const line = review.find(entry => entry.rx_item_id === item.rx_item_id);
    return !line || (!externalOnly(item) && (line.qty ?? 0) < remaining(item));
  });

  const chooseBatch = (item: PrescriptionItemDetail, batchId: number) => {
    const batch = optionsByItem.get(item.rx_item_id)?.batches.find(b => b.batchId === batchId);
    if (!batch) return;
    setSelected(old => ({ ...old, [item.rx_item_id]: { batchId, qty: String(Math.min(remaining(item), batch.qtyOnHand)), reason: old[item.rx_item_id]?.reason ?? '' } }));
    setError('');
  };
  const updateSelection = (id: number, field: 'qty' | 'reason', value: string) =>
    setSelected(old => old[id] ? { ...old, [id]: { ...old[id], [field]: value } } : old);
  const leave = () => {
    if (selectedCount && !window.confirm('Leave without saving these medicine selections? No stock has changed yet.')) return;
    navigate('/pharmacy/queue');
  };
  const prepareReview = () => {
    if (!detail || !patientChecked) { setError('First confirm that you checked the patient and prescription.'); return; }
    const payload: DispenseItemInput[] = [];
    for (const item of pending) {
      if (externalOnly(item)) {
        if (externalSelected.includes(item.rx_item_id)) payload.push({ rx_item_id: item.rx_item_id });
        continue;
      }
      const choice = selected[item.rx_item_id];
      if (!choice) continue;
      const qty = Number(choice.qty);
      const batchOptions = optionsByItem.get(item.rx_item_id)?.batches ?? [];
      const batch = batchOptions.find(b => b.batchId === choice.batchId);
      if (!batch || !Number.isInteger(qty) || qty < 1 || qty > remaining(item) || qty > batch.qtyOnHand) {
        setExpandedItems(old => old.includes(item.rx_item_id) ? old : [...old, item.rx_item_id]);
        setError(`Check the quantity and batch for ${item.medicine.name}. Enter a whole number no larger than the needed or available quantity.`); return;
      }
      const firstUsable = batchOptions.find(b => b.qtyOnHand >= qty);
      if (firstUsable?.batchId !== batch.batchId && !choice.reason.trim()) {
        setExpandedItems(old => old.includes(item.rx_item_id) ? old : [...old, item.rx_item_id]);
        setError(`Explain why you are not using the earliest usable batch for ${item.medicine.name}.`); return;
      }
      payload.push({ rx_item_id: item.rx_item_id, batch_id: batch.batchId, qty, override_reason: choice.reason.trim() || undefined });
    }
    if (!payload.length) { setError('Choose a batch and quantity for at least one medicine, or mark an external item as handled.'); return; }
    setError(''); setPartialAcknowledged(false); setReview(payload);
  };
  const confirm = async () => {
    if (!detail || !review) return;
    setBusy(true); setError('');
    try {
      await dispensePrescription(detail.prescription_id, review);
      setSelected({}); setExternalSelected([]); setPatientChecked(false); setReview(null);
      setSuccess('Medicine recorded. Refreshing the prescription…');
      try {
        const latest = await load();
        setSuccess(latest.status === 'Dispensed' ? 'All medicines recorded. Mark handed over when you give them to the patient.' : 'Selected medicines recorded. Unticked or remaining medicines are still waiting.');
      } catch (refreshError) {
        setNeedsReload(true);
        setError(`Medicine was recorded, but this page could not refresh: ${message(refreshError)}. Reload before taking another action.`);
      }
    } catch (e) { setError(message(e)); setReview(null); }
    finally { setBusy(false); }
  };
  const print = async (kind: 'label' | 'prescription') => {
    if (!detail) return;
    setPrinting(true); setError('');
    try {
      if (kind === 'label') await downloadDispenseLabel(detail.prescription_id, code(detail.prescription_id));
      else await downloadPrescriptionPdf(detail.prescription_id, code(detail.prescription_id));
    } catch (e) { setError(message(e)); }
    finally { setPrinting(false); }
  };
  const markHandedOver = async () => {
    if (!detail || detail.status !== 'Dispensed') return;
    if (!window.confirm(`Have you handed all recorded medicines to ${patient?.fullName || 'the patient'}?`)) return;
    setCollectBusy(true); setError('');
    try {
      await collectPrescription(detail.prescription_id);
      try { await load(); setSuccess('Handover recorded. This prescription is complete.'); }
      catch (refreshError) { setNeedsReload(true); setError(`Handover was saved, but the page could not refresh: ${message(refreshError)}. Reload before taking another action.`); }
    } catch (e) { setError(message(e)); }
    finally { setCollectBusy(false); }
  };

  if (loading) return <main className="gd-page gd-loading">Loading prescription…</main>;
  if (!detail || !patient) return <main className="gd-page"><div className="gd-alert danger" role="alert">{error || 'Prescription not found.'}</div><Link to="/pharmacy/queue">Return to queue</Link></main>;

  return <main className="gd-page">
    <div className="gd-heading"><div><span className="gd-eyebrow">{code(detail.prescription_id)} · {detail.status}</span><h1>{finished ? 'Medicine record' : `Give medicine to ${patient.fullName}`}</h1><p>{detail.status === 'Collected' ? 'The handover is complete. The details below are read-only.' : detail.status === 'Dispensed' ? 'All medicines are recorded. Confirm the physical handover below.' : 'Check the patient, choose what you are giving now, then review before stock changes.'}</p></div><button className="gd-button secondary" onClick={leave}>← Back to queue</button></div>
    {error && <div className="gd-alert danger" role="alert">{error}</div>}{success && <div className="gd-alert success" role="status">{success}</div>}

    <section className="gd-panel gd-patient"><div><span className="gd-eyebrow">PATIENT & PRESCRIPTION</span><h2>{patient.fullName}</h2><p>{patient.patientId || 'Temporary patient'} · {patient.phone || 'No phone'} · Dr. {detail.consultation.appointment.doctor.username}</p><p>Issued {formatDateTime(detail.issued_at)}</p></div><div className="gd-patient-side"><div className={`gd-alert ${patient.allergies ? 'danger' : 'neutral'}`}><strong>Allergies</strong><br />{patient.allergies || 'None recorded — ask the patient to confirm.'}</div>{detail.notes && <div className="gd-alert neutral"><strong>Doctor’s note</strong><br />{detail.notes}</div>}</div></section>

    {needsReload ? <div className="gd-panel"><h2>Reload before continuing</h2><p>The medicine was recorded, but the latest prescription details could not be loaded. Do not record it again from this page.</p><button className="gd-button primary" onClick={() => window.location.reload()}>Reload prescription</button></div> : finished ? <>
      <div className={`gd-alert ${detail.status === 'Collected' ? 'success' : 'neutral'}`}><strong>{detail.status === 'Collected' ? 'Handed to patient' : 'Medicine recorded — waiting for handover'}</strong><br />{detail.status === 'Collected' ? 'This prescription is complete.' : 'Check the patient and medicine one last time, then record the handover below.'}</div>
      <section className="gd-panel"><h2>Medicines on this prescription</h2><div className="gd-list">{detail.items.map(item => <div className="gd-record" key={item.rx_item_id}><div><strong>{item.medicine.name}</strong><small>Prescribed {item.qty} {item.medicine.unit} · Clinic {item.dispensed_qty} · External {item.external_qty}</small></div><span className="gd-pill">Complete</span></div>)}</div></section>
      {detail.status === 'Dispensed' && <div className="gd-handover"><div><strong>Have you given the medicines to this patient?</strong><span>Only mark handed over after the physical handoff.</span></div><button className="gd-button primary" disabled={collectBusy} onClick={() => void markHandedOver()}>{collectBusy ? 'Saving handover…' : 'Mark handed over'}</button></div>}
      {detail.status === 'Collected' && <div className="gd-alert neutral">Reception handles the patient invoice and payment separately. This screen prints medicine instructions, not a bill.</div>}
    </> : <>
      <nav className="gd-steps" aria-label="Steps to record medicine"><span className={patientChecked ? 'done' : 'current'}>1 <b>Check patient</b></span><span className={patientChecked ? 'current' : ''}>2 <b>Pick and tick medicines</b></span><span className={review ? 'current' : ''}>3 <b>Review and record</b></span></nav>
      <label className="gd-check-row"><input type="checkbox" checked={patientChecked} onChange={e => setPatientChecked(e.target.checked)} /><span>I checked this patient’s identity and allergies against the prescription.</span></label>
      <section className="gd-panel"><div className="gd-section-heading"><div><h2>Pick medicines one by one</h2><p>Take each medicine from the shown batch, check its expiry, then tick it. Unticked medicines stay waiting.</p></div><span className="gd-pill">{selectedCount} of {pending.length} ticked</span></div>
        <div className="gd-list">{detail.items.map(item => <MedicineChecklistRow key={item.rx_item_id} item={item} batches={optionsByItem.get(item.rx_item_id)?.batches ?? []} choice={selected[item.rx_item_id]} expanded={expandedItems.includes(item.rx_item_id)} externalMarked={externalSelected.includes(item.rx_item_id)} onChoose={batchId => chooseBatch(item, batchId)} onChange={(field, value) => updateSelection(item.rx_item_id, field, value)} onClear={() => setSelected(old => { const next = { ...old }; delete next[item.rx_item_id]; return next; })} onExpand={() => setExpandedItems(old => old.includes(item.rx_item_id) ? old.filter(id => id !== item.rx_item_id) : [...old, item.rx_item_id])} onExternal={checked => setExternalSelected(old => checked ? [...old, item.rx_item_id] : old.filter(id => id !== item.rx_item_id))} />)}</div>
      </section>
      <div className="gd-bottom"><span>{selectedCount} of {pending.length} waiting medicines ticked</span><button className="gd-button primary" onClick={prepareReview} disabled={!patientChecked || !selectedCount}>Review full list →</button></div>
    </>}

    {!needsReload && <section className="gd-panel"><div className="gd-section-heading"><div><h2>What has already been recorded</h2><p>Each recorded clinic batch is shown separately, including earlier partial quantities.</p></div></div>{recorded.length ? <div className="gd-list">{recorded.map(event => <div className="gd-record" key={event.dispense_id}><div><strong>{event.batch.medicine.name} · {event.qty} {event.batch.medicine.unit}</strong><small>Batch {event.batch.batch_no} · Expires {date(event.batch.expiry_date)} · Recorded {date(event.dispensed_at)}</small>{event.instructions && <small>{event.instructions}</small>}</div></div>)}</div> : <p className="gd-muted">No clinic medicine recorded yet.</p>}
      <div className="gd-actions"><button className="gd-button secondary" disabled={printing} onClick={() => void print('prescription')}>Print prescription</button>{recorded.length > 0 && <button className="gd-button secondary" disabled={printing} onClick={() => void print('label')}>Print medicine label</button>}</div>
    </section>}

    {review && <div className="gd-modal-backdrop" role="presentation" onClick={() => !busy && setReview(null)}><div className="gd-modal" role="dialog" aria-modal="true" aria-labelledby="gd-review-title" onClick={e => e.stopPropagation()}>
      <span className="gd-eyebrow">FINAL CHECK</span><h2 id="gd-review-title">Review the full prescription</h2>
      <p>Patient: <strong>{patient.fullName}</strong> · {code(detail.prescription_id)}</p>
      {patient.allergies && <div className="gd-alert danger"><strong>Allergies: {patient.allergies}</strong></div>}
      <div className="gd-review-list">{detail.items.map(item => {
        const line = review.find(entry => entry.rx_item_id === item.rx_item_id);
        const batch = optionsByItem.get(item.rx_item_id)?.batches.find(option => option.batchId === line?.batch_id);
        const left = line?.batch_id ? remaining(item) - (line.qty ?? 0) : remaining(item);
        return <div key={item.rx_item_id}>
          <strong>{item.medicine.name}</strong>
          <span>{item.dispensed_at ? 'Already completed before this visit' : !line ? 'Not giving now' : line.batch_id ? `Give ${line.qty} ${item.medicine.unit} · Batch ${batch?.batchNo} · Expires ${batch ? date(batch.expiryDate) : '—'}` : 'Confirmed obtained outside clinic — no stock used'}</span>
          <small>{!item.dispensed_at && !line ? 'Not recorded now — still needs action' : !item.dispensed_at && left > 0 ? `${left} ${item.medicine.unit} still waiting` : 'No quantity waiting after this'}</small>
        </div>;
      })}</div>
      {reviewHasUnfinished && <label className="gd-check-row gd-partial-check"><input type="checkbox" checked={partialAcknowledged} onChange={e => setPartialAcknowledged(e.target.checked)} /><span>I understand that unticked or remaining medicines will stay waiting. Tell the patient what is missing.</span></label>}
      <div className="gd-alert neutral">Confirming records the selected medicines and reduces clinic stock immediately. It does not mark them handed to the patient.</div>
      <div className="gd-actions"><button className="gd-button secondary" disabled={busy} onClick={() => setReview(null)}>Go back and correct</button><button className="gd-button primary" disabled={busy || (reviewHasUnfinished && !partialAcknowledged)} onClick={() => void confirm()}>{busy ? 'Recording…' : 'Confirm and record'}</button></div>
    </div></div>}
  </main>;
}

export default function Dispensing() {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const id = Number(prescriptionId);
  return prescriptionId ? Number.isInteger(id) && id > 0 ? <DispensingWorkspace key={id} prescriptionId={id} /> : <main className="gd-page">Invalid prescription number.</main> : <DispensingPicker />;
}
