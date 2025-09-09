# Supabase Migrations — LLM Memory Note

This note tells the LLM exactly where to place migration files, how to name them, how to generate the date/sequence prefix, and how our local (Docker) and hosted Supabase databases relate to the project.

## Location

- Directory: `supabase/migrations`
- Enabled by: `[db.migrations]` in `supabase/config.toml`
- Seeds (for local resets): `supabase/seed/*.sql`

## Naming Convention

Use a sortable, date+sequence prefix followed by a concise, snake_case description.

- Pattern: `YYYYMMDDSSSSS_description.sql`
  - `YYYYMMDD`: UTC date
  - `SSSSS`: 5‑digit, zero‑padded sequence for that day (start at `00001`)
  - `description`: short snake_case summary (e.g., `add_devices_index`)
- Examples:
  - `2025010900001_initial_schema.sql`
  - `2025010900008_web_portal_rls_policies.sql`
  - `2025010900013_add_device_heartbeat_metrics.sql`
- Rules:
  - Always use UTC for the date prefix.
  - Increment the 5‑digit sequence when creating multiple migrations on the same day.
  - Use forward‑only, idempotent SQL where practical and avoid destructive changes unless explicitly planned.

## Generating the Date + Sequence

Use UTC so filenames sort consistently across environments.

### Bash (POSIX)

```bash
DAY=$(date -u +%Y%m%d)
LAST=$(ls -1 supabase/migrations/${DAY}*.sql 2>/dev/null \
  | sed -E 's/.*([0-9]{5})_.*/\1/' \
  | sort | tail -n1)
SEQ=$(printf "%05d" $(( ${LAST:-0} + 1 )))
NAME="${DAY}${SEQ}_your_change.sql"
echo "Next migration: supabase/migrations/${NAME}"
```

### Node (cross‑platform UTC date)

```bash
DAY=$(node -e "const d=new Date();const p=n=>String(n).padStart(2,'0');\
  console.log(d.getUTCFullYear()+''+p(d.getUTCMonth()+1)+p(d.getUTCDate()))")
```

## Using Time in SQL

Follow repository patterns for timestamps and avoid non‑immutable functions in indexes.

- Column defaults: use `TIMESTAMPTZ DEFAULT NOW()`
  - Example: `created_at TIMESTAMPTZ DEFAULT NOW()`
- `NOW()`/`CURRENT_TIMESTAMP` are stable per transaction, which is correct for audit columns.
- If you need the actual wall‑clock at statement time, `clock_timestamp()` is available, but do not use it in index expressions.
- Avoid using non‑immutable time functions in index definitions (see existing comment in `2025010900004_indexes_and_performance.sql`).

## Applying Migrations

### Local (Docker‑based Supabase)

- Quick apply: `npx supabase db push`
- Full reset + seed for tests: `npm run test:supabase:init`
  - Local services:
    - API: `http://localhost:54321`
    - DB: `postgresql://postgres:postgres@localhost:54322/postgres`
    - Studio: `http://localhost:54323`
- Seeds run from `supabase/seed` during resets per `supabase/config.toml`.

### Hosted Supabase (Cloud project)

- Link once: `supabase link --project-ref $SUPABASE_PROJECT_ID`
- Apply migrations: `supabase db push`
- Ensure environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`) are set where applicable.

## How the Databases Fit the Project

- Local Supabase (Docker):
  - Purpose: Developer/CI environment for fast iteration, resets, and seeding.
  - Usage: Run tests, validate schema changes, and iterate on migrations safely.
- Hosted Supabase (Cloud):
  - Purpose: Canonical persistent database for staging/production — auth, RLS, realtime, and data persistence for the platform.
  - Usage: Apply the same versioned migrations from the repo to keep schema in lock‑step with local.
- Single source of truth: The migration files in `supabase/migrations` define the schema for both environments.

## Checklist for New Migrations

- [ ] Create file in `supabase/migrations` named with `YYYYMMDDSSSSS_description.sql` (UTC date).
- [ ] Use `TIMESTAMPTZ DEFAULT NOW()` for audit columns; avoid non‑immutable time functions in indexes.
- [ ] Test locally: `npx supabase db push` (or `npm run test:supabase:init` for a clean reset).
- [ ] If applicable, add/update seed data in `supabase/seed` for local testing.
- [ ] Apply to hosted environment via `supabase db push` after linking.

---

References: `supabase/config.toml`, `supabase/migrations/*`, `scripts/test-db-init.sh`.
