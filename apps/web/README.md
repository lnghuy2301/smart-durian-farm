# Smart Durian Web

React + TypeScript + Vite, official shared brand kit. Run commands from repository root:

```powershell
npm ci
npm run dev:api
# Separate terminal
npm run dev:web
```

Web: http://127.0.0.1:5173. Development /api proxy defaults to http://127.0.0.1:3000. Configure only public VITE_API_BASE_URL and dev-only WEB_DEV_API_TARGET in apps/web/.env.local using .env.example. Never copy root backend secrets to the client.

Checks: `npm run lint:web`, `npm run typecheck:web`, `npm run test:web`, `npm run build:web`, `npm run test:web:e2e`. Formatting: `npm run format:check -w apps/web` or `npm run format -w apps/web`. Browser suite requires installed Edge/Chrome (WEB_TEST_BROWSER overrides executable), starts isolated Nest/Vite/MQTT TCP loopback, fake email capture and mock SMS; it never uses your running API or root .env. Artifacts in ignored test-results/.

See [complete implementation/reproduction](../../docs/frontend/WEB_FOUNDATION_IMPLEMENTATION.md), [design adaptation](../../docs/frontend/DESIGN_ADAPTATION.md), [module guides](../../docs/frontend/modules/) and [source brand](../../assets/brand/README.md). Backend business data and telemetry are still RAM. Manager dashboard remains pending the user's confirmation of the separate template.

Fonts are served locally via @fontsource/be-vietnam-pro, weights400/500/600/700 Latin + Vietnamese. SIL OFL1.1 notice is shipped at /licenses/Be-Vietnam-Pro-OFL.txt. Kit SVG wordmarks use text; native SVG mark and original colors are preserved. Reference HTML/demo scripts and external images are not served by this app.
