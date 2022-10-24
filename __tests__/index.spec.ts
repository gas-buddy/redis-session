import express from 'express';
import Redis from 'ioredis';
import request from 'supertest';
import redisSession from '../src';

test('Basic function', async () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
  });

  const app = express();

  app.use(redisSession({
    store: {
      redis,
      schemas: { stuff: true },
    },
    secret: 'MuchSecret',
    resave: false,
    saveUninitialized: false,
  }));

  app.get('/set', (req, res) => {
    const session = req.session as Record<string, any>;
    session.foobar = 'hello world';
    session.stuff = { value: 'goodbye world' };
    res.json({});
  });
  app.get('/get', (req, res) => {
    res.json(req.session);
  });

  const agent = request.agent(app);
  const setSession = await agent.get('/set');
  expect(setSession.status).toEqual(200); // should set session variables

  const getSession = await agent.get('/get');

  expect(getSession.status).toEqual(200); // should get session variables
  expect(getSession.body.cookie).toBeTruthy(); // session should have a cookie
  expect(getSession.body.foobar).toEqual('hello world'); // session should have a common value
  expect(getSession.body.stuff).toBeTruthy(); // session should have a schema value
  expect(getSession.body.stuff.value).toEqual('goodbye world'); // session should have a schema value

  redis.disconnect();
});
