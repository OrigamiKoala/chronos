/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});


/**
 * Parse complete JSON objects from a partially streamed JSON array string.
 * Tracks brace depth and string boundaries to extract finished {...} objects.
 */
function extractCompleteObjects(jsonStr) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    // Outside string
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(jsonStr.substring(objStart, i + 1)));
        } catch (e) { /* incomplete, skip */ }
        objStart = -1;
      }
    }
  }

  return objects;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, startingDifficulty, subject, targetUserId = 'default_user', freeResponseMode, examFormat } = req.body;

  if (!count || !startingDifficulty || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, startingDifficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  try {
    // 1. Fetch user weaknesses and diagnostic data from BigQuery in parallel
    let weaknesses = 'None (excellent performance across all topics)';
    let weaknessAnalysis = 'None (no previous analysis available)';
    let topicBreakdown = 'None (no previous topic breakdown available)';
    let mistakeAnalysis = 'None (no previous mistake pattern analysis available)';

    try {
      await Promise.all([
        (async () => {
          try {
            const weaknessesQuery = `
              SELECT 
                COALESCE(
                  STRING_AGG(
                    FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
                    "; "
                  ),
                  "None (excellent performance across all topics)"
                ) AS weaknesses
              FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              WHERE accuracy_rate < 0.65 AND user_id = @targetUserId AND subject = @subject
            `;
            const [rows] = await bq.query({
              query: weaknessesQuery,
              params: { targetUserId: sanitizedUser, subject },
            });
            weaknesses = rows[0]?.weaknesses || 'None (excellent performance across all topics)';
          } catch (err) {
            console.error('Error fetching user weaknesses:', err);
          }
        })(),
        (async () => {
          try {
            const weaknessAnalysisQuery = `
              SELECT detailed_analysis
              FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
              WHERE user_id = @targetUserId AND subject = @subject
              ORDER BY updated_at DESC
              LIMIT 1
            `;
            const [rows] = await bq.query({
              query: weaknessAnalysisQuery,
              params: { targetUserId: sanitizedUser, subject },
            });
            if (rows && rows.length > 0) {
              weaknessAnalysis = rows[0].detailed_analysis;
            }
          } catch (err) {
            console.error('Error fetching user weakness analysis:', err);
          }
        })(),
        (async () => {
          try {
            const topicBreakdownQuery = `
              SELECT topic, good_at, not_good_at
              FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
              WHERE user_id = @targetUserId AND subject = @subject
            `;
            const [rows] = await bq.query({
              query: topicBreakdownQuery,
              params: { targetUserId: sanitizedUser, subject },
            });
            if (rows && rows.length > 0) {
              topicBreakdown = rows.map(row => `Topic: ${row.topic} | Good at: ${row.good_at} | Not good at: ${row.not_good_at}`).join('\n');
            }
          } catch (err) {
            console.error('Error fetching user topic breakdown:', err);
          }
        })(),
        (async () => {
          try {
            const mistakeAnalysisQuery = `
              SELECT mistake_patterns
              FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
              WHERE user_id = @targetUserId AND subject = @subject
              ORDER BY created_at DESC
              LIMIT 3
            `;
            const [rows] = await bq.query({
              query: mistakeAnalysisQuery,
              params: { targetUserId: sanitizedUser, subject },
            });
            if (rows && rows.length > 0) {
              mistakeAnalysis = rows.map((row, idx) => `Mistake Pattern ${idx + 1}: ${row.mistake_patterns}`).join('\n');
            }
          } catch (err) {
            console.error('Error fetching user mistake analysis:', err);
          }
        })()
      ]);
    } catch (err) {
      console.error('Parallel fetch error:', err);
    }

    // 2. Build the Gemini generation prompt
    let constraints = '';
    let examples = '';
    const normSubject = String(subject).trim().toLowerCase();

    if (normSubject === 'math') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate principles (e.g., coupling sequences with modular arithmetic and pigeonhole, or geometry with number theory).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test edge cases, domain restrictions, degeneracy, boundary conditions, off-by-one errors.
- Rigor: Require case analysis, counterexamples, or bounding arguments—not plug-and-chug.
- Novel Context: Present familiar concepts in unfamiliar frameworks.

3. Syllabus Boundaries
- DIFFICULTY < 8 (AMC/AIME): Restrict to algebra, combinatorics, geometry, number theory. No calculus. Increase difficulty by coupling topics.
- DIFFICULTY >= 8 (USAMO/IMO): Original concept-first designs. May introduce advanced topics but must define all non-standard concepts from scratch. free_response MUST require a complete proof.

4. SVG Diagrams: When needed, generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=MATHCOUNTS, 3=AMC 10, 5=AMC 12 Q20, 8=USAJMO, 10=hardest IMO.
`;
      examples = `
5. Exemplar Questions (format reference):

{
  "id": "math_ex1",
  "topic": "Number Theory & Modular Arithmetic",
  "question": "Let $S$ be the set of all positive integers $n$ such that $n^2 \\\\equiv 1 \\\\pmod{2025}$. Find the number of elements in $S$ that are less than $2025$.",
  "type": "multiple_choice",
  "options": ["$8$", "$12$", "$16$", "$24$"],
  "answer": "C",
  "difficulty": 6,
  "detailedSolution": "Factor $2025 = 3^4 \\\\times 5^2$. By CRT, solve $n^2 \\\\equiv 1$ mod $81$ and mod $25$ separately. For odd prime power $p^k$, careful analysis via Hensel lifting gives 4 solutions mod $81$ and 4 mod $25$, yielding $4 \\\\times 4 = 16$ by CRT."
}

{
  "id": "math_ex2",
  "topic": "Combinatorics & Graph Theory",
  "question": "Let $n \\\\geq 3$. In a round-robin tournament with $n$ players, player $A$ *dominates* $B$ if $A$ beat $B$, or exists $C$ with $A$ beat $C$ and $C$ beat $B$.\\\\nProve that if $n \\\\geq 7$ and odd, there exists a player dominating every other.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "Take player $v^*$ with max out-degree $\\\\Delta$. Let $W$ = wins, $L$ = losses. For any $u \\\\in L$: if $u$ beat all of $W$, then $d^+(u) \\\\geq \\\\Delta+1$, contradiction. So some $w \\\\in W$ beats $u$, and $v^*$ dominates $u$ via $w$. $v^*$ trivially dominates $W$ directly. QED."
}
`;
    } else if (normSubject === 'physics') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

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
  "topic": "Mechanics & Rotational Dynamics",
  "question": "A uniform solid cylinder of mass $M$ and radius $R$ is on a rough incline at angle $\\\\theta$. A horizontal force $\\\\vec{F}$ is applied to the center, perpendicular to the surface (into the incline). Coefficient of static friction is $\\\\mu_s$. Determine $\\\\theta_{\\\\max}$ for static equilibrium without slipping.",
  "type": "multiple_choice",
  "options": ["$\\\\tan^{-1}\\\\left(\\\\frac{3\\\\mu_s(Mg + F)}{Mg}\\\\right)$", "$\\\\tan^{-1}\\\\left(\\\\frac{3\\\\mu_s(Mg\\\\cos\\\\theta + F)}{Mg}\\\\right)$", "$\\\\tan^{-1}(3\\\\mu_s)$", "$\\\\tan^{-1}\\\\left(\\\\frac{\\\\mu_s(Mg + F)}{Mg}\\\\right)$"],
  "answer": "A",
  "difficulty": 6,
  "detailedSolution": "Normal force $N = Mg\\\\cos\\\\theta + F$. For rolling without slipping, friction needed is $f = \\\\frac{1}{3}Mg\\\\sin\\\\theta$ (from combined translational/rotational equations with $I=\\\\frac{1}{2}MR^2$). Setting $f \\\\leq \\\\mu_s N$ and solving at equality gives $\\\\theta_{\\\\max} = \\\\tan^{-1}(3\\\\mu_s(Mg+F)/Mg)$."
}

{
  "id": "phys_ex2",
  "topic": "Electromagnetism & Induction",
  "question": "A thin conducting ring (radius $a$, resistance $R$, self-inductance $L$) is coaxial with a solenoid (radius $b<a$, $n$ turns/length, current $I(t)=I_0 e^{-t/\\\\tau}$). At $t=0$ the ring is released from rest under gravity.\\\\n(a) Derive the induced EMF.\\\\n(b) Write the coupled ODEs for induced current $i(t)$ and velocity $v(t)$.\\\\n(c) For $L \\\\ll R\\\\tau$, find the approximate terminal velocity.",
  "type": "free_response",
  "answer": "",
  "difficulty": 8,
  "detailedSolution": "(a) Flux $\\\\Phi = \\\\mu_0 n I(t) \\\\pi b^2$. EMF from time-varying current: $\\\\mathcal{E}_1 = \\\\mu_0 n \\\\pi b^2 I_0/\\\\tau \\\\cdot e^{-t/\\\\tau}$. (b) Circuit: $L di/dt + Ri = \\\\mathcal{E}$. Motion: $m dv/dt = mg - F_{drag}$. (c) When $L \\\\ll R\\\\tau$, $i \\\\approx \\\\mathcal{E}/R$. At terminal velocity $mg = F_{drag}$, solve for $v_{term}$."
}
`;
    } else if (normSubject === 'chemistry') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate chemical principles (e.g., coordination chemistry $K_f$ with $K_{sp}$ and electrochemical $E^\\circ$; organic structure elucidation from elemental analysis → MS → IR → regioselective mechanisms).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test electronic structures, periodic trends, thermodynamic vs. kinetic control, anomalies in MO configurations ($B_2$ vs $O_2$).
- Rigor: Eliminate simplifying assumptions (e.g., x-is-small approximation). Require solving higher-order equations from mass/charge balances.
- Novel Context: Present principles in unfamiliar frameworks (bioinorganic sites, MOFs, industrial catalysis).

3. Syllabus Boundaries
- DIFFICULTY < 8 (USNCO): Standard AP/USNCO scope at max depth. No calculus-based derivations. Limit spectroscopy to 1D-NMR and basic IR/UV-Vis. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (IChO): Original concept-first designs. Introduce advanced topics with self-contained, axiomatic preambles (first-principles guardrail).

4. SMILES: Use only for complex organic molecules or coordination complexes. Use LaTeX for all equations, formulas, units, and variables.

5. SVG Diagrams: When needed (titration curves, phase diagrams, etc.), generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=Honors/early AP, 3=harder ACS Local, 5=harder USNCO Nationals, 10=hardest IChO.
`;
      examples = `
6. Exemplar Questions (format reference):

{
  "id": "chem_ex1",
  "topic": "Chemical Bonding & Bond Order",
  "question": "Which species has the longest carbon-oxygen bond?",
  "type": "multiple_choice",
  "options": ["$\\\\ce{HCO2^-}$", "$\\\\ce{CO3^{2-}}$", "$\\\\ce{CO2}$", "$\\\\ce{COS}$"],
  "answer": "B",
  "difficulty": 5,
  "detailedSolution": "Bond length is inversely proportional to bond order. $\\\\ce{HCO2^-}$: avg C-O bond order = 1.5. $\\\\ce{CO3^{2-}}$: avg = 1.33. $\\\\ce{CO2}$: 2.0. $\\\\ce{COS}$: C-O is 2.0. Carbonate has the lowest bond order (1.33), hence the longest C-O bond."
}

{
  "id": "chem_ex2",
  "topic": "Acid-Base Titration & Gas Laws",
  "question": "A is an ionic compound containing only H, N, and O.\\\\n(a) A 1.000-g sample titrated with 0.5000 M NaOH reaches equivalence at 25.0 mL. Find the molar mass.\\\\n(b) Heating 1.000 g at 230°C in 1.50 L gives 784 mmHg. Find moles of gas.\\\\n(c) After drying with $\\\\ce{Mg(ClO4)2}$, 308 mL at 755 mmHg, 25°C. Find moles of dry gas.\\\\n(d) Determine the formula of A.\\\\n(e) Draw Lewis structures for cation, anion, and decomposition products.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "(a) Moles OH- = 0.0125, so M = 80.0 g/mol. (b) PV=nRT gives 0.0375 mol total gas. (c) 0.0125 mol dry gas. (d) 1:3 total gas ratio, 1:2 water ratio → $\\\\ce{NH4NO3}$ (M=80.04), decomposing to $\\\\ce{N2O + 2H2O}$. (e) $\\\\ce{NH4+}$: tetrahedral N with +1 charge. $\\\\ce{NO3-}$: trigonal planar with resonance. $\\\\ce{N2O}$: two resonance structures ($\\\\ce{N#[N+][O-]}$ and $\\\\ce{[N-]=[N+]=O}$)."
}
`;
    }

    const allowedTypes = Array.isArray(examFormat)
      ? examFormat
      : (typeof examFormat === 'string' && examFormat.trim()
        ? (examFormat.includes(',') ? examFormat.split(',') : [examFormat])
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

    const systemInstruction = `###Role:### You are a professional olympiad question writer for high school olympiad-level tests. You want to write tricky problems that challenges students in their understanding of [subject] concepts, rather than their breadth of knowledge.

###Goal:### Write questions for a user's practice tests that mirror the style of actual olympiad exams and challenge the user to think deeply about the material. Target the user's weak areas ( ${weaknesses} ).

Additionally, utilize the following diagnostic information about the user to tailor the test:
- User Weakness Analysis: ${weaknessAnalysis}
- User Topic Breakdown:
${topicBreakdown}
- Recent Mistake Patterns (thinking / test-taking style):
${mistakeAnalysis}

Tailor the questions to target the user's weaknesses:
1. In knowledge base and skill set (using the User Weakness Analysis and User Topic Breakdown).
2. In thinking and test-taking style (using the Recent Mistake Patterns). Craft questions that specifically test or trigger their common mistake patterns (such as conceptual traps, calculation errors, panic, or edge case negligence) to help them overcome these pitfalls.

###Constraints:###

${constraints}

###Examples:###

${examples}

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

3. Detailed Solutions: For every question generated, you MUST provide a thorough, detailed step-by-step correct solution and proof in the "detailedSolution" field
4. QUESTION TYPES MIX: You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.

###Steps:###
1. Brainstorm potential concepts for each question.
2. Narrow down each concept into a particular topic for each question, as well as the subtle conceptual trap the user might fall into.
3. Decide on a difficulty level for each question.
4. For each question, generate the question text, taking into account the topic, trap, and difficulty level.
5. Generate the answer to that question. Double check that the answers generated are the only valid solutions. If the answer is not the only valid solution, change the problem, repeating steps 4 and 5.
6. Double check that all constraints and output requirements have been met. If they have not, change the format and/or problem so that all constraints and output requirements are met.

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
  "detailedSolution": "A thorough, detailed step-by-step solution to the question"
}

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.`;

    console.log("System instruction byte size:", Buffer.byteLength(systemInstruction, 'utf8'));

    const prompt = `Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`;

    // 3. Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const safetySettings = [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];

    const modelId = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const stream = await executeWithRetry(modelId, (ai) => ai.models.generateContentStream({
      model: modelId,
      contents: prompt,
      safety_settings: safetySettings,
      safetySettings: safetySettings,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        safety_settings: safetySettings,
        safetySettings: safetySettings,
      },
    }), req);

    let accumulated = '';
    let questionsSent = 0;

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        accumulated += text;

        // Extract all fully-formed question objects so far
        const parsed = extractCompleteObjects(accumulated);

        // Emit any newly completed questions
        while (questionsSent < parsed.length) {
          if (questionsSent < count) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Streaming generation error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
}
