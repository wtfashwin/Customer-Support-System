# Database schemas

`app/schema.prisma` and `app/migrations/` are the active Prisma schema and migration history. They own only the JavaScript application's `support_app` PostgreSQL schema.

Package commands scope the Prisma CLI connection to `support_app`, including its migration bookkeeping table. This is confined to the child process; keep the shared `DATABASE_URL` plain for Python.

The Python service owns its tables, vector extension, and Alembic version table in `public`. Its order/payment lookup tools read the JavaScript tables through explicit `support_app` names.

The older `schema.prisma` and `migrations/` files in this directory are preserved legacy history from the combined table layout. Current package scripts do not use them. Do not run those legacy migrations against the new layout.

The new baseline is for a fresh development database. An existing database with application tables in `public` needs a separately reviewed data and schema migration; changing the active schema path does not move existing records.
