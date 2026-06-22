import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, subject, targetUserId = 'default_user', examFormat, lessonTitle, lessonDescription, topics, assignmentId } = req.body;
  const difficulty = Number(req.body.difficulty !== undefined ? req.body.difficulty : 5);

  if (!count || (difficulty !== 0 && !difficulty) || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, difficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).trim().toLowerCase();
  const normSubject = String(subject).trim().toLowerCase();

  if (assignmentId && sanitizedUser !== 'default_user') {
    try {
      const getQuestionsQuery = `
        SELECT questions_json
        FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\`
        WHERE assignment_id = @assignmentId AND student_id = @targetUserId
        LIMIT 1
      `;
      const [rows] = await bq.query({
        query: getQuestionsQuery,
        params: { assignmentId, targetUserId: sanitizedUser }
      });
      if (rows && rows.length > 0) {
        const questionsList = JSON.parse(rows[0].questions_json);
        return res.status(200).json(questionsList);
      }
    } catch (err) {
      console.error('Error fetching student homework questions:', err);
    }
  }

  try {
    // 1. Fetch user weaknesses and diagnostic data from BigQuery in parallel
    let weaknesses = 'None (excellent performance across all topics)';
    let weaknessAnalysis = 'None (no previous analysis available)';
    let topicBreakdown = 'None (no previous topic breakdown available)';
    let mistakeAnalysis = 'None (no previous mistake pattern analysis available)';
    let doneQuestionIds = [];

    try {
      const consolidatedQuery = `
        WITH weaknesses AS (
          SELECT 'weaknesses' AS type, TO_JSON_STRING(STRUCT(
            COALESCE(
              STRING_AGG(
                FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
                "; "
              ),
              "None (excellent performance across all topics)"
            ) AS weaknesses
          )) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          WHERE accuracy_rate < 0.65 AND user_id = @targetUserId AND subject = @subject
        ),
        weaknessAnalysis AS (
          SELECT 'weaknessAnalysis' AS type, TO_JSON_STRING(STRUCT(detailed_analysis)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
          WHERE user_id = @targetUserId AND subject = @subject
          ORDER BY updated_at DESC
          LIMIT 1
        ),
        topicBreakdown AS (
          SELECT 'topicBreakdown' AS type, TO_JSON_STRING(STRUCT(topic, good_at, not_good_at)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
          WHERE user_id = @targetUserId AND subject = @subject
        ),
        mistakeAnalysis AS (
          SELECT 'mistakeAnalysis' AS type, TO_JSON_STRING(STRUCT(mistake_patterns)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
          WHERE user_id = @targetUserId AND subject = @subject
          ORDER BY created_at DESC
          LIMIT 3
        ),
        doneQuestions AS (
          SELECT 'doneQuestions' AS type, TO_JSON_STRING(STRUCT(qid)) AS data
          FROM (
            SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid
            FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`,
            UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q
            WHERE user_id = @targetUserId
          )
        )
        SELECT type, data FROM weaknesses
        UNION ALL
        SELECT type, data FROM weaknessAnalysis
        UNION ALL
        SELECT type, data FROM topicBreakdown
        UNION ALL
        SELECT type, data FROM mistakeAnalysis
        UNION ALL
        SELECT type, data FROM doneQuestions
      `;

      const [rows] = await bq.query({
        query: consolidatedQuery,
        params: { targetUserId: sanitizedUser, subject }
      });

      const topicBreakdownRows = [];
      const mistakeAnalysisRows = [];

      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.data);
          if (r.type === 'weaknesses') {
            weaknesses = parsed.weaknesses || 'None (excellent performance across all topics)';
          } else if (r.type === 'weaknessAnalysis') {
            if (parsed.detailed_analysis) {
              weaknessAnalysis = parsed.detailed_analysis;
            }
          } else if (r.type === 'topicBreakdown') {
            topicBreakdownRows.push(parsed);
          } else if (r.type === 'mistakeAnalysis') {
            mistakeAnalysisRows.push(parsed);
          } else if (r.type === 'doneQuestions') {
            if (parsed.qid && sanitizedUser !== 'default_user') {
              doneQuestionIds.push(parsed.qid);
            }
          }
        } catch (e) {
          console.error("Failed to parse consolidated row in generate:", r, e);
        }
      }

      if (topicBreakdownRows.length > 0) {
        topicBreakdown = topicBreakdownRows.map(row => `Topic: ${row.topic} | Good at: ${row.good_at} | Not good at: ${row.not_good_at}`).join('\n');
      }
      if (mistakeAnalysisRows.length > 0) {
        mistakeAnalysis = mistakeAnalysisRows.map((row, idx) => `Mistake Pattern ${idx + 1}: ${row.mistake_patterns}`).join('\n');
      }
    } catch (err) {
      console.error('Parallel fetch error:', err);
    }

    // 1b. Fetch 1 pregenerated question
    let pregeneratedQuestion = null;
    try {
      const pregenQuery = `
        SELECT question_json
        FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
        WHERE subject = @subject AND difficulty = @difficulty
          AND (ARRAY_LENGTH(@doneIds) = 0 OR JSON_VALUE(question_json, '$.id') NOT IN UNNEST(@doneIds))
        ORDER BY RAND()
        LIMIT 1
      `;
      const [rows] = await bq.query({
        query: pregenQuery,
        params: { subject: normSubject || subject, difficulty: difficulty, doneIds: doneQuestionIds },
        types: { doneIds: ['STRING'] }
      });
      if (rows && rows.length > 0) {
        pregeneratedQuestion = JSON.parse(rows[0].question_json);
      }
    } catch (err) {
      console.error('Error fetching pregenerated question:', err);
    }

    // 2. Build the Gemini generation prompt
    let constraints = '';
    let examples = '';

    if (normSubject === 'math') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption. The user should be tricked into thinking the wrong way, overlooking something.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
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

4. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Geometric diagrams, number-line illustrations, graphs, coordinate grids, and function plots all make problems richer and harder to solve without visualization. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), white background, and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 0=simplest part of MATHCOUNTS (MATHCOUNTS School), 1=MATHCOUNTS, 4=AMC 12 Q21-25, 5=AIME Q11-13, 8=medium USAMO, 10=hardest IMO.
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
  "detailedSolution": "Say WLOG that $AB$ is the top side of the square, and the square is of side length 1. Let us say that the midpoint of $AB$ is $M$, while the midpoint of $CD$ is $Q$. Drawing a vertical line to split the square in half, we notice that if $P$ is to the left of the line, $AP < BP$, and if P is to the right of the line, $AP > BP$. Also, drawing a quarter circle of radius 1 from point $A$, we can split the area into points P for which $AP < AB$ and $AP > AB$. Because of our constraints, there are 2 cases:

Case 1: $AB > AP > BP$ In this case, $P$ will be to the right of the vertical line and inside of the quarter circle. Let us say that the intersection of the vertical line and quarter circle is $N$. The distance from $N$ to $AD$ is 1/2, and we can say that $\\\\angle BAN$ is $60^\\circ$. Sector $BAN$ of circle $A$ would therefore have an area of $\\\\frac{\\\\pi}{6}$. Because $\\\\triangle AMN$ is a 30-60-90 triangle, the area of $AMN$ is $\\\\frac{\\\\sqrt{3}}{8}$. The probability of case 1 happening should then be $\\\\frac{\\\\pi}{6}-\\\\frac{\\\\sqrt{3}}{8}$.

Case 2: $AB < AP < BP$ In this case, $P$ will be to the left of the vertical line and outside of the quarter circle. Knowing that the quarter circle's area is $\\\\frac{\\\\pi}{4}$, we can subtract the probability of Case 1 happening to get the chance that $P$ is on the left of the vertical line and in circle $A$. Doing this would give $\\\\frac{\\\\pi}{12}+\\\\\frac{\\\\sqrt{3}}{8}$. To get the probability of Case 2 happening, we can subtract this from the area of rectangle $AMQD$. This would give us $\\\\frac{1}{2}-\\\\frac{\\\\pi}{12}-\\\\frac{\\\\sqrt{3}}{8}$.

Adding both cases, we get the total probability as $\\\\frac{1}{2}+\\\\frac{\\\\pi}{12}-\\\\frac{\\\\sqrt{3}}{4} = \\\\frac{6+\\\\pi-3\\\\sqrt{3}}{12}$. Formatting this gives us $6+1+3+3+12 = \\\\boxed{\\\\textbf{(A) } 25}$."
}

{
  "id": "math_ex2",
  "topic": "Combinatorics, Algebra, Number Theory",
  "question": "For each nonnegative integer $r$ less than $502$, define\\\\[S_r=\\\\sum_{m\\\\geq 0}\\\\binom{10,000}{502m+r},\\\\]where $\\\\binom{10,000}{n}$ is defined to be $0$ when $n>10,000$. That is, $S_r$ is the sum of all the binomial coefficients of the form $\\\\binom{10,000}{k}$ for which $0\\\\leq k\\\\leq 10,000$ and $k-r$ is a multiple of $502$. Find the number of integers in the list $S_0,S_1,S_2,\\\\dots,S_{501}$ that are multiples of the prime number $503$.",
  "type": "short_answer",
  "answer": "39",
  "difficulty": 7,
  "detailedSolution": "Take player $v^*$ with max out-degree $\\\\Delta$. Let $W$ = wins, $L$ = losses. For any $u \\\\in L$: if $u$ beat all of $W$, then $d^+(u) \\\\geq \\\\Delta+1$, contradiction. So some $w \\\\in W$ beats $u$, and $v^*$ dominates $u$ via $w$. $v^*$ trivially dominates $W$ directly. QED."
}

{
  "id": "math_ex3",
  "topic": "Combinatorics",
  "question": "The integers from $1$ through $25$ are arbitrarily separated into five groups of $5$ numbers each. The median of each group is identified. Let $M$ equal the median of the five medians. What is the least possible value of $M$?

$\\\\textbf{(A) }9 \\\\qquad \\\\textbf{(B) }10 \\\\qquad \\\\textbf{(C) }12 \\\\qquad \\\\textbf{(D) }13 \\\\qquad \\\\textbf{(E) }14$

",
  "type": "multiple_choice",
  "options": ["$9$", "$10$", "$12$", "$13$", "14"],
  "answer": "A",
  "difficulty": 3,
  "detailedSolution": "If a group has median $m$, then we must have that $3$ of the numbers in that group are $\\\\leq m$. Since there are 5 different groups, $3$ groups must have a median $\\\\leq M$, so there are at least $3\\\\cdot3=9$ numbers that are $\\\\leq M$. Since there are at least $9$ numbers that are $\\\\leq M$, we have $M$ at minimum $\\\\boxed{\\\\textbf{(A) }9}.$"
}

{
  "id": "math_ex4",
  "topic": "Number Theory",
  "question": "Let $a$ and $b$ be positive integers such that $ab + 1$ divides $a^{2} + b^{2}$. Show that $\\\\frac {a^{2} + b^{2}}{ab + 1}$ is the square of an integer.",
  "type": "free_response",
  "answer": "",
  "difficulty": 10,
  "detailedSolution": "Choose integers $a,b,k$ such that $a^2+b^2=k(ab+1)$ Now, for fixed $k$, out of all pairs $(a,b)$ choose the one with the lowest value of $\\\\min(a,b)$. Label $b'=\\\\min(a,b), a'=\\\\max(a,b)$. Thus, $a'^2-kb'a'+b'^2-k=0$ is a quadratic in $a'$. Should there be another root, $c'$, the root would satisfy: $b'c'\\\\leq a'c'=b'^2-k<b'^2\\\\implies c'<b'$ Thus, $c'$ isn't a positive integer (if it were, it would contradict the minimality condition). But $c'=kb'-a'$, so $c'$ is an integer; hence, $c'\\\\leq 0$. In addition, $(a'+1)(c'+1)=a'c'+a'+c'+1=b'^2-k+b'k+1=b'^2+(b'-1)k+1\\\\geq 1$ so that $c'>-1$. We conclude that $c'=0$ so that $b'^2=k$.

This construction works whenever there exists a solution $(a,b)$ for a fixed $k$, hence $k$ is always a perfect square."
}
`;
    } else if (normSubject === 'physics') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
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

4. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Free-body diagrams, circuit schematics, wave/field plots, geometry setups, and apparatus sketches all significantly increase problem depth and realism. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), white background, and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.
`;
      examples = `
5. Exemplar Questions (format reference):

{
  "id": "phys_ex1",
  "topic": "Mechanics",
  "question": "In astronomy, some galactic objects appear to sweep across the sky faster than light speed, $c$. This effect, called superluminal motion, comes purely from geometry and the finite travel time of light, and it has nothing to do with special relativity.
A jet moves from point $A$ to $B$ at speed $v = \\\\beta c$. The jet emits a pulse of light at $A$, and a second pulse a time \\\\delta t later at $B$. An observer sees these pulses at point $O$. The angle between the jet and the line of sight is \\\\theta$. Assume the angle \\\\phi is small, so the distances from $O$ to points $B$ and $C$ can be treated as equal.
Find the apparent transverse velocity, $v_T$, along $CB$ as measured by the observer, in terms of \\\\beta and \\\\theta$. Express your answer as \\\\beta_T \\\\equiv \\\\frac{v_T}{c}.
. <svg width="500" height="200" viewBox="0 0 500 200" xmlns="http://www.w3.org/2000/svg">
  <line x1="50" y1="150" x2="450" y2="150" stroke="black" stroke-width="2" /> <line x1="450" y1="150" x2="250" y2="80" stroke="black" stroke-width="2" />  <line x1="50" y1="150" x2="250" y2="80" stroke="black" stroke-dasharray="4" /> <line x1="250" y1="80" x2="250" y2="150" stroke="black" stroke-dasharray="4" /> <circle cx="50" cy="150" r="4" fill="black" /> <circle cx="250" cy="80" r="4" fill="black" />  <circle cx="250" cy="150" r="4" fill="black" /> <circle cx="450" cy="150" r="4" fill="black" /> <text x="40" y="140" font-family="serif" font-style="italic">O</text>
  <text x="250" y="70" font-family="serif" font-style="italic">B</text>
  <text x="250" y="170" font-family="serif" font-style="italic">C</text>
  <text x="450" y="170" font-family="serif" font-style="italic">A</text>
  
  <text x="350" y="130" font-family="serif" font-style="italic">θ</text>
  <text x="350" y="100" font-family="serif" font-style="italic">v</text>
  <path d="M 420 150 A 30 30 0 0 0 400 120" fill="none" stroke="black" />
  
  <text x="90" y="140" font-family="serif" font-style="italic">φ</text>
  <path d="M 80 150 A 30 30 0 0 0 100 140" fill="none" stroke="black" />
</svg>
",
  "type": "multiple_choice",
  "options": ["$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 - \\\\beta \\\\cos \\\\theta}$",

"$\\\\beta_T = \\\\beta \\\\sin \\\\theta(1 - \\\\beta \\\\cos \\\\theta)$",

"$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 + \\\\beta \\\\cos \\\\theta}$",

"$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{\\\\sqrt{1 - \\\\beta^2}}$",

"$\\\\beta_T = \\\\beta \\\\tan \\\\theta$"],
  "answer": "A",
  "difficulty": 6,
  "detailedSolution": "Let $OB = OC = d$.
The time interval between the emission of the two pulses is \\\\delta t = t_2 - t_1$.
The arrival time of the first pulse at $O$ is:
$$t'_1 = t_1 + \\\\frac{d + v \\\\delta t \\\\cos \\\\theta}{c}$$
The arrival time of the second pulse at $O$ is:
$$t'_2 = t_2 + \\\\frac{d}{c}$$
The observed time interval \\\\delta t' is:
$$\\\\delta t' = t'_2 - t'_1 = (t_2 - t_1) - \\\\frac{v \\\\delta t \\\\cos \\\\theta}{c} = \\\\delta t \\\\left( 1 - \\\\frac{v}{c} \\\\cos \\\\theta \\\\right) = \\\\delta t (1 - \\\\beta \\\\cos \\\\theta)$$
The transverse distance covered is $v \\\\delta t \\\\sin \\\\theta$. The apparent transverse velocity is $v_T = \\\\frac{v \\\\delta t \\\\sin \\\\theta}{\\\\delta t'}$.
Substituting \\\\delta t':
$$\\\\beta_T = \\\\frac{v_T}{c} = \\\\frac{v \\\\delta t \\\\sin \\\\theta}{c \\\\delta t (1 - \\\\beta \\\\cos \\\\theta)} = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 - \\\\beta \\\\cos \\\\theta}$$
The correct choice is (A).
"
}

