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
      SELECT t.exam_id, t.tag, t.is_correct, t.points_value, h.created_at, h.subject
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

    // Build silly vs concept point differentials over time
    const examTagMap = {};
    for (const row of tagData) {
      const eid = row.exam_id;
      if (!examTagMap[eid]) {
        examTagMap[eid] = { exam_id: eid, created_at: row.created_at, subject: row.subject, silly: 0, concept: 0, unsure_correct: 0, unsure_total: 0 };
      }
      if (row.tag === 'silly') {
        examTagMap[eid].silly += row.points_value || 1;
      } else if (row.tag === 'concept') {
        examTagMap[eid].concept += row.points_value || 1;
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
      const pointsEarned = results.filter(r => r.isCorrect).reduce((acc, r) => acc + (r.difficulty || r.difficultyAtTime || 1), 0);
      const totalPoints = results.reduce((acc, r) => acc + (r.difficulty || r.difficultyAtTime || 1), 0);
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

    return res.status(200).json({
      eloHistory,
      tagTimeSeries,
      intuitionSeries,
      efficiencyData,
      topicMastery,
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
