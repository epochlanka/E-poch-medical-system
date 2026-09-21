// Authentication intentionally fails closed without a strong JWT secret. Tests receive an
// isolated non-production key before application modules are evaluated.
process.env.JWT_SECRET = 'epoch-test-only-jwt-secret-never-use-in-production-2026';

// The integration tests log in with demo credentials and write settings, patients, payments and
// backups. They must NEVER run against a real clinic database, so the suite refuses to start
// unless it is pointed at an explicitly isolated, local one. `npm run test:isolated` starts a
// throwaway Postgres container and sets TEST_DATABASE_URL for you.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Tests must run against an isolated database — use `npm run test:isolated` ' +
      '(starts a throwaway local Postgres) or point TEST_DATABASE_URL at your own local test database.'
  );
}
const host = new URL(testUrl).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  throw new Error(`TEST_DATABASE_URL host "${host}" is not local — refusing to run tests against a remote database.`);
}
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
process.env.NODE_ENV = 'test';

// The ICD-11 tests mock fetch, but the service refuses to run without credentials being present.
// Provide fake ones so the suite never depends on (or leaks) whatever real keys the developer's
// backend/.env holds.
process.env.ICD11_CLIENT_ID = 'test-client-id';
process.env.ICD11_CLIENT_SECRET = 'test-client-secret';

// The clinic works in Sri Lanka time; day-boundary logic (reconciliation, "today") must be exercised
// in that zone, not in whatever zone the CI machine or a developer's laptop happens to use.
process.env.TZ = 'Asia/Colombo';

// Uploaded files and backup archives from the tests go to a throwaway directory, never into the
// real backend/uploads or backend/backups.
const os = require('os');
const fs = require('fs');
const path = require('path');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'epoch-test-'));
process.env.UPLOADS_DIR = path.join(scratch, 'uploads');
process.env.BACKUPS_DIR = path.join(scratch, 'backups');
