# CLAUDE.md — Dealz K.K. Inventory System

## Project Overview

Dealz is an inventory, inspection, repair, and selling system for a refurb/resale business operating in Japan. It handles items sourced from auctions, wholesalers, and individual Kaitori (direct purchase from individuals). The system tracks items from intake through inspection, repair, and selling via live-selling links and a public shop page. It also supports a Kaitori flow where individuals sell their devices (phones, laptops, tablets) to us.

Full PRD: `docs/PRD.md`
Database Schema: `docs/DATABASE_SCHEMA.md`
Page & Component Map: `docs/PAGE_COMPONENT_MAP.md`

---

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router
- **QR Codes**: qrcode.react (display) + qrcode (print)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Deployment**: Vercel or Netlify (frontend) + Supabase Cloud (backend)

---

## Project Structure

```
dealz/
├── CLAUDE.md
├── docs/
│   ├── PRD.md
│   ├── DATABASE_SCHEMA.md
│   └── PAGE_COMPONENT_MAP.md
├── src/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── layout/               # Sidebar, header, page wrappers
│   │   ├── items/                # Item CRUD, QR display, bulk intake
│   │   ├── inspection/           # IT inspection workflow UI
│   │   ├── sell-groups/          # Sell group builder, item assignment
│   │   ├── orders/               # Order management, packing verification
│   │   ├── kaitori/              # Kaitori request management (staff side)
│   │   ├── shop/                 # Public shop components
│   │   └── shared/               # QR scanner, search bar, status badges
│   ├── pages/
│   │   ├── admin/                # Staff-facing pages (behind Supabase Auth)
│   │   ├── shop/                 # Public shop pages
│   │   ├── kaitori/              # Public Kaitori self-assessment pages
│   │   └── customer/             # Customer login, order history
│   ├── hooks/                    # Custom React hooks (useItems, useOrders, etc.)
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client initialization
│   │   ├── types.ts              # TypeScript types (generated from Supabase)
│   │   └── utils.ts              # Utility functions (formatPrice, formatCode, etc.)
│   ├── services/                 # Supabase query functions grouped by domain
│   │   ├── items.ts
│   │   ├── products.ts
│   │   ├── sell-groups.ts
│   │   ├── orders.ts
│   │   ├── kaitori.ts
│   │   ├── customers.ts
│   │   └── suppliers.ts
│   └── validators/               # Zod schemas for form validation
│       ├── item.ts
│       ├── order.ts
│       ├── kaitori.ts
│       └── customer.ts
├── supabase/
│   ├── migrations/               # SQL migration files (see DATABASE_SCHEMA.md)
│   ├── functions/                # Edge Functions
│   │   ├── generate-codes/       # Auto-generate P/PG/G/KT/ORD/CUST codes
│   │   ├── kaitori-quote/        # Calculate auto-quote from price list
│   │   ├── reserve-items/        # Reserve P-items when order is placed
│   │   └── customer-auth/        # Customer login/register (PIN-based)
│   └── seed.sql                  # Seed data for development
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Identifier Codes

All codes are auto-generated sequentially. Never allow manual entry.

| Code | Format | Example | Table | Purpose |
|------|--------|---------|-------|---------|
| P-code | P000000 | P000417 | items.item_code | Physical item (has QR sticker) |
| PG-code | PG000000 | PG000123 | photo_groups.photo_group_code | Photo group |
| G-code | G000000 | G000456 | sell_groups.sell_group_code | Sell group |
| KT-code | KT000000 | KT000789 | kaitori_requests.kaitori_code | Kaitori request |
| ORD-code | ORD000000 | ORD000001 | orders.order_code | Order |
| C-code | C000000 | C000001 | customers.customer_code | Customer |

---

## Auth Model

Two completely separate auth systems:

### Staff Auth (Supabase Auth)
- Email/password login via Supabase Auth
- Used for: admin panel, inspection, packing, Kaitori staff review
- RLS policies check `auth.uid()`

### Customer Auth (Custom, lightweight)
- Login with: **last_name + email or phone + 6-digit PIN**
- Stored in `customers` table with `pin_hash` (bcrypt)
- NOT Supabase Auth — handled via Edge Function `customer-auth`
- Same account for buying (shop/live-selling) and selling (Kaitori)
- `is_seller` flag activates seller features (bank details, ID verification)

---

## Database Tables (15 total)

See `docs/DATABASE_SCHEMA.md` for full SQL.

| # | Table | Purpose |
|---|-------|---------|
| 1 | product_models | Shared model specs (brand, chipset, screen, ports) |
| 2 | config_groups | Spec variants (CPU, RAM, storage, OS) |
| 3 | photo_groups | Visual identity by model + color (PG-code) |
| 4 | photo_group_media | Photos/videos for photo groups |
| 5 | items | Physical units (P-code) — the core table |
| 6 | sell_groups | Selling units (G-code) — groups by config + grade + price |
| 7 | sell_group_items | Junction: which P-items are in which G-code |
| 8 | suppliers | Auction houses, wholesalers, individual kaitori |
| 9 | customers | Buyer and seller accounts (shared) |
| 10 | orders | Customer purchases |
| 11 | order_items | Junction: which P-items are in which order |
| 12 | kaitori_price_list | Fixed pricing matrix for auto-quotes |
| 13 | kaitori_requests | Full Kaitori lifecycle tracking |
| 14 | kaitori_request_media | Photos uploaded by sellers |
| 15 | item_audit_logs | Tracks field-level changes to items (audit trail) |

---

## Condition Grades

| Grade | Meaning | Sellable |
|-------|---------|----------|
| S | Brand new / open box | Yes |
| A | Very good | Yes |
| B | Good | Yes |
| C | Fair | Yes |
| D | As-is, major issues | Yes |
| J | Junk / parts | **No** |

---

## Item Statuses

| Status | Meaning | Can sell? |
|--------|---------|-----------|
| INTAKE | Just arrived, not inspected | No |
| AVAILABLE | Inspected, ready to sell | **Yes** |
| REPAIR | Waiting for parts/repair | No |
| MISSING | Cannot be located | No |

---

## Kaitori Request Statuses

```
QUOTED → ACCEPTED → SHIPPED (or walk-in) → RECEIVED → INSPECTING
  → APPROVED → PAID
  → PRICE_REVISED → (seller accepts) → APPROVED → PAID
                   → (seller rejects) → CANCELLED
