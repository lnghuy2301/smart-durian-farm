# Implementation plan

2026-10-05 GitHub update: PR #5 merged integration/all-modules-20261005 into main at c71820d. Remote tree matches the tested integration and contains every local branch tip; local main fast-forwarded. Next branch feat/devices-management starts at c71820d. Devices preparation is documented in DEVICES_WORKFLOW_DESIGN.md, with three required business decisions pending; no Devices code yet. Implement Devices metadata first after confirmation, Sensors and Actuators on later separate module branches, then discuss MQTT/telemetry/control and Cultivation. Keep persistence deferred and user ERD/MQTT/Postman/.env outside commits. Earlier local-only/no-push guidance describes historical batches.

2026-10-05 integration update: user approved merging existing branches into main local. All module branch tips through Harvests and standalone project-foundation are integrated together with fetched origin/main. The current base for the next module is main; historical feature-chain guidance below is superseded for new work. Existing user ERD/MQTT/Postman/.env changes stay outside Git commits; no persistence or remote push. Read BRANCH_INTEGRATION.md and MODULE_HANDOFF.md. Main checks: 89/89 tests, lint/typecheck/build.

2026-10-05 Harvests update: latest integrated local branch feat/tree-harvests-management from Trees d39c5ce. Owner/assigned-Farmer entry, creator submission/owner confirmation, individual record locking, Manager/Admin approved corrections applied immediately, Admin backdate grants after 7 Vietnam calendar days. One business table per ERD, proposal/grant metadata in RAM, no persistence. 89/89 tests + lint/typecheck/build, 24 literal Postman requests; TREE_HARVESTS_IMPLEMENTATION.md and final workflow design. No unresolved Harvest questions from this discussion; Device movement/Cultivation/MQTT still need discussion. Earlier branch/results are historical batches.

2026-10-04 Trees update: latest integrated local branch feat/trees-management from HTX 2752454 implements owner creation/updates, Admin proposals for owner approval, immutable backend DRN-UUID codes, retained metadata snapshots and status restoration. Read scope reuses shared Zones/Farm/HTX/accepted assignments; no movement, hard delete, Cultivation or public QR. 77/77 tests + lint/typecheck/build passed; Trees Postman has 20 literal requests. Read TREES_IMPLEMENTATION.md. Data remains in memory, no migrations/seed/new .env/dependencies or push/merge. Historical branch/results below describe their original batches.

2026-10-04 HTX update: integrated local branch feat/cooperatives-management from Assignments c9dbe67 adds independent Cooperative creation/Admin edits, limited own-Manager edits with email → SMS verification, and Admin notifications after 7 days / safe automatic removal after 30 days without Manager or business references. Same in-memory USERS/Farms/HTX stores; no persistence. 69/69 tests + lint/typecheck/build passed. Manual Cooperatives Postman has 20 requests. See COOPERATIVES_IMPLEMENTATION.md and MODULE_HANDOFF.md for validation/publication status.

2026-10-04 update: Zones implemented on feat/zones-management; USERS_ZONES on feat/zone-assignments. See ZONES_IMPLEMENTATION.md, ASSIGNMENTS_IMPLEMENTATION.md and MODULE_HANDOFF.md. Owner assigns, Admin proposals require owner approval, target Farmer accepts before access; exclusive Zone intervals, retained own history and 15-day correction policy after end_date. Earlier unresolved Zone questions below are superseded by this decision; persistence remains deferred. Cultivation/IoT must apply the prepared permission helpers when implemented.

Latest progress is tracked in MODULE_HANDOFF.md. Catalogs → Farms → Zones → Assignments are implemented on separate local branches with docs/manual JSON Postman; 55 tests + lint/typecheck/build. Continue in memory. Farm changes use reciprocal Admin/owner approval; joining additionally needs Manager, leaving notifies Manager. One Manager manages one Cooperative. Owner Zone writes are direct; Admin proposals need owner approval; assignments need assignee acceptance. Later IoT/Cultivation has unresolved rules in notes. No database/schema changes without confirmation.

## Backend foundation batch

Branch: feat/backend-foundation, based on main. Initialize only the NestJS API, configuration validation, liveness endpoint, Swagger and Postman collection. Implement business modules incrementally on separate branches after review.

Structure: apps/api for backend, apps/web for React/Vite, apps/mobile for React Native Android, ai for later work, docs/postman for API requests. Only apps/api is currently an npm workspace.

PostgreSQL tables detected in ERD: USERS, COOPERATIVES, FARMS, ZONES, USERS_ZONES, TREES, DEVICES, SENSORS, ACTUATORS, FARMING_STANDARDS, STANDARD_MATERIALS, AGRICULTURAL_MATERIALS, TREE_HARVESTS.

MongoDB collections: CULTIVATION_EVENTS, IOT_TELEMETRIES, ACTUATOR_TASKS, AI_DISEASE_DIAGNOSTICS, CHATBOT_CONVERSATIONS.

Relationships: COOPERATIVES.manager_id references USERS; Cooperative has Farms, Farm has Zones, Zone has Trees and Devices and references a Standard, Device has Sensors/Actuators, Tree has Harvests. USERS_ZONES records assignment history; STANDARD_MATERIALS bridges standards/materials. Backend validates cross-database references.

Environment now: PORT, CORS_ORIGINS, NODE_ENV. Later: PostgreSQL/MongoDB connections, JWT secret/expiry, MQTT connection settings and command timeout, public trace URL. Never commit secrets.

## Next batches

1. PostgreSQL/MongoDB connections, local Compose and readiness are implemented and merged. Complete in-memory USERS before schema review/migrations/seed, as requested. MongoDB replica set is required for planned locking transactions.
2. Auth, Users, Cooperatives, Farms, Zones/Assignments and Trees, one module at a time with Postman updates and focused checks.
3. IoT metadata, telemetry, control and hardware confirmation.
4. Cultivation locking, correction and hash chain with automated business-rule tests.
5. Standards, materials, harvests and QR traceability.
6. Web, then Android mobile.
7. AI diagnosis and later RAG after source PDFs exist.

The foundation batch alone did not complete Phase 1. Database connections/readiness are now implemented; migrations, seed and database-backed Auth remain outstanding. See IMPLEMENTATION_NOTES.md before schema implementation.

## Current scope update — 2026-10-02

Database connections/readiness are complete and merged. Auth includes phone/password login, per-user JWT and six-digit SMS reset. User confirmed Twilio Verify SMS/password reset through backend. The USERS batch on feat/users-registration-approval added Farmer registration, SMTP email verification, Manager Pending and Admin approval with Cooperative creation/assignment. The integrated local branch feat/zone-assignments also contains catalogs, approved Farm changes/membership, Zones and assignments. All business data remains in memory without migrations/seed or ERD changes. Updated XML/JSON ERD remains the schema authority.

See MODULE_HANDOFF.md and the module guides. Postman collections use literal JSON; manually copy email OTP/proof/JWT/UUID as needed. Existing four-request Twilio collection is unchanged. The USERS batch originally passed 29 tests; integrated validation is lint/typecheck/build and 55/55 tests with fake transports. User confirmed live SMTP verification and Manager approval succeeded.

HTX, Trees and Tree Harvests are implemented and inherited by the latest branch at the top. Device movement and Cultivation details/hash-chain still need discussion. Public QR remains future work without a separate QR table. USERS profile/email preferences and reset email fallback remain deferred. Persistence/migrations, including proposal/grant/approval/notification/history storage, need separate schema review. Preserve the integrated branch chain until dependencies merge; do not merge automatically or start from an older main that drops completed modules.
