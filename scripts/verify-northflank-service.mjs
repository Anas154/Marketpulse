const DEFAULT_ATTEMPTS = 18;
const DEFAULT_DELAY_MS = 10000;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value == null || value === '' ? undefined : String(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

async function nfGet(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Northflank API ${response.status} for ${url}: ${body}`);
  }
  return response.json();
}

async function discoverBaseUrl({ token, projectId, serviceId }) {
  const url = `https://api.northflank.com/v1/projects/${projectId}/services/${serviceId}/ports`;
  const portsData = await nfGet(url, token);
  const ports = Array.isArray(portsData?.data?.ports) ? portsData.data.ports : [];
  const publicPorts = ports.filter((port) => port?.public === true && port?.protocol === 'HTTP');
  const preferred = publicPorts.find((port) => Number(port.internalPort) === 4000)
    || publicPorts.find((port) => port.name === 'web')
    || publicPorts[0];

  if (!preferred?.dns) {
    throw new Error('No public Northflank HTTP port with a DNS entry was found.');
  }

  return `https://${preferred.dns.replace(/\/+$/, '')}`;
}

async function fetchJsonWithRetries(url, attempts = DEFAULT_ATTEMPTS, delayMs = DEFAULT_DELAY_MS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json'
        }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

async function main() {
  const token = requiredEnv('NORTHFLANK_API_KEY');
  const projectId = requiredEnv('NORTHFLANK_PROJECT_ID');
  const serviceId = requiredEnv('NORTHFLANK_SERVICE_ID');

  const override = optionalEnv('NORTHFLANK_API_BASE_URL');
  const overrideUrl = normalizeBaseUrl(override);
  if (override && !overrideUrl) {
    console.log('Ignoring NORTHFLANK_API_BASE_URL because it is not an absolute http(s) URL.');
  }

  const discoveredUrl = await discoverBaseUrl({ token, projectId, serviceId });
  const baseUrl = overrideUrl || discoveredUrl;

  const health = await fetchJsonWithRetries(`${baseUrl}/health`);
  if (health.status !== 'ok') {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  const bootstrap = await fetchJsonWithRetries(`${baseUrl}/api/bootstrap`, 6, 5000);
  if (!Array.isArray(bootstrap.instruments)) {
    throw new Error('Unexpected bootstrap response: instruments array missing.');
  }

  if (process.env.GITHUB_OUTPUT) {
    await import('node:fs').then((fs) => {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `base_url=${baseUrl}\n`);
    });
  }

  console.log(`Live Northflank service verified at ${baseUrl}`);
  console.log(`Bootstrap instruments: ${bootstrap.instruments.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
