import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password_hash: adminHash, role: 'Admin' },
  });

  const doctorHash = await bcrypt.hash('doctor123', 10);
  const doctor = await prisma.user.upsert({
    where: { username: 'doctor' },
    update: {},
    create: { username: 'doctor', password_hash: doctorHash, role: 'Doctor' },
  });

  const receptionistHash = await bcrypt.hash('reception123', 10);
  const receptionist = await prisma.user.upsert({
    where: { username: 'reception' },
    update: {},
    create: { username: 'reception', password_hash: receptionistHash, role: 'Receptionist' },
  });

  const family = await prisma.family.upsert({
    where: { family_id: 1 },
    update: {},
    create: { family_id: 1, family_name: 'Perera Family', address: 'Colombo', contact_no: '0770000000' },
  });

  // Keyed on nic (genuinely unique), not patient_id — the patients module auto-generates
  // sequential PT-###### ids from test runs against this same dev DB, so a hardcoded
  // patient_id here can collide with one it already claimed. A distinct PT-SEED-* id
  // sidesteps that collision space entirely.
  const patient = await prisma.patient.upsert({
    where: { nic: '199012345678' },
    update: {},
    create: {
      patient_id: 'PT-SEED-001',
      family_id: family.family_id,
      nic: '199012345678',
      full_name: 'Nimal Perera',
      dob: new Date('1990-05-10'),
      gender: 'Male',
      phone: '0771234567',
      blood_group: 'O+',
    },
  });

  const paracetamol = await prisma.medicine.upsert({
    where: { medicine_id: 1 },
    update: {},
    create: {
      medicine_id: 1,
      name: 'Paracetamol 500mg',
      generic_name: 'Paracetamol',
      form: 'Tablet',
      unit: 'tablet',
      reorder_level: 100,
    },
  });

  const amoxicillin = await prisma.medicine.upsert({
    where: { medicine_id: 2 },
    update: {},
    create: {
      medicine_id: 2,
      name: 'Amoxicillin 250mg',
      generic_name: 'Amoxicillin',
      form: 'Capsule',
      unit: 'capsule',
      reorder_level: 50,
    },
  });

  // Below reorder level -> should surface as a low-stock alert
  await prisma.batch.upsert({
    where: { batch_id: 1 },
    update: {},
    create: {
      batch_id: 1,
      medicine_id: paracetamol.medicine_id,
      batch_no: 'PCM-2026-01',
      expiry_date: new Date('2027-01-01'),
      qty_on_hand: 20,
    },
  });

  // Expiring within the default 90-day threshold -> should surface as an expiry alert
  const soonExpiry = new Date();
  soonExpiry.setDate(soonExpiry.getDate() + 30);
  await prisma.batch.upsert({
    where: { batch_id: 2 },
    update: {},
    create: {
      batch_id: 2,
      medicine_id: amoxicillin.medicine_id,
      batch_no: 'AMX-2026-01',
      expiry_date: soonExpiry,
      qty_on_hand: 80,
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { nic: '198508201234' },
    update: {},
    create: {
      patient_id: 'PT-SEED-002',
      family_id: family.family_id,
      nic: '198508201234',
      full_name: 'Kumari Fernando',
      dob: new Date('1985-08-20'),
      gender: 'Female',
      phone: '0779876543',
      blood_group: 'A+',
    },
  });

  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };

  const waitingAppointment = await prisma.appointment.upsert({
    where: { appointment_id: 1 },
    update: {},
    create: {
      appointment_id: 1,
      patient_id: patient.patient_id,
      doctor_id: doctor.user_id,
      scheduled_at: today,
      status: 'Waiting',
      created_by: receptionist.user_id,
    },
  });

  const completedAppointment = await prisma.appointment.upsert({
    where: { appointment_id: 2 },
    update: {},
    create: {
      appointment_id: 2,
      patient_id: patient.patient_id,
      doctor_id: doctor.user_id,
      scheduled_at: today,
      status: 'Completed',
      created_by: receptionist.user_id,
    },
  });

  // Someone else's consultation is in progress right now -> Consulting queue entry.
  await prisma.appointment.upsert({
    where: { appointment_id: 3 },
    update: {},
    create: {
      appointment_id: 3,
      patient_id: patient2.patient_id,
      doctor_id: doctor.user_id,
      scheduled_at: today,
      status: 'Consulting',
      created_by: receptionist.user_id,
    },
  });

  // Yesterday's activity, so today-vs-yesterday dashboard deltas have something to compare against.
  await prisma.appointment.upsert({
    where: { appointment_id: 4 },
    update: {},
    create: {
      appointment_id: 4,
      patient_id: patient2.patient_id,
      doctor_id: doctor.user_id,
      scheduled_at: daysAgo(1),
      status: 'Completed',
      created_by: receptionist.user_id,
    },
  });

  // Overdue by a day -> should surface in Follow-ups Due
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() - 1);

  const consultation = await prisma.consultation.upsert({
    where: { appointment_id: completedAppointment.appointment_id },
    update: {},
    create: {
      appointment_id: completedAppointment.appointment_id,
      diagnosis: 'Seasonal flu',
      notes: 'Advised rest and fluids',
      status: 'Finalized',
      follow_up_date: followUpDate,
    },
  });

  const prescription = await prisma.prescription.upsert({
    where: { prescription_id: 1 },
    update: {},
    create: {
      prescription_id: 1,
      consultation_id: consultation.consultation_id,
      status: 'Dispensed',
      issued_at: today,
    },
  });

  await prisma.prescriptionItem.upsert({
    where: { rx_item_id: 1 },
    update: {},
    create: {
      rx_item_id: 1,
      prescription_id: prescription.prescription_id,
      medicine_id: paracetamol.medicine_id,
      dosage: '1 tablet twice daily',
      qty: 20,
      batch_id: 1,
    },
  });

  await prisma.prescriptionItem.upsert({
    where: { rx_item_id: 2 },
    update: {},
    create: {
      rx_item_id: 2,
      prescription_id: prescription.prescription_id,
      medicine_id: amoxicillin.medicine_id,
      dosage: '1 capsule three times daily',
      qty: 10,
      batch_id: 2,
    },
  });

  // A second, still-pending prescription so "Pending Prescriptions" isn't always zero.
  await prisma.appointment.upsert({
    where: { appointment_id: 5 },
    update: {},
    create: {
      appointment_id: 5,
      patient_id: patient2.patient_id,
      doctor_id: doctor.user_id,
      scheduled_at: today,
      status: 'Completed',
      created_by: receptionist.user_id,
    },
  });

  const pendingConsultation = await prisma.consultation.upsert({
    where: { appointment_id: 5 },
    update: {},
    create: {
      appointment_id: 5,
      diagnosis: 'Follow-up review',
      status: 'Finalized',
    },
  });

  await prisma.prescription.upsert({
    where: { prescription_id: 2 },
    update: {},
    create: { prescription_id: 2, consultation_id: pendingConsultation.consultation_id, status: 'Pending' },
  });

  await prisma.invoice.upsert({
    where: { invoice_id: 1 },
    update: { prescription_id: prescription.prescription_id },
    create: {
      invoice_id: 1,
      patient_id: patient.patient_id,
      prescription_id: prescription.prescription_id,
      total_amount: 1500,
      payment_status: 'Paid',
    },
  });

  // Backdated invoices so the revenue trend chart has a real multi-day series.
  await prisma.invoice.upsert({
    where: { invoice_id: 2 },
    update: {},
    create: { invoice_id: 2, patient_id: patient2.patient_id, total_amount: 2200, payment_status: 'Paid', created_at: daysAgo(1) },
  });
  await prisma.invoice.upsert({
    where: { invoice_id: 3 },
    update: {},
    create: { invoice_id: 3, patient_id: patient.patient_id, total_amount: 1800, payment_status: 'Paid', created_at: daysAgo(3) },
  });
  await prisma.invoice.upsert({
    where: { invoice_id: 4 },
    update: {},
    create: { invoice_id: 4, patient_id: patient2.patient_id, total_amount: 3100, payment_status: 'Paid', created_at: daysAgo(7) },
  });

  console.log({ admin: admin.username, doctor: doctor.username, receptionist: receptionist.username });
  console.log('Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
