import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { useAuth } from '../../context/AuthContext';
import { getPrescription, downloadPrescriptionPdf } from '../../lib/prescriptions';
import type { PrescriptionDetail, PrescriptionItemDetail } from '../../lib/prescriptions';
import { getBatchSuggestions, dispensePrescription, downloadDispenseLabel, getPharmacyQueue } from '../../lib/pharmacy';
import type { BatchSuggestion, DispenseItemInput } from '../../lib/pharmacy';
import {
  ClipboardIcon,
  PatientsIcon,
  PrintIcon,
  ChevronLeftIcon,
  SendIcon,
  SaveIcon,
  RefreshIcon,
  XCircleIcon,
  UsersIcon,
  SearchIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge, formatDateTime } from '../prescriptions/patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../prescriptions/prescriptions.css';
import './dispensing.css';

const isExternal = (item: PrescriptionItemDetail) => item.external_qty >= item.qty;

type ItemStatus = 'Dispensed' | 'External' | 'Insufficient' | 'Ready' | 'Pending';

const STATUS_STYLE: Record<ItemStatus, string> = {
  Dispensed: 'badge-green',
  External: 'badge-purple',
  Insufficient: 'badge-red',
  Ready: 'badge-green',
  Pending: 'badge-amber',
};

interface Staged {
  batchId: number;
  overrideReason: string;
}

