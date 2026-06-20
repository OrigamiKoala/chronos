import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = fs.readFileSync(envPath, 'utf-8')
  .split('\n')
  .reduce((acc, line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return acc;
  }, {});

const projectId = envConfig.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: envConfig.BIGQUERY_CLIENT_EMAIL,
    private_key: envConfig.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

async function run() {
  console.log("Starting schema migration check...");
  try {
    const alterQuery = `
      ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
      ADD COLUMN IF NOT EXISTS questions_per_set INT64
    `;
    console.log("Running query:", alterQuery);
    const [job] = await bq.createQueryJob({ query: alterQuery });
    console.log(`Job started. Job ID: ${job.id}`);
    const [rows] = await job.getQueryResults();
    console.log("Migration query executed successfully! Result rows:", rows);
  } catch (err) {
    console.error("Migration failed with error:", err);
  }
}

run();
