import { useState } from 'react';
import { markReportReceived } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import { CheckCircleIcon } from '../../components/layout/Icons';

// Reception's only write action on a lab order — confirms the physical report is back. No
// clinical value ever appears here; entering/editing results is Doctor-only.
const ReportReceivedModal = ({ order, onClose, onSaved }: { order: LabTestOrder; onClose: () => void; onSaved: () => void }) => {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await markReportReceived(order.lab_test_order_id, note.trim() || undefined, file);
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to mark this report received.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Report Received</h3>
        <p className="modal-subtitle">
          {order.test_name} — {order.request_number} · {order.patient?.full_name}
        </p>
        <p className="pat-muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 12 }}>
          Confirms the physical laboratory report is back. The doctor will enter and review the actual result values separately.
        </p>

        <div className="modal-field span-2">
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Report dropped off at front desk" />
        </div>

        <div className="modal-field span-2">
          <label>Attach Scanned Report (optional)</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="modal-btn primary" disabled={submitting} onClick={handleSubmit}>
            <CheckCircleIcon /> {submitting ? 'Saving…' : 'Confirm Report Received'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportReceivedModal;
