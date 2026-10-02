# Implementation notes

- User authorizes incremental backend branches, commits and pushes, with a Postman JSON collection updated per module.
- Keep the user's pending ERD and MQTT document edits outside backend commits.
- Latest ERD uses COOPERATIVES.manager_id and ACTUATOR_TASKS. Manager reads Farms in the assigned Cooperative; backend checks the referenced user's Manager role.
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
- Confirm Manager relationship cardinality, nullability, uniqueness and deletion rules before migrations.
- Clarify author corrections after assignment ends and historical Tree/Device/Standard movement before relevant business modules.

## Database connection batch

- Both backend branches have been merged into main and fetched locally on 2026-10-02. New modules start from updated main.
- Use pg Pool and MongoClient as shared providers; lazy connections permit liveness during a database outage, while readiness reports the outage explicitly. Close both clients on shutdown and bound probe timeouts.
- DATABASE_URL and MONGODB_URI are required. Environment configuration errors fail startup without logging connection strings.
- Compose is local development only: bind database ports to loopback; MongoDB runs a single-node rs0 replica set without authentication. Use directConnection=true for the host API because the replica member advertises the Compose hostname. PostgreSQL example credentials are local placeholders.
- This batch creates no tables, collections, migrations or seed; it does not alter the ERD.

## Auth batch in progress

- Current branch feat/twilio-verify builds on feat/speedsms-integration (which builds on feat/auth). User confirmed SMS receipt from Twilio Try out Verify and selected Twilio. Read TWILIO_VERIFY_INTEGRATION.md and AUTH_IMPLEMENTATION.md for code, configuration, Postman and continuation. SpeedSMS is legacy; do not assume any pending Auth/provider branches have merged into main.
- Account persistence is still in memory, independent of SMS_PROVIDER. Twilio Verify creates/checks codes; do not send locally generated codes through Twilio Messaging or use SpeedSMS credentials. Verify Service Code length must be 6; backend checks the service before sending. Never commit real recipients, credentials or tokens.
- Local deadline is 5 minutes per accepted send; Twilio may reuse a code during its own validity period. OTP state, session version and rate limits are per process only. Serialize send/check/reset; invalidate uncertain failed checks. No schema/ERD change is authorized by this integration.

- Branch feat/auth starts from updated main. Read AUTH_IMPLEMENTATION.md for current scope, pending decisions and continuation instructions.
- User requires documentation during development and Vietnamese comments for difficult logic, including existing files. Ask before major schema/security/business-rule changes.
- User clarified Auth scope: phone_number/password login and password reset with six-digit SMS OTP; test account only, no database tables or real records. Use the in-memory fixture with Twilio Verify for the live demo or mock SMS for automated tests, not a USERS migration/seed.
