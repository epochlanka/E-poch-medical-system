import { useEffect, useRef, useState } from 'react';
import { importMedicines, downloadImportTemplate } from '../../lib/medicines';
import type { ImportResult } from '../../lib/medicines';
import { useFeedback } from '../../../../shared/ui/feedback';
import { XIcon, UploadIcon, DownloadIcon, CheckCircleIcon, AlertIcon } from '../../components/layout/Icons';

/*
 * Bulk stock entry from a spreadsheet.
 *
 * Three steps on purpose — get the template, check the file, then commit — because the file is
 * typed by hand, often by several people, and the only thing worse than re-typing a stock list is
 * importing a wrong one and not knowing. Nothing is written until the preview has been seen.
 */

type Step = 'choose' | 'preview' | 'done';

const ImportMedicinesModal = ({ onClose, onImported }: { onClose: () => void; onImported: () => void }) => {
  const { toast } = useFeedback();
  const [step, setStep] = useState<Step>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const getTemplate = async () => {
    try {
      await downloadImportTemplate();
      toast('Template downloaded. Fill in the "Medicines" sheet and upload it here.', 'success');
    } catch {
      setError('Could not download the template.');
    }
  };

  // Checking happens the moment a file is chosen: the preview is the point of this screen, and
  // making it a separate button just invites people to skip it.
  const check = async (chosen: File) => {
    setFile(chosen);
    setError(null);
    setPreview(null);
    setBusy(true);
    try {
      const outcome = await importMedicines(chosen, true);
      setPreview(outcome);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await importMedicines(file, false);
      setResult(outcome);
      setStep('done');
      onImported();
      toast(`${outcome.created} added, ${outcome.updated} updated, ${outcome.unitsAdded.toLocaleString()} units of stock.`, 'success');
    } catch (err: any) {
      setError(err.response?.data?.message || 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  const failures = (preview?.results ?? []).filter((r) => r.status === 'error');
  const importable = preview ? preview.created + preview.updated : 0;

  return (
    <dialog ref={dialogRef} className="modal-dialog" aria-labelledby="imp-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="modal-card imp-card">
        <div className="imp-head">
          <div>
            <h2 className="modal-title" id="imp-title">Import stock from a spreadsheet</h2>
            <p className="modal-subtitle">Type the medicines in Excel, then upload the file here.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {step === 'choose' && (
          <>
            <ol className="imp-steps">
              <li>
                <strong>Get the blank sheet</strong>
                <p>It already has the right column headings and a page of instructions.</p>
                <button className="pat-btn" onClick={() => void getTemplate()}>
                  <DownloadIcon /> Download template
                </button>
              </li>
              <li>
                <strong>Fill it in</strong>
                <p>
                  One row per batch. Quantity is in single tablets, capsules or ml — not boxes. A medicine with two
                  expiry dates goes on two rows with the same name.
                </p>
              </li>
              <li>
                <strong>Upload it</strong>
                <p>You will see exactly what will happen before anything is saved.</p>
                <input
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  disabled={busy}
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    if (chosen) void check(chosen);
                  }}
                />
                {busy && <p className="pat-muted">Checking the file…</p>}
              </li>
            </ol>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <div className={`imp-summary ${failures.length ? 'has-errors' : 'clean'}`}>
              {failures.length ? <AlertIcon /> : <CheckCircleIcon />}
              <div>
                <strong>Nothing has been saved yet.</strong>
                <span>
                  {importable} medicine{importable === 1 ? '' : 's'} ready ({preview.created} new, {preview.updated} already
                  in the catalogue) · {preview.batches} batch{preview.batches === 1 ? '' : 'es'} adding{' '}
                  {preview.unitsAdded.toLocaleString()} units
                  {failures.length > 0 && ` · ${failures.length} row${failures.length === 1 ? '' : 's'} will be skipped`}
                </span>
              </div>
            </div>

            {preview.unknownHeaders.length > 0 && (
              <div className="imp-note">
                These columns were not recognised and will be ignored: <strong>{preview.unknownHeaders.join(', ')}</strong>
              </div>
            )}

            {failures.length > 0 && (
              <div className="imp-errors">
                <strong>Rows that will be skipped</strong>
                <ul>
                  {failures.slice(0, 12).map((row) => (
                    <li key={row.row}>
                      <span>Row {row.row}</span>
                      {row.name ? ` · ${row.name}` : ''} — {row.message}
                    </li>
                  ))}
                </ul>
                {failures.length > 12 && <p className="pat-muted">…and {failures.length - 12} more.</p>}
                <p className="pat-muted">
                  Fix them in the spreadsheet and upload again, or continue and add the rest now.
                </p>
              </div>
            )}

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => { setStep('choose'); setPreview(null); setFile(null); }} disabled={busy}>
                Choose another file
              </button>
              <button className="modal-btn primary" onClick={() => void commit()} disabled={busy || importable === 0}>
                <UploadIcon /> {busy ? 'Importing…' : `Import ${importable} medicine${importable === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div className="imp-summary clean">
              <CheckCircleIcon />
              <div>
                <strong>Import complete</strong>
                <span>
                  {result.created} added · {result.updated} updated · {result.batches} batch
                  {result.batches === 1 ? '' : 'es'} · {result.unitsAdded.toLocaleString()} units of stock
                  {result.errored > 0 && ` · ${result.errored} skipped`}
                </span>
              </div>
            </div>
            {result.errored > 0 && (
              <div className="imp-errors">
                <strong>Skipped rows</strong>
                <ul>
                  {result.results.filter((r) => r.status === 'error').slice(0, 12).map((row) => (
                    <li key={row.row}>
                      <span>Row {row.row}</span>
                      {row.name ? ` · ${row.name}` : ''} — {row.message}
                    </li>
                  ))}
                </ul>
                <p className="pat-muted">Correct these in the spreadsheet and import that file again — already-imported rows are updated, not duplicated.</p>
              </div>
            )}
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};

export default ImportMedicinesModal;
