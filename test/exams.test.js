import { jest } from '@jest/globals';

const mBigQuery = {
  query: jest.fn(),
};

jest.unstable_mockModule('@google-cloud/bigquery', () => {
  return {
    BigQuery: jest.fn(() => mBigQuery)
  };
});

const { default: handler } = await import('../api/exams.js');
const { BigQuery } = await import('@google-cloud/bigquery');

describe('remark-correct error handling', () => {
  let req, res, bqInstance;

  beforeEach(() => {
    req = {
      method: 'POST',
      query: { route: 'remark-correct' },
      body: {
        username: 'test_user',
        examId: 'exam_123',
        questionId: 'q_1',
        subject: 'Math',
        topic: 'Algebra'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    bqInstance = new BigQuery();
    mBigQuery.query.mockReset();

    // Mock the initial console.warn inside exams.js so it doesn't pollute the test output
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return 500 when a database error occurs', async () => {
    // Force bq.query to throw an error on the very first query to simulate DB failure
    mBigQuery.query.mockRejectedValueOnce(new Error('Simulated BigQuery error'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Simulated BigQuery error' });
    expect(console.error).toHaveBeenCalled();
  });
});
