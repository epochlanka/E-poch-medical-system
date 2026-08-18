import { useState } from 'react';
import { enterLabResult } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';

interface EnterResultModalProps {
  order: LabTestOrder;
  onClose: () => void;
  onSaved: () => void;
}

const EnterResultModal = ({ order, onClose, onSaved }: EnterResultModalProps) => {
  const [resultValue, setResultValue] = useState('');
  const [unit, setUnit] = useState('');
  const [referenceRange, setReferenceRange] = useState('');
  const [resultDate, setResultDate] = useState(new Date().toISOString().slice(0, 10));
  const [resultNotes, setResultNotes] = useState('');
  const [laboratoryName, setLaboratoryName] = useState('');
  const [report, setReport] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!resultValue.trim()) {
      setError('Result value is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await enterLabResult(order.lab_test_order_id, {
        result_value: resultValue.trim(),
        unit: unit.trim() || undefined,
        reference_range: referenceRange.trim() || undefined,
        result_date: resultDate || undefined,
        result_notes: resultNotes.trim() || undefined,
        laboratory_name: laboratoryName.trim() || undefined,
        report,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save the result.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Enter Result</h3>
        <p className="modal-subtitle">
          {order.test_name} — LAB{String(order.lab_test_order_id).padStart(6, '0')} · {order.patient?.full_name}
        </p>

        <div className="modal-field span-2">
          <label>Result Value *</label>
          <input value={resultValue} onChange={(e) => setResultValue(e.target.value)} placeholder="e.g. 13.5" />
        </div>

        <div className="modal-field">
          <label>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. g/dL" />
        </div>

        <div className="modal-field">
          <label>Reference Range</label>
          <input value={referenceRange} onChange={(e) => setReferenceRange(e.target.value)} placeholder="e.g. 12-16" />
        </div>

        <div className="modal-field">
          <label>Result Date</label>
          <input type="date" value={resultDate} onChange={(e) => setResultDate(e.target.value)} />
        </div>

        <div className="modal-field">
          <label>Laboratory Name</label>
          <input value={laboratoryName} onChange={(e) => setLaboratoryName(e.target.value)} placeholder="e.g. City Diagnostics Lab" />
        </div>

        <div className="modal-field span-2">
          <label>Result Notes</label>
          <input value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} placeholder="Optional notes" />
        </div>

        <div className="modal-field span-2">
          <label>Report Attachment (optional)</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setReport(e.target.files?.[0] ?? null)} />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="modal-btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save Result'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnterResultModal;
