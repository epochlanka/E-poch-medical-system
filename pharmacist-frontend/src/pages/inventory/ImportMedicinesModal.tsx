import { useRef, useState } from 'react';
import { importMedicines } from '../../lib/medicines';
import type { ImportResult } from '../../lib/medicines';
import { XIcon, UploadIcon, CheckCircleIcon } from '../../components/layout/Icons';

const ImportMedicinesModal = ({ onClose, onImported }: { onClose: () => void; onImported: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await importMedicines(file);
      setResult(res);
      onImported();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">Import Medicines</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <p className="modal-subtitle">Upload a CSV file to bulk-create or update medicines in the catalog.</p>

        {!result && (
          <>
            <div className="modal-field">
              <label>CSV File</label>
              <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <p className="pat-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Required columns: <strong>name</strong>, <strong>unit</strong>. Optional: generic_name, brand_name, category, form, strength,
              manufacturer, unit_price, buy_price, reorder_level, max_stock_level, barcode. Rows matching an existing barcode (or the same
              name + strength + form) are updated; others are created.
            </p>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className="modal-btn primary" onClick={submit} disabled={!file || submitting}>
                <UploadIcon /> {submitting ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="modal-success">
              <div style={{ color: '#16a34a', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <CheckCircleIcon />
              </div>
              <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                {result.created} created · {result.updated} updated{result.errored ? ` · ${result.errored} failed` : ''}
              </p>
            </div>
            {result.errored > 0 && (
              <div className="pat-table-scroll" style={{ maxHeight: 180, overflowY: 'auto', marginTop: 10 }}>
                {result.results
                  .filter((r) => r.status === 'error')
                  .map((r) => (
                    <div key={r.row} className="pat-muted" style={{ fontSize: 11.5, padding: '3px 0' }}>
                      Row {r.row}: {r.message}
                    </div>
                  ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="modal-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportMedicinesModal;
