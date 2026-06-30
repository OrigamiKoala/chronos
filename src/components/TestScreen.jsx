import { useState } from 'react';
import { jsonrepair } from 'jsonrepair';
import { ChemicalText, SmilesRenderer } from './ChemicalText';
import { isSmiles } from './chemicalHelpers';
import { ArrowLeft, Code, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';

export function TestScreen({ onBack }) {
  const [jsonInput, setJsonInput] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState([]);
  const [error, setError] = useState('');

  const handleParse = () => {
    setError('');
    setParsedQuestions([]);
    let rawStr = jsonInput.trim();
    if (!rawStr) {
      setError('Please enter some JSON content.');
      return;
    }

    if (rawStr.startsWith('```')) {
      rawStr = rawStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    try {
      let repairedStr = rawStr;
      try {
        repairedStr = jsonrepair(rawStr);
      } catch (repairErr) {
        console.warn('jsonrepair failed, attempting regular parse:', repairErr);
      }

      const parsed = JSON.parse(repairedStr);
      const questionsArray = Array.isArray(parsed) ? parsed : [parsed];

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
        "topic": "Organic Chemistry",
        "question": "Which of the following compounds is chiral?",
        "type": "multiple_choice",
        "options": ["CCO", "CC(Cl)Br", "CO", "C"],
        "answer": "B",
        "difficulty": 4
      };
    } else if (type === 'short_answer') {
      example = {
        "id": "demo_sa",
        "topic": "Algebra",
        "question": "Find the sum of all positive integers $n$ for which $n^2 + 19n + 92$ is a perfect square.",
        "type": "short_answer",
        "answer": "8",
        "keywordExpression": "8",
        "difficulty": 5
      };
    } else {
      example = {
        "id": "demo_frq",
        "topic": "Mechanics",
        "question": "Derive the acceleration $a$ of the cylinder relative to the lab frame.",
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

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
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
          placeholder='Paste question JSON here...'
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
          <h3 style={{ marginBottom: '20px', color: 'var(--text-primary)', textAlign: 'center' }}>Preview Output</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {parsedQuestions.map((q, idx) => (
              <div 
                key={q.id || idx} 
                className="glass-panel animate-fade-in" 
                style={{ 
                  padding: 'var(--panel-padding)', 
                  maxWidth: '800px', 
                  margin: '0 auto 2rem',
                  width: '100%'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Question {idx + 1} of {parsedQuestions.length}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                        Level {q.difficulty !== undefined ? q.difficulty : 5}
                      </span>
                      {q.topic && (
                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          Topic: {q.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {q.id && (
                      <div className="glass-panel" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.8rem',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)'
                      }}>
                        ID: {q.id}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
                  <p><ChemicalText text={q.question} theme="dark" /></p>
                </div>

                {q.type === 'multiple_choice' && q.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                    {q.options.map((opt, oIdx) => {
                      const letter = ['A', 'B', 'C', 'D'][oIdx] || String.fromCharCode(65 + oIdx);
                      const isCorrect = q.answer === letter;
                      return (
                        <button
                          key={oIdx}
                          className={`btn btn-outline ${isCorrect ? 'selected' : ''}`}
                          style={{
                            justifyContent: 'flex-start',
                            background: isCorrect ? 'var(--bg-tertiary)' : 'transparent',
                            borderColor: isCorrect ? 'var(--accent-primary)' : '',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            minHeight: '48px',
                            padding: '0.5rem 1rem',
                            width: '100%',
                            textAlign: 'left'
                          }}
                          disabled={true}
                        >
                          <span style={{ 
                            fontWeight: '700', 
                            marginRight: '0.5rem', 
                            color: isCorrect ? 'var(--accent-primary)' : 'var(--text-secondary)' 
                          }}>
                            {letter}.
                          </span>
                          {isSmiles(opt) ? (
                            <SmilesRenderer smiles={opt} width={90} height={90} theme="dark" />
                          ) : (
                            <ChemicalText text={opt} theme="dark" defaultWidth={90} defaultHeight={90} />
                          )}
                          {isCorrect && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold', marginLeft: 'auto' }}>
                              Correct Answer
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Correct Answer Field (Preset):
                    </div>
                    <input
                      type="text"
                      className="input-field"
                      value={q.answer || ''}
                      disabled={true}
                      style={{ width: '100%' }}
                    />
                    {q.keywordExpression && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <strong>Keyword Expression:</strong> <code>{q.keywordExpression}</code>
                      </div>
                    )}
                  </div>
                )}

                {q.type === 'free_response' && (
                  <div style={{ marginBottom: '2rem' }}>
                    <span style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                      Show Your Process / Explanation:
                    </span>
                    <div style={{
                      height: '240px',
                      border: '2px dashed var(--bg-glass-border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      background: 'rgba(255,255,255,0.01)',
                      fontSize: '0.95rem'
                    }}>
                      [ Exam Whiteboard / Drawing Canvas Mockup ]
                    </div>
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
