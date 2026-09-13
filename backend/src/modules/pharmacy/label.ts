import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';

// Turns a doctor's abbreviated dosage notation into plain instructions at the point of collection.
export const streamDispenseLabel = (prescription: any, res: Response) => {
  const doc = new PDFDocument({ size: 'A5', margin: 24 });
  doc.pipe(res);

  const appointment = prescription.consultation.appointment;
  const patientName = appointment.patient?.full_name ?? appointment.temp_patient_name ?? 'Unregistered Patient';
  doc.fontSize(14).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(9).fillColor('#555').text(`RX${String(prescription.prescription_id).padStart(6, '0')}`, { align: 'center' });
  doc.fillColor('black').moveDown();
  doc.fontSize(11).text(`Patient: ${patientName}`);
  doc.fontSize(9).text('Clinic medicine actually dispensed (external purchases are not included)');
  doc.moveDown();

  // A prescription item remembers only its last batch; each dispense record carries the
  // actual medicine, batch and quantity, including earlier partial draws.
  for (const item of prescription.items) {
    for (const dispense of item.dispenses) {
      const medicine = dispense.batch.medicine;
      doc.fontSize(11).fillColor('black').text(`${medicine.name} — ${dispense.qty} ${medicine.unit}`);
      doc.fontSize(8).fillColor('#475569').text(`Batch ${dispense.batch.batch_no} · Expires ${new Date(dispense.batch.expiry_date).toISOString().slice(0, 10)} · Given ${new Date(dispense.dispensed_at).toISOString().slice(0, 10)}`);
      const instructions = [item.dosage, item.frequency, item.duration, item.route, item.instructions].filter(Boolean).join(', ');
      if (instructions) doc.text(instructions);
      doc.moveDown(0.7);
    }
  }

  doc.end();
};
