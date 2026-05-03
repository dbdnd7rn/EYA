# New App Backend (Isolated Supabase Schema)

This sets up a second backend for your new app without touching existing EYA tables.

## What was added

- SQL schema files:
  - `supabase/sql/20260303_campus_market_schema.sql`
  - `supabase/sql/20260402_order_handoffs.sql`
- New client: `lib/supabaseNewApp.ts`
- New env key: `EXPO_PUBLIC_NEW_APP_SCHEMA` (default: `campus_market`)

## Apply the schema in Supabase

1. Open Supabase Dashboard for your existing project.
2. Go to `SQL Editor`.
3. Paste and run the SQL from:
   - `supabase/sql/20260303_campus_market_schema.sql`
   - `supabase/sql/20260402_order_handoffs.sql`
4. Confirm new schema/tables exist under `campus_market`.

## Use the isolated client

Import this client only in the new app screens/services:

```ts
import { supabaseNewApp } from "@/lib/supabaseNewApp";

const { data, error } = await supabaseNewApp.from("vendors").select("*");
```

Because `supabaseNewApp` is configured with `db.schema = campus_market`, this query targets:

- `campus_market.vendors`

and does not affect existing `public.*` EYA data.

## Optional schema rename

If you want a different schema name, set:

```env
EXPO_PUBLIC_NEW_APP_SCHEMA=your_schema_name
```

and update the SQL schema name before running it.
