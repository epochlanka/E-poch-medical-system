import { useState } from 'react';
import { markReportReceived } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import { XIcon, CheckCircleIcon } from '../../components/layout/Icons';

// Reception/Doctor/Admin — deliberately the only fields here are "did the physical report
// arrive" and an optional note/attachment. No clinical value ever appears in this modal.
const MarkReceivedModal = ({ order, onClose, onSaved }: { order: LabTestOrder; onClose: () => void; onSaved: () => void }) => {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await markReportReceived(order.lab_test_order_id, note.trim() || undefined, file);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to mark this report received.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Report Received</h2>
            <p className="modal-subtitle">
              {order.test_name} — {order.request_number}
            </p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <p className="pat-muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 12 }}>
          Confirms the physical laboratory report is back. This does not record any result value — the doctor enters those separately.
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
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={submit}>
            <CheckCircleIcon /> {submitting ? 'Saving…' : 'Confirm Report Received'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarkReceivedModal;
