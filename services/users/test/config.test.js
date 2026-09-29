const { loadConfig, validateConfig, parseSecrets } = require('../src/config');

test('parses APP_SECRETS JSON', () => {
  const c = loadConfig({ APP_SECRETS: '{"db_user":"u","db_password":"p","api_key":"k"}' });
  expect(c.db).toEqual({ user: 'u', password: 'p' });
  expect(c.apiKey).toBe('k');
  expect(c.secretKeys).toEqual(['db_user', 'db_password', 'api_key']);
});

test('reports missing keys', () => {
  expect(validateConfig(loadConfig({}))).toEqual(['db_user', 'db_password']);
});

test('invalid JSON throws', () => {
  expect(() => parseSecrets('{bad')).toThrow('not valid JSON');
});
