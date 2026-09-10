# Phase 8 — Auth completion and the first client repository

**One line:** the four auth routes that Phase 7 could match but could not finish
now have controller methods; login can verify a bcrypt hash; and the next
feature, `client`, begins at the repository boundary.

**Commits:** `e60e14d` → `1415581` (client repository, 9 Sep 2026) and
`cd17043` (auth completion, 10 Sep 2026).

**State after this phase:** all five declared auth routes have a handler. The
implementation now reaches its intended service method instead of failing in the
router wrapper. `register`, `login`, and `profile` still need an integration
test against MongoDB and the other startup dependencies before they can be
called proven end-to-end. The client feature has a repository contract and two
Mongo operations, but it has no export, service, controller, router, DI
container, or `server.js` mount — it is not reachable over HTTP.

---

## What changed

| Area | Change | Why it matters |
|---|---|---|
| `AuthController` | Added `register`, `login`, `getProfile`, and `logout`; reused one cookie-options object | The router's last step now has a real HTTP adapter instead of throwing `TypeError`. |
| Registration guard | Rejects `role: "super_admin"` with `403` | The one-time onboarding endpoint remains the only creation path for a platform super admin. |
| Password verification | `AuthService.comparePassword` calls `bcrypt.compare` | Login compares a plaintext candidate with a stored hash; hashes must never be compared with `===`. |
| Logout route | Changed `GET /logout` to `POST /logout` | A state-changing operation should not be triggered by navigation, prefetching, or a crawled link. |
| Client repository contract | Added abstract `create`, `findById`, `findBySlug`, `find`, and `count` methods | It names the storage operations the future client service may depend on without coupling that service to Mongoose. |
| Mongo client repository | Implemented `create` and `findById` with logging and rethrows | Schema/database errors now travel upward instead of being silently swallowed. |

## Read in this order

1. **[1-finishing-the-auth-handlers.md](1-finishing-the-auth-handlers.md)** —
   the four routes that became real, including what each one does and does not
   do with a token.
2. **[2-starting-the-client-repository.md](2-starting-the-client-repository.md)**
   — the repository contract, the two implemented Mongo methods, and the exact
   wiring still missing.

## The gist

- A router line proves only that Express can *find* a route. A controller method
  is the adapter that lets the request enter the service layer and lets a result
  leave as HTTP.
- `bcrypt.compare(candidate, hash)` hashes the candidate using the salt encoded
  inside `hash`, then performs a safe comparison. It is the inverse operation
  for login; bcrypt hashes are intentionally not decryptable.
- `register` deliberately does **not** set a cookie. This endpoint is an admin
  creating another account, so the currently signed-in admin remains the
  browser session. The service currently mints a token that the controller
  discards; that unnecessary work is recorded as an open issue.
- A repository is not a feature by itself. Until an exported repository is
  injected into a service, called by a controller, registered in a router, and
  mounted in `server.js`, no client can invoke it.

## Issues opened or clarified here

- `MongoClientRepository` is not exported and implements only two of its five
  declared methods; it is safely dormant but cannot be injected yet.
- `AuthService.register` returns a JWT which `AuthController.register` drops.
  Either stop minting it or intentionally return/set it, depending on the
  desired account-creation flow.
- The auth flows have code coverage only by inspection so far; no integration
  test has verified cookie, MongoDB, validation, and error-handling behavior
  together. See [../OPEN-ISSUES.md](../OPEN-ISSUES.md).
