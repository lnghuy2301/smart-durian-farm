# Implementation notes

- Farms complete on feat/farm-approval-workflow from feat/standard-materials (113da8f): reciprocal Admin/owner-Farmer creation/update approval; joining additionally requires the target Cooperative Manager; leaving requires only the counterpart, then records a Manager notification. User confirmed optional membership, one Manager per Cooperative and separate in-memory requests; is_owner changes only after accepted creation. 44/44 tests + lint/typecheck/build pass, no real messages/DB writes. Read FARMS_IMPLEMENTATION.md, FARMS_WORKFLOW_DESIGN.md and the 18-request manual JSON Postman collection. Shared HTX store now enforces Manager cardinality and returns copies; USERS test reads current store after assignment. Metadata does not authorize new database tables. Stop to clarify Zone/assignment permissions before the next dependent module.

- Earlier Standard Materials batch on feat/standard-materials, based on Farming Standards, passed 36 tests + lint/typecheck/build; STANDARD_MATERIALS_IMPLEMENTATION.md documents shared catalog instances and FK/duplicate checks. Status changes preserve mappings; catalog configuration is separate from future cultivation eligibility. Its Farm questions were subsequently answered and implemented in the latest batch above.

- Farming Standards implemented on feat/farming-standards, based on Materials. Read STANDARDS_IMPLEMENTATION.md and MODULE_HANDOFF.md. CatalogListDto moved to src/catalog for shared bounded queries; no duplicate Auth/users stores. Current validation: 34 tests + lint/typecheck/build. Standards code/name uniqueness is not invented; use UUID references and confirm DB constraints later.

- Read MODULE_HANDOFF.md first for the latest branch chain and current validation. Material catalog now runs on feat/agricultural-materials, based on USERS, using shared Auth and in-memory storage. Details: MATERIALS_IMPLEMENTATION.md. User requested simple modules first, each with its own branch/docs/Postman; stop at missing critical rules. Main fetched at 7594c9d only includes initial Auth; do not silently drop Twilio/USERS.

- User authorizes incremental backend branches, commits and pushes, with a Postman JSON collection updated per module.
- Keep the user's pending ERD and MQTT document edits outside backend commits.
- Latest ERD uses COOPERATIVES.manager_id and ACTUATOR_TASKS. Manager reads Farms in the assigned Cooperative and additionally approves joining that Cooperative; backend checks the referenced user's Manager role. Admin is the counterpart for owner-Farmer creation/update/membership proposals. Leaving notifies Manager without asking their approval.
- ACTUATORS.status means operational availability, not relay on/off.
- Farmer controls watering/spraying and records/edits harvests within assigned Zones; only the original author can correct a cultivation event.
- Assignment intervals use [start_date, end_date); backend and PostgreSQL constraints prevent overlapping assignments to a Zone.
- One pending command per station; do not treat broker publish as hardware confirmation.
- Planned global cultivation hash chain: one locking worker, deadline/ObjectId ordering, atomic MongoDB transaction, recursively sorted canonical data with UTC timestamps, initial previous_hash of 64 zero characters.
- details form choices will be supplied later; do not invent business options.
- /api/health checks liveness; /api/health/ready checks PostgreSQL and MongoDB in parallel and returns 503 when either is unavailable. No raw connection errors or URLs appear in responses.
- Override Swagger's js-yaml dependency to patched 5.4.2 because npm audit fix could not resolve the moderate YAML merge CPU advisory within Swagger's dependency declaration. Recheck/remove the override when Swagger updates its dependency.
- Use NestJS 11 with CommonJS and TypeScript decorator metadata. Development and HTTP tests compile through TypeScript before execution.

## Pending before relevant modules

- Latest ERD review confirms the cultivation deadline label is now lock_at; the earlier spelling issue is resolved.
- ERD uses AI_DISEASE_DIAGNOSTICS rather than the spec's AI_LEAF_DIAGNOSIS; use ERD naming when AI is implemented.
- Preserve enum capitalization from ERD. Resolve command_id generation, timeout representation, late/duplicate short ACKs and physical-button echo with firmware before IoT.
- Manager cardinality confirmed on 2026-10-02 and enforced in the shared Cooperative store: one Manager manages one Cooperative. Verify nullability, uniqueness and deletion rules before migrations, including the storage of Farm approval requests/notifications approved only for in-memory testing so far.
- Clarify author corrections after assignment ends and historical Tree/Device/Standard movement before relevant business modules.

