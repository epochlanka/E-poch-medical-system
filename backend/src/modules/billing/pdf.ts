import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';

const formatCurrency = (n: number) => `LKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Matches the frontend's invoiceUtils.ts `invoiceCode()` exactly — same format wherever an
// invoice number is shown, print or screen.
const invoiceCode = (invoiceId: number, createdAt: Date) => `INV-${createdAt.getFullYear()}-${String(invoiceId).padStart(4, '0')}`;

export const streamInvoicePdf = (invoice: any, res: Response) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(11).fillColor('#555').text('Invoice / Receipt', { align: 'center' });
  doc.fillColor('black').moveDown();

  if (invoice.payment_status === 'Voided') {
    doc.fontSize(12).fillColor('#c0392b').text('VOIDED', { align: 'center' });
    doc.fontSize(9).text(`Reason: ${invoice.void_reason ?? ''}`, { align: 'center' });
    doc.fillColor('black').moveDown();
  }

  doc.fontSize(11);
  doc.text(`Invoice: ${invoiceCode(invoice.invoice_id, new Date(invoice.created_at))}`);
  doc.text(`Date: ${new Date(invoice.created_at).toISOString().slice(0, 10)}`);
  doc.text(`Patient: ${invoice.patient.full_name}${invoice.patient.patient_id ? ` (${invoice.patient.patient_id})` : ' (unregistered walk-in)'}`);
  const doctor = invoice.consultation?.appointment?.doctor;
  if (doctor) doc.text(`Doctor: ${doctor.username}`);
  doc.moveDown();

  doc.fontSize(13).text('Charges', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  for (const item of invoice.items as any[]) {
    doc.text(`${item.description}${item.qty > 1 ? ` x${item.qty}` : ''}`, { continued: true });
    doc.text(formatCurrency(item.line_total), { align: 'right' });
  }
  doc.moveDown();

  const line = (label: string, value: string, bold = false) => {
    doc.fontSize(11).font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, { continued: true });
    doc.text(value, { align: 'right' });
  };

  line('Subtotal', formatCurrency(invoice.subtotal));
  if (invoice.discount_total > 0) line('Discount', `-${formatCurrency(invoice.discount_total)}`);
  line('Total', formatCurrency(invoice.total_amount), true);
  line('Paid', formatCurrency(invoice.paid_amount));
  line('Balance', formatCurrency(invoice.total_amount - invoice.paid_amount), true);
  doc.font('Helvetica');
  doc.moveDown();

  if (invoice.payments?.length) {
    doc.fontSize(13).text('Payments', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const p of invoice.payments as any[]) {
      doc.text(`${new Date(p.received_at).toISOString().slice(0, 10)} — ${p.method} — ${formatCurrency(p.amount)} (received by ${p.receiver.username})`);
    }
    doc.moveDown();
  }

  if (invoice.refunds?.length) {
    doc.fontSize(13).text('Refunds', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const r of invoice.refunds as any[]) {
      doc.text(`${new Date(r.issued_at).toISOString().slice(0, 10)} — ${r.method} — ${formatCurrency(r.amount)} (issued by ${r.issuer.username})`);
    }
    doc.moveDown();
  }

  doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toISOString().slice(0, 10)} — for the patient's records.`, { align: 'left' });

  doc.end();
};
