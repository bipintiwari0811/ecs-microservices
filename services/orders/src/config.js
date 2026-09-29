// The ONLY place that reads environment variables.
// APP_SECRETS is the full JSON of Secrets Manager secret "<service>/app", injected by ECS at task start.
function parseSecrets(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('APP_SECRETS is not valid JSON');
  }
}

function loadConfig(env = process.env) {
  const secrets = parseSecrets(env.APP_SECRETS);
  return {
    serviceName: env.SERVICE_NAME || 'orders',
    port: parseInt(env.PORT || '3000', 10),
    basePath: env.BASE_PATH || '/orders',
    nodeEnv: env.NODE_ENV || 'development',
    db: {
      user: secrets.db_user,
      password: secrets.db_password,
    },
    // Service Connect name of the users service (http://<ServiceName>:<port>)
    usersUrl: env.USERS_URL || 'http://users:3000',
    apiKey: secrets.api_key, // optional - add "api_key" to the secret in the console
    secretKeys: Object.keys(secrets),
  };
}

function validateConfig(config) {
  const missing = [];
  if (!config.db.user) missing.push('db_user');
  if (!config.db.password) missing.push('db_password');
  return missing;
}

module.exports = { loadConfig, validateConfig, parseSecrets };