## Database connection batch

- Both backend branches have been merged into main and fetched locally on 2026-10-02. New modules start from updated main.
- Use pg Pool and MongoClient as shared providers; lazy connections permit liveness during a database outage, while readiness reports the outage explicitly. Close both clients on shutdown and bound probe timeouts.
- DATABASE_URL and MONGODB_URI are required. Environment configuration errors fail startup without logging connection strings.
- Compose is local development only: bind database ports to loopback; MongoDB runs a single-node rs0 replica set without authentication. Use directConnection=true for the host API because the replica member advertises the Compose hostname. PostgreSQL example credentials are local placeholders.
- This batch creates no tables, collections, migrations or seed; it does not alter the ERD.

## Auth and USERS — current state

- Current branch feat/users-registration-approval builds on feat/twilio-verify. Read USERS_IMPLEMENTATION.md first for lifecycle, SMTP setup, API contracts and continuation. User confirmed backend Twilio SMS/password reset; preserve the four-request Twilio JSON file unchanged.
- Updated ERD XML/JSON add USERS.gmail and gmail_verify. User accepts any valid email domain, one email per account. gmail_verify is proof of ownership set by backend, never a frontend boolean. Do not change edge attachment rows; user confirmed table-level relationships are intended.
- Public Farmer registration is Active immediately; email optional. Manager verifies email through SMTP OTP, then registers Pending. Admin cannot register publicly and approves only Managers with Cooperative creation/assignment. Pending/Reject cannot log in or use protected APIs. Configure local Admin via AUTH_TEST_ADMIN_PHONE/PASSWORD; no database seed.
- Nodemailer sends through configured mailbox SMTP credentials; Gmail requires an App Password/two-step verification. EMAIL_PROVIDER defaults to disabled until credentials are filled. No external email OTP API is required. SMTP acceptance is not inbox receipt; live email still needs user testing.
- Accounts, Cooperatives, OTP state and JWT versions stay in memory. SMS reset is per user; live SMS allowlist is unchanged. Email proof is single-use and bound to phone/email with expiry/cooldown/attempt limits. Approval cannot overwrite another Manager or activate the account when HTX creation/assignment fails.
- Users-Local-Test.postman_collection.json uses literal URLs/JSON, no scripts/environment. Copy OTP/ids/proof/Admin JWT manually. Profile Farmer, email OTP preferences and reset email fallback are future work. Create tables only after USERS completion/schema review.
- Validation: lint, typecheck, build and 29/29 tests pass with fake providers, without real mail/SMS/database writes. Preserve user ERD/MQTT edits and deleted legacy SpeedSMS Postman files outside this commit.

### Earlier Auth integration decisions

- User wants simple manual Postman testing: Twilio demo now has four POST requests with literal localhost URLs and editable JSON bodies, without scripts/variables/environment. Open the collection named "Smart Durian Farm - Twilio Verify - Nhap JSON" after importing the updated JSON. Advanced security cases remain automated backend tests. The old Twilio environment file is not required.

- Twilio branch feat/twilio-verify builds on feat/speedsms-integration (which builds on feat/auth). User confirmed SMS receipt from Twilio Try out Verify and selected Twilio. Read TWILIO_VERIFY_INTEGRATION.md and AUTH_IMPLEMENTATION.md for provider configuration. SpeedSMS is legacy; do not assume pending branches have merged into main.
- Account persistence is still in memory, independent of SMS_PROVIDER. Twilio Verify creates/checks codes; do not send locally generated codes through Twilio Messaging or use SpeedSMS credentials. Verify Service Code length must be 6; backend checks the service before sending. Never commit real recipients, credentials or tokens.
- Local deadline is 5 minutes per accepted send; Twilio may reuse a code during its own validity period. OTP state, session version and rate limits are per process only. Serialize send/check/reset; invalidate uncertain failed checks. No schema/ERD change is authorized by this integration.

- Branch feat/auth starts from updated main. Read AUTH_IMPLEMENTATION.md for current scope, pending decisions and continuation instructions.
- User requires documentation during development and Vietnamese comments for difficult logic, including existing files. Ask before major schema/security/business-rule changes.
- Initial Auth scope was phone/password login and SMS reset on one fixture. The USERS batch extends this to multiple in-memory accounts; no database tables/records. Use Twilio Verify for the live SMS fixture demo and mock SMS for automated multi-user tests, not a USERS migration/seed.
