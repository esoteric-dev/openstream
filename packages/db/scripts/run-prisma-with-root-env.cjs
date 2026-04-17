const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const commandArgs = process.argv.slice(2);
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(rootEnvPath)) {
  const envFile = fs.readFileSync(rootEnvPath, 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

const result = spawnSync('prisma', commandArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
