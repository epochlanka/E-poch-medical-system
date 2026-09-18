import { PrismaClient } from '@prisma/client';

// Single shared PrismaClient for the whole process. Each PrismaClient instance opens its own
// connection pool (default size = num_cpus * 2 + 1); this app used to instantiate one per
// module (~20 of them), which against Supabase's pooled Postgres connection limit exhausted
// available connections within minutes of real usage ("unable to connect to database"). Import
// this instance everywhere instead of calling `new PrismaClient()`.
export const prisma = new PrismaClient();
