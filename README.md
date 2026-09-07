# API Hit Monitoring System

A backend service for recording API traffic and turning it into per-endpoint
metrics. Instrumented services publish one event per request; the system stores
the raw events, rolls them up into time-bucketed aggregates, and exposes the
aggregates through an analytics API.

The service is built around a producer/consumer split:

- **Producer** — the HTTP API. Handles authentication, accepts hit events, and
  serves analytics. This is what `npm run dev` starts.
- **Consumer** — a queue worker that drains the `api_hits` queue and writes the
  PostgreSQL rollups. Not implemented yet; see [Project status](#project-status).

## Project status

Early development. The infrastructure, configuration, data models, and the
layered architecture for the `auth` feature are in place. Most request handlers
are not.

| Area | State |
|---|---|
| Server bootstrap, DB/queue connections, graceful shutdown | Working |
| `GET /` , `GET /health` | Working |
| `POST /api/auth/onboard-super-admin` | Working end to end |
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile`, `GET /api/auth/logout` | Routes and services are stubbed; controller methods are missing, so these currently return 500 |
| Hit ingestion (`/api/hit`) | Not built |
| Analytics API (`/api/analytics`) | Not built |
| Queue consumer / PostgreSQL rollups | Not built |

A running list of known bugs and shortcuts is kept in
[`Learning Logs/OPEN-ISSUES.md`](Learning%20Logs/OPEN-ISSUES.md).

## Architecture

```
instrumented service
        │  (hit event)
        ▼
  HTTP API (producer)  ──►  RabbitMQ: api_hits  ──►  consumer worker
        │                        │  (dead letters)         │
        │                        ▼                         ▼
        │                   api_hits.dlq            PostgreSQL: endpoint_metrics
        ▼                                                   ▲
   MongoDB: api_hits (raw events)                           │
   MongoDB: users / clients / api_keys           analytics API reads rollups
```

### Data stores

| Store | Holds | Why |
|---|---|---|
| MongoDB | Raw `api_hits` events, plus `users`, `clients`, `api_keys` | High-volume append workload; documents map directly to events; a 30-day TTL index expires raw events automatically |
| PostgreSQL | `endpoint_metrics` — hits, errors, and latency min/avg/max per `(client, service, endpoint, method, time_bucket)` | Aggregates are relational and queried with grouping and ranges; a unique constraint drives upsert-on-write |
| RabbitMQ | `api_hits` work queue with an `api_hits.dlq` dead-letter queue | Decouples ingestion latency from rollup work; failed messages are retained rather than dropped |

### Layered code structure

Each feature under `src/services/<feature>` is split into four layers, wired by a
per-feature dependency-injection container:

```
routes/       HTTP routing, middleware chain, request validation
controller/   reads req / writes res, delegates to the service
service/      business rules, token issue, orchestration
repository/   data access; BaseRepository defines the interface,
              Mongo* implements it
Dependencies/ container.js constructs repository → service → controller
```

Cross-cutting code lives in `src/shared` (`config`, `models`, `Middleware`,
`utils`, `constants`).

## Repository layout

```
server/
  src/
    server.js                     app bootstrap: middleware, routes, connect, listen, shutdown
    services/
      auth/
        routes/authRouter.js
        controller/authController.js
        service/authService.js
        repository/{BaseRepository,UserRepository}.js
        validation/authSchema.js
        Dependencies/dependencies.js
    shared/
      config/{index,logger,mongodb,postgres,rabbitmq}.js
      models/{User,Client,ApiKey,ApiHits}.js
      Middleware/{authenticate,authorize,validate,errorHandler,requestLogger}.js
      utils/{AppError,ResponseFormatter,SecurityUtil}.js
      constants/roles.js
  scripts/init.postgres.sql       endpoint_metrics table, indexes, updated_at trigger
  docker-compose.yaml             postgres, mongo, rabbitmq, pgadmin, api-app, consumer
  Dockerfile                      producer image
  Dockerfile.consumer             consumer image (entrypoint not present yet)
Learning Logs/                    design record: THE-MAP, THE-WIRING, per-phase notes, OPEN-ISSUES
```

## Prerequisites

- Node.js 20 or newer
- Docker and Docker Compose (for MongoDB, PostgreSQL, and RabbitMQ)

## Configuration

Configuration is read from environment variables in
`server/src/shared/config/index.js`, loaded from `server/.env` in development.
All keys have defaults; the table lists the ones you are likely to set.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Enables console logging and non-secure cookies when not `production` |
| `PORT` | `8080` | HTTP listen port |
| `MONGO_URI` | `mongodb://localhost:27017/api-monitoring` | MongoDB connection string |
| `MONGO_DB_NAME` | `api_monitoring` | MongoDB database name |
| `PG_HOST` / `PG_PORT` | `localhost` / `5432` | PostgreSQL host and port |
| `PG_DATABASE` / `PG_USER` / `PG_PASSWORD` | `api_monitoring` / `postgres` / `password` | PostgreSQL credentials |
| `RABBITMQ_URL` | `amqp://localhost:5672` | RabbitMQ connection string (include vhost) |
| `RABBITMQ_QUEUE` | `api_hits` | Work queue name; the DLQ is `<queue>.dlq` |
| `RABBITMQ_RETRY_ATTEMPTS` / `RABBITMQ_RETRY_DELAY` | `3` / `1000` | Publish retry policy (ms) |
| `JWT_SECRET` | `noorulhassan1` | HMAC secret for signing auth tokens — override in every real environment |
| `JWT_EXPIRES_IN` | `24h` | Token lifetime |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | `900000` / `1000` | Rate-limit config object (not yet applied to any route) |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum length enforced by `SecurityUtil` on save |
| `PASSWORD_REQUIRE_UPPERCASE` / `_LOWERCASE` / `_NUMBERS` / `_SYMBOLS` | `true` | Password composition rules |
| `API_KEY_EXPIRY_DAYS` | `365` | Default expiry applied to new API keys |

`server/.env` is git-ignored. There is no committed `.env.example`; use the
table above.

## Running locally

Start the backing services:

```bash
cd server
docker compose up -d postgres mongo rabbitmq
```

Install dependencies and run the API with reload:

```bash
npm install
npm run dev
```

The API listens on `http://localhost:8080` by default. Check it:

```bash
curl http://localhost:8080/health
```

Management UIs from the compose file: RabbitMQ on `http://localhost:15672`
(`admin` / `12345`), pgAdmin on `http://localhost:5050`
(`admin@example.com` / `admin`, start it with `docker compose up -d pgadmin`).

Note: the compose file maps MongoDB to host port `27018`. When running the API
on the host against the compose MongoDB, set
`MONGO_URI=mongodb://localhost:27018/api-monitoring`.

## Running with Docker

`docker compose up -d` builds and starts the full stack except the consumer.
The `api-app` service listens on `http://localhost:5000` and connects to the
other containers over the compose network.

The consumer is gated behind a compose profile because its entrypoint
(`src/consumer.js`) does not exist yet:

```bash
docker compose --profile consumer up -d --build
```

## HTTP API

Base URL: `http://localhost:<PORT>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | none | Service metadata and endpoint list |
| `GET` | `/health` | none | Liveness, uptime, timestamp |
| `POST` | `/api/auth/onboard-super-admin` | none (one-time) | Creates the first `super_admin`; rejected once one exists. Sets the auth cookie |
| `POST` | `/api/auth/register` | `super_admin` cookie | Create a user (handler not implemented) |
| `POST` | `/api/auth/login` | none | Exchange credentials for the auth cookie (handler not implemented) |
| `GET` | `/api/auth/profile` | any authenticated | Current user (handler not implemented) |
| `GET` | `/api/auth/logout` | none | Clear the auth cookie (handler not implemented) |

### Response envelope

Every response uses a fixed shape from `ResponseFormatter`:

```json
{ "success": true, "data": {}, "message": "...", "statusCode": 200, "timestamp": "..." }
```

```json
{ "success": false, "error": null, "message": "...", "statusCode": 400, "timestamp": "..." }
```

### Authentication

- On successful onboarding or login the server sets an `authToken` cookie:
  `httpOnly`, `sameSite=strict`, `secure` when `NODE_ENV=production`, 24-hour
  `maxAge`.
- `authenticate` reads the JWT from that cookie only (no `Authorization`
  header path). `authorize([roles])` checks `req.user.role` against an allow
  list.
- Passwords are hashed with bcryptjs in a `User` pre-save hook. Password policy
  is enforced in the model via `SecurityUtil`; the route-level `validate`
  middleware only checks presence and a minimum length.

### Roles

Defined in `src/shared/constants/roles.js`:

| Role | Intended scope |
|---|---|
| `super_admin` | Platform owner; manages clients, users, and API keys |
| `client_admin` | Manages one client's users, keys, and data |
| `client_viewer` | Read-only analytics for one client |

## Logging

Winston, configured in `src/shared/config/logger.js`. JSON to
`server/logs/error.log` (errors) and `server/logs/combined.log` (all levels);
colorized console output when `NODE_ENV` is not `production`. The `logs`
directory is git-ignored. `requestLogger` records method, path, client IP,
status, and duration on response finish.

## Development notes

- ES modules throughout (`"type": "module"`); relative imports include the
  `.js` extension.
- No test suite yet (`npm test` is a placeholder).
- The `Learning Logs/` directory is the primary design record. Start with
  `THE-MAP.md` for the whole picture and `THE-WIRING.md` for how the files
  connect; `OPEN-ISSUES.md` tracks every known defect and shortcut.

## Roadmap

Not yet built, in rough order:

1. Complete the `auth` controller (`register`, `login`, `getProfile`, `logout`)
   and add password comparison.
2. Client and API-key management endpoints.
3. Hit ingestion endpoint: validate the event, authenticate by API key, publish
   to `api_hits`, persist the raw event to MongoDB.
4. Consumer worker: consume `api_hits`, upsert `endpoint_metrics` by time
   bucket, dead-letter on repeated failure.
5. Analytics API over the PostgreSQL rollups.
