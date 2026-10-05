# Smart Durian Farm

GitHub **main** now contains all existing branches through **PR #5**, merge commit **c71820d** (verified 2026-10-05). Its tree matches the integrated code that passed 89 tests, lint, typecheck and build. Feature branches remain available. User ERD/MQTT/Postman edits and local .env are preserved outside the integration commits. Branch descriptions below record the original module batches.

The next module branch is **feat/devices-management**, based on this merged main. Devices business rules are awaiting confirmation; no Devices API has been implemented yet. Read [Devices preparation and open decisions](docs/DEVICES_WORKFLOW_DESIGN.md), [branch integration notes](docs/BRANCH_INTEGRATION.md) and [handoff](docs/MODULE_HANDOFF.md) before continuing.

Monorepo for a NestJS backend, React web and React Native Android application. The API includes database connectivity and local in-memory Auth/Users, catalogs, Cooperatives, Farm approvals, Zones, Farmer assignments, Trees and Tree Harvests; clients follow later.

## Local API setup

Requires Node.js 20.19+ and npm. Run from the repository root:

```powershell
npm install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
docker compose up -d
npm run dev:api
```

Health: http://localhost:3000/api/health (API liveness only).
Swagger: http://localhost:3000/api/docs.
OpenAPI JSON: http://localhost:3000/api/docs-json.
Readiness: http://localhost:3000/api/health/ready (200 when both databases respond; 503 otherwise).

Start Docker Desktop before running Compose. PostgreSQL and MongoDB are bound to localhost. Compose initializes MongoDB as a single-node replica set for later transactions. The API runs on the host; its MongoDB URI uses directConnection=true. This Compose setup is for local development only; MongoDB is not authenticated.

If .env already exists, add DATABASE_URL, MONGODB_URI and DB_TIMEOUT_MS from .env.example instead of overwriting your configuration. PostgreSQL Compose also requires POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB. Changing credentials does not modify an existing PostgreSQL volume.

```powershell
docker compose ps -a
docker compose logs mongo-init
docker compose stop
```

Stopping containers preserves their database volumes.

```powershell
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration --workspace @smart-durian/api
npm run start --workspace @smart-durian/api
```

Business-module Postman collections use literal URLs/JSON: paste JWT/UUID/OTP manually, with no scripts or environment. The older Foundation collection has an optional Local environment. Only implemented endpoints are included. Do not export real credentials or tokens to Git.

## Structure

- apps/api: REST API and future database/MQTT modules.
- apps/web: future React/Vite web.
- apps/mobile: future React Native Android app.
- ai: future AI/RAG work.
- docs: specifications, ERD, implementation plan and Postman files.

Database connection providers and readiness checks are implemented. Auth is available only as a local in-memory test module; migrations, seed and real authentication persistence remain outstanding. Connectivity readiness does not verify schema or seed. The ERD remains the schema authority.

## Auth local test

Set AUTH_MODE=mock, SMS_PROVIDER=mock, NODE_ENV=development and AUTH_TEST_PHONE, AUTH_TEST_PASSWORD, JWT_SECRET in .env using .env.example. Restart the API after changing config. Mock account mode binds to 127.0.0.1 and cannot run in production.

Import docs/postman/Auth-Local-Test.postman_collection.json and the Local environment. Run requests 01 through 11 in order. The SMS outbox is simulated; no real SMS is sent and no database tables or real account records are created. Restart the API before each full run to restore the original test password.

See docs/AUTH_IMPLEMENTATION.md for endpoint contracts, OTP limits and session continuation notes.

## Real SMS demo

The selected provider is **Twilio Verify**. Read [docs/TWILIO_VERIFY_INTEGRATION.md](docs/TWILIO_VERIFY_INTEGRATION.md). Keep AUTH_MODE=mock for in-memory accounts; set SMS_PROVIDER=twilio, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID, SMS_ALLOWED_PHONE matching AUTH_TEST_PHONE, and LIVE_SMS_ENABLED=true in your local .env. Set the Verify Service code length to 6. Never commit credentials. Mock defaults do not send paid SMS.

