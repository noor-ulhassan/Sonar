# 1 · Finishing the auth handlers

**Mental model:** the router is the address book; the controller is the border
agent. The router gets a request to the correct door, but only the controller
translates HTTP (`req`, `res`, cookies, status codes) into a service call and
back again.

---

## The shared cookie policy

`authController.js` now builds `authCookieOptions` once from `config.cookie`:
`httpOnly`, `secure`, `sameSite`, and `maxAge`.

Both onboarding and login use the same object when setting `authToken`. That is
important because a cookie is identified by more than its name: attributes such
as path, domain, and security policy decide whether a browser sends it. Keeping
the set options together makes the auth policy visible in one place.

Logout removes `maxAge` before calling `clearCookie`. `clearCookie` sends an
expired cookie with the same security-oriented options; a positive `maxAge`
would be the wrong instruction when deleting it.

## `POST /api/auth/register` — create an account without replacing the admin session

```
requestLogger
  → authenticate                 // read and verify authToken; fills req.user
  → authorize([SUPER_ADMIN])     // only platform admin may continue
  → validate(registrationSchema)
  → AuthController.register
  → AuthService.register
  → MongoUserRepository
  → User.pre('save')             // validates + bcrypt-hashes password
```

The controller first blocks `req.body.role === SUPER_ADMIN` with an operational
`403 AppError`. That is a boundary rule: `/onboard-super-admin` is the only
unauthenticated bootstrap route allowed to create that platform-level role.

It then delegates the complete body to `authService.register`. The service
checks username and email independently, returning `409` for either duplicate,
creates the user, and removes the password hash before returning the user. The
controller returns `201` and the standard success envelope.

**Important current behaviour:** the service also creates a JWT, but this
controller intentionally ignores it and does not set a cookie. The existing
super admin stays logged in; the newly created account must use `/login` to get
its own session. The unused token is wasteful and is tracked in the issue ledger.

`registrationSchema` accepts a valid non-super-admin role, but the model still
requires `clientId` for every non-super-admin user. The route validator does not
enforce that rule; Mongoose rejects a missing `clientId` later in the request.
That is another example of validation being split between the HTTP gate and the
data model.

## `POST /api/auth/login` — prove possession of a password

```
requestLogger → validate(loginSchema) → controller.login → service.login
  → repository.findByUsername(username) → bcrypt.compare(password, user.password)
  → service.generateToken(user) → controller sets authToken cookie → 200
```

`findByUsername` returns the stored bcrypt hash. `comparePassword` calls:

```js
await bcrypt.compare(userEnteredPassword, hashedPassword);
```

The first argument is the password submitted right now; the second is the hash
from MongoDB. Bcrypt extracts the salt and work factor from the stored hash,
recomputes the candidate hash, and returns `true` or `false`. There is no
"unhash" step and the plaintext password is never stored.

The service returns `401` when the username is absent or the comparison fails,
and `403` for an inactive account. On success the controller sets `authToken`
and returns a password-free user envelope. The spelling of the current
`"Invliad Credentials"` message is a small open hygiene issue, not a different
response path.

## `GET /api/auth/profile` — trust the verified token for identity

`authenticate` verifies the cookie before the controller runs and assigns the
JWT payload to `req.user`. The controller passes only `req.user.userId` to
`authService.getProfile`; the service asks the repository for that document,
returns `404` if it disappeared, and otherwise strips `password`.

The useful separation is:

| Layer | Owns |
|---|---|
| `authenticate` | Is this token correctly signed and unexpired? |
| controller | Which identity from the HTTP request should be looked up? |
| service/repository | Does that user still exist, and what safe profile data is returned? |

The current code does not re-check `isActive` after a token is issued. An account
deactivated after login can still reach this endpoint until its JWT expires. That
is a policy decision still to make, and is tracked as an open issue.

## `POST /api/auth/logout` — remove a browser credential

Logout has no database or service call because this application keeps no server
session record. It clears the browser's `authToken` cookie and sends `200`.
Changing it from `GET` to `POST` expresses that it changes browser state, even
though the operation is idempotent: clearing an already-absent cookie still
produces the same safe result.

The route currently does not require authentication. That is acceptable for a
cookie-clear endpoint: a request with no cookie has nothing to revoke. If token
revocation is added later, logout will need authentication and a server-side
denylist or session store.

## What Phase 8 fixed — and what it did not

| Before | Now | Still not solved |
|---|---|---|
| Four router handlers threw because their controller methods did not exist. | All five routes call existing controller methods. | No auth integration tests yet. |
| Login called a missing `comparePassword`. | It uses `bcrypt.compare`. | Password hash remains selected by default. |
| Registration could request `super_admin`. | Controller rejects that role with `403`. | Onboarding's count-then-create race remains. |
| Logout used `GET`. | Logout uses `POST`. | Logout does not revoke an already-issued JWT. |