const DispensingPicker = () => {
  const { data: board, loading } = useApiData(() => getPharmacyQueue(), []);
  const [search, setSearch] = useState('');
  const inProgress = [...(board?.Preparing ?? []), ...(board?.Pending ?? [])];
  const filtered = inProgress.filter((rx) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return `${rx.code} ${rx.patientName} ${rx.doctorName}`.toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#16a34a', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Dispensing
          </h1>
          <p>Choose a prescription to dispense medicines against, using FEFO (First Expiry First Out).</p>
        </div>
      </div>
      <div className="pat-search" style={{ maxWidth: 320, marginBottom: 14 }}>
        <SearchIcon />
        <input placeholder="Search prescription, patient…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Rx No.</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="pat-empty">
                    Nothing waiting to be dispensed right now.
                  </td>
                </tr>
              )}
              {filtered.map((rx) => (
                <tr key={rx.prescriptionId}>
                  <td>
                    <Link className="pat-id-link" to={`/pharmacy/dispensing/${rx.prescriptionId}`}>
                      {rx.code}
                    </Link>
                  </td>
                  <td>{rx.patientName}</td>
                  <td>Dr. {rx.doctorName}</td>
                  <td>
                    <span className={`badge ${rx.status === 'Preparing' ? 'badge-blue' : 'badge-amber'}`}>{rx.status}</span>
                  </td>
                  <td>{rx.itemCount}</td>
                  <td>
                    <Link className="pat-btn" to={`/pharmacy/dispensing/${rx.prescriptionId}`}>
                      Dispense
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DispensingWorkspace = ({ prescriptionId }: { prescriptionId: number }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<PrescriptionDetail | null>(null);
  const [suggestions, setSuggestions] = useState<BatchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedRxItemId, setSelectedRxItemId] = useState<number | null>(null);
  const [staged, setStaged] = useState<Record<number, Staged>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'all' | 'partial' | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, s] = await Promise.all([getPrescription(prescriptionId), getBatchSuggestions(prescriptionId)]);
      setDetail(d);
      setSuggestions(s);
    } catch (err: any) {
      setLoadError(err.response?.data?.message || 'Failed to load this prescription.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setStaged({});
    setSelectedRxItemId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptionId]);

  const suggestionByItemId = useMemo(() => new Map(suggestions.map((s) => [s.rxItemId, s])), [suggestions]);

  const itemStatus = (item: PrescriptionItemDetail): ItemStatus => {
    if (item.dispensed_at) return 'Dispensed';
    if (isExternal(item)) return 'External';
    const sugg = suggestionByItemId.get(item.rx_item_id);
    const hasSufficientBatch = sugg?.batches.some((b) => b.qtyOnHand >= item.qty) ?? false;
    if (!sugg || !hasSufficientBatch) return 'Insufficient';
    return staged[item.rx_item_id] ? 'Ready' : 'Pending';
  };

  const isReadyForSubmit = (item: PrescriptionItemDetail) => isExternal(item) || !!staged[item.rx_item_id];

  const pendingItems = useMemo(() => (detail ? detail.items.filter((i) => !i.dispensed_at) : []), [detail]);
  const allReady = pendingItems.length > 0 && pendingItems.every(isReadyForSubmit);
  const anyReady = pendingItems.some(isReadyForSubmit);

  const selectedItem = detail?.items.find((i) => i.rx_item_id === selectedRxItemId) ?? null;
  const selectedSuggestion = selectedItem ? suggestionByItemId.get(selectedItem.rx_item_id) ?? null : null;
  const fefoBatchId = selectedSuggestion?.batches[0]?.batchId ?? null;

  const handleSelectRow = (item: PrescriptionItemDetail) => {
    const status = itemStatus(item);
    if (status === 'Dispensed' || status === 'External') return;
    setSelectedRxItemId(item.rx_item_id);
  };

  const handlePickBatch = (rxItemId: number, batchId: number) => {
    setStaged((prev) => ({ ...prev, [rxItemId]: { batchId, overrideReason: prev[rxItemId]?.overrideReason ?? '' } }));
  };

  const handleNotesChange = (rxItemId: number, text: string) => {
    setStaged((prev) => ({ ...prev, [rxItemId]: { batchId: prev[rxItemId]?.batchId ?? 0, overrideReason: text } }));
  };

  const buildPayload = (items: PrescriptionItemDetail[]): DispenseItemInput[] | null => {
    const payload: DispenseItemInput[] = [];
    for (const item of items) {
      if (isExternal(item)) {
        payload.push({ rx_item_id: item.rx_item_id });
        continue;
      }
      const s = staged[item.rx_item_id];
      if (!s) return null;
      const sugg = suggestionByItemId.get(item.rx_item_id);
      const isFefo = sugg?.batches[0]?.batchId === s.batchId;
      if (!isFefo && !s.overrideReason.trim()) {
        setError(`"${item.medicine.name}" uses a non-earliest-expiry batch — an override reason is required before dispensing.`);
        return null;
      }
      payload.push({ rx_item_id: item.rx_item_id, batch_id: s.batchId, override_reason: s.overrideReason.trim() || undefined });
    }
    return payload;
  };

  const submit = async (mode: 'all' | 'partial') => {
    if (!detail) return;
    setError(null);
    const items = mode === 'all' ? pendingItems : pendingItems.filter(isReadyForSubmit);
    if (items.length === 0) return;
    const payload = buildPayload(items);
    if (!payload) return;

    setSubmitting(mode);
    try {
      await dispensePrescription(detail.prescription_id, payload);
      await load();
      setStaged({});
      setSelectedRxItemId(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Dispensing failed.');
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancel = () => {
    if (Object.keys(staged).length > 0 && !window.confirm('Discard your unsaved batch selections?')) return;
    navigate('/pharmacy/queue');
  };

  const handlePrint = async () => {
    if (!detail) return;
    setPrinting(true);
    try {
      await downloadPrescriptionPdf(detail.prescription_id, `RX${String(detail.prescription_id).padStart(6, '0')}`);
    } catch {
      setError('Failed to download the prescription PDF.');
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!detail) return;
    setPrintingLabel(true);
    try {
      await downloadDispenseLabel(detail.prescription_id, `RX${String(detail.prescription_id).padStart(6, '0')}`);
    } catch {
      setError('Failed to download the dispensing label.');
    } finally {
      setPrintingLabel(false);
    }
  };

  if (loading && !detail) {
    return <div className="disp-empty-state">Loading prescription…</div>;
  }
  if (loadError || !detail) {
    return <div className="disp-empty-state">{loadError || 'Prescription not found.'}</div>;
  }

  const totalPrescribed = detail.items.reduce((sum, i) => sum + i.qty, 0);
  const totalDispensed = detail.items.filter((i) => i.dispensed_at).reduce((sum, i) => sum + i.qty, 0);
  const totalPending = totalPrescribed - totalDispensed;
  const summaryStatus = detail.status === 'Dispensed' ? 'Completed' : allReady ? 'Ready to Complete' : 'In Progress';
  const summaryStatusCls = detail.status === 'Dispensed' || allReady ? 'badge-green' : 'badge-amber';

  const patient = detail.consultation.appointment.patient;
  const doctor = detail.consultation.appointment.doctor;

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#16a34a', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Dispensing
          </h1>
          <p>Dispense medicines against the prescription using FEFO (First Expiry First Out).</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => navigate('/pharmacy/queue')}>
            <ChevronLeftIcon /> Back to Queue
          </button>
          <button className="pat-btn" onClick={handlePrintLabel} disabled={printingLabel}>
            <PrintIcon /> {printingLabel ? 'Preparing…' : 'Print Label'}
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">{error}</div>}

      <div className="disp-topbar">
        <div className="disp-topbar-field">
          <span className="disp-topbar-label">Prescription No.</span>
          <span className="disp-topbar-value">RX{String(detail.prescription_id).padStart(6, '0')}</span>
        </div>
        <div className="disp-topbar-field">
          <span className="disp-topbar-label">Doctor</span>
          <span className="disp-topbar-value">Dr. {doctor.username}</span>
        </div>
        <div className="disp-topbar-field">
          <span className="disp-topbar-label">Date &amp; Time</span>
          <span className="disp-topbar-value">{formatDateTime(detail.issued_at)}</span>
        </div>
        <div className="disp-topbar-field">
          <span className="disp-topbar-label">Status</span>
          <span className={`badge ${detail.status === 'Dispensed' ? 'badge-green' : detail.status === 'Preparing' ? 'badge-blue' : 'badge-amber'}`}>
            {detail.status}
          </span>
        </div>
      </div>

      <div className="disp-layout">
        <div className="pat-table-card disp-col-items">
          <div className="card-header">
            <h3 className="card-title">
              <ClipboardIcon /> Prescription Items
            </h3>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine &amp; Instructions</th>
                  <th>Qty Prescribed</th>
                  <th>Qty to Dispense</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item, i) => {
                  const status = itemStatus(item);
                  const clickable = status !== 'Dispensed' && status !== 'External';
                  return (
                    <tr
                      key={item.rx_item_id}
                      className={`disp-item-row${!clickable ? ' disabled' : ''}${selectedRxItemId === item.rx_item_id ? ' active' : ''}`}
                      onClick={() => clickable && handleSelectRow(item)}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <div className="disp-item-med">{item.substituted_medicine?.name ?? item.medicine.name}</div>
                        <div className="disp-item-instr">
                          {[item.dosage, item.frequency, item.duration, item.route].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td>
                        <div className="disp-qty-box">
                          <span className="num">{item.qty}</span>
                          <span className="unit">{item.medicine.unit}</span>
                        </div>
                      </td>
                      <td>
                        <div className="disp-qty-box">
                          <span className="num">{isExternal(item) ? 0 : item.qty}</span>
                          <span className="unit">{item.medicine.unit}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_STYLE[status]}`}>{status === 'Insufficient' ? 'Insufficient Stock' : status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="disp-table-footer">
            <span>Total Items: {detail.items.length}</span>
            <span>Total Qty to Dispense: {detail.items.reduce((sum, i) => sum + (isExternal(i) ? 0 : i.qty), 0)}</span>
          </div>
        </div>

        <div className="pat-table-card disp-col-batch" style={{ padding: 16 }}>
          {!selectedItem && <div className="disp-batch-empty">Select a Pending item from the list to choose a batch.</div>}
          {selectedItem && (
            <>
              <div className="disp-batch-header">
                <button className="disp-batch-back" onClick={() => setSelectedRxItemId(null)}>
                  <ChevronLeftIcon />
                </button>
                Selected Item: {selectedItem.substituted_medicine?.name ?? selectedItem.medicine.name}
              </div>

              {itemStatus(selectedItem) === 'Insufficient' && (
                <div className="disp-batch-empty">
                  <XCircleIcon /> No batch currently holds enough stock ({selectedItem.qty} {selectedItem.medicine.unit} needed).
                </div>
              )}

              {itemStatus(selectedItem) !== 'Insufficient' && selectedSuggestion && (
                <>
                  <div className="disp-batch-required">Select Batch (FEFO) — Required Qty: {selectedItem.qty} {selectedItem.medicine.unit}</div>
                  <table className="disp-batch-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Batch No.</th>
                        <th>Expiry Date</th>
                        <th>Available</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSuggestion.batches.map((b) => {
                        const insufficient = b.qtyOnHand < selectedItem.qty;
                        const checked = staged[selectedItem.rx_item_id]?.batchId === b.batchId;
                        return (
                          <tr key={b.batchId} className={`disp-batch-row${insufficient ? ' insufficient' : ''}`}>
                            <td>
                              <input
                                type="radio"
                                name={`batch-${selectedItem.rx_item_id}`}
                                disabled={insufficient}
                                checked={checked}
                                onChange={() => handlePickBatch(selectedItem.rx_item_id, b.batchId)}
                              />
                            </td>
                            <td>{b.batchNo}</td>
                            <td>{formatDateTime(b.expiryDate).split(',')[0]}</td>
                            <td>{b.qtyOnHand}</td>
                            <td>{insufficient ? <span className="disp-batch-insufficient-tag">Insufficient</span> : checked ? selectedItem.qty : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="disp-total-line">
                    <span>Total to dispense for this item:</span>
                    <span>
                      {staged[selectedItem.rx_item_id] ? selectedItem.qty : 0} {selectedItem.medicine.unit}
                    </span>
                  </div>

                  <div>
                    <label className="disp-notes-label">
                      Dispensing Notes {staged[selectedItem.rx_item_id] && staged[selectedItem.rx_item_id].batchId !== fefoBatchId ? (
                        <span className="required">(Required — not the earliest-expiry batch)</span>
                      ) : (
                        '(Optional)'
                      )}
                    </label>
                    <div className="disp-notes">
                      <textarea
                        rows={3}
                        maxLength={200}
                        placeholder="Add notes about substitution, instructions given to patient, etc."
                        value={staged[selectedItem.rx_item_id]?.overrideReason ?? ''}
                        onChange={(e) => handleNotesChange(selectedItem.rx_item_id, e.target.value)}
                      />
                      <div className="disp-notes-count">{(staged[selectedItem.rx_item_id]?.overrideReason ?? '').length} / 200</div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="disp-col-sidebar">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <PatientsIcon /> Patient Information
              </h3>
            </div>
            <div className="disp-summary-grid">
              <div className="disp-summary-row">
                <span>Name</span>
                <span className="value">{patient.full_name}</span>
              </div>
              <div className="disp-summary-row">
                <span>PID</span>
                <span className="value">{patient.patient_id}</span>
              </div>
              <div className="disp-summary-row">
                <span>Age / Gender</span>
                <span className="value">
                  {calculateAge(patient.dob)} / {patient.gender}
                </span>
              </div>
              <div className="disp-summary-row">
                <span>Phone</span>
                <span className="value">{patient.phone || '—'}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Prescription Summary</h3>
            </div>
            <div className="disp-summary-grid">
              <div className="disp-summary-row">
                <span>Items</span>
                <span className="value">{detail.items.length}</span>
              </div>
              <div className="disp-summary-row">
                <span>Total Prescribed</span>
                <span className="value">{totalPrescribed}</span>
              </div>
              <div className="disp-summary-row">
                <span>Dispensed</span>
                <span className="value">{totalDispensed}</span>
              </div>
              <div className="disp-summary-row">
                <span>Pending</span>
                <span className={`value${totalPending > 0 ? ' warn' : ''}`}>{totalPending}</span>
              </div>
              <div className="disp-summary-status">
                <span className={`badge ${summaryStatusCls}`}>{summaryStatus}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Dispensing Pharmacist</h3>
            </div>
            <div className="disp-pharmacist-row">
              <div className="pat-avatar">{initials(user?.username ?? '?')}</div>
              <div>{user?.username}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Actions</h3>
            </div>
            <div className="disp-actions">
              <button className="pat-btn primary" disabled={!allReady || submitting !== null} onClick={() => submit('all')}>
                <SendIcon /> {submitting === 'all' ? 'Dispensing…' : 'Dispense All Items'}
              </button>
              <button className="pat-btn" disabled={!anyReady || allReady || submitting !== null} onClick={() => submit('partial')}>
                <SaveIcon /> {submitting === 'partial' ? 'Saving…' : 'Save as Partial'}
              </button>
              <button className="pat-btn" onClick={() => navigate('/pharmacy/queue')}>
                <RefreshIcon /> Hold / Return to Queue
              </button>
              <button className="pat-btn" onClick={handleCancel}>
                <XCircleIcon /> Cancel
              </button>
              <button className="pat-btn" onClick={handlePrint} disabled={printing} style={{ marginTop: 4 }}>
                <PrintIcon /> {printing ? 'Preparing…' : 'Print Prescription'}
              </button>
            </div>
          </div>
        </div>

        <div className="pat-table-card disp-col-history">
          <div className="card-header">
            <h3 className="card-title">Dispensed Items (This Prescription)</h3>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine</th>
                  <th>Batch No.</th>
                  <th>Expiry Date</th>
                  <th>Qty Dispensed</th>
                  <th>Unit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.filter((i) => i.dispensed_at).length === 0 && (
                  <tr>
                    <td colSpan={7} className="pat-empty">
                      Nothing dispensed yet for this prescription.
                    </td>
                  </tr>
                )}
                {detail.items
                  .filter((i) => i.dispensed_at)
                  .map((item, i) => (
                    <tr key={item.rx_item_id}>
                      <td>{i + 1}</td>
                      <td>{item.substituted_medicine?.name ?? item.medicine.name}</td>
                      <td>{item.batch?.batch_no ?? (isExternal(item) ? 'External Purchase' : '—')}</td>
                      <td>{item.batch ? formatDateTime(item.batch.expiry_date).split(',')[0] : '—'}</td>
                      <td>{item.qty}</td>
                      <td>{item.medicine.unit}</td>
                      <td>
                        <span className="badge badge-green">{isExternal(item) ? 'External' : 'Dispensed'}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {detail.items.length > 0 && (
            <div className="disp-table-footer">
              <span>Total Dispensed: {totalDispensed}</span>
              <span>{detail.status === 'Dispensed' ? 'All items dispensed ✓' : `${totalPending} qty remaining`}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Dispensing = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const id = prescriptionId ? Number(prescriptionId) : null;
  if (!id) return <DispensingPicker />;
  return <DispensingWorkspace key={id} prescriptionId={id} />;
};

export default Dispensing;
