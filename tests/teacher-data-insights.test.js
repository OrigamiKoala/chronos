import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry } from '../api/_gemini.js';

// Define the mock query function before mocking
const mockQuery = vi.fn();

// Mock the BigQuery class
vi.mock('@google-cloud/bigquery', () => {
  return {
    BigQuery: vi.fn().mockImplementation(function() {
      this.query = mockQuery;
    }),
  };
});

// Mock the gemini module
vi.mock('../api/_gemini.js', () => {
  return {
    executeWithRetry: vi.fn(),
  };
});

describe('teacher-data handler - insights route', () => {
  let req;
  let res;
  let handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockReset();

    // Dynamically import handler after mocks are set up
    handler = (await import('../api/teacher-data.js')).default;

    req = {
      query: { route: 'insights', studentId: 'stu1', teacherId: 'teach1' },
      method: 'GET',
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  it('should successfully return insights when no new insights are generated', async () => {
    // 1. getLessonsQuery
    // 2. getInsightsQuery
    mockQuery.mockResolvedValueOnce([[]]); // lessons
    mockQuery.mockResolvedValueOnce([[{ insight_id: 'i1', summary: 'test summary' }]]); // existing insights

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      insights: [{ insight_id: 'i1', summary: 'test summary' }]
    });
  });

  it('should format json correctly after generating a new insight', async () => {
    // Setup for insight generation
    req.query.bypassLimit = 'true';

    const mockLessonTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    // 1. getLessonsQuery
    mockQuery.mockResolvedValueOnce([
      [{ lesson_id: 'l1', title: 'Test Lesson', description: 'desc', created_at: { value: mockLessonTime } }]
    ]);
    // 2. getInsightsQuery
    mockQuery.mockResolvedValueOnce([[]]); // no existing insights
    // 3. getHistoryQuery
    mockQuery.mockResolvedValueOnce([[]]); // no practice history

    // Mock Gemini response
    executeWithRetry.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: 'New summary',
        suggestions: 'New suggestions',
        progress_status: 'Yes'
      })
    });

    // 4. insertInsightQuery
    mockQuery.mockResolvedValueOnce([]);

    // 5. Re-fetch insights
    mockQuery.mockResolvedValueOnce([
      [{ insight_id: 'new_id', summary: 'New summary', suggestions: 'New suggestions', progress_status: 'Yes' }]
    ]);

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      insights: [{ insight_id: 'new_id', summary: 'New summary', suggestions: 'New suggestions', progress_status: 'Yes' }]
    });
  });

  it('should handle BigQuery query errors during insights fetching gracefully', async () => {
    mockQuery.mockRejectedValue(new Error('BigQuery connection failed'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'BigQuery connection failed'
    });
  });
});
