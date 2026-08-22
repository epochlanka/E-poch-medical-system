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
  SaveIcon,
  RefreshIcon,
  XCircleIcon,
  SendIcon,
  SearchIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge, formatDateTime } from '../prescriptions/patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../prescriptions/prescriptions.css';
import './dispensing.css';

const isExternal = (item: PrescriptionItemDetail) => item.external_qty >= item.qty;
// Qty already handled for this line, whether drawn from clinic stock across one or more partial
// dispenses or covered by an external purchase — the two are mutually exclusive per item.
const alreadyDispensed = (item: PrescriptionItemDetail) => item.dispensed_qty + item.external_qty;
const balanceOf = (item: PrescriptionItemDetail) => Math.max(0, item.qty - alreadyDispensed(item));

type ItemStatus = 'Dispensed' | 'External' | 'Insufficient' | 'Partially Dispensed' | 'Ready' | 'Pending';

const STATUS_STYLE: Record<ItemStatus, string> = {
  Dispensed: 'badge-green',
  External: 'badge-purple',
  Insufficient: 'badge-red',
  'Partially Dispensed': 'badge-amber',
  Ready: 'badge-green',
  Pending: 'badge-gray',
};

interface Staged {
  batchId: number;
  qty: number;
  notes: string;
}

const PartialDispensePicker = () => {
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
              <SendIcon />
            </span>
            Partial Dispense
          </h1>
          <p>Dispense part of the prescribed quantity when full quantity is not available.</p>
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
                    <Link className="pat-id-link" to={`/pharmacy/partial-dispense/${rx.prescriptionId}`}>
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
                    <Link className="pat-btn" to={`/pharmacy/partial-dispense/${rx.prescriptionId}`}>
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

const PartialDispenseWorkspace = ({ prescriptionId }: { prescriptionId: number }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<PrescriptionDetail | null>(null);
  const [suggestions, setSuggestions] = useState<BatchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedRxItemId, setSelectedRxItemId] = useState<number | null>(null);
  const [staged, setStaged] = useState<Record<number, Staged>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
    const hasAnyStock = (sugg?.batches.length ?? 0) > 0;
    if (!sugg || !hasAnyStock) return 'Insufficient';
    if (staged[item.rx_item_id]) return 'Ready';
    if (alreadyDispensed(item) > 0) return 'Partially Dispensed';
    return 'Pending';
  };

  const isReadyForSubmit = (item: PrescriptionItemDetail) => isExternal(item) || !!staged[item.rx_item_id];

  const pendingItems = useMemo(() => (detail ? detail.items.filter((i) => !i.dispensed_at) : []), [detail]);
  const anyReady = pendingItems.some(isReadyForSubmit);

  const selectedItem = detail?.items.find((i) => i.rx_item_id === selectedRxItemId) ?? null;
  const selectedSuggestion = selectedItem ? suggestionByItemId.get(selectedItem.rx_item_id) ?? null : null;
  const selectedBalance = selectedItem ? balanceOf(selectedItem) : 0;
  const fefoBatchId = selectedSuggestion?.batches[0]?.batchId ?? null;
  const selectedStaged = selectedItem ? staged[selectedItem.rx_item_id] : undefined;

  const handleSelectRow = (item: PrescriptionItemDetail) => {
    const status = itemStatus(item);
    if (status === 'Dispensed' || status === 'External') return;
    setSelectedRxItemId(item.rx_item_id);
  };

  const handlePickBatch = (rxItemId: number, batchId: number, batchQtyOnHand: number, balance: number) => {
    setStaged((prev) => {
      const defaultQty = Math.max(1, Math.min(balance, batchQtyOnHand));
      const existing = prev[rxItemId];
      const qty = existing ? Math.max(1, Math.min(existing.qty, batchQtyOnHand, balance)) : defaultQty;
      return { ...prev, [rxItemId]: { batchId, qty, notes: existing?.notes ?? '' } };
    });
  };

  const handleQtyChange = (rxItemId: number, value: number, batchQtyOnHand: number, balance: number) => {
    const clamped = Math.max(1, Math.min(value || 1, batchQtyOnHand, balance));
    setStaged((prev) => (prev[rxItemId] ? { ...prev, [rxItemId]: { ...prev[rxItemId], qty: clamped } } : prev));
  };

  const handleNotesChange = (rxItemId: number, text: string) => {
    setStaged((prev) => (prev[rxItemId] ? { ...prev, [rxItemId]: { ...prev[rxItemId], notes: text } } : prev));
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
      if (!isFefo && !s.notes.trim()) {
        setError(`"${item.medicine.name}" uses a non-earliest-expiry batch — a note is required before dispensing.`);
        return null;
      }
      payload.push({
        rx_item_id: item.rx_item_id,
        batch_id: s.batchId,
        qty: s.qty,
        override_reason: s.notes.trim() || undefined,
        notes: s.notes.trim() || undefined,
      });
    }
    return payload;
  };

  const submit = async () => {
    if (!detail) return;
    setError(null);
    const items = pendingItems.filter(isReadyForSubmit);
    if (items.length === 0) return;
    const payload = buildPayload(items);
    if (!payload) return;

    setSubmitting(true);
    try {
      await dispensePrescription(detail.prescription_id, payload);
      await load();
      setStaged({});
      setSelectedRxItemId(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Dispensing failed.');
    } finally {
      setSubmitting(false);
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

  // "Now dispensing" per item: external lines not yet handled complete for their full remainder
  // the moment this save goes through; clinic lines only move by whatever qty is staged.
  const nowDispensing = (item: PrescriptionItemDetail) => {
    if (item.dispensed_at) return 0;
    if (isExternal(item)) return balanceOf(item);
    return staged[item.rx_item_id]?.qty ?? 0;
  };

  const totalPrescribed = detail.items.reduce((sum, i) => sum + i.qty, 0);
  const totalAlreadyDispensed = detail.items.reduce((sum, i) => sum + alreadyDispensed(i), 0);
  const totalNowDispensing = detail.items.reduce((sum, i) => sum + nowDispensing(i), 0);
  const totalDispensedProjected = totalAlreadyDispensed + totalNowDispensing;
  const totalBalanceProjected = totalPrescribed - totalDispensedProjected;
  const summaryStatus = totalBalanceProjected <= 0 ? 'Completed' : totalDispensedProjected > 0 ? 'Partially Dispensed' : 'Pending';
  const summaryStatusCls = totalBalanceProjected <= 0 ? 'badge-green' : totalDispensedProjected > 0 ? 'badge-amber' : 'badge-gray';

  const patient = detail.consultation.appointment.patient;
  const doctor = detail.consultation.appointment.doctor;

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#16a34a', verticalAlign: -2, display: 'inline-flex' }}>
              <SendIcon />
            </span>
            Partial Dispense
          </h1>
          <p>Dispense part of the prescribed quantity when full quantity is not available.</p>
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
          <span className={`badge ${summaryStatusCls}`}>{detail.status === 'Dispensed' ? 'Dispensed' : summaryStatus}</span>
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
                  <th>Prescribed</th>
                  <th>Dispensed</th>
                  <th>Balance</th>
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
                          <span className="num">{alreadyDispensed(item)}</span>
                          <span className="unit">{item.medicine.unit}</span>
                        </div>
                      </td>
                      <td>
                        <div className="disp-qty-box">
                          <span className="num">{balanceOf(item)}</span>
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
            <span>
              Total Prescribed: {totalPrescribed} · Total Dispensed: {totalAlreadyDispensed} · Total Balance:{' '}
              <strong>{totalPrescribed - totalAlreadyDispensed}</strong>
            </span>
          </div>
        </div>

        <div className="pat-table-card disp-col-batch" style={{ padding: 16 }}>
          {!selectedItem && <div className="disp-batch-empty">Select a Pending or Partially Dispensed item from the list to choose a batch.</div>}
          {selectedItem && (
            <>
              <div className="disp-batch-header">
                <button className="disp-batch-back" onClick={() => setSelectedRxItemId(null)}>
                  <ChevronLeftIcon />
                </button>
                Selected Item: {selectedItem.substituted_medicine?.name ?? selectedItem.medicine.name}
              </div>

              <div className="disp-batch-required">
                Prescribed: {selectedItem.qty} {selectedItem.medicine.unit} · Already Dispensed: {alreadyDispensed(selectedItem)}{' '}
                {selectedItem.medicine.unit} · Balance: {selectedBalance} {selectedItem.medicine.unit}
              </div>

              {itemStatus(selectedItem) === 'Insufficient' && (
                <div className="disp-batch-empty">
                  <XCircleIcon /> No batch currently holds any stock for this medicine.
                </div>
              )}

              {itemStatus(selectedItem) !== 'Insufficient' && selectedSuggestion && (
                <>
                  <div className="disp-batch-required">Select Batch (FEFO)</div>
                  <table className="disp-batch-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Batch No.</th>
                        <th>Mfg. Date</th>
                        <th>Expiry Date</th>
                        <th>Available</th>
                        <th>Qty to Dispense</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSuggestion.batches.map((b) => {
                        const checked = selectedStaged?.batchId === b.batchId;
                        return (
                          <tr key={b.batchId} className="disp-batch-row">
                            <td>
                              <input
                                type="radio"
                                name={`batch-${selectedItem.rx_item_id}`}
                                checked={checked}
                                onChange={() => handlePickBatch(selectedItem.rx_item_id, b.batchId, b.qtyOnHand, selectedBalance)}
                              />
                            </td>
                            <td>{b.batchNo}</td>
                            <td>—</td>
                            <td>{formatDateTime(b.expiryDate).split(',')[0]}</td>
                            <td>{b.qtyOnHand}</td>
                            <td>
                              {checked ? (
                                <input
                                  type="number"
                                  className="disp-qty-input"
                                  min={1}
                                  max={Math.min(b.qtyOnHand, selectedBalance)}
                                  value={selectedStaged.qty}
                                  onChange={(e) => handleQtyChange(selectedItem.rx_item_id, Number(e.target.value), b.qtyOnHand, selectedBalance)}
                                />
                              ) : (
                                <input type="number" className="disp-qty-input" value={0} disabled />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="disp-total-line" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total to dispense for this item:</span>
                      <span>
                        {selectedStaged?.qty ?? 0} {selectedItem.medicine.unit}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 400, color: '#64748b' }}>
                      <span>After this dispensing, balance will be:</span>
                      <span>
                        {Math.max(0, selectedBalance - (selectedStaged?.qty ?? 0))} {selectedItem.medicine.unit}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="disp-notes-label">
                      Notes {selectedStaged && selectedStaged.batchId !== fefoBatchId ? (
                        <span className="required">(Required — not the earliest-expiry batch)</span>
                      ) : (
                        '(Optional)'
                      )}
                    </label>
                    <div className="disp-notes">
                      <textarea
                        rows={3}
                        maxLength={200}
                        placeholder="Add notes about partial dispensing, reason, instructions given to patient, etc."
                        value={selectedStaged?.notes ?? ''}
                        onChange={(e) => handleNotesChange(selectedItem.rx_item_id, e.target.value)}
                      />
                      <div className="disp-notes-count">{(selectedStaged?.notes ?? '').length} / 200</div>
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
                <span>Total Dispensed</span>
                <span className="value">{totalDispensedProjected}</span>
              </div>
              <div className="disp-summary-row">
                <span>Balance</span>
                <span className={`value${totalBalanceProjected > 0 ? ' warn' : ''}`}>{totalBalanceProjected}</span>
              </div>
              <div className="disp-summary-status">
                <span className={`badge ${summaryStatusCls}`}>{summaryStatus}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Dispensing Information</h3>
            </div>
            <div className="disp-pharmacist-row">
              <div className="pat-avatar">{initials(user?.username ?? '?')}</div>
              <div>
                <div>{user?.username}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{formatDateTime(new Date().toISOString())}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Actions</h3>
            </div>
            <div className="disp-actions">
              <button className="pat-btn primary" disabled={!anyReady || submitting} onClick={submit}>
                <SaveIcon /> {submitting ? 'Saving…' : 'Save Partial Dispense'}
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
            <h3 className="card-title">Dispense Summary (This Prescription)</h3>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine</th>
                  <th>Prescribed</th>
                  <th>Already Dispensed</th>
                  <th>Now Dispensing</th>
                  <th>Total Dispensed</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item, i) => {
                  const already = alreadyDispensed(item);
                  const now = nowDispensing(item);
                  const total = already + now;
                  const bal = item.qty - total;
                  const rowStatus = bal <= 0 ? 'Completed' : total > 0 ? 'Partially Dispensed' : 'Pending';
                  const rowCls = bal <= 0 ? 'badge-green' : total > 0 ? 'badge-amber' : 'badge-gray';
                  return (
                    <tr key={item.rx_item_id}>
                      <td>{i + 1}</td>
                      <td>{item.substituted_medicine?.name ?? item.medicine.name}</td>
                      <td>{item.qty}</td>
                      <td>{already}</td>
                      <td>{now}</td>
                      <td>{total}</td>
                      <td>{bal}</td>
                      <td>
                        <span className={`badge ${rowCls}`}>{rowStatus}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="disp-table-footer">
            <span>Total Prescribed: {totalPrescribed}</span>
            <span>Total Dispensed: {totalDispensedProjected}</span>
            <span>Total Balance: {totalBalanceProjected}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const PartialDispense = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  const id = prescriptionId ? Number(prescriptionId) : null;
  if (!id) return <PartialDispensePicker />;
  return <PartialDispenseWorkspace key={id} prescriptionId={id} />;
};

export default PartialDispense;
