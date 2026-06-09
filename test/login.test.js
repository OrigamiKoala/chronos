const mockQuery = jest.fn();

jest.mock('@google-cloud/bigquery', () => {
  return {
    BigQuery: jest.fn().mockImplementation(() => {
      return {
        query: mockQuery
      };
    })
  };
});

describe('login API - Table Creation Error Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENSURE_SCHEMA = 'true';
  });

  afterEach(() => {
    delete process.env.ENSURE_SCHEMA;
  });

  it('should ignore table creation error, warn, and set schemaEnsured to true', async () => {
    jest.resetModules();
    const handler = require('../api/login.js').default;

    mockQuery.mockRejectedValueOnce(new Error('Table already exists'));
    mockQuery.mockResolvedValue([[]]);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const req = {
      method: 'POST',
      body: {
        username: 'testuser',
        password: 'password123'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await handler(req, res);

    expect(consoleWarnSpy).toHaveBeenCalledWith("Alter table error or already exists:", expect.any(Error));

    consoleWarnSpy.mockClear();
    mockQuery.mockClear();
    mockQuery.mockResolvedValue([[]]);

    await handler(req, res);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
