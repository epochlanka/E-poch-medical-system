import type { InvoiceDetail } from '../../lib/billing';
import { HeartPulseIcon, PrintIcon } from '../../components/layout/Icons';
import { formatCurrency, formatDate, formatDateTime, invoiceCode, invoiceStatusLabel, STATUS_BADGE } from './invoiceUtils';

interface InvoicePreviewProps {
  invoice: InvoiceDetail;
  onPrint?: () => void;
}

const InvoicePreview = ({ invoice, onPrint }: InvoicePreviewProps) => {
  const balance = invoice.total_amount - invoice.paid_amount;
  const chargeItems = invoice.items.filter((i) => i.item_type !== 'Discount');
  const discountItems = invoice.items.filter((i) => i.item_type === 'Discount');

  return (
    <div className="inv-preview">
      <div className="inv-preview-header">
        <div className="inv-preview-brand">
          <span className="inv-preview-brand-icon">
            <HeartPulseIcon />
          </span>
          <div>
            <div className="inv-preview-brand-name">E POCH</div>
            <div className="inv-preview-brand-sub">MEDICAL SYSTEM</div>
          </div>
        </div>
        <div className="inv-preview-meta">
          <div>{invoiceCode(invoice.invoice_id, invoice.created_at)}</div>
          <div className="pat-muted">{formatDateTime(invoice.created_at)}</div>
        </div>
        {onPrint && (
          <button className="pat-icon-btn" onClick={onPrint} aria-label="Print">
            <PrintIcon />
          </button>
        )}
      </div>

      <div className="inv-preview-parties">
        <div>
          <div className="pat-muted">Patient</div>
          <div className="inv-preview-party-name">{invoice.patient?.full_name}</div>
          {invoice.patient?.phone && <div className="pat-muted">{invoice.patient.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pat-muted">Payment Status</div>
          <span className={`badge ${STATUS_BADGE[invoiceStatusLabel(invoice.payment_status)]}`}>{invoiceStatusLabel(invoice.payment_status)}</span>
        </div>
      </div>

      <table className="inv-preview-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {chargeItems.map((item) => (
            <tr key={item.invoice_item_id}>
              <td>{item.description}</td>
              <td>{item.qty}</td>
              <td>{formatCurrency(item.unit_price)}</td>
              <td>{formatCurrency(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-preview-totals">
        <div className="inv-preview-total-row">
          <span>Sub Total</span>
          <span>{formatCurrency(invoice.subtotal)}</span>
        </div>
        {discountItems.map((d) => (
          <div className="inv-preview-total-row" key={d.invoice_item_id}>
            <span>{d.description}</span>
            <span style={{ color: '#16a34a' }}>-{formatCurrency(Math.abs(d.line_total))}</span>
          </div>
        ))}
        <div className="inv-preview-total-row grand">
          <span>Total Amount</span>
          <span>{formatCurrency(invoice.total_amount)}</span>
        </div>
        <div className="inv-preview-total-row">
          <span>Paid Amount</span>
          <span style={{ color: '#16a34a' }}>{formatCurrency(invoice.paid_amount)}</span>
        </div>
        <div className="inv-preview-total-row">
          <span>Balance Amount</span>
          <span style={{ color: balance > 0 ? '#dc2626' : undefined }}>{formatCurrency(balance)}</span>
        </div>
      </div>

      {invoice.payment_status === 'Voided' && invoice.void_reason && (
        <div className="modal-error" style={{ marginTop: 12 }}>
          Voided{invoice.voided_at ? ` on ${formatDate(invoice.voided_at)}` : ''}: {invoice.void_reason}
        </div>
      )}
    </div>
  );
};

export default InvoicePreview;