{
  "id": "phys_ex2",
  "topic": "Mechanics",
  "question": "A projectile of total mass $4M$ is launched from the ground at position $x=0$ and time $t=0$. The projectile is launched with an initial speed $v_{0}$ at an angle \\\\theta above the horizontal. When the projectile is at the highest point in its trajectory, it breaks into Pieces Q and R of masses $M$ and $3M$, respectively. The motion of the projectile is described for the following times:
    - At $t=t_{1}$, immediately after the projectile breaks apart, the two pieces are moving away from each other horizontally.
    - At $t=t_{2}$, Piece Q reaches the ground at $x=0$ and Piece R reaches the ground at $x=x_{2}$.

Part A: The horizontal and vertical components of a momentum vector are represented by $p_{x}$ and $p_{y}$, respectively. The shaded bars in Figure 2 represent $p_{x}$ and $p_{y}$ of the projectile immediately after $t=0$. On Figure 3, draw shaded bars to represent $p_{x}$ and $p_{y}$ of Pieces Q and R at $t=t_{1}$.

Part B: Derive an expression for $x_{2}$ in terms of $v_{0}$, \\\\theta, and physical constants, as appropriate. Begin your derivation by writing a fundamental physics principle or an equation from the reference information.

Part C: The horizontal component of a velocity vector is represented by $v_{x}$. Figure 4 shows the horizontal component $v_{x,cm}$ of the velocity of the center of mass of the projectile as a function of $t$ during the time interval $0 < t < t_{1}$. On Figure 4, sketch a line or curve to represent $v_{x}$ as a function of $t$ for the time interval $t_{1} < t < t_{2}$ for each of the following:
    - Piece Q
    - Piece R
    - The center of mass of the two-piece system
Clearly label all lines or curves.

Part D: Consider a case in which the projectile is launched at the same angle and initial speed as initially described. When the projectile breaks into Pieces Q and R, Piece Q falls straight down. In this case, Piece R reaches the ground at $x=x_{new}$. Indicate whether $x_{new}$ is greater than, less than, or equal to $x_{2}$ by writing one of the following:
    - $x_{new} > x_{2}$
    - $x_{new} < x_{2}$
    - $x_{new} = x_{2}$
Briefly justify your answer either by referencing a feature of the representations you drew in part A or C or by using conceptual reasoning beyond algebraic solutions.
",
  "type": "free_response",
  "answer": "",
  "difficulty": 3,
  "detailedSolution": "### Part A: Momentum at $t=t_1$

Immediately after the projectile (mass $4M$) reaches its highest point at $t=t_1$, it breaks into Piece Q (mass $M$) and Piece R (mass $3M$).

* **At the highest point ($t=t_1$):** The vertical component of momentum for the complete projectile is $p_y = 0$. The horizontal component is $p_x = (4M)v_x = (4M)v_0 \\\\cos \\\\theta$.
* **Conservation of Momentum:** Since the explosion is internal, horizontal momentum is conserved:

$$p_{x, \\\\text{initial}} = p_{x, \\\\text{Piece Q}} + p_{x, \\\\text{Piece R}}$$


$$4M(v_0 \\\\cos \\\\theta) = p_{x,Q} + p_{x,R}$$


* **Vertical Momentum:** Since both pieces are at the same height and start with $v_y = 0$ at $t_1$, both will hit the ground simultaneously. Since the net external vertical force (gravity) acts on both pieces equally, the vertical momentum components at $t_1$ immediately after the break are $p_{y,Q} = 0$ and $p_{y,R} = 0$.

### Part B: Expression for $x_2$

We use the conservation of the center of mass motion. The center of mass of the system continues to follow the parabolic trajectory of the original projectile.

1. **Horizontal position of CM:** The horizontal position of the center of mass at time $t_2$ is:

$$x_{cm} = v_{cm,x} t_2 = (v_0 \\\\cos \\\\theta) t_2$$


2. **Total time of flight ($t_2$):** At the highest point ($t_1$), $v_y = 0$. The time to fall from the maximum height $H = \\\\frac{(v_0 \\\\sin \\\\theta)^2}{2g}$ to the ground is $t_{fall} = \\\\sqrt{\\\\frac{2H}{g}} = \\\\frac{v_0 \\\\sin \\\\theta}{g}$.
The total time $t_2$ is $t_1 + t_{fall} = \\\\frac{v_0 \\\\sin \\\\theta}{g} + \\\\frac{v_0 \\\\sin \\\\theta}{g} = \\\\frac{2v_0 \\\\sin \\\\theta}{g}$.
3. **Horizontal center of mass at $t_2$:**

$$x_{cm}(t_2) = (v_0 \\\\cos \\\\theta) \\\\left( \\\\frac{2v_0 \\\\sin \\\\theta}{g} \\\\right) = \\\\frac{2v_0^2 \\\\sin \\\\theta \\\\cos \\\\theta}{g}$$


4. **Relating to $x_2$:**

$$x_{cm} = \\\\frac{M x_Q + (3M) x_R}{4M}$$



Given Piece Q lands at $x_Q = 0$:

$$\\\\frac{2v_0^2 \\\\sin \\\\theta \\\\cos \\\\theta}{g} = \\\\frac{M(0) + 3M(x_2)}{4M} = \\\\frac{3}{4} x_2$$


$$x_2 = \\\\frac{8}{3} \\\\frac{v_0^2 \\\\sin \\\\theta \\\\cos \\\\theta}{g} = \\\\frac{4v_0^2 \\\\sin(2\\\\theta)}{3g}$$



### Part C: Horizontal Velocity $v_x$

* **Center of Mass ($v_{x,cm}$):** Since there are no external horizontal forces, the center of mass velocity remains constant: $v_{x,cm} = v_0 \\\\cos \\\\theta$ for all $t$.
* **Piece Q:** Since it lands at $x=0$ at $t_2$, and it was at $x_{cm}(t_1)$ at $t_1$, it must have a negative horizontal velocity $v_{x,Q} < 0$.
* **Piece R:** Since $x_{cm}$ is a weighted average and Piece Q is behind the center of mass, Piece R must be in front of the center of mass to maintain $v_{x,cm}$, so $v_{x,R} > v_{x,cm}$.

### Part D: Comparison ($x_{new}$ vs $x_2$)

If Piece Q falls straight down, its horizontal velocity immediately after the break is $v_{x,Q} = 0$.
To conserve momentum:


$$4M(v_0 \\\\cos \\\\theta) = M(0) + 3M(v_{x,R,new})$$

$$v_{x,R,new} = \\\\frac{4}{3} v_0 \\\\cos \\\\theta$$


In the original case, $v_{x,R} < \\\\frac{4}{3} v_0 \\\\cos \\\\theta$ (because $v_{x,Q} < 0$). Since $x_R = x_{cm}(t_1) + v_{x,R} t_{fall}$, and $v_{x,R,new}$ is larger, **$x_{new} > x_2$**."
}
`;
    } else if (normSubject === 'chemistry') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
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

5. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, energy-level diagrams, orbital diagrams, reaction coordinate plots, crystallographic unit cells, and spectroscopy traces are all excellent candidates. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), white background, and single-quotes (') for all attribute values for JSON compatibility.

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
  "question": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen.\\n\\na. A 1.000-g sample of A is dissolved in 20 mL water and titrated with 0.5000 M NaOH solution, giving the data shown below. What is the molar mass of A?\\n\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' style='max-width:100%;background:white'><rect x='60' y='20' width='520' height='320' fill='white'/><g stroke='#ddd' stroke-width='0.5'><line x1='60' y1='52' x2='580' y2='52'/><line x1='60' y1='84' x2='580' y2='84'/><line x1='60' y1='116' x2='580' y2='116'/><line x1='60' y1='148' x2='580' y2='148'/><line x1='60' y1='180' x2='580' y2='180'/><line x1='60' y1='212' x2='580' y2='212'/><line x1='60' y1='244' x2='580' y2='244'/><line x1='60' y1='276' x2='580' y2='276'/><line x1='60' y1='308' x2='580' y2='308'/><line x1='103' y1='20' x2='103' y2='340'/><line x1='147' y1='20' x2='147' y2='340'/><line x1='190' y1='20' x2='190' y2='340'/><line x1='233' y1='20' x2='233' y2='340'/><line x1='277' y1='20' x2='277' y2='340'/><line x1='320' y1='20' x2='320' y2='340'/><line x1='363' y1='20' x2='363' y2='340'/><line x1='407' y1='20' x2='407' y2='340'/><line x1='450' y1='20' x2='450' y2='340'/><line x1='493' y1='20' x2='493' y2='340'/><line x1='537' y1='20' x2='537' y2='340'/></g><rect x='60' y='20' width='520' height='320' fill='none' stroke='#999' stroke-width='1'/><g font-family='Arial,sans-serif' font-size='12' text-anchor='end' fill='black'><text x='55' y='24'>14</text><text x='55' y='56'>13</text><text x='55' y='88'>12</text><text x='55' y='120'>11</text><text x='55' y='152'>10</text><text x='55' y='184'>9</text><text x='55' y='216'>8</text><text x='55' y='248'>7</text><text x='55' y='280'>6</text><text x='55' y='312'>5</text><text x='55' y='344'>4</text></g><text font-family='Arial,sans-serif' font-size='14' font-weight='bold' text-anchor='middle' transform='translate(20,180) rotate(-90)'>pH</text><g font-family='Arial,sans-serif' font-size='12' text-anchor='middle' fill='black'><text x='60' y='358'>0</text><text x='103' y='358'>5</text><text x='147' y='358'>10</text><text x='190' y='358'>15</text><text x='233' y='358'>20</text><text x='277' y='358'>25</text><text x='320' y='358'>30</text><text x='363' y='358'>35</text><text x='407' y='358'>40</text><text x='450' y='358'>45</text><text x='493' y='358'>50</text><text x='537' y='358'>55</text><text x='580' y='358'>60</text></g><text x='320' y='390' font-family='Arial,sans-serif' font-size='14' text-anchor='middle'>mL 0.5000 M NaOH added</text><path d='M 60 314.4 C 60 250,68.7 237.6,77.3 218.4 S 103.3 192.8,146.7 173.6 S 190 160.8,233.3 144.8 S 268 109.6,276.7 77.6 S 285.3 68,320 58.4 S 406.7 48.8,580 42.4' fill='none' stroke='black' stroke-width='2'/></svg>]]\\n\\nb. When a 1.000-g sample of A is heated at 230 °C in an evacuated 1.50 L vessel, it decomposes into gaseous products, giving a final pressure of 784 mm Hg. How many moles of gas are formed in this reaction?\\n\\nc. If the gases produced from the decomposition of 1.000 g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at 25 °C and a pressure of 755 mm Hg, the total volume of gas is 308 mL. How many moles of gas are collected in this experiment?\\n\\nd. What is the formula of A? Explain your reasoning.\\n\\ne. Write Lewis structures for the cation and the anion present in A and for the product(s) of its decomposition at 230 °C. Your Lewis structures should include all bonds, lone pairs, and nonzero formal charges. You should show all significant resonance structures for each species.",
  "type": "free_response",
  "answer": "",
  "difficulty": 5,
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
      ? `\n  "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \\"'carbon dioxide' OR CO2\\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
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

    let topicsInstructions = '';
    if (topics && typeof topics === 'string' && topics.trim()) {
      topicsInstructions = `
Additionally, the user has explicitly requested that this exam focus on the following topics: "${topics.trim()}".
You MUST prioritize generating questions that are directly related to these specified topics.
`;
    }

    const systemInstruction = `###Role:### You are a professional olympiad question writer for high school olympiad-level tests. You want to write tricky problems that challenges students in their understanding of [subject] concepts, rather than their breadth of knowledge.

###Goal:### Write questions for a user's practice tests that mirror the style of actual olympiad exams and challenge the user to think deeply about the material. Target the user's weak areas ( ${weaknesses} ).
${lessonInstructions}
${topicsInstructions}
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
5. BACKWARD CHAINING (REVERSE DESIGN): Use a backward-chaining methodology to design questions. EVERY single question generated must be completely unique, original, and never seen before.
6. SVG DIAGRAMS (CRITICAL - HIGH FREQUENCY REQUIRED): You MUST include [[SVG: <svg>...</svg>]] diagrams in the majority of your questions. Every geometry question, every graph-based problem (titration curves, phase diagrams, potential energy surfaces, circuit diagrams, free-body diagrams, coordinate geometry, function plots, etc.) MUST have a corresponding SVG figure embedded directly in the question text. Failing to include diagrams where they would naturally appear is a serious quality defect. Use single-quotes for all SVG attribute values.

***Constraints & Execution Instructions:***

1. **Backward Chaining Generation Methodology (CRITICAL - Ensure 100% Uniqueness & Originality)**
You must generate every question using a backward chaining thought process before outputting the final problem, ensuring that each question is completely unique, original, and never seen before:

* **Step 1 (The Trap - Must be completely unique and original):** Identify a specific, non-obvious conceptual trap, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption. This trap must be entirely novel, original, and never seen before in any question or textbook.
* **Step 2 (The System - Must be completely unique, original, and as convoluted as possible):** Once you have the trick/trap in mind, design a chemical system, physical system, mathematical scenario, or reaction where this specific trap naturally occurs, making the system/reaction or context as convoluted as possible while ensuring it is completely unique, original, and never seen before (avoid standard textbook setups).
* **Step 3 (The Distractors - Must be completely unique and original):** Calculate or derive the incorrect answers that result directly from falling into the conceptual trap (rote formula shortcut, ignoring the limiting factor, etc.). Ensure the options are uniquely designed to target this specific trap.
* **Step 4 (The Problem - Must be completely unique and original):** Draft the neutral question text that presents the system, masking the trap completely, written in a completely unique, original, and never-seen-before style.

Here is an example:

***Step 1***: A common trap is, when investigating the reactivity of nitric acid, to only think of it as a strong protonating acid and failing to realize it is also a strong oxidizing agent.

***Step 2***: This system could be one where a metal (e.g. copper) is selectively reduced by a reducing agent (e.g. H2). The student might not realize the nitric acid competes for the electrons.

***Step 3***: If the student falls for this trap, they could be presented with the reducing agent (H2) and think only copper is reduced by it, when in reality nitric acid is also reduced by it. Perhaps the student thinks adding the reducing agent to react with the copper could determine the amount of copper in a solution, but not realize that excess weight will be added from the various nitrous oxides. 

***Step 4***: The student could be asked, “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?” One of the options, consistent with the trap, should be “Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.” The other options could test other traps, i.e. that both nickel and copper form insoluble hydroxides, and that they both absorb the same wavelength of light. Thus the final question is: “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\n\\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.”


###Steps:###
To ensure high question quality:
- Mentally perform the draft, test-solving, feedback, and revision steps using a backward-chaining methodology, ensuring that each question is completely unique, original, and never seen before.
- Do NOT output your thought process in any field of the JSON. Only output the final, fully refined question parameters.
- Do NOT output any markdown, explanations, or text outside the JSON array structures. Output ONLY the valid JSON array starting with \`[\`.

For example, your output must look like this:
[
  {
    "id": "chem_prob1",
    "topic": "Stoichiometry & Hydrocarbons",
    "question": "A $4.41$ g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20$ g of \\\\ce{CO_2} and $7.21$ g of \\\\ce{H_2O}. Determine the molecular formula of M if its density at STP is $1.97$ g/L.",
    "type": "multiple_choice",
    "options": ["\\\\ce{CH_4}", "\\\\ce{C_2H_6}", "\\\\ce{C_3H_8}", "\\\\ce{C_4H_{10}}"],
    "answer": "C",
    "difficulty": 5,
    "detailedSolution": ""
  },
  {
    "id": "chem_prob2",
    "topic": "Electrochemistry",
    "question": "A galvanic cell consists of a silver electrode in $1.0$ M \\\\ce{AgNO_3} and a copper electrode in $1.0$ M \\\\ce{Cu(NO_3)_2}. If the cell operates at $25$ °C under a constant current of $2.0$ A for $45$ minutes, calculate the change in mass of the copper electrode. ($E^\\circ(\\\\ce{Ag^+/Ag}) = +0.80$ V, $E^\\circ(\\\\ce{Cu^{2+}/Cu}) = +0.34$ V, $F = 96485$ C/mol).",
    "type": "short_answer",
    "answer": "1.78 g",
    "keywordExpression": "'1.78' OR '1.78 g'",
    "difficulty": 6,
    "detailedSolution": ""
  },
  {
    "id": "chem_prob3",
    "topic": "Thermodynamics & Gas Laws",
    "question": "A horizontal, adiabatic cylinder of total volume $4.0$ L is divided into two compartments by a frictionless, moveable adiabatic piston. Compartment A contains $1.0$ mol of an ideal monoatomic gas at an initial pressure of $3.0$ atm, and compartment B contains $1.0$ mol of the same gas at $1.0$ atm. If $450$ J of heat is slowly supplied to the gas in compartment A via an internal resistive heater, calculate the final equilibrium volume of compartment A.",
    "type": "free_response",
    "answer": "",
    "difficulty": 9,
    "detailedSolution": ""
  }
]

###Output Requirements:###

OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Keep simple, purely qualitative text options that do not contain mathematical or chemical terms in plain, un-delimited text format.

The output must be a pure JSON array containing exactly the requested number of objects, with the following schema for each object:
{
  "id": "A unique string ID",
  "topic": "A comma-separated list of brief sub-categories or topics tested (e.g. 'Algebra, Number Theory' or 'Stoichiometry, Kinetics' or 'Mechanics, Rotational Dynamics')",
  "question": "The text of the question. It should be challenging, clear, and require working suitable for the question format.",
  "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
  "answer": ${answerSchemaDesc},
  "difficulty": a number representing difficulty. This MUST be in the range [${Math.max(0, difficulty - 2)}, ${Math.min(10, difficulty + 2)}] (no question can be more than 2 difficulty units away from the average test difficulty ${difficulty}),
  "detailedSolution": "An empty string \\"\\""
}

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.

CRITICAL: Difficulty level 1 can include simple plug-and-chug applications (applying a single standard formula to given values). These plug-and-chug applications can ONLY happen for difficulty level 1.`;

    const allQuestions = [];
    if (pregeneratedQuestion) {
      allQuestions.push(pregeneratedQuestion);
    }

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
    const models = [...new Set([modelId, 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'])];

    let attempts = 0;
    const maxAttempts = 3;
    while (allQuestions.length < count && attempts < maxAttempts) {
      attempts++;
      try {
        await executeWithRetry(models, async (ai, currentModel) => {
          const needed = count - allQuestions.length;
          if (needed <= 0) return;

          const typeInstruction = needed >= parsedTypes.length
            ? `You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`
            : `Each generated question MUST be chosen from the following types: ${parsedTypes.join(', ')}.`;

          let dynamicPrompt = `Generate exactly ${needed} ${subject} problems. The average difficulty of the generated questions must be exactly ${difficulty} (on a scale of 0 to 10). No single question should have a difficulty more than 2 units away from this average (i.e. every question's difficulty must be in the range [${Math.max(0, difficulty - 2)}, ${Math.min(10, difficulty + 2)}]).
Follow these strict rules:
1. Do NOT generate detailed solutions. Always set the "detailedSolution" field to an empty string "".
2. ${typeInstruction}`;

          if (topics && typeof topics === 'string' && topics.trim()) {
            dynamicPrompt += `\n3. The generated questions MUST be about the following topics: ${topics.trim()}.`;
          }

          const response = await ai.models.generateContent({
            model: currentModel,
            contents: dynamicPrompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              safetySettings,
              temperature: 1.5,
            },
          });

          const text = response.text;
          if (text) {
            const parsed = parseJSONResponse(text);
            if (parsed) {
              const list = Array.isArray(parsed) ? parsed : [parsed];
              for (const q of list) {
                if (allQuestions.length < count) {
                  allQuestions.push(q);
                }
              }
            }
          }
        }, req);
      } catch (genErr) {
        console.warn(`Model generation failed or busy on attempt ${attempts}:`, genErr);
        if (attempts >= maxAttempts) {
          throw genErr;
        }
      }
    }

    return res.status(200).json(allQuestions.slice(0, count));

  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
