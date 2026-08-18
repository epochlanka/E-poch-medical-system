import PDFDocument from 'pdfkit';
import { Response } from 'express';

const CLINIC_NAME = 'MediCare Clinic & Dispensary';

const calculateAge = (dob: Date, at: Date = new Date()) => {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
};

export const streamLabTestRequestPdf = (order: any, res: Response) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const patient = order.patient;
  const doctor = order.doctor;

  doc.fontSize(18).text(CLINIC_NAME, { align: 'center' });
  doc.fontSize(11).fillColor('#555').text('Laboratory Test Request', { align: 'center' });
  doc.fillColor('black').moveDown();

  doc.fontSize(11);
  doc.text(`Lab Test Order ID: LAB${String(order.lab_test_order_id).padStart(6, '0')}`);
  doc.text(`Date: ${new Date(order.order_date).toISOString().slice(0, 10)}`);
  doc.text(`Priority: ${order.priority}`);
  doc.moveDown(0.5);

  doc.text(`Patient: ${patient.full_name} (${patient.patient_id})`);
  doc.text(`Age / Sex: ${calculateAge(new Date(patient.dob))} Y / ${patient.gender}`);
  doc.moveDown();

  doc.fontSize(13).text('Requested Test', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(order.test_name);
  if (order.test_category) doc.fontSize(10).fillColor('#555').text(`Category: ${order.test_category}`);
  doc.fillColor('black');

  if (order.instructions) {
    doc.moveDown(0.5);
    doc.fontSize(11).text("Doctor's Instructions:", { underline: true });
    doc.fontSize(10).text(order.instructions);
  }

  doc.moveDown(2);
  doc.fontSize(11).text(`Requesting Doctor: ${doctor.username}`);
  if (doctor.registration_number) doc.text(`Registration No: ${doctor.registration_number}`);
  doc.moveDown(2);
  doc.text('Signature: ____________________________');

  doc.end();
};
