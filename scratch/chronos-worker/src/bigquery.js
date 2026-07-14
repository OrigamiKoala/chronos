/**
 * BigQuery REST API helper.
 * Replaces the Apps Script BigQuery.Jobs.query() service.
 */

function buildQueryParameters(params) {
  return Object.entries(params).map(([key, val]) => {
    let type = 'STRING';
    let value = val;

    if (val === null || val === undefined) {
      return { name: key, parameterType: { type: 'STRING' }, parameterValue: { value: null } };
    } else if (typeof val === 'number') {
      type = Number.isInteger(val) ? 'INT64' : 'FLOAT64';
      value = String(val);
    } else if (typeof val === 'boolean') {
      type = 'BOOL';
      value = String(val);
    } else if (val instanceof Date) {
      type = 'TIMESTAMP';
      value = val.toISOString();
    } else if (typeof val === 'object') {
      type = 'STRING';
      value = JSON.stringify(val);
    } else {
      value = String(val);
    }

    return {
      name: key,
      parameterType: { type },
      parameterValue: { value },
    };
  });
}

function parseRows(result) {
  const rows = result.rows || [];
  const fields = (result.schema?.fields || []).map((f) => f.name);
  return rows.map((row) => {
    const obj = {};
    row.f.forEach((cell, idx) => {
      obj[fields[idx]] = cell.v;
    });
    return obj;
  });
}

async function pollJob(jobId, location, projectId, accessToken) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    let url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries/${jobId}?timeoutMs=10000`;
    if (location) url += `&location=${encodeURIComponent(location)}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error(`BQ poll error ${resp.status}`);
    const result = await resp.json();
    if (result.jobComplete) return parseRows(result);
  }
  throw new Error('BigQuery job polling timed out');
}

export async function runQuery(sql, params, projectId, accessToken) {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: buildQueryParameters(params),
      timeoutMs: 30000,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`BigQuery error ${resp.status}: ${text}`);
  }

  const result = await resp.json();

  // Synchronous result (most simple queries)
  if (result.jobComplete) return parseRows(result);

  // Job still running — poll
  const { jobId, location } = result.jobReference;
  return pollJob(jobId, location, projectId, accessToken);
}
