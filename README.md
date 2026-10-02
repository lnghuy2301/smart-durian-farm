# Smart Durian Farm

Monorepo for a NestJS backend, React web and React Native Android application. The current batch initializes the API only.

## Local API setup

Requires Node.js 20.19+ and npm. Run from the repository root:

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d
npm run dev:api
```

Health: http://localhost:3000/api/health (API liveness only).
Swagger: http://localhost:3000/api/docs.
OpenAPI JSON: http://localhost:3000/api/docs-json.
Readiness: http://localhost:3000/api/health/ready (200 when both databases respond; 503 otherwise).

Start Docker Desktop before running Compose. PostgreSQL and MongoDB are bound to localhost. Compose initializes MongoDB as a single-node replica set for later transactions. The API runs on the host; its MongoDB URI uses directConnection=true. This Compose setup is for local development only; MongoDB is not authenticated.

If .env already exists, add DATABASE_URL, MONGODB_URI and DB_TIMEOUT_MS from .env.example instead of overwriting your configuration. PostgreSQL Compose also requires POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB. Changing credentials does not modify an existing PostgreSQL volume.

```powershell
docker compose ps -a
docker compose logs mongo-init
docker compose stop
```

Stopping containers preserves their database volumes.

```powershell
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration --workspace @smart-durian/api
npm run start --workspace @smart-durian/api
```

Import the collection and Local environment from docs/postman into Postman, select Local and run the Foundation folder. Only implemented endpoints are included. Do not export real credentials or tokens to Git.

## Structure

- apps/api: REST API and future database/MQTT modules.
- apps/web: future React/Vite web.
- apps/mobile: future React Native Android app.
- ai: future AI/RAG work.
- docs: specifications, ERD, implementation plan and Postman files.

Database connection providers and readiness checks are implemented. Auth is available only as a local in-memory test module; migrations, seed and real authentication persistence remain outstanding. Connectivity readiness does not verify schema or seed. The ERD remains the schema authority.

## Auth local test

Set AUTH_MODE=mock, NODE_ENV=development and AUTH_TEST_PHONE, AUTH_TEST_PASSWORD, JWT_SECRET in .env using .env.example. Restart the API after changing config. Mock mode binds to 127.0.0.1 and cannot run in production.

Import docs/postman/Auth-Local-Test.postman_collection.json and the Local environment. Run requests 01 through 11 in order. The SMS outbox is simulated; no real SMS is sent and no database tables or real account records are created. Restart the API before each full run to restore the original test password.

See docs/AUTH_IMPLEMENTATION.md for endpoint contracts, OTP limits and session continuation notes.
