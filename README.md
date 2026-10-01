# Smart Durian Farm

Monorepo for a NestJS backend, React web and React Native Android application. The current batch initializes the API only.

## Local API setup

Requires Node.js 20.19+ and npm. Run from the repository root:

```powershell
npm install
Copy-Item .env.example .env
npm run dev:api
```

Health: http://localhost:3000/api/health (API liveness only).
Swagger: http://localhost:3000/api/docs.
OpenAPI JSON: http://localhost:3000/api/docs-json.

```powershell
npm run lint
npm run typecheck
npm run build
npm test
npm run start --workspace @smart-durian/api
```

Import the collection and Local environment from docs/postman into Postman, select Local and run the Foundation folder. Only implemented endpoints are included. Do not export real credentials or tokens to Git.

## Structure

- apps/api: REST API and future database/MQTT modules.
- apps/web: future React/Vite web.
- apps/mobile: future React Native Android app.
- ai: future AI/RAG work.
- docs: specifications, ERD, implementation plan and Postman files.

Database connections, migrations, authentication and business modules are not implemented in this foundation batch. The ERD remains the schema authority.
