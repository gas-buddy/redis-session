@gasbuddy/redis-session
========================

[![wercker status](https://app.wercker.com/status/fe7216469e3eae1d70a04c9582bd9874/s/master "wercker status")](https://app.wercker.com/project/byKey/fe7216469e3eae1d70a04c9582bd9874)

A configuration-file driven express.js session store which uses
Redis, but with HMGET/HMSET to allow for a microservice architecture
to divide sessions in a useful way.

Sample configuration:

```
{
  "meddleware": {
    "module": "require:@gasbuddy/configured-redis-sesssion",
    "arguments": [{
      schemas: {
        my-service-private-session: true,
        my-service: true,
        some-other-service: true,
      },
      secret: 'MuchSecret',
      resave: false,
      saveUninitialized: false,
    }],
  }
}
```

Note that this module requires a separately configured redis client
(usually configured-redis-client) which is assumed to be found at app.gb.redis,
but can be changed with a "client" configuration key that points to an instance
of the redis client or a dot-capable property name relative to the app.
