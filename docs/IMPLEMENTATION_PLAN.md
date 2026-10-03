# Implementation plan

2026-10-04 update: Zones implemented on feat/zones-management; see ZONES_IMPLEMENTATION.md and MODULE_HANDOFF.md. Assignment permissions have been approved: owner assigns, Admin proposals require owner approval, target Farmer accepts before access; exclusive Zone intervals, retained own history and 15-day correction after end_date. USERS_ZONES is next on its own branch. Earlier unresolved Zone questions below are superseded by this decision; persistence remains deferred.

Latest progress is tracked in MODULE_HANDOFF.md. Agricultural Materials → Farming Standards → Standard Materials → Farms are implemented on separate branches with docs/manual JSON Postman; 44 tests + lint/typecheck/build. Continue in memory. Farm changes use reciprocal Admin/owner approval; joining additionally needs Manager approval, leaving records a Manager notification. One Manager manages one Cooperative; membership is optional. Before Zones/USERS_ZONES, clarify write/assignment permissions and whether those changes need reciprocal approval. Later IoT/Cultivation has unresolved rules in notes. No database/schema changes without confirmation.

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

Database connections/readiness are complete and merged. Auth includes phone/password login, per-user JWT and six-digit SMS reset. User confirmed Twilio Verify SMS/password reset through backend. The USERS batch on feat/users-registration-approval added Farmer registration, SMTP email verification, Manager Pending and Admin approval with Cooperative creation/assignment. The current integrated branch feat/farm-approval-workflow also contains catalogs and approved Farm changes/membership. Accounts, Cooperatives, Farms, requests and notifications remain in memory without migrations/seed or ERD changes. Updated XML/JSON ERD remains the schema authority.

See MODULE_HANDOFF.md, FARMS_IMPLEMENTATION.md, USERS_IMPLEMENTATION.md, AUTH_IMPLEMENTATION.md and TWILIO_VERIFY_INTEGRATION.md. Users/Farms Postman collections use literal JSON; manually copy email OTP/proof/JWT/UUID as needed. Existing four-request Twilio collection is unchanged. The USERS batch originally passed 29 tests; the latest integrated validation is lint/typecheck/build and 44/44 tests with fake transports. Configure sending mailbox in .env to test live email.

Next clarify Zone creation/update and Farmer assignment permissions before that module. USERS profile/email preferences and password-reset email fallback remain deferred until authorized. Only after USERS completion, review schema decisions and add persistence/migrations, including approval/notification storage. Review changes and merge dependencies before creating the next module branch from updated main; do not merge automatically.