```

---

## Order Statuses

```
PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED
                                       → CANCELLED (at any point before SHIPPED)
```

---

## Business Rules (Guardrails)

### Selling
- Only AVAILABLE items can join sell groups
- Grade J items cannot be sold
- Photo groups must be verified before selling
- One item → one sell group at a time (unique constraint)
- One item → one order (unique constraint)
- Packing QR scan must match order_items

### Kaitori
- Seller must have verified ID (本人確認) before completing transaction
- Auto-quote requires matching kaitori_price_list entry
- Price revision requires a reason
- Seller must accept revised price before payment
- Bank details required for bank transfer
- Paid items enter inventory as `source_type = KAITORI`

---

## Frontend Conventions

- **TypeScript strict mode** — no `any` types
- **TanStack Query** for all Supabase data fetching. Consistent query key pattern: `['table-name', filters]`
- **React Hook Form + Zod** for all forms. Zod schemas in `src/validators/`
- **shadcn/ui** as component base. Don't rebuild what shadcn provides
- **Tailwind only** for styling. No CSS files except globals
- **No inline styles**
- **Functional components only** with hooks. No class components
- **File naming**: kebab-case for files (`item-list.tsx`), PascalCase for components (`ItemList`)
- **Barrel exports**: Each component folder has an `index.ts`
- **Error handling**: All Supabase calls wrapped in try/catch with toast notifications
- **Loading states**: Use TanStack Query's `isLoading` / `isPending` with skeleton components

---

## Supabase Conventions

- Client initialized in `src/lib/supabase.ts` (single instance)
- Service functions in `src/services/` — one file per domain
- **RLS on every table** — no exceptions
- **Storage buckets**: `photo-group-media`, `kaitori-media`, `id-documents`
- **Realtime** subscriptions for: shop page stock counts, order status changes
- **Edge Functions** for: code generation, customer auth, Kaitori quote calculation, item reservation

---

## MCP Servers

This project uses two MCP servers with Claude Code. These give Claude Code direct access to the Supabase database and GitHub repo.

### Supabase MCP

Lets Claude Code run SQL queries, manage tables, apply migrations, generate TypeScript types, and search Supabase docs — all without leaving the terminal.

**Setup (run in terminal, not inside Claude Code):**

```bash
# Option 1: Remote MCP (Supabase Cloud) — recommended
claude mcp add supabase \
  --transport http \
  --url "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF" \
  -s project
```

Replace `YOUR_PROJECT_REF` with your Supabase project ID (found in Project Settings → General).

Your MCP client will automatically redirect you to log in to Supabase during setup. No personal access token needed.

**Key tools available:**
- `execute_sql` — Run any SQL query against your dev database
- `apply_migration` — Apply DDL/schema changes (tracked in migration history)
- `list_tables` / `get_table` — Inspect database schema
- `generate_typescript_types` — Generate types from your schema
- `search_docs` — Search Supabase documentation
- `get_logs` — Retrieve project logs for debugging
- `list_extensions` — View available PostgreSQL extensions

**Safety flags:**
```bash
# Read-only mode (recommended when exploring data):
claude mcp add supabase-readonly \
  --transport http \
  --url "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=read_only" \
  -s project
