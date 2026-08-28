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
    create: { username: 'doctor', password_hash: doctorHash, role: 'Doctor', registration_number: 'SLMC-24681' },
  });

  const pharmacistHash = await bcrypt.hash('pharmacist123', 10);
  const pharmacist = await prisma.user.upsert({
    where: { username: 'pharmacist' },
    update: {},
    create: { username: 'pharmacist', password_hash: pharmacistHash, role: 'Pharmacist' },
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
      category: 'Analgesic',
      form: 'Tablet',
      strength: '500mg',
      unit: 'tablet',
      reorder_level: 100,
      unit_price: 15,
      barcode: '8901030001',
    },
  });

  const amoxicillin = await prisma.medicine.upsert({
    where: { medicine_id: 2 },
    update: {},
    create: {
      medicine_id: 2,
      name: 'Amoxicillin 250mg',
      generic_name: 'Amoxicillin',
      category: 'Antibiotic',
      form: 'Capsule',
      strength: '250mg',
      unit: 'capsule',
      reorder_level: 50,
      unit_price: 45,
      barcode: '8901030002',
    },
  });

  const cetirizine = await prisma.medicine.upsert({
    where: { medicine_id: 3 },
    update: {},
    create: {
      medicine_id: 3,
      name: 'Cetirizine 10mg',
      generic_name: 'Cetirizine',
      category: 'Antihistamine',
      form: 'Tablet',
      strength: '10mg',
      unit: 'tablet',
      reorder_level: 30,
      unit_price: 8,
      barcode: '8901030003',
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { supplier_id: 1 },
    update: {},
    create: { supplier_id: 1, name: 'MedSupply Lanka (Pvt) Ltd', contact: '011-2345678', address: 'Colombo 02' },
  });

  // A fully-received PO -> GRN -> Batch chain, so every unit of batch 1 traces to a purchase document.
  const receivedPo = await prisma.purchaseOrder.upsert({
    where: { po_id: 1 },
    update: {},
    create: { po_id: 1, supplier_id: supplier.supplier_id, order_date: new Date('2026-07-01'), status: 'Received', created_by: pharmacist.user_id },
  });
  const receivedPoItem = await prisma.purchaseOrderItem.upsert({
    where: { po_item_id: 1 },
    update: {},
    create: { po_item_id: 1, po_id: receivedPo.po_id, medicine_id: paracetamol.medicine_id, qty_ordered: 40, unit_cost: 10 },
  });

  // Below reorder level -> should surface as a low-stock alert. Started at 40 (per the GRN),
  // 20 already dispensed by the seeded prescription below, so qty_on_hand nets to 20.
  const batch1 = await prisma.batch.upsert({
    where: { batch_id: 1 },
    update: {},
    create: {
      batch_id: 1,
      medicine_id: paracetamol.medicine_id,
      batch_no: 'PCM-2026-01',
      expiry_date: new Date('2027-01-01'),
      qty_on_hand: 20,
      supplier_id: supplier.supplier_id,
    },
  });
  await prisma.gRNItem.upsert({
    where: { grn_item_id: 1 },
    update: {},
    create: {
      grn_item_id: 1,
      grn_id: (
        await prisma.goodsReceivedNote.upsert({
          where: { grn_id: 1 },
          update: {},
          create: { grn_id: 1, po_id: receivedPo.po_id, received_by: pharmacist.user_id, received_at: new Date('2026-07-05') },
        })
      ).grn_id,
      po_item_id: receivedPoItem.po_item_id,
      batch_id: batch1.batch_id,
      qty_received: 40,
    },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 1 },
    update: {},
    create: {
      ledger_id: 1,
      batch_id: batch1.batch_id,
      change_qty: 40,
      balance_after: 40,
      event_type: 'GRN',
      reference_type: 'GRN',
      reference_id: '1',
      created_by: pharmacist.user_id,
      created_at: new Date('2026-07-05'),
    },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 2 },
    update: {},
    create: {
      ledger_id: 2,
      batch_id: batch1.batch_id,
      change_qty: -20,
      balance_after: 20,
      event_type: 'Dispense',
      reference_type: 'Prescription',
      reference_id: '1',
      created_by: pharmacist.user_id,
    },
  });

  // A second PO still awaiting delivery — demonstrates the Draft/Submitted stage of the workflow.
  await prisma.purchaseOrder.upsert({
    where: { po_id: 2 },
    update: {},
    create: { po_id: 2, supplier_id: supplier.supplier_id, order_date: new Date(), status: 'Submitted', created_by: pharmacist.user_id },
  });
  await prisma.purchaseOrderItem.upsert({
    where: { po_item_id: 2 },
    update: {},
    create: { po_item_id: 2, po_id: 2, medicine_id: amoxicillin.medicine_id, qty_ordered: 100, unit_cost: 30 },
  });

  // A third PO received with a quantity discrepancy — flagged for Admin review, not silently accepted.
  const discrepancyPo = await prisma.purchaseOrder.upsert({
    where: { po_id: 3 },
    update: {},
    create: { po_id: 3, supplier_id: supplier.supplier_id, order_date: new Date('2026-07-20'), status: 'Received', created_by: pharmacist.user_id },
  });
  const discrepancyPoItem = await prisma.purchaseOrderItem.upsert({
    where: { po_item_id: 3 },
    update: {},
    create: { po_item_id: 3, po_id: discrepancyPo.po_id, medicine_id: cetirizine.medicine_id, qty_ordered: 100, unit_cost: 5 },
  });
  const discrepancyGrn = await prisma.goodsReceivedNote.upsert({
    where: { grn_id: 2 },
    update: {},
    create: {
      grn_id: 2,
      po_id: discrepancyPo.po_id,
      received_by: pharmacist.user_id,
      received_at: new Date('2026-07-22'),
      has_discrepancy: true,
      discrepancy_notes: 'Ordered 100 units, supplier delivered only 90',
    },
  });

  // Expiring within the default 90-day threshold -> should surface as an expiry alert
  const soonExpiry = new Date();
  soonExpiry.setDate(soonExpiry.getDate() + 30);
  const batch2 = await prisma.batch.upsert({
    where: { batch_id: 2 },
    update: {},
    create: {
      batch_id: 2,
      medicine_id: amoxicillin.medicine_id,
      batch_no: 'AMX-2026-01',
      expiry_date: soonExpiry,
      qty_on_hand: 80,
      supplier_id: supplier.supplier_id,
    },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 3 },
    update: {},
    create: { ledger_id: 3, batch_id: batch2.batch_id, change_qty: 90, balance_after: 90, event_type: 'GRN', created_by: pharmacist.user_id },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 4 },
    update: {},
    create: {
      ledger_id: 4,
      batch_id: batch2.batch_id,
      change_qty: -10,
      balance_after: 80,
      event_type: 'Dispense',
      reference_type: 'Prescription',
      reference_id: '1',
      created_by: pharmacist.user_id,
    },
  });

  // A later-expiring batch of the same medicine, so FEFO has a real earliest-vs-later choice to suggest.
  // This is the batch actually received against the discrepancy PO above (90, not the ordered 100).
  const laterExpiry = new Date();
  laterExpiry.setDate(laterExpiry.getDate() + 180);
  const batch3 = await prisma.batch.upsert({
    where: { batch_id: 3 },
    update: {},
    create: {
      batch_id: 3,
      medicine_id: amoxicillin.medicine_id,
      batch_no: 'AMX-2026-02',
      expiry_date: laterExpiry,
      qty_on_hand: 60,
      supplier_id: supplier.supplier_id,
    },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 5 },
    update: {},
    create: { ledger_id: 5, batch_id: batch3.batch_id, change_qty: 60, balance_after: 60, event_type: 'GRN', created_by: pharmacist.user_id },
  });

  const batch4 = await prisma.batch.upsert({
    where: { batch_id: 4 },
    update: {},
    create: {
      batch_id: 4,
      medicine_id: cetirizine.medicine_id,
      batch_no: 'CTZ-2026-01',
      expiry_date: laterExpiry,
      qty_on_hand: 90,
      supplier_id: supplier.supplier_id,
    },
  });
  await prisma.gRNItem.upsert({
    where: { grn_item_id: 2 },
    update: {},
    create: { grn_item_id: 2, grn_id: discrepancyGrn.grn_id, po_item_id: discrepancyPoItem.po_item_id, batch_id: batch4.batch_id, qty_received: 90 },
  });
  await prisma.stockLedger.upsert({
    where: { ledger_id: 6 },
    update: {},
    create: {
      ledger_id: 6,
      batch_id: batch4.batch_id,
      change_qty: 90,
      balance_after: 90,
      event_type: 'GRN',
      reference_type: 'GRN',
      reference_id: String(discrepancyGrn.grn_id),
      created_by: pharmacist.user_id,
      created_at: new Date('2026-07-22'),
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
      allergies: 'Amoxicillin (penicillin-class)',
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

  const pendingPrescription = await prisma.prescription.upsert({
    where: { prescription_id: 2 },
    update: {},
    create: { prescription_id: 2, consultation_id: pendingConsultation.consultation_id, status: 'Pending' },
  });

  await prisma.prescriptionItem.upsert({
    where: { rx_item_id: 3 },
    update: {},
    create: {
      rx_item_id: 3,
      prescription_id: pendingPrescription.prescription_id,
      medicine_id: cetirizine.medicine_id,
      dosage: '1 tablet at night',
      frequency: 'Once daily',
      duration: '5 days',
      route: 'Oral',
      qty: 5,
    },
  });

  // Pre-configured substitution rule — dispensing can only ever offer an alternative the
  // system already knows about, never an ad-hoc counter substitution.
  await prisma.medicineSubstitution.upsert({
    where: { medicine_id_substitute_medicine_id: { medicine_id: amoxicillin.medicine_id, substitute_medicine_id: cetirizine.medicine_id } },
    update: {},
    create: { medicine_id: amoxicillin.medicine_id, substitute_medicine_id: cetirizine.medicine_id, created_by: pharmacist.user_id },
  });

  const CONSULTATION_FEE = 500;

  // Consolidated invoice: consultation fee + every dispensed line, on the same items table
  // discounts and payments will later apply against — not a flat total_amount pulled from nowhere.
  const invoice1 = await prisma.invoice.upsert({
    where: { invoice_id: 1 },
    update: {},
    create: {
      invoice_id: 1,
      patient_id: patient.patient_id,
      consultation_id: consultation.consultation_id,
      subtotal: CONSULTATION_FEE + 20 * paracetamol.unit_price + 10 * amoxicillin.unit_price,
      discount_total: 0,
      total_amount: CONSULTATION_FEE + 20 * paracetamol.unit_price + 10 * amoxicillin.unit_price,
      paid_amount: CONSULTATION_FEE + 20 * paracetamol.unit_price + 10 * amoxicillin.unit_price,
      payment_status: 'Paid',
      created_by: receptionist.user_id,
    },
  });
  await prisma.invoiceItem.upsert({
    where: { invoice_item_id: 1 },
    update: {},
    create: { invoice_item_id: 1, invoice_id: invoice1.invoice_id, item_type: 'ConsultationFee', description: 'Consultation fee', qty: 1, unit_price: CONSULTATION_FEE, line_total: CONSULTATION_FEE },
  });
  await prisma.invoiceItem.upsert({
    where: { invoice_item_id: 2 },
    update: {},
    create: {
      invoice_item_id: 2,
      invoice_id: invoice1.invoice_id,
      item_type: 'Medicine',
      description: paracetamol.name,
      qty: 20,
      unit_price: paracetamol.unit_price,
      line_total: 20 * paracetamol.unit_price,
      source_prescription_item_id: 1,
    },
  });
  await prisma.invoiceItem.upsert({
    where: { invoice_item_id: 3 },
    update: {},
    create: {
      invoice_item_id: 3,
      invoice_id: invoice1.invoice_id,
      item_type: 'Medicine',
      description: amoxicillin.name,
      qty: 10,
      unit_price: amoxicillin.unit_price,
      line_total: 10 * amoxicillin.unit_price,
      source_prescription_item_id: 2,
    },
  });
  await prisma.payment.upsert({
    where: { payment_id: 1 },
    update: {},
    create: { payment_id: 1, invoice_id: invoice1.invoice_id, method: 'Cash', amount: invoice1.total_amount, received_by: receptionist.user_id },
  });

  // Backdated, single-line invoices so the revenue trend chart has a real multi-day series.
  const backdatedInvoices = [
    { invoice_id: 2, patient: patient2, amount: 2200, daysBack: 1 },
    { invoice_id: 3, patient, amount: 1800, daysBack: 3 },
    { invoice_id: 4, patient: patient2, amount: 3100, daysBack: 7 },
  ];
  for (const inv of backdatedInvoices) {
    const created = await prisma.invoice.upsert({
      where: { invoice_id: inv.invoice_id },
      update: {},
      create: {
        invoice_id: inv.invoice_id,
        patient_id: inv.patient.patient_id,
        subtotal: inv.amount,
        total_amount: inv.amount,
        paid_amount: inv.amount,
        payment_status: 'Paid',
        created_by: receptionist.user_id,
        created_at: daysAgo(inv.daysBack),
      },
    });
    await prisma.invoiceItem.upsert({
      where: { invoice_item_id: 100 + inv.invoice_id },
      update: {},
      create: { invoice_item_id: 100 + inv.invoice_id, invoice_id: created.invoice_id, item_type: 'ConsultationFee', description: 'Consultation & dispensing', qty: 1, unit_price: inv.amount, line_total: inv.amount },
    });
    await prisma.payment.upsert({
      where: { payment_id: 100 + inv.invoice_id },
      update: {},
      create: { payment_id: 100 + inv.invoice_id, invoice_id: created.invoice_id, method: 'Cash', amount: inv.amount, received_by: receptionist.user_id, received_at: daysAgo(inv.daysBack) },
    });
  }

  // An Outstanding invoice with a partial payment, to demo the partial-settlement path.
  const outstandingInvoice = await prisma.invoice.upsert({
    where: { invoice_id: 5 },
    update: {},
    create: {
      invoice_id: 5,
      patient_id: patient2.patient_id,
      consultation_id: pendingConsultation.consultation_id,
      subtotal: CONSULTATION_FEE + 5 * cetirizine.unit_price,
      total_amount: CONSULTATION_FEE + 5 * cetirizine.unit_price,
      paid_amount: 300,
      payment_status: 'PartiallyPaid',
      created_by: receptionist.user_id,
    },
  });
  await prisma.invoiceItem.upsert({
    where: { invoice_item_id: 5 },
    update: {},
    create: { invoice_item_id: 5, invoice_id: outstandingInvoice.invoice_id, item_type: 'ConsultationFee', description: 'Consultation fee', qty: 1, unit_price: CONSULTATION_FEE, line_total: CONSULTATION_FEE },
  });
  await prisma.invoiceItem.upsert({
    where: { invoice_item_id: 6 },
    update: {},
    create: {
      invoice_item_id: 6,
      invoice_id: outstandingInvoice.invoice_id,
      item_type: 'Medicine',
      description: cetirizine.name,
      qty: 5,
      unit_price: cetirizine.unit_price,
      line_total: 5 * cetirizine.unit_price,
      source_prescription_item_id: 3,
    },
  });
  await prisma.payment.upsert({
    where: { payment_id: 5 },
    update: {},
    create: { payment_id: 5, invoice_id: outstandingInvoice.invoice_id, method: 'Card', amount: 300, received_by: receptionist.user_id },
  });

  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      clinic_name: 'MediCare Clinic & Dispensary',
      clinic_address: '123 Galle Road, Colombo 03',
      registration_number: 'CLN-000123',
      default_consultation_fee: 500,
      expiry_alert_threshold_days: 90,
      updated_by: admin.user_id,
    },
  });

  const masterData: { type: string; value: string; sort_order: number }[] = [
    { type: 'MedicineCategory', value: 'Analgesic', sort_order: 1 },
    { type: 'MedicineCategory', value: 'Antibiotic', sort_order: 2 },
    { type: 'MedicineCategory', value: 'Antihistamine', sort_order: 3 },
    { type: 'MedicineCategory', value: 'Antacid', sort_order: 4 },
    { type: 'PaymentMethod', value: 'Cash', sort_order: 1 },
    { type: 'PaymentMethod', value: 'Card', sort_order: 2 },
    { type: 'PaymentMethod', value: 'Mobile', sort_order: 3 },
    { type: 'DiscountType', value: 'Senior Citizen', sort_order: 1 },
    { type: 'DiscountType', value: 'Staff', sort_order: 2 },
    { type: 'DiscountType', value: 'Goodwill', sort_order: 3 },
    { type: 'MedicalCondition', value: 'Hypertension', sort_order: 1 },
    { type: 'MedicalCondition', value: 'Diabetes Mellitus', sort_order: 2 },
    { type: 'MedicalCondition', value: 'Asthma', sort_order: 3 },
    { type: 'MedicalCondition', value: 'Allergic Rhinitis', sort_order: 4 },
    { type: 'MedicalCondition', value: 'Ischemic Heart Disease', sort_order: 5 },
    { type: 'MedicalCondition', value: 'Hyperlipidemia', sort_order: 6 },
    { type: 'DosageForm', value: 'Tablet', sort_order: 1 },
    { type: 'DosageForm', value: 'Capsule', sort_order: 2 },
    { type: 'DosageForm', value: 'Syrup', sort_order: 3 },
    { type: 'DosageForm', value: 'Suspension', sort_order: 4 },
    { type: 'DosageForm', value: 'Cream', sort_order: 5 },
    { type: 'DosageForm', value: 'Ointment', sort_order: 6 },
    { type: 'DosageForm', value: 'Gel', sort_order: 7 },
    { type: 'DosageForm', value: 'Drops', sort_order: 8 },
    { type: 'DosageForm', value: 'Eye Drops', sort_order: 9 },
    { type: 'DosageForm', value: 'Ear Drops', sort_order: 10 },
    { type: 'DosageForm', value: 'Injection', sort_order: 11 },
    { type: 'DosageForm', value: 'Inhaler', sort_order: 12 },
    { type: 'DosageForm', value: 'Sachet', sort_order: 13 },
    { type: 'DosageForm', value: 'Powder', sort_order: 14 },
    { type: 'DosageForm', value: 'Other', sort_order: 15 },
  ];
  for (const item of masterData) {
    await prisma.masterDataItem.upsert({
      where: { type_value: { type: item.type, value: item.value } },
      update: {},
      create: item,
    });
  }

  // ---- Lab test catalog -----------------------------------------------------------------
  // A small standard panel so lab-test-order flows (and their tests) work from a clean seed.
  const labCatalog: {
    test_name: string;
    test_code: string;
    category: string;
    abbreviation?: string;
    parameters: { parameter_name: string; unit?: string; reference_range?: string }[];
  }[] = [
    {
      test_name: 'Full Blood Count',
      test_code: 'FBC',
      category: 'Haematology',
      abbreviation: 'CBC',
      parameters: [
        { parameter_name: 'Haemoglobin', unit: 'g/dL', reference_range: '13-17' },
        { parameter_name: 'WBC Count', unit: '×10⁹/L', reference_range: '4-11' },
        { parameter_name: 'Platelets', unit: '×10⁹/L', reference_range: '150-450' },
        { parameter_name: 'RBC Count', unit: '×10¹²/L', reference_range: '4.5-5.5' },
        { parameter_name: 'PCV', unit: '%', reference_range: '40-50' },
        { parameter_name: 'Neutrophils', unit: '%', reference_range: '40-75' },
        { parameter_name: 'Lymphocytes', unit: '%', reference_range: '20-45' },
      ],
    },
    {
      test_name: 'Lipid Profile',
      test_code: 'LIPID',
      category: 'Biochemistry',
      abbreviation: 'Lipids',
      parameters: [
        { parameter_name: 'Total Cholesterol', unit: 'mg/dL', reference_range: '0-200' },
        { parameter_name: 'HDL Cholesterol', unit: 'mg/dL', reference_range: '40-60' },
        { parameter_name: 'LDL Cholesterol', unit: 'mg/dL', reference_range: '0-130' },
        { parameter_name: 'Triglycerides', unit: 'mg/dL', reference_range: '0-150' },
      ],
    },
    {
      test_name: 'Fasting Blood Sugar',
      test_code: 'FBS',
      category: 'Biochemistry',
      abbreviation: 'FBS',
      parameters: [{ parameter_name: 'Fasting Blood Glucose', unit: 'mg/dL', reference_range: '70-100' }],
    },
    {
      test_name: 'Liver Function Test',
      test_code: 'LFT',
      category: 'Biochemistry',
      abbreviation: 'LFT',
      parameters: [
        { parameter_name: 'AST (SGOT)', unit: 'U/L', reference_range: '0-40' },
        { parameter_name: 'ALT (SGPT)', unit: 'U/L', reference_range: '0-41' },
        { parameter_name: 'Total Bilirubin', unit: 'mg/dL', reference_range: '0.1-1.2' },
      ],
    },
    {
      test_name: 'Serum Creatinine',
      test_code: 'CREAT',
      category: 'Biochemistry',
      abbreviation: 'Creat',
      parameters: [{ parameter_name: 'Creatinine', unit: 'mg/dL', reference_range: '0.7-1.3' }],
    },
  ];
  for (const t of labCatalog) {
    const test = await prisma.labTestCatalog.upsert({
      where: { test_code: t.test_code },
      update: { test_name: t.test_name, category: t.category, abbreviation: t.abbreviation, is_active: true },
      create: { test_name: t.test_name, test_code: t.test_code, category: t.category, abbreviation: t.abbreviation },
    });
    await prisma.labTestParameter.deleteMany({ where: { test_id: test.test_id } });
    await prisma.labTestParameter.createMany({
      data: t.parameters.map((p, i) => ({
        test_id: test.test_id,
        parameter_name: p.parameter_name,
        unit: p.unit,
        reference_range: p.reference_range,
        display_order: i,
      })),
    });
  }

  console.log({ admin: admin.username, doctor: doctor.username, receptionist: receptionist.username, pharmacist: pharmacist.username });
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
