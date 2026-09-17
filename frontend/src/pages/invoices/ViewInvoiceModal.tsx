import { useEffect, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getInvoice, voidInvoice, downloadInvoicePdf, listPaymentMethodOptions } from '../../lib/billing';
import { formatCurrency, invoiceCode } from './invoiceUtils';
import { PlusIcon, TrashIcon } from '../../components/layout/Icons';
import InvoicePreview from './InvoicePreview';

interface ViewInvoiceModalProps {
  invoiceId: number;
  canVoid: boolean;
  onClose: () => void;
  onChanged: () => void;
}

interface RefundLine {
  method: string;
  amount: string;
}

const ViewInvoiceModal = ({ invoiceId, canVoid, onClose, onChanged }: ViewInvoiceModalProps) => {
  const { data: invoice, loading, reload } = useApiData(() => getInvoice(invoiceId), [invoiceId]);
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [reason, setReason] = useState('');
  const [methods, setMethods] = useState<string[]>(['Cash', 'Card', 'Mobile', 'Bank Transfer', 'Other']);
  const [refunds, setRefunds] = useState<RefundLine[]>([{ method: 'Cash', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPaymentMethodOptions()
      .then((opts) => opts.length > 0 && setMethods(opts))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (invoice && invoice.paid_amount > 0) setRefunds([{ method: 'Cash', amount: String(invoice.paid_amount) }]);
  }, [invoice]);

  const needsRefund = !!invoice && invoice.paid_amount > 0;
  const refundTotal = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const updateRefund = (i: number, patch: Partial<RefundLine>) => setRefunds((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRefund = () => setRefunds((rs) => [...rs, { method: methods[0] ?? 'Cash', amount: '' }]);
  const removeRefund = (i: number) => setRefunds((rs) => rs.filter((_, idx) => idx !== i));

  const handleVoid = async () => {
    if (!reason.trim()) {
      setError('A void reason is required.');
      return;
    }
    if (needsRefund) {
      const lines = refunds.filter((r) => Number(r.amount) > 0);
      if (lines.length === 0) {
        setError('This invoice has payments recorded — specify how the paid amount is being refunded.');
        return;
      }
      if (refundTotal > invoice!.paid_amount + 0.01) {
        setError(`Refund total (${formatCurrency(refundTotal)}) exceeds the amount actually paid (${formatCurrency(invoice!.paid_amount)}).`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      const lines = needsRefund ? refunds.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount) })) : undefined;
      await voidInvoice(invoiceId, reason.trim(), lines);
      reload();
      onChanged();
      setShowVoidForm(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to void invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.invoice_id, invoiceCode(invoice.invoice_id, invoice.created_at));
    } catch {
      setError('Failed to download the invoice PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {loading && <p className="pat-muted">Loading…</p>}
        {invoice && (
          <>
            <InvoicePreview invoice={invoice} onPrint={() => window.print()} />

            {invoice.refunds.length > 0 && (
              <div className="modal-field" style={{ marginTop: 14 }}>
                <label>Refunds issued</label>
                {invoice.refunds.map((r) => (
                  <div key={r.refund_id} className="pat-muted" style={{ fontSize: 13 }}>
                    {formatCurrency(r.amount)} via {r.method} — {new Date(r.issued_at).toLocaleDateString()} (by {r.issuer.username})
                  </div>
                ))}
              </div>
            )}

            {showVoidForm && (
              <div className="modal-field" style={{ marginTop: 14 }}>
                <label>Void reason *</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient disputed the charge" />

                {needsRefund && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <label style={{ marginBottom: 0 }}>Refund — {formatCurrency(invoice.paid_amount)} was paid on this invoice</label>
                      <button type="button" className="card-link" onClick={addRefund}>
                        <PlusIcon /> Split refund
                      </button>
                    </div>
                    {refunds.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <select value={r.method} onChange={(e) => updateRefund(i, { method: e.target.value })} style={{ width: 110 }}>
                          {methods.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <input type="number" min={0} step="0.01" value={r.amount} onChange={(e) => updateRefund(i, { amount: e.target.value })} style={{ flex: 1 }} />
                        {refunds.length > 1 && (
                          <button type="button" className="pat-icon-btn" onClick={() => removeRefund(i)} aria-label="Remove">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    ))}
                    <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, color: refundTotal > invoice.paid_amount + 0.01 ? '#dc2626' : '#0f172a' }}>
                      Refund total: {formatCurrency(refundTotal)}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose}>
                Close
              </button>
              {canVoid && invoice.payment_status !== 'Voided' && !showVoidForm && (
                <button type="button" className="modal-btn secondary" onClick={() => setShowVoidForm(true)}>
                  Void Invoice
                </button>
              )}
              {showVoidForm && (
                <button type="button" className="modal-btn primary" onClick={handleVoid} disabled={submitting}>
                  {submitting ? 'Voiding…' : 'Confirm Void'}
                </button>
              )}
              {!showVoidForm && (
                <button type="button" className="modal-btn primary" onClick={handleDownload} disabled={downloading}>
                  {downloading ? 'Downloading…' : 'Download PDF'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewInvoiceModal;
