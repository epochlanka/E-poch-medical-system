// Authentication intentionally fails closed without a strong JWT secret. Tests receive an
// isolated non-production key before application modules are evaluated.
process.env.JWT_SECRET = 'epoch-test-only-jwt-secret-never-use-in-production-2026';
