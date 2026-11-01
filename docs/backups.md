# Backups

How to back up the production Supabase database (project `memex`, ref `zwgotlojioprtjvrxltc`) and restore it. Added 2026-11-01. Once the vault backend lands (ROADMAP v2), backups move to R2 versioning and the `~/memex` mirror; until then this is the safety net.

**Rule for agents and humans alike: take a backup before any migration** (see “Safety rules for agents” in `CLAUDE.md`).

## What a backup is

`scripts/backup-supabase.sh` writes one folder per run, outside the repo:

```
~/memex-backups/2026-11-01T222601Z/
  roles.sql        role settings (Supabase's platform roles; no custom roles today)
  schema.sql       every non-Supabase-managed schema: tables, RLS policies, functions, grants
  data.sql         all rows, including auth.users and storage metadata (COPY format)
  row-counts.txt   rows per table, for checking a restore
  SHA256SUMS       checksums of the three .sql files
  README.txt       project, time, git commit
```

The folder is `chmod 700` and files `600`: they hold every note and jot plus `auth.users` (password hashes). Keep backups off shared drives, and copy them somewhere encrypted if they leave this Mac. Storage buckets are empty today (images are hotlinked), so there are no files to copy beyond the database.

## Taking a backup

Needs Node (for `npx`), Docker Desktop running, and a Supabase CLI login for the account that owns the project (`npx supabase@2 login`, once).

```bash
scripts/backup-supabase.sh                       # → ~/memex-backups/<UTC timestamp>/
scripts/backup-supabase.sh --out /Volumes/Backup/memex-backups
MEMEX_BACKUP_DIR=~/Dropbox/memex-backups scripts/backup-supabase.sh
```

No database password is needed: a current CLI (2.x via `npx`; the Homebrew 2.12 build is too old and asks for one) signs in through a temporary login role over the IPv4 pooler. If you'd rather use the password, pass the pooler connection string from Dashboard → Connect: `SUPABASE_DB_URL='postgresql://…' scripts/backup-supabase.sh`.

The script only reads. It runs three `supabase db dump` calls (the same files as Supabase's own [backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)) and refuses to write inside the repo. `storage.buckets_vectors` and `storage.vector_indexes` are skipped: memex doesn't use them and `postgres` can't write them on a fresh project.

## Restoring

Restore into a **new, empty** Supabase project (or a local stack), never on top of live data. Use the pooler (session mode) connection string of the target project; `psql` 14 or newer works.

```bash
cd ~/memex-backups/<timestamp>
shasum -a 256 -c SHA256SUMS                    # files intact?

export TARGET_DB_URL='postgresql://postgres.<new-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'

# 1. Role settings: best effort. The "supabase_admin is a reserved role" error is expected.
psql --file roles.sql --dbname "$TARGET_DB_URL"

# 2. Schema + data in one transaction; any error rolls the whole thing back.
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$TARGET_DB_URL"

# 3. Check every table against the backup's counts.
while read -r t n; do
  c=$(psql -Atc "select count(*) from $t" "$TARGET_DB_URL")
  [ "$c" = "$n" ] || echo "MISMATCH $t: backup $n, restored $c"
done < row-counts.txt
```

Then point the app at the new project: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` and `.env.production` (rebuild + `npm run deploy`), the `memex-api` worker's Supabase secrets (`api/README.md`), Auth → URL configuration (site URL and redirect URLs for the live origin) and the GitHub OAuth provider settings. Signed-in sessions are restored with `auth.*`, but expect to sign in again. API tokens survive the restore (they're rows in `api_tokens`).

### Practising a restore locally

Tested 2026-11-01 against the backup above: all 45 tables matched. To repeat it without touching any real project:

```bash
mkdir -p /tmp/memex-restore-test && cd /tmp/memex-restore-test
npx supabase@2 init
sed -i '' 's/^project_id = .*/project_id = "memex-restore-test"/; s/^major_version = .*/major_version = 15/' supabase/config.toml
npx supabase@2 start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor
export TARGET_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
# … run steps 1–3 above from the backup folder …
npx supabase@2 stop --no-backup && rm -rf /tmp/memex-restore-test
```

## Restoring one table or a few rows

Don't restore the whole database to fix one mistake. Restore into a local stack as above, then copy just what you need across with `COPY … TO STDOUT` / `\copy` (or `pg_dump --data-only --table public.<name>` from the local stack), and review it before applying to production. Anything that changes production data needs Ryan's say-so.