Import only docs/postman/Twilio-Verify-Demo.postman_collection.json and open **Smart Durian Farm - Twilio Verify - Nhap JSON**. No environment, variables or scripts are needed. Enter JSON directly in Body: 01 login, 02 request SMS OTP, 03 enter the received code and new password, 04 login with the new password. Replace the sample phone with AUTH_TEST_PHONE. Twilio generates/checks the code. No new npm dependency, table or database write is required.

## Users registration and Manager approval

For the latest branch order and session setup, read [docs/MODULE_HANDOFF.md](docs/MODULE_HANDOFF.md).

Read [docs/USERS_IMPLEMENTATION.md](docs/USERS_IMPLEMENTATION.md). Farmer registration becomes Active immediately; Manager verifies an email address through SMTP, registers Pending and becomes Active only when Admin approves and creates/assigns a Cooperative. Public Admin registration is rejected. Accounts and Cooperatives remain in memory; restarting clears registrations and restores configured fixtures.

Nodemailer has been added for real verification email. Configure SMTP_USER/PASSWORD/FROM and EMAIL_PROVIDER=smtp in the root .env; Gmail sending requires an App Password. Recipient email can use any valid domain. Configure AUTH_TEST_ADMIN_PHONE/PASSWORD for the local Admin fixture. Preserve existing Twilio credentials. Profile email preferences and password-reset email fallback are future work.

Import **docs/postman/Users-Local-Test.postman_collection.json**, open **Smart Durian Farm - Users - Nhap JSON**, and edit JSON directly. Copy verification_id, the emailed OTP, verification token, Manager id and Admin JWT manually as instructed in each request. No scripts or environment variables are required. The four-request Twilio collection is unchanged. USERS originally passed 29 automated tests; see MODULE_HANDOFF.md for the latest full-suite result, using fake transports without sending real email/SMS.

## Agricultural materials catalog

Admin can create/update/deactivate materials; Active users can read and search with pagination. Data stays in memory, without inventory management. See [docs/MATERIALS_IMPLEMENTATION.md](docs/MATERIALS_IMPLEMENTATION.md). Import docs/postman/Materials-Local-Test.postman_collection.json; edit literal JSON and paste the login JWT into Authorization. No new dependencies.

## Farming standards catalog

The same Admin-write/Active-user-read rules apply to standards. See [docs/STANDARDS_IMPLEMENTATION.md](docs/STANDARDS_IMPLEMENTATION.md) and import docs/postman/Standards-Local-Test.postman_collection.json. Standards now attach to Zones; new links require Active, and existing links remain when a standard is deactivated. No database write.

## Standard-material links

Admin can add/remove mappings between existing standards and materials; Active users can read a standard's materials. Both catalogs use shared stores and stay intact when a link is removed. Read [docs/STANDARD_MATERIALS_IMPLEMENTATION.md](docs/STANDARD_MATERIALS_IMPLEMENTATION.md), import docs/postman/Standard-Materials-Local-Test.postman_collection.json and follow its six JSON requests.

## Farms and Cooperative membership

Farm creation/updates require reciprocal Admin–owner-Farmer approval. Joining also requires the target Cooperative Manager; leaving only notifies that Manager after counterpart approval. Changes stay separate from official Farms until accepted. A Manager manages one Cooperative and reads only its member Farms; a Farmer reads owned Farms. Data, pending requests and Manager notifications remain in memory without schema changes.

Read [docs/FARMS_IMPLEMENTATION.md](docs/FARMS_IMPLEMENTATION.md) and import **docs/postman/Farms-Local-Test.postman_collection.json**. Its 18 requests use literal URLs/JSON and manually pasted JWT/UUID values; no scripts/environment are needed. Creation/update tests need Farmer/Admin only; membership tests need a Manager previously email-verified and approved through USERS. Manager notifications are read through `/api/farm-notifications`. No additional npm install is required.

See MODULE_HANDOFF.md for the latest integrated branch and validation; persistent approval/notification storage needs an ERD decision.

## Zones

Owner Farmers create/update Zones directly. Admin proposes changes for owner approval; Managers read only current member-Farm Zones. New standard links require Active; existing Inactive links remain. Total Zone area cannot exceed Farm area, including when accepting a Farm shrink. Read [docs/ZONES_IMPLEMENTATION.md](docs/ZONES_IMPLEMENTATION.md), import docs/postman/Zones-Local-Test.postman_collection.json and enter JSON/JWT/UUID directly. No new dependencies or .env values; all data stays in memory.

