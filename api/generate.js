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

  const { count, startingDifficulty, subject, targetUserId = 'default_user', freeResponseMode, examFormat, lessonTitle, lessonDescription } = req.body;

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
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption. The user should be tricked into thinking the wrong way, overlooking something.
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

Difficulty scale: 1=MATHCOUNTS, 3=AMC 10, 5=AMC 12 Q20, 8=USAJMO, 10=hardest IMO.
`;
      examples = `
5. Exemplar Questions (format reference):

{
  "id": "math_ex1",
  "topic": "Geometry",
  "question": "A point $P$ is chosen at random inside square $ABCD$. The probability that $\overline{AP}$ is neither the shortest nor the longest side of $\triangle APB$ can be written as $\frac{a + b \pi - c \sqrt{d}}{e}$, where $a, b, c, d,$ and $e$ are positive integers, $\text{gcd}(a, b, c, e) = 1$, and $d$ is not divisible by the square of a prime. What is $a+b+c+d+e$?",
  "type": "multiple_choice",
  "options": ["$25$", "$26$", "$27$", "$28$", "29"],
  "answer": "A",
  "difficulty": 5,
  "detailedSolution": "Say WLOG that $AB$ is the top side of the square, and the square is of side length 1. Let us say that the midpoint of $AB$ is $M$, while the midpoint of $CD$ is $Q$. Drawing a vertical line to split the square in half, we notice that if $P$ is to the left of the line, $AP < BP$, and if P is to the right of the line, $AP > BP$. Also, drawing a quarter circle of radius 1 from point $A$, we can split the area into points P for which $AP < AB$ and $AP > AB$. Because of our constraints, there are 2 cases:

Case 1: $AB > AP > BP$ In this case, $P$ will be to the right of the vertical line and inside of the quarter circle. Let us say that the intersection of the vertical line and quarter circle is $N$. The distance from $N$ to $AD$ is 1/2, and we can say that $\angle BAN$ is $60^\circ$. Sector $BAN$ of circle $A$ would therefore have an area of $\frac{\pi}{6}$. Because $\triangle AMN$ is a 30-60-90 triangle, the area of $AMN$ is $\frac{\sqrt{3}}{8}$. The probability of case 1 happening should then be $\frac{\pi}{6}-\frac{\sqrt{3}}{8}$.

Case 2: $AB < AP < BP$ In this case, $P$ will be to the left of the vertical line and outside of the quarter circle. Knowing that the quarter circle's area is $\frac{\pi}{4}$, we can subtract the probability of Case 1 happening to get the chance that $P$ is on the left of the vertical line and in circle $A$. Doing this would give $\frac{\pi}{12}+\frac{\sqrt{3}}{8}$. To get the probability of Case 2 happening, we can subtract this from the area of rectangle $AMQD$. This would give us $\frac{1}{2}-\frac{\pi}{12}-\frac{\sqrt{3}}{8}$.

Adding both cases, we get the total probability as $\frac{1}{2}+\frac{\pi}{12}-\frac{\sqrt{3}}{4} = \frac{6+\pi-3\sqrt{3}}{12}$. Formatting this gives us $6+1+3+3+12 = \boxed{\textbf{(A) } 25}$."
}

{
  "id": "math_ex2",
  "topic": "Combinatorics, Algebra, Number Theory",
  "question": "For each nonnegative integer $r$ less than $502$, define\[S_r=\sum_{m\geq 0}\binom{10,000}{502m+r},\]where $\binom{10,000}{n}$ is defined to be $0$ when $n>10,000$. That is, $S_r$ is the sum of all the binomial coefficients of the form $\binom{10,000}{k}$ for which $0\leq k\leq 10,000$ and $k-r$ is a multiple of $502$. Find the number of integers in the list $S_0,S_1,S_2,\dots,S_{501}$ that are multiples of the prime number $503$.",
  "type": "short_answer",
  "answer": "39",
  "difficulty": 7,
  "detailedSolution": "Take player $v^*$ with max out-degree $\\\\Delta$. Let $W$ = wins, $L$ = losses. For any $u \\\\in L$: if $u$ beat all of $W$, then $d^+(u) \\\\geq \\\\Delta+1$, contradiction. So some $w \\\\in W$ beats $u$, and $v^*$ dominates $u$ via $w$. $v^*$ trivially dominates $W$ directly. QED."
}

