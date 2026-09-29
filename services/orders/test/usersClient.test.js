const { createUsersClient } = require('../src/usersClient');

test('calls users service URL', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 1 }) }));
  const client = createUsersClient('http://users:3000', fetchImpl);
  await expect(client.getUser(1)).resolves.toEqual({ id: 1 });
  expect(fetchImpl.mock.calls[0][0]).toBe('http://users:3000/users/1');
});

test('returns null on 404', async () => {
  const client = createUsersClient('http://users:3000', async () => ({ ok: false, status: 404 }));
  await expect(client.getUser(9)).resolves.toBeNull();
});

test('throws on 500', async () => {
  const client = createUsersClient('http://users:3000', async () => ({ ok: false, status: 500 }));
  await expect(client.getUser(1)).rejects.toThrow('500');
});