## Farmer assignments

Owners invite Farmers; Admin invitations additionally need owner approval. Assigned Farmers accept before obtaining access inside their assignment interval. Ending retains history and the original Zone snapshot. A prepared policy limits original-author correction to 15 days after end_date; journal/IoT modules will use these permission helpers when implemented. Read [docs/ASSIGNMENTS_IMPLEMENTATION.md](docs/ASSIGNMENTS_IMPLEMENTATION.md) and import docs/postman/Assignments-Local-Test.postman_collection.json. No scripts or environment are needed in Postman. Assignments are inherited by the integrated feat/tree-harvests-management branch; read MODULE_HANDOFF.md for validation and publication status.

## Cooperatives

Admin creates Cooperatives without a Manager and edits their information directly. Manager attachment uses the existing USERS approval flow. Managers can update their own Cooperative's name, director, address and contact number after email verification followed by SMS verification; only Admin edits its certificate number. OTP goes to the Manager account's email/phone, and changes apply only after both steps succeed.

Unmanaged Cooperatives warn Admin after 7 days and are removed after 30 days only when no business records reference them. Notifications and lifecycle data stay in memory and disappear on restart. Read [docs/COOPERATIVES_IMPLEMENTATION.md](docs/COOPERATIVES_IMPLEMENTATION.md), import **docs/postman/Cooperatives-Local-Test.postman_collection.json** (20 manual requests). Its branch **feat/cooperatives-management** is inherited by feat/tree-harvests-management; no migrations/seed or database writes were added.

For real Manager SMS, fill `TWILIO_HTX_VERIFY_SERVICE_SID` (a separate six-digit Verify Service) and `HTX_SMS_ALLOWED_PHONES` in your local .env. Blank keys were appended locally at the user's request; add missing keys from .env.example without overwriting existing values. Shared Twilio account credentials and SMTP remain as configured; Farmer reset service/allowlist stay unchanged. Without these optional HTX settings, existing Auth works and real HTX SMS returns 503. Automated checks use fake providers, never real .env credentials.

## Trees

Owner Farmers create/update Trees directly; Admin submits proposals for the correct owner to approve. Managers read Trees in their Cooperative's current Farms; assigned Farmers only read Trees in accepted, effective Zone assignments. Backend generates immutable DRN-UUID codes; no Zone transfer or hard delete. Dead/Removed can be restored to Active to correct mistakes, retaining metadata snapshots and the same code. Owner edits make older Admin proposals require rejection and resubmission.

Read [docs/TREES_IMPLEMENTATION.md](docs/TREES_IMPLEMENTATION.md) and import **docs/postman/Trees-Local-Test.postman_collection.json** (20 manual requests). No new .env settings or dependencies. Trees on feat/trees-management are inherited by the latest Harvests branch below. QR public trace and cultivation follow separately.

## Tree Harvests

Owners enter harvests directly; other Farmers need an accepted, effective Zone assignment. Creator submits Draft for owner confirmation; owner-creators confirm automatically on submit. Initial confirmation leaves updated_by/updated_at null. Confirmed corrections retain original data while Pending; the current Cooperative Manager or Admin for an independent Farm approves changes and applies them immediately, recording the actual editor and update time.

One harvest per Tree/day prevents conflicting entries. Multiple Trees share a batch code in the same Zone/day; individual confirmation keeps other Trees open for entry. Backdate up to seven Vietnam calendar days, beyond requires a scoped Admin permission. Former authors retain own history and can request correction, with the owner preparing changes. No Cultivation hash/15-minute lifecycle or extra business table; records/proposals/permissions remain in backend RAM.

Read [docs/TREE_HARVESTS_IMPLEMENTATION.md](docs/TREE_HARVESTS_IMPLEMENTATION.md) and [final workflow design](docs/TREE_HARVESTS_WORKFLOW_DESIGN.md). Import **docs/postman/Tree-Harvests-Local-Test.postman_collection.json** (24 manual requests); replace dates, JWT and UUID manually. No new .env settings/dependencies or persistence. Latest integrated local branch: **feat/tree-harvests-management**, based on Trees d39c5ce; no push/merge.

Integrated validation: **89/89 tests**, lint/typecheck/build passed. If the Windows npm wrapper hits installation-path EPERM, use the equivalent local commands in the Harvests guide.
