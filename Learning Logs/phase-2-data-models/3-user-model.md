# 3 · `models/User.js`

**Mental model:** a dashboard login. Belongs to a tenant (`clientId`) unless it
is platform staff (`super_admin`). Password is hashed on the way in and — as
written — comes back out on every query (a bug).

---

**What we did.** A Mongoose schema + model for a dashboard account. Fields:
`username`, `email`, `password`, `role`, `clientId`, `isActive`, and a
`permissions` sub-document of four booleans. Plus a `pre('save')` hook and two
secondary indexes. `timestamps: true`, `collection: "users"`.

**What it does.** On `new User({...}).save()` Mongoose validates every field
(username character-set, email format, the `SecurityUtils` policy on
`password`), then the `pre('save')` hook bcrypt-hashes the password before the
write. Nothing imports it yet, so none of this has run.

**Why each decision:**

- **`username`** — `/^[a-zA-Z0-9_.-]+$/` on top of `minlength: 3` + `unique`.
  Safe to drop into URLs, log lines, `@mentions` without escaping.
- **`email`** — `lowercase: true` + `trim: true` + a loose format regex.
  Lowercasing at the schema level is what makes `unique` mean "one account per
  address" (otherwise `A@x.com` and `a@x.com` coexist). Full RFC validation is
  not worth it; a confirmation email is the real check.
- **`password`** — schema `minlength: 6`, but `SecurityUtils` enforces 8, so the
  effective minimum is 8. Two disagreeing numbers (Issue). The validator guards
  with `!password.startsWith("$2a$")` to skip re-validating an already-hashed
  value — but `bcryptjs@3` emits `$2b$`, so the guard misses (Issue).
- **`role`** — three-value `enum` (`super_admin`, `client_admin`,
  `client_viewer`), default the least-privileged `client_viewer`. (The list is
  now *also* in `shared/constants/roles.js` from Phase 6 — two copies, Issue.)
- **`clientId`** — conditionally `required` (everyone except `super_admin`),
  `ref: "Client"` for `populate()`.
- **`permissions`** — a fixed block of four named booleans, not a free-form
  string array. Named fields get schema defaults, typo protection, indexable
  paths. Defaults encode "a viewer can view analytics and nothing else". Overlap
  with `role` is unresolved (Issue — RBAC vs capability flags).
- **`pre('save')` hashing hook** — re-checks `isModified("password")`, calls
  `next(error)` on failure so a bad hash aborts the save rather than writing
  plaintext.
- **Indexes** — `{ clientId, isActive }` ("active users in this tenant", the
  admin list) and `{ role }` ("find the super_admins").

**Missing (Issues):** `select: false` on `password` and a `toJSON` transform to
strip it. Until then any query returns the hash, so callers must deliberately
remove it before replying.

> **Correction — Phase 8 (10 Sep 2026).** `User` is now reached through
> `MongoUserRepository`, and the login flow no longer lacks password comparison:
> `AuthService.comparePassword(plain, hash)` delegates to `bcrypt.compare`. It
> is a service helper rather than a Mongoose instance method, so the repository
> still returns the document and the service owns the authentication decision.
> The exposure concern above remains: this does not make `password`
> unselectable.
