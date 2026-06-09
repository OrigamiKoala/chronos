import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google-cloud/bigquery', () => {
  const queryMock = vi.fn();
  return {
    BigQuery: class {
      constructor() {}
      query = queryMock;
    },
    _queryMock: queryMock
  };
});

import { _queryMock } from '@google-cloud/bigquery';
import handler from './exams.js';

describe('exams.js get-exam error handling', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      query: { route: 'get-exam', examId: 'test-exam-123' },
      method: 'GET'
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    vi.clearAllMocks();
  });

  it('should return 500 when BigQuery query throws an error', async () => {
    _queryMock.mockImplementation(() => {
      throw new Error('BigQuery sync error');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(req, res);

    expect(consoleSpy).toHaveBeenCalledWith('Get exam error:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'BigQuery sync error' });

    consoleSpy.mockRestore();
  });

  it('should return 500 when JSON.parse fails on results_json', async () => {
    _queryMock.mockResolvedValue([
      [{ results_json: 'invalid json' }]
    ]);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(req, res);

    expect(consoleSpy).toHaveBeenCalledWith('Get exam error:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unexpected token') }));

    consoleSpy.mockRestore();
  });
});
