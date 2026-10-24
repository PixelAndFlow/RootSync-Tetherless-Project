# marc-frontend-integration-test

Chris's frontend (`chris-frontend-integration`), unchanged except for one real
wire: staff sign-in and password change now call the live Render/Neon server
instead of the mock. Everything else — offline learning, trainer reports,
learner setup, cohorts/students/modules on the staff screens — is still mock.
Not a decision about the admin backend's final shape; just a smoke test to
prove the deployed server and this frontend can talk to each other at all.

## What this actually tests

- Real `POST /v1/staff/login` against Neon, through Render, over the network
  from a browser (so this also proves CORS is configured right).
- Real `POST /v1/staff/me/password` + `GET /v1/staff/me` for the forced
  first-password-change flow.
- Nothing else hits the network. The staff dashboard will show 0 cohorts /
  0 students / 0 modules after a real sign-in — that's `ApiStaffAdminGateway`
  returning empty reads on purpose (see the comment at the top of
  `src/services/staff/ApiStaffAdminGateway.ts`), not a bug.

## What you need to do before testing

1. **CORS on Render** — set `CORS_ORIGINS` on the Render service to include
   wherever you'll run this frontend from, e.g. `http://localhost:5173`, and
   redeploy/restart so it picks up the change.
2. **A real Superadmin on Neon** — if one doesn't exist yet, run locally
   (needs the `marc-backend` branch of the code repo, not this one):
   ```sh
   DATABASE_URL='<neon-connection-string>' node packages/server/src/admin.ts \
     create-staff --role superadmin --username marc --name "Marc" <<< 'a-long-password'
   ```
3. **This frontend, pointed at Render**:
   ```sh
   npm install
   cp .env.example .env.local
   # edit .env.local: VITE_TETHERLESS_API_BASE_URL=https://<your-render-service>.onrender.com
   npm run dev
   ```
4. Open the printed localhost URL, go to `/#/staff/sign-in`, sign in with the
   real Superadmin username/password. The demo-credentials hint on that screen
   is hidden automatically once `VITE_TETHERLESS_API_BASE_URL` is set — if you
   still see it, the env var isn't being picked up (check `.env.local` is in
   this project's root, not `.env`, and restart `npm run dev`).

## Expected result

- Correct credentials → redirected to `/staff` (or `/staff/change-password`
  if `must_change_password` is set on that account), dashboard shows your real
  display name and role, counts at 0.
- Wrong credentials → `ApiErrorNotice` shows an auth error, same as it would
  for any real API error.
- Nothing loads / `NETWORK_ERROR` → check the Render service is awake (free
  tier sleeps) and that `CORS_ORIGINS` was actually redeployed.

## Open questions for Marc (no need to answer before testing — just flag what you find)

1. Does `CORS_ORIGINS` already include anything, or is it unset? If unset,
   step 1 above is required before anything will work at all.
2. Is there already a Superadmin on the live Neon DB, or does step 2 need to
   run? If one exists, what's the intended long-term way to hand out the
   password (this doc assumes you already have it).
3. Once sign-in works: do you want `listCohorts`/`listStudents`/`createStudent`
   wired next (requires reconciling `StaffAdminGateway`'s shape with the
   server's real setup-code/roster-import flow — the mismatch flagged
   earlier), or is sign-in alone enough for now while the admin-backend
   question stays open?

## Next steps after this test passes

- Decide whether cohorts/students/modules get wired for real next, or stay
  mock until the admin-UI architecture question is settled.
- Decide where this frontend actually gets deployed (currently only tested
  via `npm run dev` locally against the Render API).
- Reconcile `StaffAdminGateway.createStudent`'s `firstName`/`lastName` shape
  against the server's real learner-creation route before wiring it.
