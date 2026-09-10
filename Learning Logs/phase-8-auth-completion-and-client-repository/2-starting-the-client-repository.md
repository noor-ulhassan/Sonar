# 2 · Starting the client repository

**Mental model:** a repository is the data-access plug, not the appliance. It
defines what the business layer may ask for; the concrete Mongo class knows how
to ask Mongoose. Neither one makes an HTTP endpoint on its own.

---

## The contract: `BaseClientRepository`

The base class declares five async operations:

```js
create(clientData)
findById(clientId)
findBySlug(slug)
find(filters, options)
count(filters)
```

Each method throws `"Method Not Implemented"`. JavaScript has no built-in
interface keyword, so this is a convention with a loud failure: if a future
repository is injected without implementing an operation the service needs, it
fails immediately instead of quietly returning `undefined`.

The contract is deliberately stated in domain terms — *client*, *slug*, and
filters — rather than as a Mongoose query. A future `ClientService` should depend
on these methods, not on `Client.findOne(...)`. That keeps database details in
one replaceable layer.

## The concrete class: `MongoClientRepository`

`ClientRepository.js` extends the base class and passes the `Client` Mongoose
model to `super(Client)`. This mirrors the established user-repository pattern:

```
future ClientService
  → clientRepository.create(data)
  → new Client(data).save()
  → Mongoose validation and indexes
  → MongoDB clients collection
```

### `create(clientData)`

The method creates `new this.model(clientData)`, awaits `.save()`, logs the new
Mongo `_id` and `slug`, and returns the persisted document. The important
change between the two commits is the error path: it now logs an error **and
rethrows it**. An empty `catch` would turn a failed write into `undefined`,
making the service believe it received a client and causing a less useful error
later.

Mongoose still provides the real protections: required fields, slug format,
unique slug index, `createdBy`, and nested settings validation. This repository
does not yet check business rules such as who is allowed to create a client;
that belongs in the missing service layer.

### `findById(clientId)`

The method calls `this.model.findById(clientId)`, logs the result, and returns
either the client document or `null`. It rethrows malformed-ID and database
errors so the caller can map them to an API response. `null` is not an error: it
means the query completed correctly but found no matching document.

## Why this is not reachable yet

The class currently has no `export default new MongoClientRepository()` (or named
export), so no other module can import an instance. It also implements only two
of the five methods it promises. More importantly, these links do not exist:

```
ClientRepository  --missing-->  ClientService
ClientService     --missing-->  ClientController
ClientController  --missing-->  clientRouter
clientRouter      --missing-->  app.use("/api/clients", ...)
```

That is why the right status is **repository code written, feature not built**.
The model's existence and a successful direct repository call are not evidence
that a dashboard client can call `/api/clients`.

## Next wiring boundary

When this feature resumes, finish the repository's exported implementation and
only then construct the downward chain:

1. Define the business rules in `ClientService` — especially slug uniqueness,
   active state, and the caller/`createdBy` relationship.
2. Inject the exported repository through a `Dependencies/dependencies.js`
   composition root.
3. Add a controller that converts those service results into the existing
   `ResponseFormatter` envelope.
4. Add protected, validated routes, then mount them in `server.js`.

The ordering matters: a router should not need to know which database stores a
client, and a repository should not know an Express request exists.
