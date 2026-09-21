// One-time production setup: creates the first real Admin account. Demo seeding (prisma/seed.ts)
// refuses to run in production on purpose, so a fresh database has zero users until this runs.
// Safe to re-run: it refuses if the username already exists rather than resetting its password.
//
// Usage:
//   ADMIN_USERNAME=admin ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('Set ADMIN_PASSWORD (and optionally ADMIN_USERNAME) in the environment before running this script.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`User "${username}" already exists — refusing to overwrite. Change the password via the app instead.`);
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: { username, password_hash, role: 'Admin' },
  });

  console.log(`Created admin user "${admin.username}" (user_id ${admin.user_id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
