// Calls the users service over ECS Service Connect: http://users:3000/users/:id
function createUsersClient(baseUrl, fetchImpl = fetch) {
  return {
    async getUser(id) {
      const res = await fetchImpl(`${baseUrl}/users/${id}`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`users service returned ${res.status}`);
      return res.json();
    },
  };
}

module.exports = { createUsersClient };
