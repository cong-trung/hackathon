# FE Replication / Setup Prompt

Give this file to the coding agent that will scaffold or extend the frontend. It combines
the step-by-step setup with the architecture contract for the reference app.

## Setup

1. Unzip the template into the target project.
2. Run `npm install` in the project root.
3. Edit `.env.development`: set `DJANGO_BASE_URL` (your backend) and `PORT` (default 5173).
4. Run `npm run dev` for dev (Vite + Express); `npm run build` then `npm start` for prod.
5. Rename the app: `package.json` -> `name`, `index.html` -> `<title>` + favicon.

The template already ships with: Vite/Express config, path aliases, the full shadcn/ui
design system (`src/client/shared/`), RTK Query store + apiSlice, the routes shell
(`src/client/routes/`), one starter feature (`src/client/features/home/`) with a
data-table page + NotFound, and the Express proxy chain (`src/server/`).

Use the reference app only for structure and conventions. Build the target features by
following the contract below.

---

# Goal
Build a React + Vite + Express frontend that visually and structurally matches an existing
reference app. Match folder layout, import aliases, theme tokens, and component conventions.

# Tech stack (must match)
- Vite 6 (JS, not TS), React 18.3, react-router-dom 6, Redux Toolkit Query 2
- Tailwind CSS 3 (class-based dark mode) + tailwindcss-animate
- shadcn/ui "new-york" style, lucide-react icons (components are JSX, not TSX)
- Express 5 + vite-express (dev: Vite+Express; prod: Express serves dist/)
- TanStack React Table 8, React Hook Form + Zod, sonner toasts
- REST calls go through an Express proxy to a backend, never directly

# Folder structure (must replicate)
- src/client/  -> React app (import alias "@/" -> src/client)
- src/server/  -> Express API proxy (import alias "~/" -> src/server)
- src/client/main.jsx -> createRoot + Redux Provider + ThemeProvider + <Toaster/>
- src/client/app/store.js -> configureStore with only the RTK Query apiSlice
- src/client/app/api/apiSlice.js -> createApi({ baseQuery: fetchBaseQuery({ baseUrl: '/api' }), tagTypes, endpoints: () => ({}) })
- src/client/app/api/<feature>Api.js -> apiSlice.injectEndpoints() per feature
- src/client/routes/ -> constants.js (path constants), routes.js (lazy route table with
  route_name/key/title/icon/breadcrumb/component/children), App.jsx (createBrowserRouter
  building route objects from routes.js, wrapped in AppLayout, lazy NotFound for "*")
- src/client/features/<feature>/pages/<Page>.jsx  (+ optional components/ folder)
- src/client/shared/components/ui/  -> shadcn components (JSX)
- src/client/shared/components/data-table/ -> reusable DataTable + toolbar + pagination
- src/client/shared/components/app-sidebar/ -> shadcn sidebar shell
- src/client/shared/layout/ -> AppLayout.jsx (sidebar + breadcrumb header + Outlet),
  PageWithDataTableLayout.jsx (Card wrapper with loading/error states)
- src/client/shared/hooks, shared/lib/utils.js (cn), shared/utils/scrollbar.js
- src/server/server.js -> express, cors, cookie-parser, json, /api router, ViteExpress
- src/server/config/env.js -> loads .env.<NODE_ENV>, exports port/djangoBaseUrl
- src/server/routes/api.js -> mounts per-feature routers
- src/server/routes/api/<feature>.js -> express.Router delegating to services
- src/server/services/<feature>Service.js -> calls forwardRequest(path, req), parseError
- src/server/utils/forwardRequest.js -> axios to ${DJANGO_BASE_URL}${path}, preserves
  method/body/query/auth header, throws normalized {response:{data,status}}

# Conventions
- Path aliases "@/" (client) and "~/" (server) in BOTH vite.config.js and jsconfig.json
- components.json aliases: components=@/shared/components, ui=@/shared/components/ui,
  utils=@/shared/lib/utils, lib=@/shared/lib, hooks=@/shared/hooks
- Tailwind theme reads CSS vars: background/foreground/primary/sidebar/chart plus custom
  "table-*" (header/frozen/stripe/hover/link) and "status-*" (warning/info/success) colors
- Sticky/frozen columns in wide tables via CSS vars like bg-table-frozen/bg-table-hover
- All table UIs use <DataTable> + columns.jsx + toolbar.jsx + faceted filters for enums
- Forms: Zod schema + useForm({ resolver: zodResolver(schema) }) + shadcn Form/FormField
- New feature = add routes/constants entry + lazy component + API slice + optional
  server route + service (following forwardRequest pattern)
- Run via: npm run dev (dev), npm run build (vite build -> dist), npm start (prod Express)
- No TypeScript, no tests, no lint/typecheck scripts; prettier: 4-space indent, single
  quotes, trailing commas, 80 char, .jsx for components, .js for modules
