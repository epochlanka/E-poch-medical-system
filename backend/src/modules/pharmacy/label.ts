import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';

// Turns a doctor's abbreviated dosage notation into plain instructions at the point of collection.
export const streamDispenseLabel = (prescription: any, res: Response) => {
  const doc = new PDFDocument({ size: [283, 200], margin: 12 });
  doc.pipe(res);

  const appointment = prescription.consultation.appointment;
  const patientName = appointment.patient?.full_name ?? appointment.temp_patient_name ?? 'Unregistered Patient';
  const dispensedItems = prescription.items.filter((i: any) => i.batch_id);

  doc.fontSize(10).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(8).fillColor('#555').text(`RX${String(prescription.prescription_id).padStart(6, '0')}`, { align: 'center' });
  doc.fillColor('black').moveDown(0.5);

  doc.fontSize(9).text(`Patient: ${patientName}`);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(0.4);

  for (const item of dispensedItems) {
    doc.fontSize(9).text(item.medicine.name, { continued: false });
    const instructions = [item.dosage, item.frequency, item.duration, item.route].filter(Boolean).join(', ');
    if (instructions) doc.fontSize(8).fillColor('#555').text(instructions, { indent: 8 });
    doc.fillColor('black').moveDown(0.3);
  }

  doc.end();
};
