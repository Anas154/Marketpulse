import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policyPath = path.join(root, 'ops', 'cost-policy.json');

if (!fs.existsSync(policyPath)) {
  throw new Error(`Missing policy file: ${policyPath}`);
}

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const failures = [];

function fail(message) {
  failures.push(message);
}

function checkWorkflowCronPolicy() {
  if (!policy.repo?.disallowWorkflowScheduleCron) return;
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return;
  const files = fs.readdirSync(workflowsDir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    if (/\bon:\s*[\r\n]+\s*schedule\s*:/m.test(content) || /\bschedule\s*:/m.test(content)) {
      fail(`Workflow schedule/cron is not allowed by policy: .github/workflows/${file}`);
    }
  }
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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

async function checkNorthflankPolicy() {
  const token = process.env.NORTHFLANK_API_KEY;
  const projectId = process.env.NORTHFLANK_PROJECT_ID;
  const serviceId = process.env.NORTHFLANK_SERVICE_ID || '';
  if (!token || !projectId) {
    fail('Missing NORTHFLANK_API_KEY or NORTHFLANK_PROJECT_ID for policy validation.');
    return;
  }

  const base = `https://api.northflank.com/v1/projects/${projectId}`;
  const [servicesData, jobsData, addonsData] = await Promise.all([
    nfGet(`${base}/services`, token),
    nfGet(`${base}/jobs`, token),
    nfGet(`${base}/addons`, token).catch(() => ({ data: { addons: [] } }))
  ]);

  const services = toArray(servicesData?.data?.services);
  const jobs = toArray(jobsData?.data?.jobs);
  const addons = toArray(addonsData?.data?.addons);

  const limits = policy.northflank || {};
  if (typeof limits.maxServices === 'number' && services.length > limits.maxServices) {
    fail(`Northflank services exceed policy: ${services.length} > ${limits.maxServices}`);
  }
  if (typeof limits.maxJobs === 'number' && jobs.length > limits.maxJobs) {
    fail(`Northflank jobs exceed policy: ${jobs.length} > ${limits.maxJobs}`);
  }
  if (typeof limits.maxAddons === 'number' && addons.length > limits.maxAddons) {
    fail(`Northflank addons exceed policy: ${addons.length} > ${limits.maxAddons}`);
  }

  if (limits.allowJobCreation === false && jobs.length > 0) {
    fail('Northflank jobs exist, but policy disallows job creation.');
  }
  if (limits.allowAddonCreation === false && addons.length > 0) {
    fail('Northflank addons exist, but policy disallows addon creation.');
  }

  if (serviceId) {
    const serviceData = await nfGet(`${base}/services/${serviceId}`, token);
    const service = serviceData?.data || {};
    const instances = Number(service?.deployment?.instances || 0);
    if (typeof limits.maxReplicasPerService === 'number' && instances > limits.maxReplicasPerService) {
      fail(`Service ${serviceId} instances exceed policy: ${instances} > ${limits.maxReplicasPerService}`);
    }

    const plan = String(service?.billing?.deploymentPlan || '');
    const allowedPlans = toArray(limits.allowedDeploymentPlans);
    if (allowedPlans.length && plan && !allowedPlans.includes(plan)) {
      fail(`Service ${serviceId} plan violates policy: ${plan}. Allowed: ${allowedPlans.join(', ')}`);
    }
  }
}

async function main() {
  checkWorkflowCronPolicy();
  await checkNorthflankPolicy();

  if (failures.length) {
    console.error('Cost policy violations:');
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log('Cost policy checks passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
