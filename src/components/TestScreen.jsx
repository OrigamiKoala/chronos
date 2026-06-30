import { useState } from 'react';
import { ChemicalText, SmilesRenderer } from './ChemicalText';
import { ArrowLeft, Code, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';

export function TestScreen({ onBack }) {
  const [jsonInput, setJsonInput] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState([]);
  const [error, setError] = useState('');

  const handleParse = () => {
    setError('');
    setParsedQuestions([]);
    if (!jsonInput.trim()) {
      setError('Please enter some JSON content.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      const questionsArray = Array.isArray(parsed) ? parsed : [parsed];

      // Simple validation of required fields
      for (let i = 0; i < questionsArray.length; i++) {
        const q = questionsArray[i];
        if (!q.question) {
          throw new Error(`Question at index ${i} is missing the "question" field.`);
        }
        if (!q.type) {
          throw new Error(`Question at index ${i} is missing the "type" field.`);
        }
        if (q.type === 'multiple_choice' && (!q.options || !Array.isArray(q.options))) {
          throw new Error(`Question at index ${i} has type "multiple_choice" but is missing a valid "options" array.`);
        }
      }

      setParsedQuestions(questionsArray);
    } catch (err) {
      setError(`Invalid JSON or schema: ${err.message}`);
    }
  };

  const loadExample = (type) => {
    let example = {};
    if (type === 'mcq') {
      example = {
        "id": "demo_mcq",
        "topic": "Organic Chemistry, Stereochemistry",
        "question": "Which of the following compounds is chiral?\n\nCC(C)O\n\nCC(Cl)Br\n\n[[SVG: <svg viewBox='0 0 100 100' width='100' height='100'><circle cx='50' cy='50' r='40' stroke='white' stroke-width='2' fill='none'/><text x='50' y='55' fill='white' text-anchor='middle'>SVG Demo</text></svg>]]",
        "type": "multiple_choice",
        "options": ["Isopropyl alcohol", "1-chloro-1-bromoethane", "Methanol", "Ethanol"],
        "answer": "B",
        "difficulty": 4
      };
    } else if (type === 'short_answer') {
      example = {
        "id": "demo_sa",
        "topic": "Algebra, Number Theory",
        "question": "Find the sum of all positive integers $n$ for which $n^2 + 19n + 92$ is a perfect square.",
        "type": "short_answer",
        "answer": "8",
        "keywordExpression": "8",
        "difficulty": 5
      };
    } else {
      example = {
        "id": "demo_frq",
        "topic": "Classical Mechanics, Rotational Dynamics",
        "question": "A uniform cylinder of mass $M$ and radius $R$ is placed on a rough horizontal board. The board is accelerated horizontally with a constant acceleration $A$. Assuming the cylinder rolls without slipping, derive the acceleration $a$ of the cylinder relative to the lab frame, and the minimum coefficient of static friction $\\mu_s$ required to prevent slipping.",
        "type": "free_response",
        "answer": "",
        "difficulty": 7
      };
    }
    setJsonInput(JSON.stringify(example, null, 2));
    setError('');
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 10px' }}>
      <button 
        onClick={onBack}
        className="btn btn-outline"
        style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <ArrowLeft size={16} /> Back to Setup
      </button>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Code className="text-gradient" /> JSON Question Previewer
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.95rem' }}>
          Input a JSON object or array of objects representing questions to test how they render (including LaTeX, SMILES, reactions, and SVG diagrams).
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <button onClick={() => loadExample('mcq')} className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            Load MCQ Example
          </button>
          <button onClick={() => loadExample('short_answer')} className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            Load Short Answer Example
          </button>
          <button onClick={() => loadExample('free_response')} className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            Load FRQ Example
          </button>
        </div>

        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='Paste question JSON here... E.g.
{
  "id": "q1",
  "topic": "Algebra",
  "question": "What is $2 + 2$?",
  "type": "multiple_choice",
  "options": ["3", "4", "5", "6"],
  "answer": "B",
  "difficulty": 1
}'
          style={{
            width: '100%',
            height: '240px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--bg-glass-border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '12px',
            marginBottom: '16px',
            resize: 'vertical'
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={handleParse} 
            className="btn btn-primary"
            style={{ minWidth: '150px' }}
          >
            Render Questions
          </button>
          {parsedQuestions.length > 0 && (
            <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
              <CheckCircle size={16} /> Loaded {parsedQuestions.length} question(s)
            </span>
          )}
        </div>

        {error && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '6px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'start',
            gap: '8px',
            fontSize: '0.9rem'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {parsedQuestions.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Preview Output</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {parsedQuestions.map((q, idx) => (
              <div 
                key={q.id || idx} 
                className="glass-panel" 
                style={{ 
                  padding: '24px', 
                  borderLeft: '4px solid var(--accent-primary)',
                  position: 'relative'
                }}
              >
                {/* Meta details */}
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '12px', 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingBottom: '10px',
                  marginBottom: '16px'
                }}>
                  {q.id && <span><strong>ID:</strong> {q.id}</span>}
                  {q.type && <span style={{ textTransform: 'capitalize' }}><strong>Type:</strong> {q.type.replace('_', ' ')}</span>}
                  {q.difficulty !== undefined && <span><strong>Difficulty:</strong> {q.difficulty}/10</span>}
                  {q.topic && <span><strong>Topic:</strong> {q.topic}</span>}
                </div>

                {/* Question Text */}
                <div style={{ fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '20px' }}>
                  <ChemicalText text={q.question} theme="dark" />
                </div>

                {/* Options (MCQ only) */}
                {q.type === 'multiple_choice' && q.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    {q.options.map((opt, oIdx) => {
                      const label = String.fromCharCode(65 + oIdx); // A, B, C, D...
                      const isCorrect = q.answer === label;
                      return (
                        <div 
                          key={oIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            backgroundColor: isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                            border: isCorrect ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: isCorrect ? 'var(--success)' : 'var(--text-secondary)',
                            marginRight: '12px',
                            fontSize: '1rem'
                          }}>
                            {label}.
                          </span>
                          <div style={{ flex: 1 }}>
                            <ChemicalText text={opt} theme="dark" defaultWidth={90} defaultHeight={90} />
                          </div>
                          {isCorrect && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold', marginLeft: '10px' }}>
                              Correct Answer
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Short Answer details */}
                {q.type === 'short_answer' && (
                  <div style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '10px'
                  }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong style={{ color: 'var(--success)' }}>Expected Answer:</strong> {q.answer}
                    </div>
                    {q.keywordExpression && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong>Keyword Expression:</strong> <code>{q.keywordExpression}</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Free Response details */}
                {q.type === 'free_response' && (
                  <div style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid rgba(255, 255, 255, 0.05)', 
                    borderRadius: '8px',
                    padding: '16px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem'
                  }}>
                    <HelpCircle size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                    This is a Free Response question. Users are expected to submit a full written solution/proof.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
