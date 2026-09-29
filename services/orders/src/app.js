const express = require('express');
const { createUsersClient } = require('./usersClient');

// Sample in-memory data - replace with a real DB using config.db
const ORDERS = {
  101: { id: 101, userId: 1, item: 'Laptop', amount: 75000 },
  102: { id: 102, userId: 2, item: 'Phone', amount: 30000 },
};

function createApp(config, deps = {}) {
  const usersClient = deps.usersClient || createUsersClient(config.usersUrl);
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
      secretLoaded: Boolean(config.db.password),
      secretKeys: config.secretKeys,
    });
  });

  router.get('/list', (_req, res) => res.json(Object.values(ORDERS)));

  // Order + user details fetched from the users service (service-to-service call)
  router.get('/:id', async (req, res) => {
    const order = ORDERS[req.params.id];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    try {
      const user = await usersClient.getUser(order.userId);
      return res.json({ ...order, user });
    } catch (err) {
      return res.status(502).json({ ...order, user: null, error: `users service unavailable: ${err.message}` });
    }
  });

  app.use(config.basePath, router);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

module.exports = { createApp };
