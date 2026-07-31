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

  const patient = await prisma.patient.upsert({
    where: { patient_id: 'PT-000001' },
    update: {},
    create: {
      patient_id: 'PT-000001',
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

  const today = new Date();

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

  // Overdue by a day -> should surface in Follow-ups Due
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() - 1);

  await prisma.consultation.upsert({
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

  await prisma.invoice.upsert({
    where: { invoice_id: 1 },
    update: {},
    create: {
      invoice_id: 1,
      patient_id: patient.patient_id,
      total_amount: 1500,
      payment_status: 'Paid',
    },
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
