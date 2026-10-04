# Implementation notes

- 2026-10-04 HTX: feat/cooperatives-management from Assignments c9dbe67. Admin creates unmanaged Cooperatives and edits directly; own Manager edits cooperative_name/director/address/contact_number through email then SMS verification. Certificate remains Admin-only. Existing USERS approval attaches Manager; shared stores/SMTP transport, separate purpose-specific OTP provider. Warn at 7 days, delete at 30 only if no Manager and no business references; otherwise notify Admin and preserve data/history. A 60-second worker and HTX API access run synchronous maintenance. All lifecycle/version/verification/notification data stays in memory, no schema/migration/seed. Read COOPERATIVES_IMPLEMENTATION.md and the 20-request manual Postman file.
- HTX live SMS requires separate TWILIO_HTX_VERIFY_SERVICE_SID and explicit HTX_SMS_ALLOWED_PHONES to prevent Twilio code reuse/consumption from affecting password reset. Existing Farmer reset SID/allowlist unchanged; no .env edits or real messages in tests. Missing optional HTX settings fail with 503 rather than mock fallback. Email has 10 minutes; after verification 10 minutes to start SMS; SMS has a fresh 5-minute deadline. Re-login can resume a request if JWT expires, without extending OTP deadline/account-version proof. Apply changes only after both verifications and post-await context/version checks.
- Trees rules confirmed for a later module: owner Farmer edits directly, Admin proposals need owner approval, other Farmers only read Tree metadata, backend generates tree_code, no Zone transfer in the first batch. Device movement and Cultivation details/hash-chain remain to discuss.
- HTX work is authorized locally; no new permission to push/merge origin. Keep the prior automatic-review push rejection in force until explicit publication authorization. Do not stage user ERD/MQTT/Twilio/Users Postman changes.
- HTX validation: 69/69 tests (14 HTX, 55 regression), lint/typecheck/build, manual Postman JSON checks passed. npm wrapper hit Windows installation-path EPERM; local eslint/tsc/node-test commands performed equivalent checks. No real .env, email/SMS sends, database writes or new dependencies.

- Assignments complete locally on feat/zone-assignments, based on Zones e7bb204. Owner invitation requires assignee acceptance; Admin proposals require owner and assignee. Shared store enables current Zone reads only inside accepted intervals, preserves history snapshot, prevents Pending/accepted overlaps and supports owner end/Admin end proposals. Fixed 15-day policy from end_date for original-author corrections; event/IoT modules must call exported assertion helpers later and use server-stored original event references. No journal/IoT endpoints yet. See ASSIGNMENTS_IMPLEMENTATION.md and manual Assignments Postman collection; no new .env/dependencies/schema. Automated review rejected the Zones push to origin; do not bypass that rejection or claim remote publication. Obtain explicit user permission for sending both local branch payloads to this origin after work is reviewable.

- 2026-10-04: Zones on feat/zones-management, based on Farm. Owner Farmer writes directly; Admin proposals need owner approval; Manager reads member-Farm Zones only. Area budget shared with Farm acceptance; integer thousandths; new standard links require Active. Read ZONES_IMPLEMENTATION.md. User approved assignments next: owner assigns, Admin proposal needs owner acceptance, assignee Farmer must accept, one Farmer per Zone interval, own history remains readable with correction up to 15 days from end_date. Cultivation/IoT enforcement follows in their modules. Live SMTP/Manager approval was successfully tested by user.

- Earlier Farms batch on feat/farm-approval-workflow from feat/standard-materials (113da8f): reciprocal Admin/owner-Farmer creation/update approval; joining additionally requires the target Cooperative Manager; leaving requires only the counterpart, then records a Manager notification. is_owner changes only after accepted creation. That batch passed 44 tests + lint/typecheck/build. Read FARMS_IMPLEMENTATION.md and the 18-request manual JSON Postman collection. Shared HTX store enforces Manager cardinality and returns copies. Zone/assignment permissions were subsequently approved and implemented as recorded above. Metadata does not authorize new database tables.

