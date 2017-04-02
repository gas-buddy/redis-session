import tap from 'tap';
import express from 'express';
import request from 'supertest';
import Redis from '@gasbuddy/configured-redis-client';
import redisSession from '../src/index';

tap.test('test_connection', async (t) => {
  const configuredClient = new Redis({});
  const redis = await configuredClient.start({
    hostname: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  });

  const app = express();
  app.gb = { redis };
  app.use(redisSession({
    schemas: { stuff: true },
    secret: 'MuchSecret',
    resave: false,
    saveUninitialized: false,
  }));
  app.get('/set', (req, res) => {
    req.session.foobar = 'hello world';
    req.session.stuff = { value: 'goodbye world' };
    res.json({});
  });
  app.get('/get', (req, res) => {
    res.json(req.session);
  });

  const agent = request.agent(app);
  const setSession = await agent.get('/set');
  t.strictEquals(setSession.status, 200, 'should set session variables');

  const getSession = await agent.get('/get');

  t.strictEquals(getSession.status, 200, 'should get session variables');
  t.ok(getSession.body.cookie, 'session should have a cookie');
  t.strictEquals(getSession.body.foobar, 'hello world', 'session should have a common value');
  t.ok(getSession.body.stuff, 'session should have a schema value');
  t.strictEquals(getSession.body.stuff.value, 'goodbye world', 'session should have a schema value');

  await configuredClient.stop();
});
