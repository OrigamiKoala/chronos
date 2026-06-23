import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

function getExamDuration(results) {
  let maxTime = 0;
  for (const r of results) {
    if (r.intervals && r.intervals.length > 0) {
      for (const inv of r.intervals) {
        if (inv.end > maxTime) maxTime = inv.end;
      }
    } else {
      maxTime += (r.timeSpent || 0);
    }
  }
  return maxTime || results.reduce((acc, r) => acc + (r.timeSpent || 0), 0) || 1;
}

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
      const examDuration = exam.totalSec || 1;
      const scaleFactor = maxDuration / examDuration;

      for (const r of exam.results) {
        const questionIntervals = (r.intervals && r.intervals.length > 0)
          ? r.intervals
          : [{ start: cursor, end: cursor + (r.timeSpent || 0) }];
        cursor += (r.timeSpent || 0);

        for (const inv of questionIntervals) {
          const qStart = inv.start * scaleFactor;
          const qEnd = inv.end * scaleFactor;
          const overlapStart = Math.max(qStart, start);
          const overlapEnd = Math.min(qEnd, end);
          if (overlapEnd > overlapStart) {
            const overlapDuration = overlapEnd - overlapStart;
            const score = r.score !== undefined ? Number(r.score) : (r.isCorrect ? 1.0 : 0.0);
            if (score > 0) {
              const isFRQ = r.type === 'free_response';
              const points = isFRQ ? (r.difficulty || r.difficultyAtTime || 1) : 1;
              sum += (points * score) * (overlapDuration / intervalSeconds) / scaleFactor;
            }
          }
        }
      }
    }
    const avg = exams.length > 0 ? sum / exams.length : 0;
    data.push(Math.round(avg * 100) / 100);
    const pct = Math.round((end / maxDuration) * 100);
    labels.push(`${pct}%`);
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

  const usernames = username.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
  if (usernames.length === 0) {
    return res.status(400).json({ error: 'At least one username is required' });
  }

  try {
    // Fire all 6 independent reads in parallel
    const consolidatedQuery = `
      WITH elo AS (
        SELECT 'elo' AS type, TO_JSON_STRING(STRUCT(user_id, exam_id, subject, accuracy, new_rating, rating_change, created_at)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
        WHERE user_id IN UNNEST(@usernames)
      ),
      tags AS (
        SELECT 'tag' AS type, TO_JSON_STRING(STRUCT(t.user_id, t.exam_id, t.question_index, t.tag, t.is_correct, t.points_value, h.created_at, h.subject)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\` t
        JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
          ON t.exam_id = h.exam_id AND t.user_id = h.user_id
        WHERE t.user_id IN UNNEST(@usernames)
      ),
      results AS (
        SELECT 'results' AS type, TO_JSON_STRING(STRUCT(r.user_id, r.exam_id, r.results_json, h.created_at, h.subject)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r
        JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
          ON r.exam_id = h.exam_id AND r.user_id = h.user_id
        WHERE r.user_id IN UNNEST(@usernames)
      ),
      mastery AS (
        SELECT 'mastery' AS type, TO_JSON_STRING(STRUCT(user_id, sub_category, subject, correct_count, total_count, accuracy_rate)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
        WHERE user_id IN UNNEST(@usernames) AND total_count > 0
      ),
      analysis AS (
        SELECT 'analysis' AS type, TO_JSON_STRING(STRUCT(user_id, subject, detailed_analysis)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
        WHERE user_id IN UNNEST(@usernames)
      ),
      breakdown AS (
        SELECT 'breakdown' AS type, TO_JSON_STRING(STRUCT(user_id, topic, good_at, not_good_at)) AS data
        FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
        WHERE user_id IN UNNEST(@usernames)
      )
      SELECT type, data FROM elo
      UNION ALL
      SELECT type, data FROM tags
      UNION ALL
      SELECT type, data FROM results
      UNION ALL
      SELECT type, data FROM mastery
      UNION ALL
      SELECT type, data FROM analysis
      UNION ALL
      SELECT type, data FROM breakdown
    `;

    const params = { usernames };
    const [rows] = await bq.query({ query: consolidatedQuery, params });

    const eloHistory = [];
    const tagData = [];
    const resultRows = [];
    const topicMastery = [];
    const analyses = [];
    const breakdowns = [];

    for (const r of rows) {
      try {
        const parsedData = JSON.parse(r.data);
        if (r.type === 'elo') eloHistory.push(parsedData);
        else if (r.type === 'tag') tagData.push(parsedData);
        else if (r.type === 'results') resultRows.push(parsedData);
        else if (r.type === 'mastery') topicMastery.push(parsedData);
        else if (r.type === 'analysis') analyses.push(parsedData);
        else if (r.type === 'breakdown') breakdowns.push(parsedData);
      } catch (parseErr) {
        console.error("Failed to parse row data:", r, parseErr);
      }
    }

    // Apply sorting in JS to match previous database ordering
    eloHistory.sort((a, b) => {
      const da = new Date(a.created_at?.value || a.created_at);
      const db = new Date(b.created_at?.value || b.created_at);
      return da - db;
    });

    tagData.sort((a, b) => {
      const da = new Date(a.created_at?.value || a.created_at);
      const db = new Date(b.created_at?.value || b.created_at);
      return da - db;
    });

    resultRows.sort((a, b) => {
      const da = new Date(a.created_at?.value || a.created_at);
      const db = new Date(b.created_at?.value || b.created_at);
      return da - db;
    });

    topicMastery.sort((a, b) => {
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      return b.accuracy_rate - a.accuracy_rate;
    });

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
    if (usernames.length > 1) {
      const studentExams = {};
      usernames.forEach(u => {
        studentExams[u] = [];
      });
      for (const h of eloHistory) {
        if (studentExams[h.user_id]) {
          studentExams[h.user_id].push(h);
        }
      }
      let totalStreak = 0;
      let studentsWithExams = 0;
      for (const u of usernames) {
        const exams = studentExams[u].sort((a, b) => new Date(a.created_at?.value || a.created_at) - new Date(b.created_at?.value || b.created_at));
        if (exams.length > 0) {
          studentsWithExams++;
          let uStreak = 0;
          let uStreakType = null;
          for (let i = exams.length - 1; i >= 0; i--) {
            const passed = exams[i].accuracy >= 0.75;
            if (uStreakType === null) {
              uStreakType = passed ? 'correct' : 'incorrect';
              uStreak = 1;
            } else if ((uStreakType === 'correct' && passed) || (uStreakType === 'incorrect' && !passed)) {
              uStreak++;
            } else {
              break;
            }
          }
          if (uStreakType === 'correct') {
            totalStreak += uStreak;
          }
        }
      }
      currentStreak = studentsWithExams > 0 ? Math.round(totalStreak / studentsWithExams) : 0;
      streakType = 'correct';
    } else {
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
        const totalSec = getExamDuration(results);
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

    // Synthesize class average ELO over time for multi-user, or use raw for single user
    let finalEloHistory = eloHistory;
    if (usernames.length > 1) {
      const studentRatings = {};
      usernames.forEach(u => {
        studentRatings[u] = { Math: 100, Physics: 100, Chemistry: 100 };
      });

      const sortedHistory = [...eloHistory].sort((a, b) => {
        const da = new Date(a.created_at?.value || a.created_at);
        const db = new Date(b.created_at?.value || b.created_at);
        return da - db;
      });

      const synthesizedHistory = [];
      for (const h of sortedHistory) {
        if (studentRatings[h.user_id]) {
          studentRatings[h.user_id][h.subject] = h.new_rating;
        }

        let mathSum = 0, physSum = 0, chemSum = 0;
        usernames.forEach(u => {
          mathSum += studentRatings[u].Math;
          physSum += studentRatings[u].Physics;
          chemSum += studentRatings[u].Chemistry;
        });

        const avgMath = Math.round(mathSum / usernames.length);
        const avgPhys = Math.round(physSum / usernames.length);
        const avgChem = Math.round(chemSum / usernames.length);

        let newRating = 100;
        if (h.subject === 'Math') newRating = avgMath;
        else if (h.subject === 'Physics') newRating = avgPhys;
        else if (h.subject === 'Chemistry') newRating = avgChem;

        synthesizedHistory.push({
          user_id: h.user_id,
          exam_id: h.exam_id,
          subject: h.subject,
          accuracy: h.accuracy,
          rating_change: h.rating_change,
          created_at: h.created_at,
          new_rating: newRating
        });
      }
      finalEloHistory = synthesizedHistory;
    }

    const history = [...finalEloHistory]
      .sort((a, b) => new Date(b.created_at?.value || b.created_at) - new Date(a.created_at?.value || a.created_at))
      .slice(0, 25);

    let finalTopicMastery = topicMastery;
    if (usernames.length > 1) {
      const masteryMap = {};
      for (const row of topicMastery) {
        const key = `${row.subject}:${row.sub_category}`;
        if (!masteryMap[key]) {
          masteryMap[key] = { sub_category: row.sub_category, subject: row.subject, correct_count: 0, total_count: 0 };
        }
        masteryMap[key].correct_count += (row.correct_count || 0);
        masteryMap[key].total_count += (row.total_count || 0);
      }
      finalTopicMastery = Object.values(masteryMap).map(m => ({
        ...m,
        accuracy_rate: m.total_count > 0 ? m.correct_count / m.total_count : 0
      })).sort((a, b) => b.accuracy_rate - a.accuracy_rate);
    }

    const strengths = finalTopicMastery.filter(m => m.total_count >= 3 && m.accuracy_rate >= 0.70).map(m => ({ topic: m.sub_category, subject: m.subject }));
    const weaknesses = finalTopicMastery.filter(m => m.total_count >= 3 && m.accuracy_rate < 0.65).map(m => ({ topic: m.sub_category, subject: m.subject }));

    let detailedAnalysis = {};
    let topicBreakdowns = {};

    if (usernames.length > 1 && (analyses.length > 0 || breakdowns.length > 0)) {
      try {
        const inputData = {
          analyses: analyses.map(a => ({ studentId: a.user_id, subject: a.subject, detailed_analysis: a.detailed_analysis })),
          breakdowns: breakdowns.map(b => ({ studentId: b.user_id, topic: b.topic, good_at: b.good_at, not_good_at: b.not_good_at }))
        };

        const prompt = `You are an expert tutor synthesizing student learning analytics. Below is the detailed analysis and topic breakdown for a class of students. Please consolidate this data into a single cohesive dashboard representing the class as a whole.
Do not reference individual student usernames or student IDs (e.g. do not say "Student user_1 has problem with X" or "user_1 is good at Y"). Synthesize their strengths and weaknesses into general trends for the entire class.

Input Data:
${JSON.stringify(inputData, null, 2)}

You MUST format your output strictly as a JSON object, with no markdown code blocks wrapping the JSON, matching this schema:
{
  "detailedAnalysis": {
    "Math": "Markdown consolidated summary for Math class-wide performance...",
    "Physics": "Markdown consolidated summary for Physics class-wide performance...",
    "Chemistry": "Markdown consolidated summary for Chemistry class-wide performance..."
  },
  "topicBreakdowns": {
    "TopicName": {
      "good_at": "Markdown bulleted list summarizing what students in the class generally understand well.",
      "not_good_at": "Markdown bulleted list summarizing what students in the class generally struggle with."
    }
  }
}`;

        const response = await executeWithRetry(
          ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'],
          (ai, currentModel) => ai.interactions.create({
            model: currentModel,
            input: prompt,
            response_format: {
              type: 'text',
              mime_type: 'application/json'
            }
          })
        );

        const responseText = response.output_text;
        const parsed = parseJSONResponse(responseText);
        if (!parsed) {
          throw new Error('Failed to parse JSON response from Gemini');
        }
        detailedAnalysis = parsed.detailedAnalysis || {};
        topicBreakdowns = parsed.topicBreakdowns || {};
      } catch (geminiError) {
        console.error("Gemini consolidation failed, falling back to local concatenation:", geminiError);
        for (const a of analyses) {
          const subject = a.subject;
          if (subject && typeof subject === 'string' && subject !== '__proto__' && subject !== 'constructor' && subject !== 'prototype') {
            if (!detailedAnalysis[subject]) detailedAnalysis[subject] = '';
            detailedAnalysis[subject] += `- ${a.detailed_analysis}\n\n`;
          }
        }
        for (const b of breakdowns) {
          const topic = b.topic;
          if (topic && typeof topic === 'string' && topic !== '__proto__' && topic !== 'constructor' && topic !== 'prototype') {
            if (!topicBreakdowns[topic]) topicBreakdowns[topic] = { good_at: '', not_good_at: '' };
            if (b.good_at) topicBreakdowns[topic].good_at += `- ${b.good_at}\n`;
            if (b.not_good_at) topicBreakdowns[topic].not_good_at += `- ${b.not_good_at}\n`;
          }
        }
      }
    } else {
      for (const a of analyses) {
        const subject = a.subject;
        if (typeof subject === 'string' && subject !== '__proto__' && subject !== 'constructor' && subject !== 'prototype') {
          detailedAnalysis[subject] = a.detailed_analysis;
        }
      }
      for (const b of breakdowns) {
        const topic = b.topic;
        if (typeof topic === 'string' && topic !== '__proto__' && topic !== 'constructor' && topic !== 'prototype') {
          topicBreakdowns[topic] = {
            good_at: b.good_at,
            not_good_at: b.not_good_at
          };
        }
      }
    }

    return res.status(200).json({
      eloHistory: finalEloHistory,
      tagTimeSeries,
      intuitionSeries,
      topicMastery: finalTopicMastery,
      avgTimePerSubject,
      timelines,
      history,
      strengths,
      weaknesses,
      detailedAnalysis,
      topicBreakdowns,
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
