# Implementation plan

Latest incremental progress is tracked in MODULE_HANDOFF.md. User now prioritizes low-dependency catalogs: Agricultural Materials → Farming Standards → Standard Materials before farm/IoT workflows with unresolved rules. Each is a separate branch with docs and manual JSON Postman. Continue in memory; stop and ask before missing critical rules or database/schema changes.

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

Database connections/readiness are complete and merged. Auth includes phone/password login, per-user JWT and six-digit SMS reset. User confirmed Twilio Verify SMS/password reset through backend. Current branch feat/users-registration-approval builds on feat/twilio-verify and adds Farmer registration, SMTP email verification, Manager Pending and Admin approval with Cooperative creation/assignment. Accounts and Cooperatives remain in memory without migrations/seed or ERD changes. Updated XML/JSON ERD remains the schema authority.

See USERS_IMPLEMENTATION.md, AUTH_IMPLEMENTATION.md and TWILIO_VERIFY_INTEGRATION.md. Users Postman collection uses literal JSON; manually copy email OTP/proof/Admin JWT. Existing four-request Twilio collection is unchanged. Validation: lint/typecheck/build and 29/29 tests pass with fake transports. Configure sending mailbox in .env to test live email.

Next finish USERS profile/email preferences and password-reset email fallback when authorized. Only after USERS completion, review schema decisions and add persistence/migrations. Review changes and merge dependencies before creating the next module branch from updated main; do not merge automatically.
