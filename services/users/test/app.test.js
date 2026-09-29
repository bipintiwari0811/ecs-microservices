const request = require('supertest');
const { createApp } = require('../src/app');

const config = {
  serviceName: 'users',
  basePath: '/users',
  nodeEnv: 'test',
  db: { user: 'users_user', password: 'super-secret' },
  secretKeys: ['db_user', 'db_password'],
};
const app = createApp(config);

describe('users service', () => {
  test('health', async () => {
    const res = await request(app).get('/users/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('info shows secret loaded but never the value', async () => {
    const res = await request(app).get('/users');
    expect(res.body.secretLoaded).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
  });

  test('list users', async () => {
    const res = await request(app).get('/users/list');
    expect(res.body).toHaveLength(2);
  });

  test('get user by id', async () => {
    const res = await request(app).get('/users/1');
    expect(res.body.name).toBe('Bipin');
  });

  test('unknown user returns 404', async () => {
    const res = await request(app).get('/users/999');
    expect(res.status).toBe(404);
  });
});
