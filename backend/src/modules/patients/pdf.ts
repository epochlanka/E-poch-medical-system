import PDFDocument from 'pdfkit';
import { Response } from 'express';

const describeEvent = (event: any): string => {
  switch (event.type) {
    case 'appointment':
      return `Appointment with ${event.doctorName} — status: ${event.status}`;
    case 'consultation':
      return `Consultation — diagnosis: ${event.diagnosis || 'n/a'} (${event.status})`;
    case 'prescription':
      return `Prescription (${event.status}) — ${event.items.map((i: any) => `${i.medicine} x${i.qty}`).join(', ') || 'no items'}`;
    case 'invoice':
      return `Invoice #${event.invoiceId} — ${event.totalAmount} (${event.paymentStatus})`;
    default:
      return '';
  }
};

export const streamPatientHistoryPdf = (patient: any, events: any[], res: Response) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('Patient History Summary', { align: 'center' });
  doc.moveDown();

  doc.fontSize(11);
  doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
  doc.text(`DOB: ${new Date(patient.dob).toISOString().slice(0, 10)}   Gender: ${patient.gender}`);
  if (patient.nic) doc.text(`NIC: ${patient.nic}`);
  if (patient.blood_group) doc.text(`Blood Group: ${patient.blood_group}`);
  if (patient.allergies) doc.text(`Allergies: ${patient.allergies}`);
  doc.moveDown();

  doc.fontSize(13).text('Timeline', { underline: true });
  doc.moveDown(0.5);

  if (events.length === 0) {
    doc.fontSize(11).text('No records found for the selected filters.');
  }

  for (const event of events) {
    const date = new Date(event.date).toISOString().slice(0, 10);
    doc.fontSize(11).text(`${date}  [${event.type.toUpperCase()}]`);
    doc.fontSize(10).text(describeEvent(event), { indent: 15 });
    doc.moveDown(0.5);
  }

  doc.end();
};
