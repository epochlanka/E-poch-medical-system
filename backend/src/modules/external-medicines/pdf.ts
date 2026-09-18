import PDFDocument from 'pdfkit';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';

const DEFAULT_CLINIC_NAME = 'MediCare Clinic & Dispensary';

// A dedicated, doctor-facing "buy these outside the clinic" document — distinct from the older
// External Purchase Slip (which prints PrescriptionItem.external_qty lines, a different concept,
// see the ExternalPrescriptionMedicine schema comment). Modeled on a traditional handwritten
// prescription slip: clinic header, patient block, numbered medicine list, doctor sign-off.
//
// `clinicSettings` is the admin-configured ClinicSettings row (Settings > General). When a logo
// has been uploaded there (e.g. a scan of the clinic's own printed letterhead/prescription pad),
// that image IS the header — it already carries the clinic name, doctor and registration details
// the way the physical pad prints them. Only falls back to a plain text header when no logo is set.
export const streamExternalMedicineSlipPdf = (prescription: any, clinicSettings: any, res: Response) => {
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  doc.pipe(res);

  const patient = prescription.consultation.appointment.patient;
  const doctor = prescription.consultation.appointment.doctor;
  const rxCode = `RX${String(prescription.prescription_id).padStart(6, '0')}`;

  const logoPath = clinicSettings?.logo_url ? path.join(__dirname, '..', '..', '..', clinicSettings.logo_url) : null;

  if (logoPath && fs.existsSync(logoPath)) {
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.image(logoPath, doc.page.margins.left, doc.y, { fit: [contentWidth, 100], align: 'center' });
    doc.y += 100;
  } else {
    doc.fontSize(15).font('Helvetica-Bold').text(clinicSettings?.clinic_name || DEFAULT_CLINIC_NAME, { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#555');
    if (clinicSettings?.clinic_address) doc.text(clinicSettings.clinic_address, { align: 'center' });
    if (clinicSettings?.registration_number) doc.text(`Reg No: ${clinicSettings.registration_number}`, { align: 'center' });
    doc.fillColor('black');
  }

  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').stroke();
  doc.strokeColor('black');
  doc.moveDown(0.8);

  doc.fontSize(10).font('Helvetica');
  doc.text(`Patient Name: ${patient.full_name}`);
  doc.text(`Patient ID: ${patient.patient_id}     Age: ${calcAge(patient.dob)}`);
  doc.text(`Date: ${new Date(prescription.issued_at).toISOString().slice(0, 10)}`);
  doc.text(`Prescription No: ${rxCode}`);
  doc.moveDown(0.8);

  doc.fontSize(12).font('Helvetica-Bold').text('EXTERNAL MEDICINES', { underline: true });
  doc.font('Helvetica');
  doc.moveDown(0.4);

  prescription.external_medicines.forEach((item: any, i: number) => {
    const title = [item.medicine_name, item.strength].filter(Boolean).join(' ');
    doc.fontSize(11).font('Helvetica-Bold').text(`${i + 1}. ${title}${item.dosage_form ? ` (${item.dosage_form})` : ''}`);
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    const line2 = [item.dosage, item.frequency, item.duration].filter(Boolean).join(' — ');
    if (line2) doc.text(line2, { indent: 14 });
    doc.text(`Qty: ${item.quantity} ${item.quantity_unit}`, { indent: 14 });
    if (item.instructions) doc.text(item.instructions.split(';').map((s: string) => s.trim()).join(', '), { indent: 14 });
    doc.fillColor('black');
    doc.moveDown(0.5);
  });

  doc.moveDown(0.5);
  doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#555').text(
    'The above medicines are to be purchased from an external pharmacy or other authorized source and are not being dispensed by the clinic pharmacy.',
    { align: 'left' }
  );
  doc.fillColor('black').font('Helvetica');

  doc.moveDown(1.5);
  doc.fontSize(10);
  doc.text('Doctor Name: ' + doctor.username);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);
  doc.moveDown(1);
  doc.text('Signature: ______________________________');
  doc.moveDown(0.5);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(0.5);
  doc.text('Clinic Stamp:');

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#94a3b8').text(`Reference: ${rxCode}`, { align: 'right' });

  doc.end();
};

const calcAge = (dob: string | Date) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};
