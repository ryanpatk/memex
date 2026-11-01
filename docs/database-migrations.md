# Database Migrations Guide

This document explains how to manage database schema changes using Supabase CLI migrations.

## Initial Setup (Already Done)

```bash
# Initialize Supabase in your project
supabase init

# Link to your remote Supabase project
supabase link --project-ref zwgotlojioprtjvrxltc
```

## Creating New Migrations

When you need to make database schema changes:

```bash
# Create a new migration file
supabase migration new <migration_name>

# Example:
supabase migration new add_user_preferences_table
supabase migration new add_tags_to_projects
supabase migration new update_links_add_metadata
```

This creates a new file in `supabase/migrations/` with a timestamp prefix.

## Writing Migration SQL

Edit the generated migration file with your SQL changes:

```sql
-- Example: Adding a new column
ALTER TABLE projects ADD COLUMN color VARCHAR(7) DEFAULT '#000000';

-- Example: Creating a new table
CREATE TABLE user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  theme VARCHAR(20) DEFAULT 'light',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example: Adding RLS policies for new table
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);
```

## Applying Migrations

### To Remote Database (Production)

**Back up first** (`scripts/backup-supabase.sh`, see `docs/backups.md`), and only push additive migrations without Ryan's sign-off (`CLAUDE.md` → “Safety rules for agents”).

```bash
# Push all pending migrations to your remote Supabase database
supabase db push
```

You'll be prompted for your database password. Get it from:
- Supabase Dashboard → Settings → Database → Connection string
- Or reset it if you don't remember it

### Testing Locally (Optional)

```bash
# Start local Supabase (includes PostgreSQL, Auth, etc.)
supabase start

# Apply migrations to local database
supabase db reset

# Stop local services when done
supabase stop
```

## Best Practices

### 1. Always Use Migrations
- Never make manual changes directly in the Supabase SQL Editor for schema changes
- Always create a migration file first
- This ensures version control and reproducibility

### 2. Migration Naming
Use descriptive names:
- `add_tags_table` ✅
- `update_projects_schema` ✅  
- `fix_rls_policies` ✅
- `migration1` ❌

### 3. Test Before Pushing
- Test your SQL in a local environment or staging first
- Make sure migrations are reversible if possible
- Document any breaking changes

### 4. Rollback Strategy
If you need to undo a migration:

```sql
-- Create a new migration to reverse changes
-- Example: If you added a column, create a migration to drop it

ALTER TABLE projects DROP COLUMN IF EXISTS color;
```

### 5. Data Migrations
For data changes (not just schema):

```sql
-- Example: Populate new column with default values
UPDATE projects SET color = '#FF6B35' WHERE is_starred = true;
UPDATE projects SET color = '#000000' WHERE is_starred = false;
```

## Syncing Remote Changes

If someone makes manual changes in production:

```bash
# Pull remote schema to create a new migration
supabase db pull
```

This creates a migration file with the differences.

## Common Migration Examples

### Adding a New Column
```sql
ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_projects_archived ON projects(archived_at) WHERE archived_at IS NOT NULL;
```

### Adding a New Table with RLS
```sql
CREATE TABLE project_collaborators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project owners can manage collaborators" ON project_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_collaborators.project_id 
      AND projects.user_id = auth.uid()
    )
  );
```

### Modifying Existing Policies
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;

-- Create updated policy
CREATE POLICY "Users can view accessible projects" ON projects
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM project_collaborators 
      WHERE project_collaborators.project_id = projects.id 
      AND project_collaborators.user_id = auth.uid()
    )
  );
```

## Troubleshooting

### Migration Fails
1. Check SQL syntax
2. Ensure referenced tables/columns exist
3. Check for naming conflicts
4. Verify RLS policies don't conflict

### Connection Issues
1. Verify database password
2. Check network connection
3. Try `supabase link` again if needed

### Reset Everything (Nuclear Option)
```bash
# This will DELETE ALL DATA and reset to latest migration
supabase db reset --linked
```

## File Structure

After setup, your project will have:

```
supabase/
├── config.toml              # Project configuration
├── migrations/              # All migration files
│   └── 20250719201741_initial_schema.sql
└── seed.sql                 # Optional: seed data for development
```

## Next Steps

1. Always create migrations for schema changes
2. Test migrations locally when possible  
3. Keep migration files in version control
4. Document breaking changes in commit messages
5. Consider creating seed data for development in `supabase/seed.sql`

For more details, see the [Supabase CLI documentation](https://supabase.com/docs/guides/cli).