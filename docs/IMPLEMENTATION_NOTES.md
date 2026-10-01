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

- feat/database-connections builds on feat/backend-foundation, which has not been merged into main. Keep the PR based on the foundation branch until that merge.
- Use pg Pool and MongoClient as shared providers; lazy connections permit liveness during a database outage, while readiness reports the outage explicitly. Close both clients on shutdown and bound probe timeouts.
- DATABASE_URL and MONGODB_URI are required. Environment configuration errors fail startup without logging connection strings.
- Compose is local development only: bind database ports to loopback; MongoDB runs a single-node rs0 replica set without authentication. Use directConnection=true for the host API because the replica member advertises the Compose hostname. PostgreSQL example credentials are local placeholders.
- This batch creates no tables, collections, migrations or seed; it does not alter the ERD.
