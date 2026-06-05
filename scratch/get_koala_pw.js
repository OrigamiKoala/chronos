import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

async function main() {
  const [rows] = await bq.query({
    query: `SELECT user_id, password, user_role FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = 'origamikoala'`
  });
  console.log('origamikoala details:', rows);
}

main().catch(console.error);
