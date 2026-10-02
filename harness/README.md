# Tech Nerv DB harness

Runs SQL against the **TechNerv-Internal** Supabase project via the Management API. No dependencies, just Node 18+.
All app tables live in the `accounts` schema; migration bookkeeping lives in `_harness`.

```bash
cp .env.example .env        # add SUPABASE_ACCESS_TOKEN
npm run db -- help
npm run migrate             # apply migrations/*.sql in order, one transaction each
npm run seed                # reference data (tax rates, GIFI categories, company profile)
npm test                    # tests/*.sql, each inside a transaction that's rolled back
npm run db -- sql "select * from accounts.invoice_overview"
npm run db -- tables
```

Rules:
- Never edit an applied migration; add a new numbered file. `status` flags changed files.
- Tests fail by raising an exception, so they can insert anything without leaving data behind.
- `.env` holds a personal access token with full access to the Supabase org. Keep it out of git.
