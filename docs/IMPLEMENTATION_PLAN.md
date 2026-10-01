# Implementation plan

## Backend foundation batch

Branch: feat/backend-foundation, based on main. Initialize only the NestJS API, configuration validation, liveness endpoint, Swagger and Postman collection. Implement business modules incrementally on separate branches after review.

Structure: apps/api for backend, apps/web for React/Vite, apps/mobile for React Native Android, ai for later work, docs/postman for API requests. Only apps/api is currently an npm workspace.

PostgreSQL tables detected in ERD: USERS, COOPERATIVES, FARMS, ZONES, USERS_ZONES, TREES, DEVICES, SENSORS, ACTUATORS, FARMING_STANDARDS, STANDARD_MATERIALS, AGRICULTURAL_MATERIALS, TREE_HARVESTS.

MongoDB collections: CULTIVATION_EVENTS, IOT_TELEMETRIES, ACTUATOR_TASKS, AI_DISEASE_DIAGNOSTICS, CHATBOT_CONVERSATIONS.

Relationships: COOPERATIVES.manager_id references USERS; Cooperative has Farms, Farm has Zones, Zone has Trees and Devices and references a Standard, Device has Sensors/Actuators, Tree has Harvests. USERS_ZONES records assignment history; STANDARD_MATERIALS bridges standards/materials. Backend validates cross-database references.

Environment now: PORT, CORS_ORIGINS, NODE_ENV. Later: PostgreSQL/MongoDB connections, JWT secret/expiry, MQTT connection settings and command timeout, public trace URL. Never commit secrets.

## Next batches

1. Resolve schema ambiguities; add PostgreSQL and MongoDB connections, migrations, seed and readiness checks. MongoDB replica set is required for planned locking transactions.
2. Auth, Users, Cooperatives, Farms, Zones/Assignments and Trees, one module at a time with Postman updates and focused checks.
3. IoT metadata, telemetry, control and hardware confirmation.
4. Cultivation locking, correction and hash chain with automated business-rule tests.
5. Standards, materials, harvests and QR traceability.
6. Web, then Android mobile.
7. AI diagnosis and later RAG after source PDFs exist.

This batch does not complete the full Phase 1 milestone: database connections, migrations, seed and auth remain outstanding. See IMPLEMENTATION_NOTES.md before schema implementation.
