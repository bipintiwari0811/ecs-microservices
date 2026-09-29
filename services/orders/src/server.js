const { createApp } = require('./app');
const { loadConfig, validateConfig } = require('./config');

const config = loadConfig();
const missing = validateConfig(config);
if (missing.length) {
  console.error(`Missing secret keys: ${missing.join(', ')} - check APP_SECRETS / execution role`);
  process.exit(1);
}

const server = createApp(config).listen(config.port, () => {
  console.log(`${config.serviceName} listening on ${config.port}${config.basePath}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
