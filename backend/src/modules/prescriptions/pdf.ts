import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';

export const streamPrescriptionPdf = (prescription: any, res: Response) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const patient = prescription.consultation.appointment.patient;
  const doctor = prescription.consultation.appointment.doctor;

  doc.fontSize(18).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(11).fillColor('#555').text('Prescription', { align: 'center' });
  doc.fillColor('black').moveDown();

  doc.fontSize(11);
  doc.text(`Prescription: RX${String(prescription.prescription_id).padStart(6, '0')}`);
  doc.text(`Date: ${new Date(prescription.issued_at).toISOString().slice(0, 10)}`);
  if (prescription.is_refill) doc.text('Type: Refill / Repeat Prescription');
  doc.moveDown(0.5);

  doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
  doc.text(`DOB: ${new Date(patient.dob).toISOString().slice(0, 10)}   Gender: ${patient.gender}`);
  if (patient.allergies) doc.text(`Known allergies: ${patient.allergies}`);
  doc.moveDown();

  doc.fontSize(13).text('Medicines', { underline: true });
  doc.moveDown(0.5);

  for (const item of prescription.items) {
    doc.fontSize(11).text(`${item.medicine.name}${item.medicine.generic_name ? ` (${item.medicine.generic_name})` : ''} — Qty ${item.qty}`);
    const parts = [item.dosage, item.frequency, item.duration, item.route].filter(Boolean);
    if (parts.length) doc.fontSize(10).fillColor('#555').text(parts.join(' · '), { indent: 15 });
    if (item.instructions) doc.fontSize(10).fillColor('#555').text(item.instructions, { indent: 15 });
    doc.fillColor('black').moveDown(0.5);
  }

  if (prescription.notes) {
    doc.moveDown(0.5);
    doc.fontSize(11).text('Notes to Pharmacist:', { underline: true });
    doc.fontSize(10).text(prescription.notes);
  }

  doc.moveDown();
  doc.fontSize(11).text(`Prescribing Doctor: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);

  doc.end();
};

// Only the items a doctor has marked External Purchase (external_qty > 0) — the qty shown is
// the externally-sourced portion, not the full prescribed qty, so a partially-split line reads
// correctly here (e.g. "10 of 18 prescribed" would still just show the 8 to be bought outside).
export const streamExternalPurchaseSlipPdf = (prescription: any, res: Response) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const patient = prescription.consultation.appointment.patient;
  const doctor = prescription.consultation.appointment.doctor;
  const externalItems = prescription.items.filter((i: any) => i.external_qty > 0);

  doc.fontSize(18).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(13).fillColor('#555').text('EXTERNAL MEDICINE PURCHASE SLIP', { align: 'center' });
  doc.fillColor('black').moveDown();

  doc.fontSize(11);
  doc.text(`Prescription: RX${String(prescription.prescription_id).padStart(6, '0')}`);
  doc.text(`Date: ${new Date(prescription.issued_at).toISOString().slice(0, 10)}`);
  doc.moveDown(0.5);

  doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
  doc.text(`DOB: ${new Date(patient.dob).toISOString().slice(0, 10)}   Gender: ${patient.gender}`);
  doc.moveDown();

  doc.fontSize(13).text('Medicines — External Purchase', { underline: true });
  doc.moveDown(0.5);

  for (const item of externalItems) {
    doc.fontSize(11).text(`${item.medicine.name}${item.medicine.strength ? ` (${item.medicine.strength})` : ''} — Qty ${item.external_qty}`);
    const parts = [item.dosage, item.frequency, item.duration].filter(Boolean);
    if (parts.length) doc.fontSize(10).fillColor('#555').text(parts.join(' · '), { indent: 15 });
    if (item.instructions) doc.fontSize(10).fillColor('#555').text(item.instructions, { indent: 15 });
    doc.fillColor('black').moveDown(0.5);
  }

  doc.moveDown();
  doc.fontSize(9).fillColor('#555').text(
    'The above medicines are to be purchased from an external pharmacy or other authorized source. These medicines are not being dispensed by the clinic pharmacy.',
    { align: 'left' }
  );
  doc.fillColor('black');

  doc.moveDown(2);
  doc.fontSize(11).text(`Doctor: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);

  doc.end();
};
