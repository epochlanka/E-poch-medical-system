// Fails (exit 1) if any public table lacks row-level security, or if Supabase's API roles hold
// any privilege on public tables. Run at production startup (docker-entrypoint.sh) so a future
// migration that forgets to lock a new table cannot silently ship an open database.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const noRls = await prisma.$queryRaw`
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    ORDER BY 1`;

  const grants = await prisma.$queryRaw`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    ORDER BY 1, 2, 3`;

  if (noRls.length === 0 && grants.length === 0) {
    console.log('Database security check passed: RLS enabled on all public tables, no anon/authenticated grants.');
    return;
  }

  if (noRls.length) console.error(`RLS is DISABLED on: ${noRls.map((r) => r.table_name).join(', ')}`);
  if (grants.length) {
    const roles = [...new Set(grants.map((g) => g.grantee))].join(', ');
    console.error(`${roles} hold ${grants.length} privilege(s) on public tables (e.g. ${grants[0].grantee} ${grants[0].privilege_type} on ${grants[0].table_name}).`);
  }
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('Database security check could not run:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
