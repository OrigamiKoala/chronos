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
      const difficulty = Number(hw.difficulty !== undefined ? hw.difficulty : 5);

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
      const baseDiff = Math.max(1, Math.min(10, difficulty));
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
      } catch (e) { }

      try {
        const weaknessAnalysisRows = runQuery(
          `SELECT detailed_analysis FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY updated_at DESC LIMIT 1`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (weaknessAnalysisRows && weaknessAnalysisRows.length > 0) weaknessAnalysis = weaknessAnalysisRows[0].detailed_analysis;
      } catch (e) { }

      try {
        const topicBreakdownRows = runQuery(
          `SELECT topic, good_at, not_good_at FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @studentId AND subject = @subject`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (topicBreakdownRows && topicBreakdownRows.length > 0) {
          topicBreakdown = topicBreakdownRows.map(row => `Topic: ${row.topic} | Good: ${row.good_at} | Not good: ${row.not_good_at}`).join('\n');
        }
      } catch (e) { }

      try {
        const mistakeAnalysisRows = runQuery(
          `SELECT mistake_patterns FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY created_at DESC LIMIT 3`,
          { studentId: sanitizedStudent, subject },
          projectId
        );
        if (mistakeAnalysisRows && mistakeAnalysisRows.length > 0) {
          mistakeAnalysis = mistakeAnalysisRows.map((row, idx) => `Pattern ${idx + 1}: ${row.mistake_patterns}`).join('\n');
        }
      } catch (e) { }

      try {
        const doneRows = runQuery(
          `SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`, UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q WHERE user_id = @studentId`,
          { studentId: sanitizedStudent },
          projectId
        );
        doneQuestionIds = doneRows.map(row => row.qid).filter(Boolean);
      } catch (e) { }

      // Prompt Guidelines...
      const allowedTypes = Array.isArray(hw.examFormat) ? hw.examFormat : [hw.examFormat || 'multiple_choice'];
      const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);
      const typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(' | ');

      let lessonInstructions = '';
      if (lessonTitle || lessonDescription) {
        lessonInstructions = `Homework for "${lessonTitle}". Content: "${lessonDescription}"`;
      }

      const prompt = `You must ensure that EVERY single question is completely unique, original, and never seen before. Do NOT repeat, rephrase, or adapt previously used setups, standard textbook scenarios, chemical reactions, physical systems, or mathematical templates.

Use a backward-chaining thought process to generate each question step-by-step, ensuring maximum uniqueness and originality:
- Step 1 (The Trap - Must be completely unique and original): Identify a specific, non-obvious conceptual trap, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption. This trap must be entirely novel, original, and never seen before.
- Step 2 (The System - Must be completely unique, original, and as convoluted as possible): Once you have the trick/trap in mind, design a chemical system, physical system, mathematical scenario, or reaction where this specific trap naturally occurs. The system/context must be made as convoluted as possible to challenge the user while ensuring it is completely unique, original, and never seen before (avoid standard textbook setups).
- Step 3 (The Distractors - Must be completely unique and original): Calculate or derive the incorrect answers that result directly from falling into the conceptual trap.
- Step 4 (The Problem - Must be completely unique and original): Draft the neutral question text that presents the system, masking the trap completely, written in a completely unique, original, and never-seen-before style.

Write tricky Olympiad questions targeting weak areas (${weaknesses}). 
Subject: ${subject}
Average Difficulty: ${studentDifficulty} (This represents the average difficulty of the exam. No single question's difficulty should be more than 2 difficulty units away from this average!)
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
  "difficulty": 5, // Must represent the difficulty of this specific question, and must be in the range [${Math.max(1, studentDifficulty - 2)}, ${Math.min(10, studentDifficulty + 2)}] (no question can be more than 2 units away from the average difficulty ${studentDifficulty})
  "detailedSolution": "",
  "step1_trap": "trap description",
  "step2_system": "system description",
  "step3_distractors": "distractor derivation",
  "step4_problem": "formulation description"
}]`;

      const responseText = callSiliconFlow(prompt);
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
  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, isRated, assignmentId, results, geminiApiKeys } = payload;
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
      return gradeFRQ(r, subject, projectId, geminiApiKeys);
    }
    return r;
  });

  // Calculate final ELO and details
  let finalAccuracy = accuracy;
  let finalRatingChange = ratingChange;
  let finalNewRating = newRating;

  const isGuest = sanitizedUser === 'default_user';

  if (!isGuest) {
    const hasFRQ = gradedResults.some(r => r.type === 'free_response');
    if (isRated !== false && hasFRQ) {
      const totalQuestions = gradedResults.length;
      const totalScore = gradedResults.reduce((acc, r) => acc + (r.score !== undefined ? r.score : (r.isCorrect ? 1 : 0)), 0);
      finalAccuracy = totalScore / totalQuestions;

      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      let currentRating = 100;
      try {
        const userRows = runQuery(
          `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @username`,
          { username: sanitizedUser },
          projectId
        );
        if (userRows && userRows.length > 0) {
          currentRating = Number(userRows[0][ratingColumn]) || 100;
        }
      } catch (e) {
        console.error('Failed to fetch user rating for recalculation in Apps Script:', e);
      }

      const getQuestionRating = (sub, diff) => {
        const d = Math.max(1, Math.min(10, diff));
        if (sub === 'Math') {
          const mathMap = { 1: 500, 2: 600, 3: 800, 4: 900, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
          return mathMap[Math.round(d)] || 1000;
        } else if (sub === 'Chemistry') {
          const chemMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
          return chemMap[Math.round(d)] || 1000;
        } else if (sub === 'Physics') {
          const physMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1300, 7: 1600, 8: 2000, 9: 2500, 10: 3000 };
          return physMap[Math.round(d)] || 1000;
        }
        return 100;
      };

      const sumQuestionRatings = gradedResults.reduce((acc, r) => acc + getQuestionRating(subject, r.difficulty || 5), 0);
      const avgQuestionRating = sumQuestionRatings / totalQuestions;

      let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
      if (avgQuestionRating < currentRating) {
        expectedScore = Math.max(expectedScore, 0.75);
      }

      let isChallenged = false;
      try {
        const historyRows = runQuery(
          `SELECT accuracy FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
            WHERE user_id = @username AND subject = @subject ORDER BY created_at DESC LIMIT 5`,
          { username: sanitizedUser, subject },
          projectId
        );
        let consecutiveFailCount = 0;
        for (const h of historyRows) {
          if (Number(h.accuracy) < 0.75) {
            consecutiveFailCount++;
          } else {
            consecutiveFailCount = 0;
          }
          if (consecutiveFailCount >= 2) {
            isChallenged = true;
          }
        }
        if (finalAccuracy < 0.75) {
          consecutiveFailCount++;
        } else {
          consecutiveFailCount = 0;
        }
        if (consecutiveFailCount >= 2) {
          isChallenged = true;
        }
      } catch (e) {
        console.error('Failed to fetch history for challenge check in Apps Script:', e);
      }

      const K = isChallenged ? 32 : 250;
      const questionMultiplier = Math.sqrt(totalQuestions / 5);
      finalRatingChange = Math.round(K * questionMultiplier * (finalAccuracy - expectedScore));
      finalNewRating = Math.max(100, currentRating + finalRatingChange);
    }

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

    if (isRated !== false) {
      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      runQuery(
        `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
          SET ${ratingColumn} = @newRating, elo_version = @eloVersion
          WHERE user_id = @username`,
        { username: sanitizedUser, newRating: finalNewRating, eloVersion: 3 },
        projectId
      );
    }
  }
}

function gradeFRQ(r, subject, projectId, apiKeys) {
  try {
    const isImage = r.frqSubmission && (r.frqSubmission.type === 'whiteboard' || r.frqSubmission.type === 'image') && r.frqSubmission.value && r.frqSubmission.value.startsWith('data:image/');

    let gradingPrompt = `You are a world-class grading examiner. You are grading a student's free-response solution for a competitive Olympiad-level exam.

Question Details:
Subject: ${subject}
Topic: ${r.topic || 'General'}
Question Text: ${r.question}
`;

    if (r.detailedSolution) {
      gradingPrompt += `\nDetailed Correct Solution (for your reference): ${r.detailedSolution}\n`;
    }

    if (isImage) {
      gradingPrompt += `\nThe student submitted their solution as a handwritten drawing or uploaded image of their scratch work/whiteboard.
Analyze the image carefully to understand their step-by-step logic, calculation progress, and final proof.`;
    } else {
      const textAns = r.frqSubmission?.value || r.userAnswer || 'No answer submitted.';
      gradingPrompt += `\nStudent's typed solution process:
${textAns}`;
    }

    gradingPrompt += `\n\nYour tasks:
1. Solve the question completely from scratch first to determine the correct step-by-step solution, the correct final answer, and establish a clear grading rubric.
2. Critically evaluate the student's solution against the correct solution. Compare both their explanation/process and final answer.
3. Award a partial credit score between 0.0 and 1.0 (where 1.0 is fully correct, 0.0 is completely wrong/timeout, and in-between represents partial credit based on correct logical steps shown). Give partial credit generously for valid logical steps, calculations, or methods, even if their final answer was incorrect.
4. Set 'isCorrect' to true if the score is greater than or equal to 0.7 (conceptually correct / very good progress), otherwise set it to false.
5. Provide clear, professional, pedagogical feedback explaining where they made mistakes and what they did well.
${isImage ? `6. Provide an extensive transcription/summary of the user's handwritten work, calculations, logic, and final proof shown in the image in the 'transcription' field.` : ''}

Return strictly a valid JSON object with the following schema:
{
  "correctSolution": "Your fully derived step-by-step correct solution",
  "correctAnswer": "The correct final answer",
  "score": 0.5,
  "isCorrect": true,
  "feedback": "Detailed grading feedback"${isImage ? `,\n  "transcription": "Extensive transcription of the user's work and proof in the image"` : ''}
}
Do NOT include markdown headers or backticks in the response. Return ONLY the raw JSON object.`;

    const contents = [];
    if (isImage) {
      const parts = r.frqSubmission.value.split(',');
      const base64Data = parts[1] || r.frqSubmission.value;
      let mimeType = 'image/png';
      const mimeMatch = parts[0].match(/data:(.*?);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
      contents.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }
    contents.push(gradingPrompt);

    const responseText = callGemini(
      contents,
      apiKeys || [],
      ['gemini-3.1-flash-lite', 'gemini-3-flash-preview']
    );

    if (responseText) {
      const cleanText = responseText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const graded = JSON.parse(cleanText);
      return {
        ...r,
        isCorrect: !!graded.isCorrect,
        score: Number(graded.score) || 0,
        feedback: graded.feedback,
        answer: graded.correctAnswer || r.answer || '',
        solution: graded.correctSolution,
        userAnswer: isImage ? (graded.transcription || r.userAnswer) : r.userAnswer
      };
    }
  } catch (err) {
    console.error('Error grading FRQ in Apps Script:', err);
  }

  return {
    ...r,
    isCorrect: false,
    score: 0,
    feedback: 'Grading failed during background processing.'
  };
}

function evaluateShortAnswer(r) {
  if (r.keywordExpression) {
    return evaluateKeywordExpression(r.keywordExpression, r.userAnswer);
  }
  return normalizeAnswer(r.userAnswer) === normalizeAnswer(r.answer);
}

function evaluateMCQ(r) {
  const getOptionIndex = (val, opts) => {
    const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(val).trim().toUpperCase());
    if (letterIdx !== -1) return letterIdx;
    return opts.findIndex(o => normalizeAnswer(o) === normalizeAnswer(val));
  };
  const correctIdx = getOptionIndex(r.answer, r.options || []);
  const userIdx = getOptionIndex(r.userAnswer, r.options || []);
  return correctIdx !== -1 && correctIdx === userIdx;
}

function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([\s\S]*?)\$/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\\(text|mathrm|mathbf|mathit|rm|bf)\{([^}]*)\}/g, '$2')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function evaluateKeywordExpression(expression, userAnswer) {
  if (!expression) return false;
  const normalizedAnswer = normalizeAnswer(userAnswer);
  const tokens = expression.match(/'[^']+'|"[^"]+"|\(|\)|AND|OR|NOT|[a-zA-Z0-9_.-]+/gi) || [];
  
  const processedTokens = tokens.map(token => {
    const upper = token.toUpperCase();
    if (upper === 'AND') return '&&';
    if (upper === 'OR') return '||';
    if (upper === 'NOT') return '!';
    if (token === '(' || token === ')') return token;
    
    const cleanTerm = token.replace(/^['"]|['"]$/g, '');
    const normTerm = normalizeAnswer(cleanTerm);
    const present = normalizedAnswer.includes(normTerm);
    return present ? 'true' : 'false';
  });
  
  const jsExpression = processedTokens.join(' ');
  try {
    const safeRegex = /^(?:true|false|&&|\|\||!|\(|\)|\s)+$/;
    if (!safeRegex.test(jsExpression)) {
      return false;
    }
    return !!(new Function(`return (${jsExpression})`)());
  } catch (e) {
    console.error("Failed to evaluate keyword expression:", jsExpression, e);
    return false;
  }
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
// Gemini API Call Helper (kept for grading)
// ------------------------------------
function callGemini(contents, apiKeys, models) {
  let requestContents = contents;
  if (typeof contents === 'string') {
    requestContents = [{ parts: [{ text: contents }] }];
  } else if (Array.isArray(contents)) {
    const parts = [];
    for (const item of contents) {
      if (typeof item === 'string') {
        parts.push({ text: item });
      } else if (item && item.inlineData) {
        parts.push({ inlineData: item.inlineData });
      }
    }
    requestContents = [{ parts: parts }];
  }

  const defaultModels = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
  const targetModels = models && models.length > 0 ? models : defaultModels;

  for (const model of targetModels) {
    for (const key of apiKeys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const payload = {
          contents: requestContents,
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

// ------------------------------------
// SiliconFlow API Call Helper (for question generation)
// ------------------------------------
function callSiliconFlow(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('SILICONFLOW_API_KEY');
  if (!apiKey) {
    console.error('SILICONFLOW_API_KEY script property is not set');
    return null;
  }

  const model = PropertiesService.getScriptProperties().getProperty('SILICONFLOW_MODEL') || 'deepseek-ai/DeepSeek-V4-Flash';
  const url = 'https://api.siliconflow.com/v1/chat/completions';

  try {
    const payload = {
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    };
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      const resData = JSON.parse(response.getContentText());
      return resData.choices[0].message.content;
    } else {
      console.warn('SiliconFlow request failed: ' + response.getResponseCode() + ' ' + response.getContentText());
    }
  } catch (err) {
    console.warn('SiliconFlow request failed:', err);
  }
  return null;
}
