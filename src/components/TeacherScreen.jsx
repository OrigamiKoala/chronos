import { useState, useEffect } from 'react';
import { Users, BookOpen, Plus, Loader2, Award, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { AnalyticsDashboard } from './AnalyticsDashboard';

export function TeacherScreen({ user, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Roster view state
  const [viewAllStudents, setViewAllStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentAnalyticsUser, setStudentAnalyticsUser] = useState(null);

  // Exam Review Modal state
  const [reviewExam, setReviewExam] = useState(null);

  // Create Lesson Modal state
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [assignHomework, setAssignHomework] = useState(false);
  
  // Homework config state
  const [homeworkList, setHomeworkList] = useState([]);
  const [hwTitle, setHwTitle] = useState('');
  const [hwSubject, setHwSubject] = useState('Math');
  const [hwQuestions, setHwQuestions] = useState(5);
  const [hwDifficulty, setHwDifficulty] = useState(5);
  const [hwFormats, setHwFormats] = useState(['short_answer']);
  const [hwTimeStyle, setHwTimeStyle] = useState('whole_test');
  const [hwTimeValue, setHwTimeValue] = useState(30);
  const [hwStress, setHwStress] = useState('none');
  const [hwDueDate, setHwDueDate] = useState('');

  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState('');

  const fetchTeacherData = () => {
    if (!user) return;
    fetch(`/api/teacher-data?username=${encodeURIComponent(user.user_id)}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load teacher portal');
        return r.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTeacherData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleClaimStudent = async (studentId, isClaimed) => {
    try {
      const res = await fetch('/api/teacher-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user.user_id,
          studentId,
          action: isClaimed ? 'remove' : 'add'
        })
      });
      if (res.ok) {
        fetchTeacherData();
      } else {
        alert('Failed to update student roster mapping.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateLesson = async (e) => {
    e.preventDefault();
    setLessonError('');
    if (!lessonTitle.trim() || !lessonDescription.trim()) {
      setLessonError('Title and description are required.');
      return;
    }

    setLessonLoading(true);
    try {
      const payload = {
        teacherId: user.user_id,
        organization: user.user_organization,
        title: lessonTitle.trim(),
        description: lessonDescription.trim()
      };

      if (assignHomework) {
        const finalHomework = [...homeworkList];
        const hasDraft = hwTitle.trim() !== '' || hwDueDate !== '';
        if (homeworkList.length === 0 || hasDraft) {
          finalHomework.push({
            title: hwTitle.trim() || `Homework ${homeworkList.length + 1}: ${lessonTitle.trim()}`,
            subject: hwSubject,
            numQuestions: hwQuestions,
            startingDifficulty: hwDifficulty,
            examFormat: hwFormats,
            timeLimitStyle: hwTimeStyle,
            timeLimitValue: hwTimeValue,
            stressMode: hwStress,
            dueDate: hwDueDate ? new Date(hwDueDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          });
        }
        payload.homework = finalHomework;
      }

      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowLessonModal(false);
        setLessonTitle('');
        setLessonDescription('');
        setAssignHomework(false);
        setHomeworkList([]);
        setHwTitle('');
        setHwDueDate('');
        fetchTeacherData();
      } else {
        const d = await res.json();
        setLessonError(d.error || 'Failed to create lesson.');
      }
    } catch (err) {
      console.error(err);
      setLessonError('Connection error creating lesson.');
    } finally {
      setLessonLoading(false);
    }
  };

  const handleReviewExam = async (historyItem) => {
    try {
      const res = await fetch(`/api/get-exam?examId=${historyItem.exam_id}`);
      if (!res.ok) throw new Error('Failed to fetch exam results');
      const examData = await res.json();
      setReviewExam({
        ...historyItem,
        results: examData.results,
        mistakePatterns: examData.mistakePatterns
      });
    } catch (e) {
      console.error(e);
      alert('Could not retrieve full exam details.');
    }
  };

  const toggleFormat = (f) => {
    setHwFormats(prev => prev.includes(f) ? prev.filter(item => item !== f) : [...prev, f]);
  };

  const addHomeworkItem = () => {
    const titleVal = hwTitle.trim() || `Homework ${homeworkList.length + 1}: ${lessonTitle.trim() || 'Lesson'}`;
    const newItem = {
      title: titleVal,
      subject: hwSubject,
      numQuestions: hwQuestions,
      startingDifficulty: hwDifficulty,
      examFormat: hwFormats,
      timeLimitStyle: hwTimeStyle,
      timeLimitValue: hwTimeValue,
      stressMode: hwStress,
      dueDate: hwDueDate ? new Date(hwDueDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    setHomeworkList([...homeworkList, newItem]);
    
    // Reset temporary form states to defaults
    setHwTitle('');
    setHwSubject('Math');
    setHwQuestions(5);
    setHwDifficulty(5);
    setHwFormats(['short_answer']);
    setHwTimeStyle('whole_test');
    setHwTimeValue(30);
    setHwStress('none');
    setHwDueDate('');
  };

  const removeHomeworkItem = (index) => {
    setHomeworkList(homeworkList.filter((_, i) => i !== index));
  };

  if (user?.user_role !== 'teacher' && user?.user_role !== 'admin') {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '500px', margin: '4rem auto' }}>
        <h3 style={{ color: 'var(--danger)' }}>Access Denied</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Only coaches and admins can access this page.</p>
        <button className="btn btn-outline" style={{ marginTop: '1.5rem' }} onClick={onBack}>Go Back</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
        <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
        <h3>Loading Teacher Portal...</h3>
      </div>
    );
  }

  const { orgStudents = [], claimedStudentIds = [], lessons = [], assignments = [], submissions = [], collectiveStats = {} } = data || {};

  const myStudentsList = orgStudents.filter(s => claimedStudentIds.includes(s.user_id));

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={32} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <div>
            <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.15rem', lineHeight: '1.2' }}>
              Teacher Dashboard
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Organization: <strong>{user.user_organization}</strong>
            </p>
          </div>
        </div>
        <button className="btn btn-outline" onClick={onBack}>
          Practice Mode
        </button>
      </div>

      {/* Main columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap' }}>
        
        {/* Column 1: My Students */}
        <div className="glass-panel" style={{ padding: 'var(--panel-padding)', height: '100%', minHeight: '380px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} color="var(--accent-primary)" />
              {viewAllStudents ? 'All Organization Students' : 'My Students'}
            </h3>
            <button className="btn btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setViewAllStudents(!viewAllStudents)}>
              {viewAllStudents ? 'View My Students' : 'View All Students'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            {(viewAllStudents ? orgStudents : myStudentsList).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {viewAllStudents ? 'No students found in the organization.' : 'You have not claimed any students yet. Click View All Students to claim your roster.'}
              </p>
            ) : (
              (viewAllStudents ? orgStudents : myStudentsList).map(student => {
                const isClaimed = claimedStudentIds.includes(student.user_id);
                return (
                  <div
                    key={student.user_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-tertiary)',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: studentAnalyticsUser?.user_id === student.user_id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div 
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} 
                      onClick={() => {
                        setSelectedStudent(student.user_id);
                        setStudentAnalyticsUser({
                          user_id: student.user_id,
                          math_rating: student.math_rating,
                          physics_rating: student.physics_rating,
                          chemistry_rating: student.chemistry_rating
                        });
                      }}
                    >
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{student.user_id}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Math: {student.math_rating} | Phys: {student.physics_rating} | Chem: {student.chemistry_rating}
                      </span>
                    </div>
                    
                    <button
                      className={`btn ${isClaimed ? 'btn-outline' : 'btn-primary'}`}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto' }}
                      onClick={() => handleClaimStudent(student.user_id, isClaimed)}
                    >
                      {isClaimed ? 'Unclaim' : 'Claim'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: My Lessons */}
        <div className="glass-panel" style={{ padding: 'var(--panel-padding)', height: '100%', minHeight: '380px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={20} color="var(--accent-primary)" /> My Lessons
            </h3>
            <button className="btn btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => setShowLessonModal(true)}>
              <Plus size={14} /> Create Lesson
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {lessons.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No lessons created yet. Start by planning your first classroom topic!</p>
            ) : (
              lessons.map(lesson => {
                const lessonHws = assignments.filter(a => a.lesson_id === lesson.lesson_id);
                return (
                  <div key={lesson.lesson_id} style={{ background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ color: 'var(--accent-primary)', fontSize: '0.95rem' }}>{lesson.title}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(lesson.created_at?.value || lesson.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                      {lesson.description}
                    </p>
                    
                    {lessonHws.length > 0 && (
                      <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Assigned Homework:</span>
                        {lessonHws.map(hw => {
                          const doneCount = submissions.filter(s => s.assignment_id === hw.assignment_id).length;
                          return (
                            <div key={hw.assignment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              <span>{hw.title} ({hw.subject})</span>
                              <span style={{ color: doneCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                {doneCount} completed
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Selected Student Analytics Area */}
      {studentAnalyticsUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto', zIndex: 1001 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '95%', maxWidth: '1000px', marginBottom: '5vh', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="text-gradient" style={{ fontSize: '1.25rem', margin: 0 }}>
                Student Analytics: {selectedStudent}
              </h3>
              <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => { setStudentAnalyticsUser(null); setSelectedStudent(null); }}>
                Close Student Dashboard
              </button>
            </div>
            <AnalyticsDashboard
              user={studentAnalyticsUser}
              onBack={() => {}}
              onReviewExam={handleReviewExam}
            />
          </div>
        </div>
      )}

      {/* Overall Class Averages section */}
      <div className="glass-panel" style={{ padding: 'var(--panel-padding)' }}>
        <h3 className="text-gradient" style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={24} /> Overall Class Analytics ({myStudentsList.length} Claimed Students)
        </h3>

        {myStudentsList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Claim students to view aggregate analytics.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Class Math Avg ELO</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{collectiveStats.avgMath}</span>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Class Physics Avg ELO</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{collectiveStats.avgPhys}</span>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Class Chemistry Avg ELO</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{collectiveStats.avgChem}</span>
              </div>
              <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Class Practice Index</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {collectiveStats.totalExams} tests ({collectiveStats.avgAccuracy}% acc)
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(74, 222, 128, 0.04)', border: '1px solid rgba(74, 222, 128, 0.15)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Collective Class Strengths</h4>
                {collectiveStats.strengths?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {collectiveStats.strengths.map((s, i) => (
                      <span key={i} style={{ background: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {s.topic} ({s.subject})
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Class data is insufficient to identify strengths.</span>
                )}
              </div>

              <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(248, 113, 113, 0.04)', border: '1px solid rgba(248, 113, 113, 0.15)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Collective Class Weaknesses</h4>
                {collectiveStats.weaknesses?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {collectiveStats.weaknesses.map((w, i) => (
                      <span key={i} style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--danger)', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {w.topic} ({w.subject})
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Class data is insufficient to identify weaknesses.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Review Past Exam Modal */}
      {reviewExam && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto', zIndex: 1001 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '800px', marginBottom: '5vh', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>
                Review Exam: <strong style={{ color: 'var(--accent-primary)' }}>{reviewExam.subject}</strong> (Acc: {Math.round(reviewExam.accuracy * 100)}%)
              </h3>
              <button className="btn btn-outline" style={{ padding: '0.3rem 0.75rem' }} onClick={() => setReviewExam(null)}>Close</button>
            </div>

            {reviewExam.mistakePatterns && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldAlert size={16} /> AI mistake analysis / Pattern gaps:
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {reviewExam.mistakePatterns}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reviewExam.results.map((r, idx) => (
                <div key={r.id || idx} style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Q{idx + 1} - {r.topic || 'General'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {r.isCorrect ? <CheckCircle size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
                      <span style={{ fontSize: '0.8rem', color: r.isCorrect ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                        {r.isCorrect ? 'Correct' : 'Incorrect'} ({r.score !== undefined ? Math.round(r.score * 100) : 0}% credit)
                      </span>
                    </div>
                  </div>

                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
                    {r.question}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>Student Answer:</span>
                      <strong style={{ color: r.isCorrect ? 'var(--success)' : 'var(--danger)' }}>{r.userAnswer || '(none)'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>Correct Answer:</span>
                      <strong style={{ color: 'var(--success)' }}>{r.answer}</strong>
                    </div>
                  </div>

                  {r.feedback && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', borderLeft: '3px solid var(--accent-primary)', paddingLeft: '0.75rem', color: 'var(--text-secondary)' }}>
                      <strong>AI Grading Note:</strong> {r.feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Lesson Modal */}
      {showLessonModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '8vh', overflowY: 'auto', zIndex: 1001 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '600px', marginBottom: '8vh', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-gradient" style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>Create New Lesson</h3>
            {lessonError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '1rem' }}>{lessonError}</p>}
            
            <form onSubmit={handleCreateLesson} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Lesson Title</label>
                <input
                  type="text"
                  placeholder="E.g., Intro to Combinatorics"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  className="input-field"
                  disabled={lessonLoading}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Lesson Description / Syllabus</label>
                <textarea
                  placeholder="Describe what was taught in this session..."
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                  className="input-field"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  disabled={lessonLoading}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input
                  type="checkbox"
                  id="assignHw"
                  checked={assignHomework}
                  onChange={(e) => setAssignHomework(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                />
                <label htmlFor="assignHw" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Assign Homework Mock Exam?
                </label>
              </div>

              {assignHomework && (
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  
                  {/* List of currently added homework items */}
                  {homeworkList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Added Homework Mock Exams ({homeworkList.length}):</span>
                      {homeworkList.map((hw, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{hw.title}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {hw.subject} | {hw.numQuestions} Qs | Diff: {hw.startingDifficulty} | {hw.stressMode === 'none' ? 'No Stress' : `${hw.stressMode} stress`}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                            onClick={() => removeHomeworkItem(idx)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent-primary)' }}>
                    {homeworkList.length > 0 ? 'Add Another Mock Exam' : 'Configure Mock Exam'}
                  </h4>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Assignment Title</label>
                    <input
                      type="text"
                      placeholder="E.g., Chapter Sprint Homework"
                      value={hwTitle}
                      onChange={(e) => setHwTitle(e.target.value)}
                      className="input-field"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Subject</label>
                      <select value={hwSubject} onChange={(e) => setHwSubject(e.target.value)} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                        <option value="Math">Math</option>
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Questions count</label>
                      <input type="number" min="1" max="60" value={hwQuestions} onChange={(e) => setHwQuestions(Number(e.target.value))} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start Difficulty (1-10)</label>
                      <input type="number" min="1" max="10" value={hwDifficulty} onChange={(e) => setHwDifficulty(Number(e.target.value))} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stress Mode</label>
                      <select value={hwStress} onChange={(e) => setHwStress(e.target.value)} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                        <option value="none">None</option>
                        <option value="hidden">Hidden Clock</option>
                        <option value="strict">Strict Auto-skip</option>
                        <option value="dynamic">Dynamic Speedup</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Exam Format (Select one or more)</label>
                    <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      {['multiple_choice', 'short_answer', 'free_response'].map(f => (
                        <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={hwFormats.includes(f)} onChange={() => toggleFormat(f)} style={{ accentColor: 'var(--accent-primary)' }} />
                          <span style={{ textTransform: 'capitalize' }}>{f.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Timer Style</label>
                      <select value={hwTimeStyle} onChange={(e) => setHwTimeStyle(e.target.value)} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                        <option value="per_question">Per Question (sec)</option>
                        <option value="whole_test">Whole Test (min)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Timer Value</label>
                      <input type="number" min="1" value={hwTimeValue} onChange={(e) => setHwTimeValue(Number(e.target.value))} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Due Date & Time</label>
                    <input
                      type="datetime-local"
                      value={hwDueDate}
                      onChange={(e) => setHwDueDate(e.target.value)}
                      className="input-field"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                      required={assignHomework && homeworkList.length === 0}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ marginTop: '0.25rem', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', fontSize: '0.85rem', padding: '0.4rem' }}
                    onClick={addHomeworkItem}
                  >
                    + Add Mock Exam to Homework List
                  </button>

                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowLessonModal(false); setLessonError(''); setHomeworkList([]); }} disabled={lessonLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={lessonLoading}>
                  {lessonLoading ? <Loader2 size={16} className="animate-spin" /> : null} Publish Lesson
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