```

**Important:** Only connect to your development project, never production. See [Supabase MCP security docs](https://supabase.com/docs/guides/getting-started/mcp).

---

### GitHub MCP

Lets Claude Code create branches, manage PRs, create issues, search code, and interact with your repo directly.

**Setup (run in terminal, not inside Claude Code):**

```bash
# Option 1: HTTP transport (simplest for Claude Code)
claude mcp add github \
  --transport http \
  -s project \
  -- https://api.githubcopilot.com/mcp \
  -H "Authorization: Bearer YOUR_GITHUB_PAT"

# Option 2: Using add-json (Claude Code v2.1.1+)
claude mcp add-json github '{
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_GITHUB_PAT"
  }
}'
```

**Creating your GitHub PAT:**
1. Go to https://github.com/settings/tokens
2. Generate a new token (fine-grained recommended)
3. Grant permissions: `repo` (full), `issues` (read/write), `pull_requests` (read/write)

**Key tools available:**
- `create_branch` / `create_pull_request` — Branch and PR management
- `create_issue` / `list_issues` — Issue tracking
- `search_code` / `search_repositories` — Code search
- `get_file_contents` / `push_files` — Read and write files
- `list_commits` — View commit history

---

### Blotato MCP (Social Media)

Lets Claude Code schedule and upload social media posts via Blotato. Used by the `/post` command.

**Setup (run in terminal, not inside Claude Code):**

```bash
claude mcp add blotato \
  --transport http \
  --url "https://mcp.blotato.com/mcp" \
  --header "blotato-api-key: <BLOTATO_API_KEY>" \
  -s project
```

Get your API key from the Blotato dashboard: Settings → API.

**Key tools available:**
- Upload media to connected social accounts
- Schedule posts using `useNextFreeSlot` for optimal timing
- List connected social accounts and platforms

**Docs:**
- MCP docs: https://help.blotato.com/api/mcp
- API reference: https://help.blotato.com/api/llm

---

### Verify MCP Connections

After setup, verify both servers are connected:

```bash
# List all configured MCP servers
claude mcp list

# Check specific server
claude mcp get supabase
claude mcp get github
```

Inside Claude Code, you can also run `/mcp` to see server status.

### .mcp.json (Project-scoped config)

When you use `-s project` scope, Claude Code creates a `.mcp.json` file in your project root that team members can share. **Do not commit tokens** — use environment variables instead:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF"
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      }
    }
  }
}
```

Store secrets in your shell profile:
```bash
export GITHUB_PAT=ghp_your_token_here
```

---

## Common Development Tasks

### Adding a new page
1. Create page component in `src/pages/`
2. Add route in React Router config
3. Create service functions in `src/services/` if new queries needed
4. Create Zod validators in `src/validators/` if forms involved
5. Use TanStack Query hooks for data fetching

### Adding a new database table
1. Write migration SQL in `supabase/migrations/`
2. Run `supabase db push` or `supabase migration up`
3. Regenerate TypeScript types: `supabase gen types typescript`
4. Add RLS policies in the migration
5. Create service functions in `src/services/`

### Working with QR codes
- Display: `<QRCodeSVG value="P000417" />` from qrcode.react
- Print: Use qrcode library to generate image for print layout
- QR always encodes the P-code string
- Scanning: Use device camera or USB scanner → decode → fetch item by item_code

### Working with file uploads
- Use Supabase Storage `upload()` method
- Store the returned path in the relevant `file_url` / `id_document_url` column
- Generate signed URLs for display (especially for ID documents)
- Bucket policies: `photo-group-media` (public read), `kaitori-media` (public read), `id-documents` (staff only)

### Image Processing Standards
All product/item photos stored in Supabase must follow these rules:

- **Two sizes per image** (generated on upload):
  - **Display**: 1080x1080px — for product pages, galleries, and zoom
  - **Thumbnail**: 256x256px — for cards, lists, and grids
- **Format**: WebP preferred, JPEG fallback
- **Compression**: Display 82% quality, Thumbnail 80% quality
- **Naming convention**: `{uuid}_display.webp`, `{uuid}_thumb.webp`
- **Processing pipeline**: Original → center crop to square → resize to each size → compress → upload all three
- **Library**: Use `sharp` (server-side via Edge Function) or `browser-image-compression` (client-side)
- **Applies to**: `photo_group_media`, `kaitori_request_media`
- **Does NOT apply to**: `id_documents` (keep original quality for legal compliance)
- **Storage paths**: `photo-group-media/{photo_group_id}/{uuid}_{size}.webp`

```typescript
// Image size constants
const IMAGE_SIZES = {
  display:   { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256,  height: 256,  quality: 0.80 },
} as const;
```

**Usage in components:**
- `ProductCard` / `ShopProductGrid` → use thumbnail (256px)
- `ProductGallery` / `ProductDetail` → use display (1080px)
- `ImageLightbox` / zoom view → use display (1080px)
