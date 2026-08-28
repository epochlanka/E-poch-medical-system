import { useEffect, useState } from 'react';
import { getLabTestOrder, getLabTestCatalogParameters, completeLabResult, amendLabResult } from '../../lib/labTestOrders';
import type { LabTestOrder, ResultParameterInput } from '../../lib/labTestOrders';
import { XIcon, CheckCircleIcon, PlusIcon, TrashIcon } from '../../components/layout/Icons';
import './labTestOrders.css';

interface ResultRow extends ResultParameterInput {
  key: string;
}

const emptyRow = (): ResultRow => ({ key: `${Date.now()}-${Math.random()}`, parameter_name: '', unit: '', reference_range: '', result_value: '' });

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// The doctor's one screen for "Manual Laboratory Result Entry" + "Doctor Review / Interpretation"
// + "Save & Complete" (spec sections 13-19) — reachable only once an order's report has been
// received, or (to amend) once it's already Completed. Takes just the order id and re-fetches
// the full detail (with results) itself — list views this opens from don't always include the
// per-parameter results array, so trusting a passed-in summary object risks stale/missing rows.
const LabResultModal = ({ orderId, onClose, onSaved }: { orderId: number; onClose: () => void; onSaved: () => void }) => {
  const [order, setOrder] = useState<LabTestOrder | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([emptyRow()]);
  const [doctorNotes, setDoctorNotes] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [loadingParams, setLoadingParams] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLabTestOrder(orderId).then((full) => {
      setOrder(full);
      setDoctorNotes(full.review_notes ?? '');
      setInterpretation(full.interpretation ?? '');

      const isAmending = full.status === 'Completed';
      if (isAmending && full.results && full.results.length > 0) {
        setRows(
          full.results.map((r) => ({
            key: String(r.result_id),
            parameter_id: r.parameter_id ?? undefined,
            parameter_name: r.parameter_name,
            unit: r.unit ?? '',
            reference_range: r.reference_range ?? '',
            result_value: r.result_value,
          }))
        );
        setLoadingParams(false);
        return;
      }
      if (full.catalog_test_id) {
        getLabTestCatalogParameters(full.catalog_test_id)
          .then((params) =>
            setRows(
              params.map((p) => ({
                key: String(p.parameter_id),
                parameter_id: p.parameter_id,
                parameter_name: p.parameter_name,
                unit: p.unit ?? '',
                reference_range: p.reference_range ?? '',
                result_value: '',
              }))
            )
          )
          .finally(() => setLoadingParams(false));
      } else {
        setLoadingParams(false);
      }
    });
  }, [orderId]);

  const isAmending = order?.status === 'Completed';

  const updateRow = (key: string, field: keyof ResultRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const submit = async () => {
    if (!order) return;
    const values = rows.filter((r) => r.parameter_name.trim() && r.result_value.trim());
    if (values.length === 0) {
      setError('Enter at least one result value before completing.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        results: values.map((r) => ({ parameter_id: r.parameter_id, parameter_name: r.parameter_name.trim(), unit: r.unit || undefined, reference_range: r.reference_range || undefined, result_value: r.result_value.trim() })),
        doctor_notes: doctorNotes.trim() || undefined,
        interpretation: interpretation.trim() || undefined,
      };
      if (isAmending) await amendLabResult(order.lab_test_order_id, input);
      else await completeLabResult(order.lab_test_order_id, input);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save the result.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card lab-result-modal" onClick={(e) => e.stopPropagation()}>
          <div className="lab-empty">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card lab-result-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">{order.test_name}</h2>
            <p className="modal-subtitle">
              {order.request_number} · Patient: {order.patient?.full_name}
            </p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="lab-result-meta">
          <span>Requested: {formatDateTime(order.order_date)}</span>
          {order.report_received_at && <span>Report Received: {formatDateTime(order.report_received_at)}</span>}
          {order.completed_at && <span>Reviewed: {formatDateTime(order.completed_at)}</span>}
        </div>

        <div className="modal-field">
          <label>Manual Laboratory Result Entry</label>
          {loadingParams ? (
            <div className="lab-empty">Loading parameters…</div>
          ) : (
            <table className="lab-result-table">
              <thead>
                <tr>
                  <th>Test Parameter</th>
                  <th>Result</th>
                  <th>Unit</th>
                  <th>Reference Range</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <input className="lab-cell-input" value={r.parameter_name} onChange={updateRow(r.key, 'parameter_name')} placeholder="e.g. Haemoglobin" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.result_value} onChange={updateRow(r.key, 'result_value')} placeholder="Value" />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.unit} onChange={updateRow(r.key, 'unit')} placeholder="Unit" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <input className="lab-cell-input" value={r.reference_range} onChange={updateRow(r.key, 'reference_range')} placeholder="e.g. 13-17" disabled={!!r.parameter_id} />
                    </td>
                    <td>
                      <button type="button" className="pat-icon-btn" onClick={() => removeRow(r.key)} aria-label="Remove parameter">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '6px 10px', marginTop: 8 }} onClick={addRow}>
            <PlusIcon /> Add Parameter
          </button>
        </div>

        <div className="modal-field">
          <label>Doctor Notes</label>
          <textarea rows={2} value={doctorNotes} onChange={(e) => setDoctorNotes(e.target.value)} placeholder="Clinical notes about this result" />
        </div>
        <div className="modal-field">
          <label>Interpretation</label>
          <textarea rows={2} value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="Clinical interpretation" />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={submit}>
            <CheckCircleIcon /> {submitting ? 'Saving…' : isAmending ? 'Save Changes' : 'Save & Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabResultModal;
