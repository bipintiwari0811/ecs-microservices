const request = require('supertest');
const { createApp } = require('../src/app');

const config = {
  serviceName: 'orders',
  basePath: '/orders',
  nodeEnv: 'test',
  db: { user: 'orders_user', password: 'super-secret' },
  secretKeys: ['db_user', 'db_password'],
};

describe('orders service', () => {
  const usersClient = { getUser: jest.fn(async (id) => ({ id, name: 'Bipin' })) };
  const app = createApp(config, { usersClient });

  test('health', async () => {
    const res = await request(app).get('/orders/health');
    expect(res.status).toBe(200);
  });

  test('info never leaks the secret', async () => {
    const res = await request(app).get('/orders');
    expect(res.body.secretLoaded).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
  });

  test('order includes user from users service', async () => {
    const res = await request(app).get('/orders/101');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Bipin');
    expect(usersClient.getUser).toHaveBeenCalledWith(1);
  });

  test('unknown order returns 404', async () => {
    const res = await request(app).get('/orders/999');
    expect(res.status).toBe(404);
  });

  test('users service down returns 502 with order data', async () => {
    const failing = createApp(config, { usersClient: { getUser: async () => { throw new Error('timeout'); } } });
    const res = await request(failing).get('/orders/102');
    expect(res.status).toBe(502);
    expect(res.body.item).toBe('Phone');
  });
});
