# FE Starter Template (Vite + React + Express proxy)

Stripped-down starter extracted from a working hackathon frontend. Keeps the full
shadcn/ui design system, the reusable data-table, the shared layout/sidebar, and a
minimal Express proxy to a backend.

## Stack
- Vite 6 + React 18 (JSX), react-router-dom 6, RTK Query
- Tailwind 3 + shadcn/ui (New York, JSX) + lucide icons
- TanStack Table 8, React Hook Form + Zod, sonner
- Express 5 + vite-express (single server, proxies /api to a backend)

## Structure
- src/client/  -> React app (alias @/)
- src/server/  -> Express proxy (alias ~/)
- @/shared/    -> design system: components/ui, components/data-table,
  components/app-sidebar, layout, hooks, lib/utils
- @/features/<name>/pages|components|api -> one feature per folder
- @/app/api/   -> RTK Query apiSlice + per-feature endpoints

## Get started
1. npm install
2. Edit .env.development: set DJANGO_BASE_URL (your backend) and PORT.
3. npm run dev      -> dev (Vite + Express)
4. npm run build    -> dist/
5. npm start        -> prod (Express serves dist/)

## Adding a feature
1. Create src/client/features/<name>/pages/<Page>.jsx (+ optional components/).
2. Add an API slice in src/client/app/api/<name>Api.js via apiSlice.injectEndpoints().
3. Register the route in src/client/routes/routes.js (lazy) + add path to constants.js.
4. For server calls: add a router in src/server/routes/api/, a service in
   src/server/services/ using forwardRequest(), mount in src/server/routes/api.js.

See src/client/features/home and src/server/.../health* for end-to-end examples.
