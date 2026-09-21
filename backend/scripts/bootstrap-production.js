// One-time (and safe to re-run) production setup. Runs inside the production image with only its
// production dependencies — no tsx, no dev tooling:
//
//   docker compose -f docker-compose.prod.yml exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='<12+ chars>' \
//     backend node scripts/bootstrap-production.js
//
// It exists because production deliberately never runs the demo seed, so a fresh database has no
// users and no payment methods (every payment is rejected until at least one method exists).
//
//  - Admin: created only when ADMIN_PASSWORD is provided. Refuses to overwrite an existing username.
//  - Payment methods: the standard set is added ONLY when the clinic has no active payment method at
//    all. If you have already configured your own, nothing is touched. Adjust them any time under
//    Settings > Payment Methods.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const DEFAULT_PAYMENT_METHODS = ['Cash', 'Card', 'Mobile', 'Bank Transfer', 'Other'];
const MIN_PASSWORD_LENGTH = 12;

async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    const admins = await prisma.user.count({ where: { role: 'Admin', is_active: true } });
    console.log(admins > 0 ? `Admin: ${admins} active administrator(s) already exist — nothing to do.` : 'Admin: NO administrator exists yet. Re-run with ADMIN_PASSWORD set to create one.');
    return admins > 0;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Admin: ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return false;
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    console.error(`Admin: user "${username}" already exists — refusing to overwrite. Change the password from the app instead.`);
    return false;
  }
  const admin = await prisma.user.create({ data: { username, password_hash: await bcrypt.hash(password, 10), role: 'Admin' } });
  console.log(`Admin: created "${admin.username}" (user_id ${admin.user_id}).`);
  return true;
}

async function ensurePaymentMethods() {
  const active = await prisma.masterDataItem.count({ where: { type: 'PaymentMethod', is_active: true } });
  if (active > 0) {
    console.log(`Payment methods: ${active} active method(s) already configured — left untouched.`);
    return;
  }
  for (const [i, value] of DEFAULT_PAYMENT_METHODS.entries()) {
    await prisma.masterDataItem.upsert({
      where: { type_value: { type: 'PaymentMethod', value } },
      update: { is_active: true },
      create: { type: 'PaymentMethod', value, sort_order: i + 1 },
    });
  }
  console.log(`Payment methods: added ${DEFAULT_PAYMENT_METHODS.join(', ')}.`);
}

async function main() {
  const adminOk = await ensureAdmin();
  await ensurePaymentMethods();
  if (!adminOk) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
