import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // This creates a well-known admin/admin123 account — never run it against a real,
  // internet/LAN-reachable deployment. Production database setup is a one-time, explicit,
  // manual step (create the real admin account by hand), not something that runs on boot.
  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production — skipping demo seed (refusing to create default admin/admin123).');
    return;
  }

  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password_hash: adminHash, role: 'Admin' },
  });

  console.log({ admin: admin.username });
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
