# Hosting MAESTRO with Vercel, Render, and MongoDB Atlas

This repository includes a Vercel SPA fallback in `frontend/vercel.json` and a
Render Blueprint in `render.yaml`. The Render build trains the AI model artifact
from the tracked CSV datasets; the generated artifact is intentionally not
committed.

## 1. Prepare MongoDB Atlas

1. Create a production database and a dedicated database user with only the
   permissions MAESTRO needs.
2. Set `MONGODB_URI` to the Atlas connection string and
   `MONGODB_DATABASE=maestro_cmms`.
3. Configure Atlas Network Access to allow the Render service's outbound IP
   addresses. Avoid opening access to `0.0.0.0/0` except as a temporary,
   deliberate diagnostic.

## 2. Deploy the API to Render

Create a Render Web Service from the repository using the included Blueprint.
The backend runs one Uvicorn worker by default and exposes `/health` for the
Render health check. The Blueprint selects Render's Free plan to avoid
surprise charges; free services can sleep and have no production uptime
guarantee and are not suitable for continuous machine monitoring. Choose an
always-on paid plan deliberately before connecting live equipment.

Set the Blueprint's `sync: false` variables in Render:

- `MONGODB_URI`
- `AUTH_BOOTSTRAP_EMAIL`
- `AUTH_BOOTSTRAP_PASSWORD` (at least 12 characters)
- `CORS_ORIGINS` (the exact Vercel frontend origin, with no trailing slash)
- `MQTT_BROKER_HOST`, `MQTT_USERNAME`, and `MQTT_PASSWORD`
- `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` if the chatbot will be enabled

The initial bootstrap account is a Manager. Store credentials in the hosting
provider's environment-variable settings, not in this repository. Do not keep
bootstrap credentials in deployment settings after the initial account exists.

For the MQTT connection, use a private broker with TLS and authentication.
Render is configured to require TLS on port 8883; configure a broker hostname
and credentials that support this. The browser never connects directly to MQTT.

## 3. Deploy the frontend to Vercel

Import the repository into Vercel and set the project **Root Directory** to
`frontend`. Add this build-time environment variable to the Vercel environment
used for deployments:

```text
VITE_API_URL=https://<your-render-service>.onrender.com
```

Use the backend origin only; do not append `/api`. Vite embeds `VITE_*`
variables into public browser assets, so never put credentials in them.

## 4. Configure domains and cookies

Add the deployed Vercel origin to Render's `CORS_ORIGINS` exactly, including
the scheme and any custom port. Do not use `*` with credentialed requests.

For production, prefer custom domains under the same registrable domain, for
example `app.example.com` and `api.example.com`. These are separate origins for
CORS but remain same-site for the session cookie, so keep
`AUTH_COOKIE_SAMESITE=lax` and `AUTH_COOKIE_SECURE=true`.

The default `vercel.app` and `onrender.com` hostnames are cross-site. Browsers
may block third-party cookies between them even if `SameSite=None` is set;
custom domains are recommended before relying on authenticated API sessions.
If cross-site cookies are intentionally required, set
`AUTH_COOKIE_SAMESITE=none` while keeping `AUTH_COOKIE_SECURE=true`, and verify
login, refresh, logout, and WebSocket authentication in the target browsers.

## 5. Production checks

- Replace all example origins and credentials with production values.
- Confirm Atlas, MQTT, and any LLM provider are reachable from Render.
- Verify `/health`, login/logout, role access, chatbot behavior, and
  `/ws/telemetry` after deployment.
- The UI still contains demo-role simulation and browser-local demo data.
  Simulation is not a substitute for authentication; keep it clearly marked
  and do not use demo records as operational data.
- Machine control is an operational feature. Validate target RPM mapping and
  site/OEM safety limits on the actual equipment before enabling live use.
