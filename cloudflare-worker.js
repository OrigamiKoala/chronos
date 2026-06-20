// Helper to sign JWT using Cloudflare's built-in Web Crypto API (For BigQuery OAuth)
async function GoogleAuthToken(serviceAccount) {
  const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).replace(/=+$/, '');

  const message = `${jwtHeader}.${jwtClaim}`;
  const enc = new TextEncoder();

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s+/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(message));
  const jwtSign = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${message}.${jwtSign}`;
}

function base64UrlToArrayBuffer(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) { base64 += '='; }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function verifyTeacherJwt(authHeader, secretString) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const encoder = new TextEncoder();
  const data = encoder.encode(`${header}.${payload}`);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretString),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBinary = base64UrlToArrayBuffer(signature);
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, signatureBinary, data);
    if (!isValid) return false;

    let payloadBase64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payloadBase64.length % 4) { payloadBase64 += '='; }
    const decodedPayload = JSON.parse(atob(payloadBase64));

    if (decodedPayload.exp && Math.floor(Date.now() / 1000) > decodedPayload.exp) return false;

    return decodedPayload;
  } catch (err) {
    return false;
  }
}

async function executeBq(query, serviceAccount, accessToken, params = null) {
  const body = {
    query,
    useLegacySql: false
  };
  if (params) {
    body.queryParameters = Object.entries(params).map(([name, val]) => {
      let type = 'STRING';
      if (typeof val === 'number') {
        type = Number.isInteger(val) ? 'INT64' : 'FLOAT64';
      } else if (typeof val === 'boolean') {
        type = 'BOOL';
      }
      return {
        name,
        parameterType: { type },
        parameterValue: { value: String(val) }
      };
    });
    body.parameterMode = 'NAMED';
  }

  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${serviceAccount.project_id}/queries`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(`BigQuery query failed: ${data.error.message}`);
  }
  return data.rows || [];
}

async function runBackgroundGradingRetry(payload, env) {
  const { username, subject, examId } = payload;
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    try {
      console.log(`[Background Grading] Retrying submit-exam for ${username}, exam: ${examId}`);
      const response = await fetch('https://chronos-bot.vercel.app/api/submit-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        console.log(`[Background Grading] Successfully submitted and graded exam ${examId}`);
        const gradedData = await response.json();
        
        try {
          const serviceAccount = await env.CHAT_KV.get('GCP_SERVICE_ACCOUNT', { type: 'json' });
          if (serviceAccount) {
            const assertionJwt = await GoogleAuthToken(serviceAccount);
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertionJwt}`
            });
            const tokenData = await tokenResponse.json();
            const accessToken = tokenData.access_token;
            
            if (accessToken) {
              const projectId = serviceAccount.project_id;
              const sanitizedUser = username.trim().toLowerCase();
              
              // Check if already in user_exam_results to avoid duplicates
              const checkRows = await executeBq(
                `SELECT exam_id FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` WHERE user_id = @username AND exam_id = @examId`,
                serviceAccount,
                accessToken,
                { username: sanitizedUser, examId }
              );
              
              if (checkRows.length === 0) {
                console.log(`[Background Grading] Exam not found in BigQuery, inserting history and results...`);
                
                const finalAccuracy = typeof gradedData.accuracy === 'number' ? gradedData.accuracy : 0.0;
                const finalRatingChange = typeof gradedData.ratingChange === 'number' ? gradedData.ratingChange : 0;
                const finalNewRating = typeof gradedData.newRating === 'number' ? gradedData.newRating : 100;
                const gradedResults = gradedData.results || [];
                const isGuest = sanitizedUser === 'default_user';
                
                if (!isGuest) {
                  // Insert history
                  await executeBq(
                    `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
                      (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at, assignment_id)
                      VALUES (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP(), @assignmentId)`,
                    serviceAccount,
                    accessToken,
                    {
                      username: sanitizedUser,
                      examId,
                      subject,
                      accuracy: finalAccuracy,
                      avgTime: payload.avgTime || 0,
                      ratingChange: finalRatingChange,
                      newRating: finalNewRating,
                      assignmentId: payload.assignmentId || ''
                    }
                  );
                  
                  // Insert results
                  await executeBq(
                    `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
                      (user_id, exam_id, results_json, created_at, assignment_id)
                      VALUES (@username, @examId, @resultsJson, CURRENT_TIMESTAMP(), @assignmentId)`,
                    serviceAccount,
                    accessToken,
                    {
                      username: sanitizedUser,
                      examId,
                      resultsJson: JSON.stringify(gradedResults),
                      assignmentId: payload.assignmentId || ''
                    }
                  );
                  
                  // Delete from active exams
                  await executeBq(
                    `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\`
                      WHERE user_id = @username AND exam_id = @examId`,
                    serviceAccount,
                    accessToken,
                    { username: sanitizedUser, examId }
                  );
                  
                  // Update user rating
                  let ratingColumn = 'math_rating';
                  if (subject === 'Physics') ratingColumn = 'physics_rating';
                  else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';
                  
                  if (payload.isRated !== false) {
                    await executeBq(
                      `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
                        SET ${ratingColumn} = @newRating, elo_version = @eloVersion
                        WHERE user_id = @username`,
                      serviceAccount,
                      accessToken,
                      { username: sanitizedUser, newRating: finalNewRating, eloVersion: 3 }
                    );
                  }
                }
              } else {
                console.log(`[Background Grading] Exam ${examId} already exists in BigQuery.`);
              }
            }
          }
        } catch (bqErr) {
          console.error('[Background Grading] Failed to save graded exam to BigQuery:', bqErr);
        }
        
        break;
      }
      const errText = await response.text();
      console.warn(`[Background Grading] Retry failed with status ${response.status}: ${errText}`);
    } catch (err) {
      console.error('[Background Grading] Network/fetch error during retry:', err);
    }
  }
}

