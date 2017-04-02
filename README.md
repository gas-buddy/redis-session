@gasbuddy/redis-session
========================
A configuration-file driven express.js session store which uses
Redis, but with HMGET/HMSET to allow for a microservice architecture
to divide sessions in a useful way.

Sample configuration:

```
{
  "meddleware": {
    "module": "require:@gasbuddy/configured-redis-sesssion",

  }
}
```

Note that this module requires a separately configured redis client
(usually configured-redis-client) which is assumed to be found at app.gb.redis, but can be changed with a "client" configuration key
that points to an instance of the redis client or a dot-capable property
name relative to the app.
