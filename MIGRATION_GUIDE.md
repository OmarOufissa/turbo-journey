# PostgreSQL Migration Guide

This guide walks you through migrating from SQLite to PostgreSQL using Neon.

## Prerequisites

1. **Connect to Neon MCP** - [Connect to Neon](#open-mcp-popover)
2. Once connected, Neon will provide you with a `DATABASE_URL`

## Migration Steps

### Step 1: Set DATABASE_URL

After connecting to Neon MCP, you'll receive a connection string. The system will automatically set it as an environment variable.

### Step 2: Generate Migration

Run the following command to generate the initial migration:

```bash
pnpm db:generate
```

This will create migration files in the `drizzle` directory based on your schema.

### Step 3: Push Schema to Database

Run the following command to push the schema to your PostgreSQL database:

```bash
pnpm db:push
```

This will create all tables, indexes, and constraints in your Neon database.

### Step 4: Restart Dev Server

The dev server should automatically restart and connect to PostgreSQL.

### Step 5: Seed Database (Optional)

If you want to seed the database with initial data from the Excel file:

```bash
curl -X POST http://localhost:5000/api/seed
```

Or use the UI to trigger the seeding process.

## Verification

1. Check that the demo user login works: `admin@example.com / admin123`
2. Verify that employee data is loading correctly
3. Test creating, updating, and deleting employees

## Available Database Commands

- `pnpm db:generate` - Generate migrations from schema changes
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run pending migrations
- `pnpm db:studio` - Open Drizzle Studio (database GUI)

## Rollback Plan

If you need to rollback to SQLite:

1. The old SQLite database is still available at `habilitations.db`
2. Restore the old `server/db.ts` from git history
3. Restart the dev server

## Benefits of PostgreSQL

✅ Production-ready database
✅ ACID compliance
✅ Better concurrency handling
✅ Automated backups (via Neon)
✅ Scalability
✅ Migration system for schema versioning
✅ Type-safe queries with Drizzle ORM

## Notes

- The compatibility layer ensures existing routes work without changes
- Gradually migrate to Drizzle ORM queries for better type safety
- Monitor database performance in Neon dashboard