async function runBackgroundHomeworkGeneration(payload, serviceAccount, accessToken) {
  const { teacherId, lessonId, lessonTitle, lessonDescription, studentIds, homeworks, geminiApiKeys } = payload;
  const projectId = serviceAccount.project_id;

  for (const studentId of studentIds) {
    const sanitizedStudent = studentId.trim().toLowerCase();

    for (const hw of homeworks) {
      const subject = hw.subject || 'Math';
      const normSubject = subject.toLowerCase();
      const numQuestions = hw.numQuestions || 5;
      const startingDifficulty = hw.startingDifficulty || 5;
      const format = hw.examFormat || 'mix';

      const sharedQuestionsCount = Array.isArray(hw.sharedQuestions) ? hw.sharedQuestions.length : 0;
      const aiCount = numQuestions - sharedQuestionsCount;

      if (aiCount <= 0) {
        try {
          await executeBq(
            `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
            serviceAccount,
            accessToken,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent }
          );
          await executeBq(
            `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
            serviceAccount,
            accessToken,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: '[]' }
          );
        } catch (err) {
          console.error("Error saving empty questions list:", err);
        }
        continue;
      }

      // 1. Fetch user ELO rating for the given subject
      let ratingColumn = 'math_rating';
      if (subject.toLowerCase() === 'physics') ratingColumn = 'physics_rating';
      else if (subject.toLowerCase() === 'chemistry') ratingColumn = 'chemistry_rating';

      let studentRating = 100;
      try {
        const ratingRows = await executeBq(
          `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @studentId`,
          serviceAccount,
          accessToken,
          { studentId: sanitizedStudent }
        );
        if (ratingRows && ratingRows.length > 0) {
          studentRating = Number(ratingRows[0]?.f?.[0]?.v) || 100;
        }
      } catch (err) {
        console.error('Error fetching student rating in worker:', err);
      }

      // 2. Calculate expected rating for teacher's chosen difficulty
      const baseDiff = Math.max(1, Math.min(10, startingDifficulty));
      let expectedR = 1000;
      if (subject.toLowerCase() === 'math') {
        const mathMap = new Map([[1, 500], [2, 600], [3, 800], [4, 900], [5, 1000], [6, 1250], [7, 1500], [8, 2000], [9, 2500], [10, 3000]]);
        expectedR = mathMap.get(Math.round(baseDiff)) || 1000;
      } else {
        const otherMap = new Map([[1, 100], [2, 300], [3, 500], [4, 750], [5, 1000], [6, 1250], [7, 1500], [8, 2000], [9, 2500], [10, 3000]]);
        expectedR = otherMap.get(Math.round(baseDiff)) || 1000;
      }

      // 3. Offset difficulty based on student ELO vs expected ELO, clamp offset to [-1.5, 1.5]
      const rawOffset = (studentRating - expectedR) / 300;
      const clampedOffset = Math.max(-1.5, Math.min(1.5, rawOffset));
      const studentDifficulty = Math.max(1, Math.min(10, Math.round(baseDiff + clampedOffset)));

      // Fetch diagnostic metrics for the student
      let weaknesses = 'None (excellent performance across all topics)';
      let weaknessAnalysis = 'None (no previous analysis available)';
      let topicBreakdown = 'None (no previous topic breakdown available)';
      let mistakeAnalysis = 'None (no previous mistake pattern analysis available)';

      try {
        const weaknessesRows = await executeBq(
          `SELECT COALESCE(STRING_AGG(FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), "; "), "None (excellent performance across all topics)") AS weaknesses FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE accuracy_rate < 0.65 AND user_id = @studentId AND subject = @subject`,
          serviceAccount,
          accessToken,
          { studentId: sanitizedStudent, subject }
        );
        weaknesses = weaknessesRows[0]?.f?.[0]?.v || weaknesses;
      } catch (err) {
        console.error('Error weaknesses:', err);
      }

      try {
        const weaknessAnalysisRows = await executeBq(
          `SELECT detailed_analysis FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY updated_at DESC LIMIT 1`,
          serviceAccount,
          accessToken,
          { studentId: sanitizedStudent, subject }
        );
        weaknessAnalysis = weaknessAnalysisRows[0]?.f?.[0]?.v || weaknessAnalysis;
      } catch (err) {
        console.error('Error weaknessAnalysis:', err);
      }

      try {
        const topicBreakdownRows = await executeBq(
          `SELECT topic, good_at, not_good_at FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @studentId AND subject = @subject`,
          serviceAccount,
          accessToken,
          { studentId: sanitizedStudent, subject }
        );
        if (topicBreakdownRows && topicBreakdownRows.length > 0) {
          topicBreakdown = topicBreakdownRows.map(row => `Topic: ${row.f[0].v} | Good at: ${row.f[1].v} | Not good at: ${row.f[2].v}`).join('\n');
        }
      } catch (err) {
        console.error('Error topicBreakdown:', err);
      }

      try {
        const mistakeAnalysisRows = await executeBq(
          `SELECT mistake_patterns FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY created_at DESC LIMIT 3`,
          serviceAccount,
          accessToken,
          { studentId: sanitizedStudent, subject }
        );
        if (mistakeAnalysisRows && mistakeAnalysisRows.length > 0) {
          mistakeAnalysis = mistakeAnalysisRows.map((row, idx) => `Mistake Pattern ${idx + 1}: ${row.f[0].v}`).join('\n');
        }
      } catch (err) {
        console.error('Error mistakeAnalysis:', err);
      }

      let doneQuestionIds = [];
      try {
        const doneRows = await executeBq(
          `SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid
           FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`,
           UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q
           WHERE user_id = @targetUserId`,
          serviceAccount,
          accessToken,
          { targetUserId: sanitizedStudent }
        );
        doneQuestionIds = doneRows.map(row => row.f[0].v).filter(Boolean);
      } catch (err) {
        console.error('Error fetching done question IDs in worker:', err);
      }

      // Build Gemini generation prompt
      let constraints = '';
      let examples = '';

      if (normSubject === 'math') {
        constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption. The user should be tricked into thinking the wrong way, overlooking something.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C".
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.
- No question should be like any other question seen before.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate principles (e.g., coupling sequences with modular arithmetic and pigeonhole, or geometry with number theory).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test edge cases, domain restrictions, degeneracy, boundary conditions, off-by-one errors.
- Rigor: Require case analysis, counterexamples, or bounding arguments—not plug-and-chug.
- Novel Context: Present familiar concepts in unfamiliar frameworks.

3. Syllabus Boundaries
- Restrict to algebra, combinatorics, geometry, number theory. No calculus. Increase difficulty by coupling topics.
- NO research level math (e.g. differential equations, topology, etc.)

4. SVG Diagrams: When needed, generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=MATHCOUNTS, 4=AMC 12 Q21-25, 5=AIME Q11-13, 8=medium USAMO, 10=hardest IMO.
`;
        examples = `
5. Exemplar Questions (format reference):

{
  "id": "math_ex1",
  "topic": "Geometry",
  "question": "A point $P$ is chosen at random inside square $ABCD$. The probability that $\\\\overline{AP}$ is neither the shortest nor the longest side of $\\\\triangle APB$ can be written as $\\\\frac{a + b \\\\pi - c \\\\sqrt{d}}{e}$, where $a, b, c, d,$ and $e$ are positive integers, $\\\\text{gcd}(a, b, c, e) = 1$, and $d$ is not divisible by the square of a prime. What is $a+b+c+d+e$?",
  "type": "multiple_choice",
  "options": ["$25$", "$26$", "$27$", "$28$", "29"],
  "answer": "A",
  "difficulty": 5,
  "detailedSolution": ""
}
`;
      } else if (normSubject === 'physics') {
        constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C".
- Incorporate a deceptive path: the most common rote formula shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate physical principles (e.g., thermodynamic cycle with magnetic induction, electrostatics with rotational dynamics, spring-mass with RC circuit via EM induction).
- Multi-Step Cascades: Output of one step forms input of the next (e.g., find charge distribution → compute E-field → integrate for potential energy → apply energy conservation).
- Subtle Nuances: Test non-inertial frames, static-to-kinetic friction transitions, non-obvious geometric constraints, cases where small-angle approximation breaks down.
- Rigor: Require setting up and solving differential equations, non-trivial integrations, perturbation methods.
- Novel Context: Present physics in unfamiliar frameworks (astrophysical systems, atmospheric phenomena, biological mechanics).

3. Syllabus Boundaries
- DIFFICULTY < 8 (F=ma/AP Physics C): Restrict to classical mechanics, electromagnetism, thermodynamics, fluid dynamics, waves, optics. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (USAPhO/IPhO): Original concept-first designs. May introduce special relativity, quantum basics, statistical mechanics, etc. but MUST define all concepts from scratch (first-principles guardrail). free_response MUST require comprehensive derivation, not just a final number.

4. SVG Diagrams: When needed, generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.
`;
        examples = `
5. Exemplar Questions (format reference):

{
  "id": "phys_ex1",
  "topic": "Mechanics",
  "question": "A jet moves from point $A$ to $B$ at speed $v = \\\\beta c$. Apparent transverse velocity $v_T$ along $CB$ is measured by observer. Find apparent transverse velocity.",
  "type": "multiple_choice",
  "options": ["$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 - \\\\beta \\\\cos \\\\theta}$", "$\\\\beta_T = \\\\beta \\\\sin \\\\theta(1 - \\\\beta \\\\cos \\\\theta)$"],
  "answer": "A",
  "difficulty": 6,
  "detailedSolution": ""
}
`;
      } else if (normSubject === 'chemistry') {
        constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \times 10^{-8}$ M aqueous solution of $\ce{HCl}$ at $25 ^{\circ}$ C".
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate chemical principles (e.g., coordination chemistry $K_f$ with $K_{sp}$ and electrochemical $E^\\circ$).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test electronic structures, periodic trends, thermodynamic vs. kinetic control.
- Rigor: Eliminate simplifying assumptions (e.g., x-is-small approximation). Require solving higher-order equations.

3. Syllabus Boundaries
- DIFFICULTY < 8 (USNCO): Standard AP/USNCO scope at max depth.
- DIFFICULTY >= 8 (IChO): Original concept-first designs with self-contained axiomatic preambles.

4. SMILES: Use only for complex organic molecules. Use LaTeX for all equations.

Difficulty scale: 1=Honors/early AP, 3=harder ACS Local, 5=harder USNCO Nationals, 10=hardest IChO.
`;
        examples = `
6. Exemplar Questions (format reference):

{
  "id": "chem_ex1",
  "topic": "Chemical Bonding & Bond Order",
  "question": "Which species has the longest carbon-oxygen bond?",
  "type": "multiple_choice",
  "options": ["$\\\\\ce{HCO2^-}$", "$\\\\\ce{CO3^{2-}}$", "$\\\\\ce{CO2}$", "$\\\\\ce{COS}$"],
  "answer": "B",
  "difficulty": 5,
  "detailedSolution": ""
}
`;
      }

      const allowedTypes = Array.isArray(hw.examFormat)
        ? hw.examFormat
        : (typeof hw.examFormat === 'string' && hw.examFormat.trim()
          ? (hw.examFormat.includes(',') ? hw.examFormat.split(',') : [hw.examFormat])
          : ['multiple_choice', 'short_answer', 'free_response']);

      const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);

      let typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(' | ');
      let optionsSchemaDesc = parsedTypes.includes('multiple_choice')
        ? `\n  "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be provided if type is multiple_choice`
        : ``;
      let keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
        ? `\n  "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \"'carbon dioxide' OR CO2\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
        : ``;
      let answerSchemaDesc = `"For multiple_choice, exactly 'A', 'B', 'C', or 'D'. For short_answer, the exact correct short text or number. For free_response, an empty string ''."`;

      let lessonInstructions = '';
      if (lessonTitle || lessonDescription) {
        lessonInstructions = `
Additionally, this exam is a homework assignment for the lesson "${lessonTitle || ''}".
The teacher set the following lesson plan/content:
"${lessonDescription || ''}"

You MUST generate questions that are directly related to the content and concepts outlined in this lesson plan/content.
`;
      }

      const systemInstruction = `###Role:### You are a professional olympiad question writer for high school olympiad-level tests. You want to write tricky problems that challenges students in their understanding of [subject] concepts, rather than their breadth of knowledge.

###Goal:### Write questions for a user's practice tests that mirror the style of actual olympiad exams and challenge the user to think deeply about the material. Target the user's weak areas ( ${weaknesses} ).
${lessonInstructions}

Additionally, utilize the following diagnostic information about the user to tailor the test:
- User Weakness Analysis: ${weaknessAnalysis}
- User Topic Breakdown:
${topicBreakdown}
- Recent Mistake Patterns (thinking / test-taking style):
${mistakeAnalysis}

###CRITICAL UNIQUE & CREATIVE DIRECTIVE:###
You must be extremely creative and ensure that EVERY question is completely unique and novel. Do NOT repeat, rephrase, or adapt previously used setups, standard textbook scenarios, chemical reactions, physical systems, or mathematical templates. Avoid using similar numerical values, scenarios, or phrasing across different questions or exams. Force yourself to design entirely new contexts, variables, and systems for each problem.

Tailor the questions to target the user's weaknesses:
1. In knowledge base and skill set (using the User Weakness Analysis and User Topic Breakdown).
2. In thinking and test-taking style (using the Recent Mistake Patterns). Craft questions that specifically test or trigger their common mistake patterns (such as conceptual traps, calculation errors, panic, or edge case negligence) to help them overcome these pitfalls.

###Constraints:###

${constraints}

###Examples:###

${examples.replace(/"detailedSolution":\s*"[\s\S]*?"/g, '"detailedSolution": ""')}

For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE & TRICKINESS: Provide a balanced and diverse mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Ensure all questions are solvable based strictly on competitive high school level concepts or below, maintaining complete scientific and mathematical rigor while remaining accessible from core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY & WEAKNESS WEIGHTING: The exam must cover a wide, extremely diverse range of standard core subjects/topics within the chosen field. For example:
      - In Chemistry: You must select from stoichiometry, descriptive, states of matter, thermodynamics, kinetics, equilibrium, oxidation-reduction, atomic structure/periodicity, bonding/molecular structure, and organic/biochemistry.
      - In Physics: You must select from kinematics, forces, momentum, systems of particles, rotational kinematics, rotational dynamics, angular momentum, energy, fluid statics, gravitation, fluid dynamics, oscillations, waves, thermodynamics, electricity, and magnetism.
      - In Math: You must select from algebra, geometry, counting/probability, number theory.
   If a user's weak concepts are provided, allocate a minority of the questions (~30%, e.g., 1 out of 3, or 2 out of 5) to target those weaknesses, and dedicate the remaining majority (~70%) to a diverse selection of other core topics in the subject's standard syllabus, ensuring a balanced distribution of topics across the exam. If weaknesses are "None", distribute questions evenly across all core topics.

3. Detailed Solutions: Do NOT generate detailed solutions. Always set the "detailedSolution" field to an empty string "".
4. QUESTION TYPES MIX: You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.
5. BACKWARD CHAINING (REVERSE DESIGN): Use a backward-chaining methodology to design questions.

***Constraints & Execution Instructions:***

1. **Backward Chaining Generation Methodology (CRITICAL)**
You must generate every question using a backward chaining thought process before outputting the final problem:

* **Step 1 (The Trap):** Identify a specific, non-obvious conceptual trap, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
* **Step 2 (The System):** Design a chemical system or reaction where this specific trap naturally occurs.
* **Step 3 (The Distractors):** Calculate or derive the incorrect answers that result directly from falling into the conceptual trap (rote formula shortcut, ignoring the limiting factor, etc.).
* **Step 4 (The Problem):** Draft the neutral question text that presents the system, masking the trap completely.

Here is an example:

***Step 1***: A common trap is, when investigating the reactivity of nitric acid, to only think of it as a strong protonating acid and failing to realize it is also a strong oxidizing agent.

***Step 2***: This system could be one where a metal (e.g. copper) is selectively reduced by a reducing agent (e.g. H2). The student might not realize the nitric acid competes for the electrons.

***Step 3***: If the student falls for this trap, they could be presented with the reducing agent (H2) and think only copper is reduced by it, when in reality nitric acid is also reduced by it. Perhaps the student thinks adding the reducing agent to react with the copper could determine the amount of copper in a solution, but not realize that excess weight will be added from the various nitrous oxides. 

***Step 4***: The student could be asked, “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?” One of the options, consistent with the trap, should be “Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.” The other options could test other traps, i.e. that both nickel and copper form insoluble hydroxides, and that they both absorb the same wavelength of light. Thus the final question is: “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\n\\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.”


###Output Requirements:###

OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Keep simple, purely qualitative text options that do not contain mathematical or chemical terms in plain, un-delimited text format.

The output must be a pure JSON array containing exactly the requested number of objects, with the following schema for each object:
{
  "id": "A unique string ID",
  "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
  "question": "The text of the question. It should be challenging, clear, and require working suitable for the question format.",
  "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
  "answer": ${answerSchemaDesc},
  "difficulty": a number between 1 and 10 representing difficulty,
  "detailedSolution": "An empty string \"\""
}

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.
`;

      const userPrompt = `Generate exactly ${aiCount} ${subject} problems. The difficulty should start around ${studentDifficulty} out of 10 and can vary slightly to provide a balanced test.
Follow these strict rules:
1. Do NOT generate detailed solutions. Always set the "detailedSolution" field to an empty string "".
2. You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`;

      let responseText = null;
      let geminiError = null;
      let success = false;

      for (const model of ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite']) {
        if (success) break;
        for (const apiKey of geminiApiKeys) {
          try {
            const maxOutputTokens = model.includes('1.5') ? 8192 : 65536;
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction.replace('[subject]', subject) }] },
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 1.5,
                  maxOutputTokens
                }
              })
            });

            if (response.ok) {
              const resData = await response.json();
              if (resData.candidates?.[0]?.content?.parts?.[0]?.text) {
                responseText = resData.candidates[0].content.parts[0].text;
                success = true;
                break;
              }
            } else {
              geminiError = await response.text();
              const status = response.status;
              if (status === 503 || (geminiError && geminiError.toLowerCase().includes('overloaded'))) {
                console.warn(`[503] Model ${model} overloaded. Breaking key loop to try next model.`);
                break;
              }
            }
          } catch (err) {
            geminiError = err.message;
          }
        }
      }

      let questionsList = [];
      if (responseText) {
        try {
          const cleanText = responseText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
          questionsList = JSON.parse(cleanText);
        } catch (err) {
          console.error("JSON parsing of Gemini response failed:", err, responseText);
        }
      }

      // Fallback to pregenerated questions if Gemini generation failed
      if (questionsList.length === 0) {
        try {
          let queryPart = '';
          if (doneQuestionIds.length > 0) {
            const escapedIds = doneQuestionIds.map(id => `'${id.replace(/'/g, "\\'")}'`).join(', ');
            queryPart = `AND JSON_VALUE(question_json, '$.id') NOT IN (${escapedIds})`;
          }

          const fallbackRows = await executeBq(
            `SELECT question_json FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` WHERE subject = @subject AND difficulty = @difficulty ${queryPart} ORDER BY RAND() LIMIT @limit`,
            serviceAccount,
            accessToken,
            { subject, difficulty: studentDifficulty, limit: aiCount }
          );
          questionsList = fallbackRows.map(row => JSON.parse(row.f[0].v));

          // If still not enough, fetch without difficulty restriction
          if (questionsList.length < aiCount) {
            const neededMore = aiCount - questionsList.length;
            const extraRows = await executeBq(
              `SELECT question_json FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` WHERE subject = @subject ${queryPart} ORDER BY RAND() LIMIT @limit`,
              serviceAccount,
              accessToken,
              { subject, limit: neededMore }
            );
            const extraList = extraRows.map(row => JSON.parse(row.f[0].v));
            questionsList = [...questionsList, ...extraList];
          }
        } catch (err) {
          console.error("Fallback pregenerated questions query failed in worker:", err);
        }
      }

      // Insert tailored questions into student_homework_questions
      if (questionsList.length > 0) {
        try {
          await executeBq(
            `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
            serviceAccount,
            accessToken,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent }
          );
          await executeBq(
            `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
            serviceAccount,
            accessToken,
            { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: JSON.stringify(questionsList) }
          );
        } catch (err) {
          console.error(`Error saving student tailored questions for ${sanitizedStudent}:`, err);
        }
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://chronos-bot.vercel.app',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // 1. Token Check
      const authHeader = request.headers.get('Authorization');
      const tokenClaims = await verifyTeacherJwt(authHeader, env.JWT_SECRET);

      if (!tokenClaims) {
        return new Response(JSON.stringify({ error: 'Unauthorized token.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const payload = await request.json();
      const { action, teacherId } = payload;

      if (!teacherId || tokenClaims.teacherId !== teacherId) {
        return new Response(JSON.stringify({ error: `Forbidden authorization payload mismatch.` }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 4. Fetch Credentials
      const serviceAccount = await env.CHAT_KV.get('GCP_SERVICE_ACCOUNT', { type: 'json' });
      if (!serviceAccount) {
        return new Response('Missing GCP Credentials in KV', { status: 500, headers: corsHeaders });
      }

      // 5. OAuth Token Generation
      const assertionJwt = await GoogleAuthToken(serviceAccount);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertionJwt}`
      });
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return new Response(JSON.stringify({
          error: 'OAuth token generation failed',
          debug: { tokenError: tokenData.error, tokenDesc: tokenData.error_description }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'generate_homework') {
        // Trigger background generation
        ctx.waitUntil(runBackgroundHomeworkGeneration(payload, serviceAccount, accessToken));

        return new Response(JSON.stringify({
          success: true,
          message: 'Homework generation started in background'
        }), {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'async_grade_exam') {
        ctx.waitUntil(runBackgroundGradingRetry(payload.payload, env));

        return new Response(JSON.stringify({
          success: true,
          message: 'Background grading scheduled successfully'
        }), {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Invalid or Unsupported Action', { status: 400, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({
        error: "Worker Exception",
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
