import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { listInvoicesForConsultation, listPaymentMethodOptions, recordPayments } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';
import { money, errorText } from '../operations/format';

interface PaymentLine {
  method: string;
  amount: string;
  idempotencyKey: string;
}

const newLine = (method: string): PaymentLine => ({ method, amount: '', idempotencyKey: crypto.randomUUID() });

// Roles that may actually take money — matches the backend's BILLING_ROLES plus FrontDesk
// (which satisfies it via the Receptionist-or-Pharmacist role-access rule). A plain Pharmacist
// account sees the price but not a payment form, same duty split as the rest of the app.
const CAN_RECORD_PAYMENT = ['Admin', 'FrontDesk', 'Receptionist'];

interface HandoverPaymentDialogProps {
  open: boolean;
  consultationId: number;
  patientName: string;
  onClose: () => void;
}

export default function HandoverPaymentDialog({ open, consultationId, patientName, onClose }: HandoverPaymentDialogProps) {
  // Fetched directly rather than through an AuthContext: this component is reused verbatim
  // inside the receptionist-frontend FrontDesk portal (see docs/clinic-front-desk.md), which has
  // its own separate AuthProvider — pharmacist-frontend's own context is never mounted there.
  const [canRecordPayment, setCanRecordPayment] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .get<{ user: { role: string } }>('/auth/me')
      .then(({ data }) => active && setCanRecordPayment(CAN_RECORD_PAYMENT.includes(data.user.role)))
      .catch(() => active && setCanRecordPayment(false));
    return () => {
      active = false;
    };
  }, [open]);

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [methods, setMethods] = useState<string[]>(['Cash', 'Card', 'Mobile', 'Bank Transfer', 'Other']);
  const [lines, setLines] = useState<PaymentLine[]>([newLine('Cash')]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    setPaid(false);
    Promise.all([listInvoicesForConsultation(consultationId), listPaymentMethodOptions().catch(() => [])])
      .then(([invoices, opts]) => {
        if (!active) return;
        const active_invoice = invoices[0] ?? null;
        setInvoice(active_invoice);
        if (opts.length > 0) setMethods(opts);
        const balance = active_invoice ? active_invoice.total_amount - active_invoice.paid_amount : 0;
        setLines([{ ...newLine(opts[0] ?? 'Cash'), amount: balance > 0 ? balance.toFixed(2) : '' }]);
      })
      .catch((e) => active && setError(errorText(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, consultationId]);

  const balance = invoice ? Math.max(0, invoice.total_amount - invoice.paid_amount) : 0;
  const totalEntered = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const addLine = () => setLines((ls) => [...ls, newLine(methods[0] ?? 'Cash')]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<PaymentLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleConfirmPayment = async () => {
    if (!invoice || submitting) return;
    const toSubmit = lines.filter((l) => Number(l.amount) > 0).map((l) => ({ method: l.method, amount: Number(l.amount), idempotency_key: l.idempotencyKey }));
    if (toSubmit.length === 0) {
      setError('Enter at least one payment amount.');
      return;
    }
    if (totalEntered > balance + 0.01) {
      setError(`Total payment (${money(totalEntered)}) exceeds the amount due (${money(balance)}).`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const updated = await recordPayments(invoice.invoice_id, toSubmit);
      setInvoice(updated);
      setPaid(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="gd-modal" aria-labelledby="gd-payment-title" onCancel={(e) => e.preventDefault()} onClose={onClose}>
      <span className="gd-eyebrow">HANDOVER COMPLETE</span>
      <h2 id="gd-payment-title">Payment for {patientName}</h2>

      {loading && <p className="gd-muted">Loading the bill for this visit…</p>}

      {!loading && !invoice && (
        <div className="gd-alert neutral">
          No invoice yet for this visit — it will be billed automatically once every prescription for this consultation is dispensed. Reception will collect
          payment once it appears.
        </div>
      )}

      {!loading && invoice && (
        <>
          {/* Full itemized breakdown, visible regardless of role, so the pharmacist can read the
              exact charges out to the patient — not just a lump total. */}
          <div className="gd-batch-heading">
            <strong>Charges</strong>
          </div>
          <div className="gd-list">
            {invoice.items
              .filter((item) => item.item_type !== 'Discount')
              .map((item) => (
                <div className="gd-record" key={item.invoice_item_id}>
                  <div>
                    <strong>{item.description}</strong>
                    {item.qty > 1 && <small>Qty {item.qty} × {money(item.unit_price)}</small>}
                  </div>
                  <span className="gd-pill">{money(item.line_total)}</span>
                </div>
              ))}
            {invoice.items
              .filter((item) => item.item_type === 'Discount')
              .map((item) => (
                <div className="gd-record" key={item.invoice_item_id}>
                  <div>
                    <strong>{item.description}</strong>
                    <small>Discount</small>
                  </div>
                  <span className="gd-pill">-{money(Math.abs(item.line_total))}</span>
                </div>
              ))}
          </div>

          <div className="gd-review-list">
            <div>
              <strong>Total for this visit</strong>
              <span>{money(invoice.total_amount)}</span>
            </div>
            {invoice.paid_amount > 0 && (
              <div>
                <strong>Already paid</strong>
                <span>{money(invoice.paid_amount)}</span>
              </div>
            )}
            <div>
              <strong>{balance > 0.01 ? 'Balance due' : 'Balance'}</strong>
              <span>{money(invoice.total_amount - invoice.paid_amount)}</span>
            </div>
          </div>

          {balance <= 0.01 ? (
            <div className="gd-alert success">This visit is fully paid.</div>
          ) : paid ? (
            <div className="gd-alert success">Payment recorded. Balance now {money(invoice.total_amount - invoice.paid_amount)}.</div>
          ) : canRecordPayment ? (
            <div className="gd-exception">
              <div className="gd-batch-heading">
                <strong>Receive payment</strong>
                <button type="button" className="gd-link" onClick={addLine}>
                  + Split payment
                </button>
              </div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select className="gd-input" value={l.method} onChange={(e) => updateLine(i, { method: e.target.value })} style={{ width: 110 }}>
                    {methods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    className="gd-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  {lines.length > 1 && (
                    <button type="button" className="gd-button secondary" onClick={() => removeLine(i)} aria-label="Remove line">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <p className="gd-muted" style={{ marginTop: 8 }}>
                Total entered: {money(totalEntered)}
              </p>
            </div>
          ) : (
            <div className="gd-alert neutral">Reception will collect this payment separately.</div>
          )}
        </>
      )}

      {error && (
        <div className="gd-alert danger" role="alert">
          {error}
        </div>
      )}

      <div className="gd-actions">
        <button type="button" className="gd-button secondary" onClick={onClose}>
          {paid || balance <= 0.01 || !invoice || !canRecordPayment ? 'Close' : 'Skip for now'}
        </button>
        {!loading && invoice && balance > 0.01 && !paid && canRecordPayment && (
          <button type="button" className="gd-button primary" disabled={submitting} onClick={() => void handleConfirmPayment()}>
            {submitting ? 'Recording…' : 'Confirm payment'}
          </button>
        )}
      </div>
    </dialog>
  );
}
