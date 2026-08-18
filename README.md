# Tablo — truck queue management

Queue and dock management for a warehouse yard, plus a public display board for
drivers. Next.js (App Router) + Prisma on SQLite, NextAuth with optional
LDAP/Active Directory authentication.

## Getting started

```bash
npm install
cp .env.example .env      # then fill it in, see "Environment" below
npx prisma generate
ADMIN_INITIAL_PASSWORD='choose-something-long' npx prisma db seed
npm run dev
```

Open http://localhost:3000 — it redirects to the queue board. Sign in as `admin`
with the password you passed to the seed, then change it.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (`output: standalone`) |
| `npm test` | Unit and integration tests (`node --test`, requires Node 22+) |
| `npm run lint` | ESLint over `src/` |

## Routes

| Path | Who | What |
|---|---|---|
| `/queue` | any signed-in user | Dispatcher board: register, call, dock, complete |
| `/dashboard` | any signed-in user | Counts, current queue, dock status |
| `/docks` | any signed-in user (manage: SUPERVISOR+) | Dock states |
| `/register` | any signed-in user | Register an arriving truck |
| `/display` | **public** | Board for drivers, no login |
| `/settings/*` | SUPERVISOR+ (LDAP: ADMIN) | Configuration |

`/display` and `GET /api/display` are intentionally unauthenticated — they feed the
screen in the yard. Everything else requires a session; see `src/lib/api-auth.ts`,
which is the single place route authorization is decided.

## Environment

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | SQLite path. Docker defaults to `file:/app/data/tablo.db` |
| `NEXTAUTH_SECRET` | yes | Session signing key — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | Base URL for auth callbacks |
| `LDAP_ENCRYPTION_KEY` | in production | 32 bytes hex (`openssl rand -hex 32`). Encrypts the LDAP service-account password at rest. The app refuses to start in production without it |
| `ADMIN_INITIAL_PASSWORD` | first run only | Password of the initial `admin` account, min 12 chars. Read only while creating a fresh database |
| `EXTERNAL_API_URL` | for cargo sync | Base URL of the external cargo API |
| `EXTERNAL_API_USERNAME` | for cargo sync | |
| `EXTERNAL_API_PASSWORD` | for cargo sync | |

There are no default credentials. The seed and the container entrypoint both refuse
to create the admin account unless `ADMIN_INITIAL_PASSWORD` is set.

## Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` requires `NEXTAUTH_SECRET` and `LDAP_ENCRYPTION_KEY` and will
refuse to start without them. Set `ADMIN_INITIAL_PASSWORD` for the first run. Data
lives in the `tablo_data` volume at `/app/data/tablo.db`.

## Database schema

⚠️ The schema has two sources right now:

- `prisma/schema.prisma` — what the application's Prisma client is generated from.
- `docker-entrypoint.sh` — hand-written `CREATE TABLE`/`ALTER TABLE` that
  initialises and patches the SQLite file in the container.

There is no `prisma/migrations` directory, so **any schema change has to be made in
both places**, and the entrypoint's DDL must stay compatible with existing volumes.
Moving to `prisma migrate deploy` is the intended fix; it needs the live databases
baselined first (`prisma migrate resolve --applied`), which is why it has not been
done yet.

`src/lib/docks.test.mts` builds its throwaway database from `schema.prisma` via
`prisma migrate diff`, so at least the Prisma schema is exercised by the test suite.

## LDAP / Active Directory

Configured at `/settings/authentication/ldap` (ADMIN only). Supports LDAP, LDAPS and
STARTTLS, group-to-role mapping, allow/deny group lists, and blocking accounts that
are disabled, locked or expired in AD.

`disableLocalFallback` controls what happens when LDAP cannot authenticate a user:
with it off, the local password table is tried as a fallback; with it on, the login
is refused — including when the directory is unreachable, so that taking the
directory offline cannot downgrade the whole application to local passwords. See
`src/lib/ldap-auth-policy.ts`.
