import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = path.join(root, 'ops', 'cost-policy.json');
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const limits = policy.northflank || {};

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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function addOptionalEnv(target, names) {
  for (const name of names) {
    const value = optionalEnv(name);
    if (value !== undefined) {
      target[name] = value;
    }
  }
}

const secretValues = [
  process.env.JWT_SECRET,
  process.env.SMTP_CREDENTIALS_SECRET,
  process.env.SMTP_PASS
].filter(Boolean);

function redactSecrets(input) {
  let output = String(input || '');
  for (const secret of secretValues) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

async function patchNorthflankService({ token, projectId, serviceId, payload }) {
  const url = `https://api.northflank.com/v1/projects/${projectId}/services/deployment/${serviceId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Northflank service configuration failed with ${response.status}: ${redactSecrets(body)}`);
  }

  return response.json();
}

function buildPayload() {
  const serviceId = requiredEnv('NORTHFLANK_SERVICE_ID');
  const allowedServiceIds = toArray(limits.allowedServiceIds);
  if (allowedServiceIds.length && !allowedServiceIds.includes(serviceId)) {
    throw new Error(`Service ${serviceId} is not allowed by policy. Allowed: ${allowedServiceIds.join(', ')}`);
  }

  const allowedPlans = toArray(limits.allowedDeploymentPlans);
  const deploymentPlan = process.env.NORTHFLANK_DEPLOYMENT_PLAN || allowedPlans[0] || 'nf-compute-10';
  if (allowedPlans.length && !allowedPlans.includes(deploymentPlan)) {
    throw new Error(`Deployment plan ${deploymentPlan} is not allowed by policy. Allowed: ${allowedPlans.join(', ')}`);
  }

  const instances = Number(process.env.NORTHFLANK_INSTANCES || 1);
  if (typeof limits.maxReplicasPerService === 'number' && instances > limits.maxReplicasPerService) {
    throw new Error(`Instances ${instances} exceed policy max ${limits.maxReplicasPerService}.`);
  }

  const port = Number(process.env.NORTHFLANK_INTERNAL_PORT || 4000);
  const allowedPublicPorts = toArray(limits.allowedPublicPorts).map(Number);
  if (allowedPublicPorts.length && !allowedPublicPorts.includes(port)) {
    throw new Error(`Public port ${port} is not allowed by policy. Allowed: ${allowedPublicPorts.join(', ')}`);
  }

  const ephemeralStorageMb = Number(process.env.NORTHFLANK_EPHEMERAL_STORAGE_MB || 1024);
  if (typeof limits.maxEphemeralStorageMb === 'number' && ephemeralStorageMb > limits.maxEphemeralStorageMb) {
    throw new Error(`Ephemeral storage ${ephemeralStorageMb} MB exceeds policy max ${limits.maxEphemeralStorageMb} MB.`);
  }

  const sharedMemoryMb = Number(process.env.NORTHFLANK_SHARED_MEMORY_MB || 64);
  if (typeof limits.maxSharedMemoryMb === 'number' && sharedMemoryMb > limits.maxSharedMemoryMb) {
    throw new Error(`Shared memory ${sharedMemoryMb} MB exceeds policy max ${limits.maxSharedMemoryMb} MB.`);
  }

  const runtimeEnvironment = {
    NODE_ENV: 'production',
    PORT: String(port),
    CLIENT_BUILD_PATH: '/app/client/dist',
    DATABASE_PATH: optionalEnv('DATABASE_PATH') || '/app/server/data/marketpulse.db',
    PORTFOLIO_UPLOAD_DIR: optionalEnv('PORTFOLIO_UPLOAD_DIR') || '/app/server/data/uploads',
    CLIENT_PROD_ORIGIN: optionalEnv('CLIENT_PROD_ORIGIN') || 'https://anas154.github.io',
    JWT_SECRET: requiredEnv('JWT_SECRET'),
    SMTP_CREDENTIALS_SECRET: requiredEnv('SMTP_CREDENTIALS_SECRET')
  };

  addOptionalEnv(runtimeEnvironment, [
    'CLIENT_DEV_ORIGIN',
    'DEMO_EMAIL',
    'DEMO_PASSWORD',
    'MARKET_PROVIDER',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM'
  ]);

  return {
    description: 'MarketPulse API and web app. Managed by GitHub Actions with cost guardrails.',
    billing: {
      deploymentPlan
    },
    deployment: {
      type: 'deployment',
      instances,
      docker: {
        configType: 'default'
      },
      buildpack: {
        configType: 'default'
      },
      storage: {
        ephemeralStorage: {
          storageSize: ephemeralStorageMb
        },
        shmSize: sharedMemoryMb
      },
      ssh: {
        enabled: false
      }
    },
    ports: [
      {
        name: 'web',
        internalPort: port,
        public: true,
        protocol: 'HTTP'
      }
    ],
    healthChecks: [
      {
        protocol: 'HTTP',
        type: 'readinessProbe',
        path: '/health',
        port,
        initialDelaySeconds: 15,
        periodSeconds: 60,
        timeoutSeconds: 5,
        failureThreshold: 3,
        successThreshold: 1
      }
    ],
    runtimeEnvironment
  };
}

async function main() {
  const token = requiredEnv('NORTHFLANK_API_KEY');
  const projectId = requiredEnv('NORTHFLANK_PROJECT_ID');
  const serviceId = requiredEnv('NORTHFLANK_SERVICE_ID');
  const payload = buildPayload();

  await patchNorthflankService({
    token,
    projectId,
    serviceId,
    payload
  });

  console.log('Northflank service configuration applied with cost guardrails.');
}

main().catch((error) => {
  console.error(redactSecrets(error.message));
  process.exit(1);
});