{
  "id": "math_ex3",
  "topic": "Combinatorics",
  "question": "The integers from $1$ through $25$ are arbitrarily separated into five groups of $5$ numbers each. The median of each group is identified. Let $M$ equal the median of the five medians. What is the least possible value of $M$?

$\textbf{(A) }9 \qquad \textbf{(B) }10 \qquad \textbf{(C) }12 \qquad \textbf{(D) }13 \qquad \textbf{(E) }14$

",
  "type": "multiple_choice",
  "options": ["$9$", "$10$", "$12$", "$13$", "14"],
  "answer": "A",
  "difficulty": 3,
  "detailedSolution": "If a group has median $m$, then we must have that $3$ of the numbers in that group are $\leq m$. Since there are 5 different groups, $3$ groups must have a median $\leq M$, so there are at least $3\cdot3=9$ numbers that are $\leq M$. Since there are at least $9$ numbers that are $\leq M$, we have $M$ at minimum $\boxed{\textbf{(A) }9}.$"
}


`;
    } else if (normSubject === 'physics') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep question text neutral and objective — no hints, warnings, or clarifying instructions.
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
5. Test-solve each of the questions to ensure they satisfy each of the constraints. Write feedback for each of the problems for how to improve them.
6. Improve the questions based on the feedback. Fix all questions that do not adhere to the constraints, and ones you can easily solve.
7. Solve each question. Double check that the answers generated are the only valid solutions. If the answer is not the only valid solution, change the problem, repeating steps 4 and 5.
8. Double check that all constraints and output requirements have been met. If they have not, change the format and/or problem so that all constraints and output requirements are met.

For example, your thought process might look like:

Step 1: The user wants me to generate 2 chemistry olympiad questions with starting difficulty 5. The user struggles with remembering to balance equations in stoichiometry and electrochemistry.

Step 2, 3: For the first question, I will test stoichiometry (identifying an unknown compound based on resulting gases), with difficulty level 5. For the second question, I will test electrochemistry (overpotential), with difficulty level 6. I will tailor these questions to target the user's weaknesses.

Step 4: Now I will generate the problem texts.

1. A compound M reacts in the following reaction. $\ce{M + 5 O_2 -> 3 C O_2 + 4 H_2 O}. How many grams of $\ce{M}$ are required to form $14.4$ liters of $\ce{C O_2}$ at STP? The trap is to forget to balance out the chemical equation.

2. A reaction has a standard exchange current density ($j_0$) of $1.0$ A/cm$^2$ at $25$ °C. What is the current density ($j$) when the overpotential ($\eta$) is $0.1$ V? The trap is to forget to multiply the exchange current density by 2 when taking the absolute value.

Step 5: Test-solve and feedback

Question 1 Test-Solve:
Equation given: M + 5 O2 -> 3 CO2 + 4 H2O.
Equation is balanced; M = C3H8 (molar mass = 44.1 g/mol).
Moles of CO2 = 14.4 L / 22.4 L/mol = 0.643 mol.
Moles of M = 0.643 / 3 = 0.214 mol.
Mass of M = 0.214 mol * 44.1 g/mol = 9.44 g.
Question 1 Feedback: Problem is too easy and too standard for difficulty level 5. Make it more challenging by removing the equation and giving how much of each gas is produced when a given amount of M is burned.

Question 2 Test-Solve:
Using Butler-Volmer equation: j = j0 * (exp(alpha_a * n * F * eta / RT) - exp(-alpha_c * n * F * eta / RT)).
Parameters n and alpha are missing.
Question 2 Feedback: Butler-Volmer equation is beyond the scope of the USNCO, and beyond difficulty level 6. Replace the entire question.

Step 6: Improve the questions

Question 1 Revision: A 4.41 g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce 13.20 g of CO2 and 7.21 g of H2O. Determine the molecular formula of M if its density at STP is 1.97 g/L.
Question 2 Revision: A galvanic cell consists of a silver electrode in 1.0 M AgNO3 and a copper electrode in 1.0 M Cu(NO3)2. If the cell operates at 25 degrees C under a constant current of 2.0 A for 45 minutes, calculate the change in mass of the copper electrode. (E0 Ag+/Ag = +0.80 V, E0 Cu2+/Cu = +0.34 V, F = 96485 C/mol).

Step 7: Solve and verify uniqueness

Question 1 Solution:
Moles C = 13.20 g / 44.01 g/mol = 0.300 mol.
Moles H = 2 * (7.21 g / 18.02 g/mol) = 0.800 mol.
Empirical formula = C3H8.
Molar mass = 1.97 g/L * 22.4 L/mol = 44.1 g/mol.
Molecular formula = C3H8.
Uniqueness: Single hydrocarbon identity fits elemental mass ratios and molar mass.

Question 2 Solution:
Anode reaction: Cu -> Cu2+ + 2e-.
Charge Q = 2.0 A * 45 min * 60 s/min = 5400 C.
Moles e- = 5400 C / 96485 C/mol = 0.0560 mol.
Moles Cu = 0.0560 mol / 2 = 0.0280 mol.
Mass decrease = 0.0280 mol * 63.55 g/mol = 1.78 g.
Uniqueness: Standard reduction potentials confirm copper is the anode. Faraday's law yields one precise value.

Step 8: Double check constraints

Target difficulties (5 and 6) met. Traps appropriate for USNCO. Formatting constraints followed. No bold text used.

Final Output JSON:
[
  {
    "id": "chem_prob1",
    "topic": "Stoichiometry & Hydrocarbons",
    "question": "A $4.41$ g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20$ g of $\\ce{CO_2}$ and $7.21$ g of $\\ce{H_2O}$. Determine the molecular formula of M if its density at STP is $1.97$ g/L.",
    "type": "multiple_choice",
    "options": ["$\\ce{CH_4}$", "$\\ce{C_2H_6}$", "$\\ce{C_3H_8}$", "$\\ce{C_4H_{10}}$"],
    "answer": "C",
    "difficulty": 5,
    "detailedSolution": "1. Find moles of C: $13.20\\text{ g } \\ce{CO_2} / 44.01\\text{ g/mol} = 0.300\\text{ mol } \\ce{CO_2}$, which corresponds to $0.300\\text{ mol}$ of C.\\n2. Find moles of H: $2 \\times (7.21\\text{ g } \\ce{H_2O} / 18.02\\text{ g/mol}) = 0.800\\text{ mol}$ of H.\\n3. Empirical formula: $\\ce{C_{0.300}H_{0.800}} = \\ce{C_3H_8}$.\\n4. Molar mass of M: $1.97\\text{ g/L} \\times 22.4\\text{ L/mol} = 44.1\\text{ g/mol}$.\\n5. Since the molar mass of $\\ce{C_3H_8}$ is $44.1\\text{ g/mol}$, the molecular formula is $\\ce{C_3H_8}$."
  },
  {
    "id": "chem_prob2",
    "topic": "Electrochemistry",
    "question": "A galvanic cell consists of a silver electrode in $1.0$ M $\\ce{AgNO_3}$ and a copper electrode in $1.0$ M $\\ce{Cu(NO_3)_2}$. If the cell operates at $25$ °C under a constant current of $2.0$ A for $45$ minutes, calculate the change in mass of the copper electrode. ($E^\\circ(\\ce{Ag^+/Ag}) = +0.80$ V, $E^\\circ(\\ce{Cu^{2+}/Cu}) = +0.34$ V, $F = 96485$ C/mol).",
    "type": "short_answer",
    "answer": "1.78 g",
    "keywordExpression": "'1.78' OR '1.78 g'",
    "difficulty": 6,
    "detailedSolution": "1. Identify the anode: Since $E^\\circ(\\ce{Ag^+/Ag}) = +0.80\\text{ V}$ is greater than $E^\\circ(\\ce{Cu^{2+}/Cu}) = +0.34\\text{ V}$, silver is reduced (cathode) and copper is oxidized (anode).\\n2. Anode reaction: $\\ce{Cu -> Cu^{2+} + 2e^-}$.\\n3. Total charge $Q$: $2.0\\text{ A} \\times 45\\text{ min} \\times 60\\text{ s/min} = 5400\\text{ C}$.\\n4. Moles of electrons: $5400\\text{ C} / 96485\\text{ C/mol} = 0.0560\\text{ mol } e^-$.\\n5. Moles of Cu reacted: $0.0560\\text{ mol } e^- / 2 = 0.0280\\text{ mol } \\ce{Cu}$.\\n6. Mass change of Cu: $0.0280\\text{ mol } \\ce{Cu} \\times 63.55\\text{ g/mol} = 1.78\\text{ g}$ decrease."
  }
]

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
