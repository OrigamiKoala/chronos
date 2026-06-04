/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

function buildTimeline(exams, maxDuration, intervalSeconds) {
  const numIntervals = Math.ceil(maxDuration / intervalSeconds);
  const data = [];
  const labels = [];
  for (let i = 0; i < numIntervals; i++) {
    const start = i * intervalSeconds;
    const end = (i + 1) * intervalSeconds;
    let sum = 0;
    for (const exam of exams) {
      let cursor = 0;
      for (const r of exam.results) {
        const qStart = cursor;
        const qEnd = cursor + (r.timeSpent || 0);
        const overlapStart = Math.max(qStart, start);
        const overlapEnd = Math.min(qEnd, end);
        if (overlapEnd > overlapStart) {
          const overlapDuration = overlapEnd - overlapStart;
          if (r.isCorrect) {
            const isFRQ = r.type === 'free_response';
            const points = isFRQ ? (r.difficulty || r.difficultyAtTime || 1) : 1;
            const score = r.score !== undefined ? Number(r.score) : 1.0;
            sum += (points * score) * (overlapDuration / intervalSeconds);
          }
        }
        cursor = qEnd;
      }
    }
    data.push(Math.round(sum * 100) / 100);
    const minutes = Math.floor(end / 60);
    const seconds = end % 60;
    const timeStr = seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
    labels.push(timeStr);
  }
  return { labels, data };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // Fire all 4 independent reads in parallel
    const eloQuery = `
      SELECT exam_id, subject, accuracy, new_rating, rating_change, created_at
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
      WHERE user_id = @username
      ORDER BY created_at ASC
    `;
    const tagQuery = `
      SELECT t.exam_id, t.question_index, t.tag, t.is_correct, t.points_value, h.created_at, h.subject
      FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\` t
      JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
        ON t.exam_id = h.exam_id AND t.user_id = h.user_id
      WHERE t.user_id = @username
      ORDER BY h.created_at ASC
    `;
    const resultsQuery = `
      SELECT r.exam_id, r.results_json, h.created_at, h.subject
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r
      JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
        ON r.exam_id = h.exam_id AND r.user_id = h.user_id
      WHERE r.user_id = @username
      ORDER BY h.created_at ASC
    `;
    const masteryQuery = `
      SELECT sub_category, subject, correct_count, total_count, accuracy_rate
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
      WHERE user_id = @username AND total_count > 0
      ORDER BY subject, accuracy_rate DESC
    `;

    const params = { username: sanitizedUser };
    const [eloResult, tagResult, resultsResult, masteryResult] = await Promise.allSettled([
      bq.query({ query: eloQuery, params }),
      bq.query({ query: tagQuery, params }),
      bq.query({ query: resultsQuery, params }),
      bq.query({ query: masteryQuery, params })
    ]);

    const eloHistory = eloResult.status === 'fulfilled' ? eloResult.value[0] : [];
    const tagData = tagResult.status === 'fulfilled' ? tagResult.value[0] : [];
    const resultRows = resultsResult.status === 'fulfilled' ? resultsResult.value[0] : [];
    const topicMastery = masteryResult.status === 'fulfilled' ? masteryResult.value[0] : [];

    // Build a map of exam results to dynamically look up question type and difficulty
    const examResultsMap = {};
    for (const row of resultRows) {
      try {
        examResultsMap[row.exam_id] = JSON.parse(row.results_json);
      } catch (e) {
        console.error("Failed to parse results_json for exam:", row.exam_id, e);
      }
    }

    // Build silly vs concept point differentials over time
    const examTagMap = {};
    for (const row of tagData) {
      const eid = row.exam_id;
      if (!examTagMap[eid]) {
        examTagMap[eid] = { exam_id: eid, created_at: row.created_at, subject: row.subject, silly: 0, concept: 0, unsure_correct: 0, unsure_total: 0 };
      }

      // Dynamic recalculation of points_value based on question type
      let pointsValue = 1;
      const resultsList = examResultsMap[eid] || [];
      const q = resultsList[row.question_index];
      if (q) {
        const isFRQ = q.type === 'free_response';
        pointsValue = isFRQ ? (q.difficulty || q.difficultyAtTime || 1) : 1;
      } else {
        pointsValue = row.points_value || 1;
      }

      if (row.tag === 'silly') {
        examTagMap[eid].silly += pointsValue;
      } else if (row.tag === 'concept') {
        examTagMap[eid].concept += pointsValue;
      } else if (row.tag === 'unsure') {
        examTagMap[eid].unsure_total += 1;
        if (row.is_correct) {
          examTagMap[eid].unsure_correct += 1;
        }
      }
    }
    const tagTimeSeries = Object.values(examTagMap).sort((a, b) => {
      const da = new Date(a.created_at?.value || a.created_at);
      const db = new Date(b.created_at?.value || b.created_at);
      return da - db;
    });

    // Intuition series (cumulative unsure accuracy over time)
    let cumulativeUnsureCorrect = 0;
    let cumulativeUnsureTotal = 0;
    const intuitionSeries = tagTimeSeries.filter(t => t.unsure_total > 0).map(t => {
      cumulativeUnsureCorrect += t.unsure_correct;
      cumulativeUnsureTotal += t.unsure_total;
      return {
        exam_id: t.exam_id,
        created_at: t.created_at,
        accuracy: cumulativeUnsureTotal > 0 ? Math.round((cumulativeUnsureCorrect / cumulativeUnsureTotal) * 100) : 0,
        cumCorrect: cumulativeUnsureCorrect,
        cumTotal: cumulativeUnsureTotal
      };
    });

    // Point efficiency per exam
    const efficiencyData = resultRows.map(row => {
      const results = JSON.parse(row.results_json);
      const totalTimeSeconds = results.reduce((acc, r) => acc + (r.timeSpent || 0), 0);
      const totalMinutes = Math.max(totalTimeSeconds / 60, 0.1);
      const rawPointsEarned = results.reduce((acc, r) => {
        if (r.type === 'free_response') {
          const difficulty = r.difficulty || r.difficultyAtTime || 1;
          const score = r.score !== undefined ? Number(r.score) : (r.isCorrect ? 1.0 : 0.0);
          return acc + (score * difficulty);
        } else {
          return acc + (r.isCorrect ? 1 : 0);
        }
      }, 0);
      const pointsEarned = Math.round(rawPointsEarned * 10) / 10;

      const totalPoints = results.reduce((acc, r) => {
        if (r.type === 'free_response') {
          return acc + (r.difficulty || r.difficultyAtTime || 1);
        } else {
          return acc + 1;
        }
      }, 0);
      const avgTimePerQuestion = results.length > 0 ? Math.round(totalTimeSeconds / results.length) : 0;

      return {
        exam_id: row.exam_id,
        subject: row.subject,
        created_at: row.created_at,
        pointsEarned,
        totalPoints,
        totalMinutes: Math.round(totalMinutes * 10) / 10,
        efficiency: Math.round((pointsEarned / totalMinutes) * 10) / 10,
        avgTimePerQuestion,
        questionCount: results.length
      };
    });

    // Summary stats
    const totalExams = eloHistory.length;
    const subjectCounts = {};
    const subjectAccuracies = {};
    for (const h of eloHistory) {
      const subject = h.subject;
      if (typeof subject === 'string' && subject !== '__proto__' && subject !== 'constructor' && subject !== 'prototype') {
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
        if (!subjectAccuracies[subject]) subjectAccuracies[subject] = [];
        subjectAccuracies[subject].push(h.accuracy);
      }
    }

    // Current streak
    let currentStreak = 0;
    let streakType = null;
    for (let i = eloHistory.length - 1; i >= 0; i--) {
      const historyItem = eloHistory.at(i);
      if (!historyItem) break;
      const passed = historyItem.accuracy >= 0.75;
      if (streakType === null) {
        streakType = passed ? 'correct' : 'incorrect';
        currentStreak = 1;
      } else if ((streakType === 'correct' && passed) || (streakType === 'incorrect' && !passed)) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate average time spent per question per subject across all user exam history
    const subjectTimes = { Math: 0, Physics: 0, Chemistry: 0 };
    const subjectQuestions = { Math: 0, Physics: 0, Chemistry: 0 };
    for (const row of resultRows) {
      try {
        const results = JSON.parse(row.results_json);
        const sub = row.subject;
        if (subjectTimes[sub] !== undefined) {
          for (const r of results) {
            subjectTimes[sub] += (r.timeSpent || 0);
            subjectQuestions[sub] += 1;
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    const avgTimePerSubject = {};
    for (const sub of ['Math', 'Physics', 'Chemistry']) {
      const count = subjectQuestions[sub] || 0;
      avgTimePerSubject[sub] = count > 0 ? Math.round((subjectTimes[sub] / count) * 10) / 10 : 0;
    }

    // Calculate aggregate timelines by subject
    const allExams = [];
    let maxDuration = 0;
    for (const row of resultRows) {
      try {
        const results = JSON.parse(row.results_json);
        const totalSec = results.reduce((acc, r) => acc + (r.timeSpent || 0), 0);
        if (totalSec > maxDuration) {
          maxDuration = totalSec;
        }
        allExams.push({ results, totalSec, subject: row.subject });
      } catch (e) {
        console.error(e);
      }
    }

    const timelineIntervalSeconds = maxDuration > 3600 ? 60 : (maxDuration > 1800 ? 30 : 15);

    const timelines = {
      All: buildTimeline(allExams, maxDuration, timelineIntervalSeconds),
      Math: buildTimeline(allExams.filter(e => e.subject === 'Math'), maxDuration, timelineIntervalSeconds),
      Physics: buildTimeline(allExams.filter(e => e.subject === 'Physics'), maxDuration, timelineIntervalSeconds),
      Chemistry: buildTimeline(allExams.filter(e => e.subject === 'Chemistry'), maxDuration, timelineIntervalSeconds)
    };

    return res.status(200).json({
      eloHistory,
      tagTimeSeries,
      intuitionSeries,
      efficiencyData,
      topicMastery,
      avgTimePerSubject,
      timelines,
      summary: {
        totalExams,
        subjectCounts,
        subjectAccuracies,
        currentStreak,
        streakType
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