- Earlier Standard Materials batch on feat/standard-materials, based on Farming Standards, passed 36 tests + lint/typecheck/build; STANDARD_MATERIALS_IMPLEMENTATION.md documents shared catalog instances and FK/duplicate checks. Status changes preserve mappings; catalog configuration is separate from future cultivation eligibility. Its Farm questions were subsequently answered and implemented in the latest batch above.

- Farming Standards implemented on feat/farming-standards, based on Materials. Read STANDARDS_IMPLEMENTATION.md and MODULE_HANDOFF.md. CatalogListDto moved to src/catalog for shared bounded queries; no duplicate Auth/users stores. Current validation: 34 tests + lint/typecheck/build. Standards code/name uniqueness is not invented; use UUID references and confirm DB constraints later.

- Read MODULE_HANDOFF.md first for the latest branch chain and current validation. Material catalog now runs on feat/agricultural-materials, based on USERS, using shared Auth and in-memory storage. Details: MATERIALS_IMPLEMENTATION.md. User requested simple modules first, each with its own branch/docs/Postman; stop at missing critical rules. Main fetched at 7594c9d only includes initial Auth; do not silently drop Twilio/USERS.

- User authorizes incremental backend branches and local commits, with a Postman JSON collection updated per module. Earlier general push guidance is superseded by the explicit publication restriction at the top.
- Keep the user's pending ERD and MQTT document edits outside backend commits.
- Latest ERD uses COOPERATIVES.manager_id and ACTUATOR_TASKS. Manager reads Farms in the assigned Cooperative and additionally approves joining that Cooperative; backend checks the referenced user's Manager role. Admin is the counterpart for owner-Farmer creation/update/membership proposals. Leaving notifies Manager without asking their approval.
- ACTUATORS.status means operational availability, not relay on/off.
- Farmer controls watering/spraying and records/edits harvests within assigned Zones; only the original author can correct a cultivation event.
- Assignment intervals use [start_date, end_date); in-memory backend prevents overlapping accepted/Pending assignments. PostgreSQL exclusion constraints and transaction locking are planned only after schema review.
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
- Author corrections after assignment ends are limited to 15 days from end_date; only own history. First Trees batch forbids Zone movement; clarify historical Device movement before its module.

## Database connection batch

- Both backend branches have been merged into main and fetched locally on 2026-10-02. New modules start from updated main.
- Use pg Pool and MongoClient as shared providers; lazy connections permit liveness during a database outage, while readiness reports the outage explicitly. Close both clients on shutdown and bound probe timeouts.
- DATABASE_URL and MONGODB_URI are required. Environment configuration errors fail startup without logging connection strings.
- Compose is local development only: bind database ports to loopback; MongoDB runs a single-node rs0 replica set without authentication. Use directConnection=true for the host API because the replica member advertises the Compose hostname. PostgreSQL example credentials are local placeholders.
- This batch creates no tables, collections, migrations or seed; it does not alter the ERD.

## Auth and USERS — current state

- The USERS batch branch feat/users-registration-approval builds on feat/twilio-verify; the latest integrated branch is recorded at the top of this file and in MODULE_HANDOFF.md. Read USERS_IMPLEMENTATION.md for lifecycle, SMTP setup and API contracts. User confirmed backend Twilio SMS/password reset; preserve the four-request Twilio JSON file unchanged.
- Updated ERD XML/JSON add USERS.gmail and gmail_verify. User accepts any valid email domain, one email per account. gmail_verify is proof of ownership set by backend, never a frontend boolean. Do not change edge attachment rows; user confirmed table-level relationships are intended.
- Public Farmer registration is Active immediately; email optional. Manager verifies email through SMTP OTP, then registers Pending. Admin cannot register publicly and approves only Managers with Cooperative creation/assignment. Pending/Reject cannot log in or use protected APIs. Configure local Admin via AUTH_TEST_ADMIN_PHONE/PASSWORD; no database seed.
- Nodemailer sends through configured mailbox SMTP credentials; Gmail requires an App Password/two-step verification. EMAIL_PROVIDER defaults to disabled until credentials are filled. No external email OTP API is required. User confirmed live email verification/Manager registration and approval succeeded; automatic tests still use fake transports.
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
