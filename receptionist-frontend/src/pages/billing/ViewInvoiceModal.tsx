import { useEffect, useState } from 'react';
import { getInvoice } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';
import { formatCurrency, formatDateTime, invoiceCode, paymentStatusLabel, STATUS_BADGE } from './billingUtils';

const ITEM_TYPE_LABEL: Record<string, string> = { ConsultationFee: 'Consultation Fee', Medicine: 'Medicine', Discount: 'Discount' };

interface ViewInvoiceModalProps {
  invoiceId: number;
  onClose: () => void;
  onRecordPayment?: (invoice: Invoice) => void;
}

const ViewInvoiceModal = ({ invoiceId, onClose, onRecordPayment }: ViewInvoiceModalProps) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInvoice(invoiceId)
      .then(setInvoice)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const chargeItems = invoice?.items.filter((i) => i.item_type !== 'Discount') ?? [];
  const discountItems = invoice?.items.filter((i) => i.item_type === 'Discount') ?? [];
  const balance = invoice ? Math.max(0, invoice.total_amount - invoice.paid_amount) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {loading && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>}
        {invoice && (
          <>
            <div className="modal-title">
              {invoiceCode(invoice.invoice_id, invoice.created_at)}
              <span className={`badge ${STATUS_BADGE[paymentStatusLabel(invoice.payment_status)]}`} style={{ marginLeft: 10 }}>
                {paymentStatusLabel(invoice.payment_status)}
              </span>
            </div>
            <div className="modal-subtitle">
              {invoice.patient.full_name} ({invoice.patient.patient_id}) — {formatDateTime(invoice.created_at)}
            </div>

            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {chargeItems.map((item) => (
                    <tr key={item.invoice_item_id}>
                      <td>{item.description}</td>
                      <td>{ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}</td>
                      <td>{item.qty}</td>
                      <td>{item.unit_price.toFixed(2)}</td>
                      <td>{item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {discountItems.map((item) => (
                    <tr key={item.invoice_item_id}>
                      <td colSpan={4} style={{ color: '#dc2626' }}>
                        Discount — {item.description}
                      </td>
                      <td style={{ color: '#dc2626' }}>{item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="ci-summary-row">
                <span>Sub Total</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount_total > 0 && (
                <div className="ci-summary-row discount">
                  <span>Discount</span>
                  <span>- {formatCurrency(invoice.discount_total)}</span>
                </div>
              )}
              <div className="ci-summary-row total">
                <span>Total Amount</span>
                <span>{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="ci-summary-row">
                <span>Amount Paid</span>
                <span>{formatCurrency(invoice.paid_amount)}</span>
              </div>
              {invoice.payment_status !== 'Voided' && (
                <div className={`ci-summary-row balance${balance > 0.01 ? ' due' : ''}`}>
                  <span>Balance</span>
                  <span>{formatCurrency(balance)}</span>
                </div>
              )}
            </div>

            {invoice.payments.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Payments</div>
                {invoice.payments.map((p) => (
                  <div className="ci-payment-row" key={p.payment_id}>
                    <span>
                      {p.method} — {formatDateTime(p.received_at)}
                    </span>
                    <span>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {invoice.payment_status === 'Voided' && invoice.void_reason && (
              <div className="dash-error-banner" style={{ marginTop: 12 }}>
                Voided — {invoice.void_reason}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
          {invoice && onRecordPayment && invoice.payment_status !== 'Voided' && invoice.payment_status !== 'Paid' && (
            <button className="modal-btn primary" onClick={() => onRecordPayment(invoice)}>
              Record Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewInvoiceModal;
