# Fixture source (fake data)

Input for the fixture vault in `../vault-fixture/`. Everything here is invented sample data shaped like the rows `scripts/export-vault.mjs` reads from Supabase; no real data. `fixture:<file>` image URLs resolve to files in this folder, and `fixture:missing.png` deliberately fails so the manifest shows a recorded image failure.

Regenerate the vault after changing the exporter or this data:

```bash
node scripts/export-vault.mjs --from-json docs/vault-fixture-source/data.json \
  --out docs/vault-fixture --tz America/New_York --now 2026-11-01T12:00:00.000Z
node scripts/check-vault.mjs docs/vault-fixture
```

If the regenerated vault differs from the committed one, the format changed: describe the change in `docs/vault-format.md`, and bump `schema` if old readers would misread the new files.
