// Google Apps Script Webhook for Background Homework Generation and Grading
// Deploy this script as a Web App in Google Apps Script.
// Ensure the BigQuery API service is enabled in the Apps Script project.

const PROJECT_ID = "chronos-stress-sandbox"; // Update with actual GCP Project ID if different

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const projectId = payload.projectId || PROJECT_ID;

    if (action === 'generate_homework') {
      generateHomework(payload, projectId);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Homework generation complete' }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    if (action === 'async_grade_exam') {
      gradeExam(payload.payload, projectId);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Exam grading complete' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON)
      .setStatusCode(400);

  } catch (err) {
    console.error('Webhook error:', err);
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
      .setStatusCode(500);
  }
}

// ------------------------------------
// Homework Generation Logic
// ------------------------------------
function generateHomework(payload, projectId) {
  const { teacherId, lessonId, lessonTitle, lessonDescription, studentIds, homeworks, geminiApiKeys } = payload;
  const tId = teacherId.trim().toLowerCase();

  for (const studentId of studentIds) {
    const sanitizedStudent = studentId.trim().toLowerCase();

    for (const hw of homeworks) {
      const subject = hw.subject || 'Math';
      const normSubject = subject.toLowerCase();
      const numQuestions = hw.numQuestions || 5;
      const startingDifficulty = hw.startingDifficulty || 5;

      const sharedQuestionsCount = Array.isArray(hw.sharedQuestions) ? hw.sharedQuestions.length : 0;
      const aiCount = numQuestions - sharedQuestionsCount;

      if (aiCount <= 0) {
        // Save empty questions list
        runQuery(
          `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent },
          projectId
        );
        runQuery(
          `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: '[]' },
          projectId
        );
        continue;
      }

      // Fetch user ELO rating for the given subject
      let ratingColumn = 'math_rating';
      if (subject.toLowerCase() === 'physics') ratingColumn = 'physics_rating';
      else if (subject.toLowerCase() === 'chemistry') ratingColumn = 'chemistry_rating';

      let studentRating = 100;
      try {
        const ratingRows = runQuery(
          `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @studentId`,
          { studentId: sanitizedStudent },
          projectId
        );
        if (ratingRows && ratingRows.length > 0) {
          studentRating = Number(ratingRows[0][ratingColumn]) || 100;
        }
      } catch (err) {
        console.error('Error fetching student rating:', err);
      }

      // Calculate difficulty
      const baseDiff = Math.max(1, Math.min(10, startingDifficulty));
      let expectedR = 1000;
      if (subject.toLowerCase() === 'math') {
        const mathMap = { 1: 500, 2: 600, 3: 800, 4: 900, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
        expectedR = mathMap[Math.round(baseDiff)] || 1000;
      } else {
        const otherMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
        expectedR = otherMap[Math.round(baseDiff)] || 1000;
      }
      const rawOffset = (studentRating - expectedR) / 300;
      const clampedOffset = Math.max(-1.5, Math.min(1.5, rawOffset));
      const studentDifficulty = Math.max(1, Math.min(10, Math.round(baseDiff + clampedOffset)));

      // Fetch weaknesses, analysis, breakdown, mistakes, doneQuestionIds
      let weaknesses = 'None';
      let weaknessAnalysis = 'None';
      let topicBreakdown = 'None';
      let mistakeAnalysis = 'None';
      let doneQuestionIds = [];

      try {
        const weaknessesRows = runQuery(
          `SELECT COALESCE(STRING_AGG(FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), "; "), "None") AS weaknesses FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE accuracy_rate < 0.65 AND user_id = @studentId AND subject = @subject`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (weaknessesRows && weaknessesRows.length > 0) weaknesses = weaknessesRows[0].weaknesses;
      } catch(e) {}

      try {
        const weaknessAnalysisRows = runQuery(
          `SELECT detailed_analysis FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY updated_at DESC LIMIT 1`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (weaknessAnalysisRows && weaknessAnalysisRows.length > 0) weaknessAnalysis = weaknessAnalysisRows[0].detailed_analysis;
      } catch(e) {}

      try {
        const topicBreakdownRows = runQuery(
          `SELECT topic, good_at, not_good_at FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @studentId AND subject = @subject`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (topicBreakdownRows && topicBreakdownRows.length > 0) {
          topicBreakdown = topicBreakdownRows.map(row => `Topic: ${row.topic} | Good: ${row.good_at} | Not good: ${row.not_good_at}`).join('\n');
        }
      } catch(e) {}

      try {
        const mistakeAnalysisRows = runQuery(
          `SELECT mistake_patterns FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY created_at DESC LIMIT 3`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (mistakeAnalysisRows && mistakeAnalysisRows.length > 0) {
          mistakeAnalysis = mistakeAnalysisRows.map((row, idx) => `Pattern ${idx + 1}: ${row.mistake_patterns}`).join('\n');
        }
      } catch(e) {}

      try {
        const doneRows = runQuery(
          `SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`, UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q WHERE user_id = @studentId`,
          { studentId: sanitizedStudent },
          projectId
        );
        doneQuestionIds = doneRows.map(row => row.qid).filter(Boolean);
      } catch(e) {}

      // Prompt Guidelines...
      const allowedTypes = Array.isArray(hw.examFormat) ? hw.examFormat : [hw.examFormat || 'multiple_choice'];
      const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);
      const typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(' | ');

      let lessonInstructions = '';
      if (lessonTitle || lessonDescription) {
        lessonInstructions = `Homework for "${lessonTitle}". Content: "${lessonDescription}"`;
      }

      const prompt = `Write tricky Olympiad questions targeting weak areas (${weaknesses}). 
Subject: ${subject}
Difficulty: ${studentDifficulty}
Count: ${aiCount}
Types: ${parsedTypes.join(', ')}
${lessonInstructions}
Weakness Analysis: ${weaknessAnalysis}
Breakdown: ${topicBreakdown}
Mistake Analysis: ${mistakeAnalysis}

Return strictly a JSON array of question objects matching this schema:
[{
  "id": "unique string",
  "topic": "topic name",
  "question": "question text in LaTeX",
  "type": ${typeSchemaDesc},
  "options": ["A", "B", "C", "D"], // if MCQ
  "answer": "correct answer",
  "difficulty": 5,
  "detailedSolution": "",
  "step1_trap": "trap description",
  "step2_system": "system description",
  "step3_distractors": "distractor derivation",
  "step4_problem": "formulation description"
}]`;

      const responseText = callGemini(prompt, geminiApiKeys);
      if (responseText) {
        try {
          const cleanText = responseText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
          const questionsList = JSON.parse(cleanText);

          runQuery(
            `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent },
            projectId
          );
          runQuery(
            `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: JSON.stringify(questionsList) },
            projectId
          );
        } catch (err) {
          console.error("Failed to parse/save homework questions:", err);
        }
      }
    }
  }
}

// ------------------------------------
// Exam Grading Logic
// ------------------------------------
function gradeExam(payload, projectId) {
  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, isRated, assignmentId, results } = payload;
  const sanitizedUser = username.trim().toLowerCase();

  const gradedResults = results.map(r => {
    if (r.type === 'short_answer') {
      const correct = evaluateShortAnswer(r);
      return { ...r, isCorrect: correct, score: correct ? 1.0 : 0.0 };
    }
    if (r.type === 'multiple_choice') {
      const correct = evaluateMCQ(r);
      return { ...r, isCorrect: correct, score: correct ? 1.0 : 0.0 };
    }
    if (r.type === 'free_response') {
      return gradeFRQ(r, subject, projectId);
    }
    return r;
  });

  // Calculate final ELO and details
  let finalAccuracy = accuracy;
  let finalRatingChange = ratingChange;
  let finalNewRating = newRating;

  // Save to BigQuery
  runQuery(
    `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
      (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at, assignment_id)
      VALUES (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP(), @assignmentId)`,
    { username: sanitizedUser, examId, subject, accuracy: finalAccuracy, avgTime, ratingChange: finalRatingChange, newRating: finalNewRating, assignmentId: assignmentId || null },
    projectId
  );

  runQuery(
    `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      (user_id, exam_id, results_json, created_at, assignment_id)
      VALUES (@username, @examId, @resultsJson, CURRENT_TIMESTAMP(), @assignmentId)`,
    { username: sanitizedUser, examId, resultsJson: JSON.stringify(gradedResults), assignmentId: assignmentId || null },
    projectId
  );

  runQuery(
    `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\` WHERE user_id = @username AND exam_id = @examId`,
    { username: sanitizedUser, examId },
    projectId
  );
}

// ------------------------------------
// Google Apps Script BigQuery Helper
// ------------------------------------
function runQuery(sql, params, projectId) {
  const request = {
    query: sql,
    useLegacySql: false,
    parameterMode: 'NAMED',
    queryParameters: Object.entries(params).map(([key, val]) => {
      let type = 'STRING';
      let value = val;
      if (typeof val === 'number') {
        type = Number.isInteger(val) ? 'INT64' : 'FLOAT64';
        value = String(val);
      } else if (typeof val === 'boolean') {
        type = 'BOOL';
        value = String(val);
      } else if (val instanceof Date) {
        type = 'TIMESTAMP';
        value = val.toISOString();
      } else if (typeof val === 'object' && val !== null) {
        type = 'STRING';
        value = JSON.stringify(val);
      }
      return {
        name: key,
        parameterType: { type: type },
        parameterValue: { value: value }
      };
    })
  };
  
  const queryResults = BigQuery.Jobs.query(request, projectId);
  const rows = queryResults.rows || [];
  const fields = queryResults.schema.fields.map(f => f.name);
  
  return rows.map(row => {
    const obj = {};
    row.f.forEach((cell, idx) => {
      obj[fields[idx]] = cell.v;
    });
    return obj;
  });
}

// ------------------------------------
// Gemini API Call Helper
// ------------------------------------
function callGemini(prompt, apiKeys) {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    for (const key of apiKeys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        };
        const response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        if (response.getResponseCode() === 200) {
          const resData = JSON.parse(response.getContentText());
          return resData.candidates[0].content.parts[0].text;
        }
      } catch (err) {
        console.warn('Gemini request failed:', err);
      }
    }
  }
  return null;
}
