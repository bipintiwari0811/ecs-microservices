const express = require('express');

// Sample in-memory data - replace with a real DB using config.db
const USERS = {
  1: { id: 1, name: 'Bipin', email: 'bipin@example.com' },
  2: { id: 2, name: 'Asha', email: 'asha@example.com' },
};

function createApp(config) {
  const app = express();
  const router = express.Router();
  app.disable('x-powered-by');
  app.use(express.json());

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));

  router.get('/', (_req, res) => {
    res.json({
      service: config.serviceName,
      environment: config.nodeEnv,
      dbUser: config.db.user || null,
      secretLoaded: Boolean(config.db.password), // never return the value itself
      secretKeys: config.secretKeys,              // key names only
    });
  });

  router.get('/list', (_req, res) => res.json(Object.values(USERS)));

  router.get('/:id', (req, res) => {
    const user = USERS[req.params.id];
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  });

  app.use(config.basePath, router);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

module.exports = { createApp };
