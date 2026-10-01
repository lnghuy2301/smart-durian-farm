# Implementation notes

## Latest ERD review

- COOPERATIVES now contains manager_id: UUID. Use this field rather than the earlier proposed manager_account_id; validate that it references a User with role Manager.
- ACTUATOR_TASKS now matches the build specification collection name.
- CULTIVATION_EVENTS still labels the deadline field as lock _at, with an embedded space. Confirm its intended spelling before schema generation; do not silently rename it.
- The ERD names the AI collection AI_DISEASE_DIAGNOSTICS; the spec calls it AI_LEAF_DIAGNOSIS. Preserve the ERD name; AI is deferred.
- Preserve ERD enum capitalization: Pending/Locked and Pending/Confirmed/Failed.
- command_id: Long remains in ACTUATOR_TASKS. Its meaning, generation and relation to per-target task_id must be resolved before IoT implementation.
- Some drawn relationship connectors attach to non-key rows; one connector has no target. Interpret relationships together with declared foreign-key fields, and review before generating constraints. Do not edit the ERD.

## User decisions

- Manager reads all Farms belonging to the assigned Cooperative; Manager does not mutate farm data.
- Farmer controls watering/spraying and records/edits harvests within the assigned Zone.
- Only the original cultivation-log author may create a correction.
- Assignment records preserve Farmer, Zone and time period.
- details remains an Object for selected form options and free text when Other is selected; option lists are not defined yet.
- ACTUATORS.status means operational availability, not relay on/off state.

## Implementation choices

- Assignment intervals use [start_date, end_date); protect against overlapping assignments to a Zone in both backend validation and PostgreSQL constraints.
- One command awaiting confirmation per station; reject a new command while busy. Do not treat broker publish success as hardware confirmation.
- Use a global cultivation hash chain with one locking worker; process due events by deadline then ObjectId. Atomically lock and hash within a MongoDB transaction.
- The initial previous_hash is 64 zero characters. Canonical event data includes identity, author, target, content, correction links and timestamps; recursively sort object keys and normalize timestamps to UTC ISO-8601. Hash only Locked events.

## Pending before the relevant implementation

- Resolve lock _at spelling before database models or migrations.
- Confirm Manager relationship cardinality from the diagram before constraints; do not invent an additional uniqueness rule.
- Define ACK timeout, late/duplicate ACK behavior, physical-button synchronization and echo behavior with firmware.
- Define the source of current relay on/off state without overloading ACTUATORS.status.
- Finalize telemetry station/stream mapping and command ID allocation.
- Confirm whether author-only corrections remain allowed after the author leaves the Zone; this was previously proposed, not explicitly confirmed.
- Finalize form options, nullability, defaults and remaining uniqueness/deletion rules before the relevant schema/API implementation.
