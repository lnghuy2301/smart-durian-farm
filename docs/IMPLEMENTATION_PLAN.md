# Implementation plan

## Current scope

Create the base monorepo folders only. No application code, dependencies, database schema or migrations in this step.

## Repository structure

- apps/api: NestJS REST API and MQTT integration.
- apps/web: React, Vite and TypeScript.
- apps/mobile: React Native, Android first.
- ai: later training, inference and RAG.
- docs: specifications, ERD and implementation decisions.

## Schema inventory

PostgreSQL: USERS, COOPERATIVES, FARMS, ZONES, USERS_ZONES, TREES, DEVICES, SENSORS, ACTUATORS, FARMING_STANDARDS, STANDARD_MATERIALS, AGRICULTURAL_MATERIALS, TREE_HARVESTS.

MongoDB: CULTIVATION_EVENTS, IOT_TELEMETRIES, ACTUATOR_TASKS, AI_DISEASE_DIAGNOSTICS, CHATBOT_CONVERSATIONS.

Relationships: User owns Farms; User manages Cooperative through COOPERATIVES.manager_id; Cooperative has Farms; Farm has Zones; Zone references a Farming Standard and has Trees and Devices; Device has Sensors and Actuators; Tree has Harvests. USERS_ZONES records assignment periods. STANDARD_MATERIALS bridges standards and materials. MongoDB references to relational UUIDs require application validation.

## Planned configuration

PostgreSQL and MongoDB connection settings; JWT secret and expiry; API port; CORS origins; MQTT host, port, client ID and optional credentials; command timeout; public traceability base URL. Exact names and values will be set during foundation implementation. MongoDB requires a replica set for the planned event-locking transactions.

## Implementation phases

1. Resolve schema notes before models or migrations; initialize API, configuration, PostgreSQL, MongoDB, migrations, seed and Swagger.
2. Authentication, read-only Manager scope and farm/zone/tree management.
3. MQTT metadata, telemetry ingestion, command batches and hardware confirmation.
4. Cultivation events, 15-minute locking, author-only corrections and hash verification.
5. Standards, materials, harvests and public QR traceability.
6. Admin/Manager web and public trace page.
7. Farmer Android mobile.
8. AI diagnosis, then RAG after source PDFs are provided.

## Verification

This folder-only step requires file and Git checks. The full foundation milestone additionally requires a running API, working database connections, migrations and seed, Swagger, lint, typecheck and runnable tests. It is not complete yet.

See IMPLEMENTATION_NOTES.md for decisions and unresolved schema/protocol details.
