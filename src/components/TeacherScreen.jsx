import { useState, useEffect, useRef } from 'react';
import { Users, BookOpen, Plus, Loader2, Award, ShieldAlert, CheckCircle, XCircle, Sparkles, Send, Trash2 } from 'lucide-react';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { StudentAIInsights } from './StudentAIInsights';
import { ChemicalText, isSmiles, SmilesRenderer } from './ChemicalText';

// Chatbot Vercel function
async function sendChatMessage({ message, teacherId, selectedStudentIds, sessionId, accessToken, history }) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: message,
        // FORCE LOWERCASE AND TRIM TO MATCH VERCEL'S SANITIZED ACCESS TOKEN CLAIM
        teacherId: teacherId ? teacherId.trim().toLowerCase() : teacherId,
        // If no students are explicitly selected, pass null so the worker triggers class aggregation
        studentId: selectedStudentIds && selectedStudentIds.length > 0 ? selectedStudentIds : null,
        sessionId: sessionId,
        history: history
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Chat API error response:', response.status, errBody);
      throw new Error(`HTTP error! status: ${response.status} body: ${errBody}`);
    }

    const data = await response.ok ? await response.json() : {};
    if (data._debug) {
      console.log('[Chat API Debug]', data._debug);
    }
    return data.response; // This is the text response from the Gemini API
  } catch (error) {
    console.error('Error communicating with chatbot API:', error);
    return 'Sorry, I encountered an error processing that data request.';
  }
}

export function TeacherScreen({ user, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chatbot states
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Hello! I am your AI teaching assistant. Ask me anything about your class or select specific students to analyze their performance, strengths, or weaknesses.', timestamp: new Date() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatScope, setChatScope] = useState('class'); // 'class' or 'students'
  const [chatSelectedStudents, setChatSelectedStudents] = useState([]);
  const [chatSessionId, setChatSessionId] = useState(() => 'sess_' + Math.random().toString(36).substring(2, 9));
  const [isMobile, setIsMobile] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');

    // Add user message to chat history
    const updatedMessages = [...chatMessages, { sender: 'user', text: userMsg, timestamp: new Date() }];
    setChatMessages(updatedMessages);
    setChatLoading(true);

    // If scope is 'class', pass all claimed student IDs
    const selectedIds = chatScope === 'class' ? (data?.claimedStudentIds || []) : chatSelectedStudents.map(s => s.user_id || s);

    try {
      const aiResponse = await sendChatMessage({
        message: userMsg,
        teacherId: user.user_id,
        selectedStudentIds: selectedIds,
        sessionId: chatSessionId,
        accessToken,
        history: chatMessages
      });

      setChatMessages(prev => [...prev, { sender: 'ai', text: aiResponse, timestamp: new Date() }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'ai', text: 'Sorry, I encountered an error processing that request.', timestamp: new Date() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const parseDate = (d) => {
    if (!d) return null;
    const val = typeof d === 'object' && d.value ? d.value : d;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  };

  // Roster view state
  const [viewAllStudents, setViewAllStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentAnalyticsUser, setStudentAnalyticsUser] = useState(null);

  // Exam Review Modal state
  const [reviewExam, setReviewExam] = useState(null);

  // Selected Topic Details state
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);

  // Create Lesson Modal state
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [assignHomework, setAssignHomework] = useState(false);

  // Selected Lesson Details Modal state
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Homework config state
  const [homeworkList, setHomeworkList] = useState([]);
  const [hwTitle, setHwTitle] = useState('');
  const [hwSubject, setHwSubject] = useState('Math');
  const [hwQuestions, setHwQuestions] = useState(5);
  const [hwDifficulty, setHwDifficulty] = useState(5);
  const [hwFormats, setHwFormats] = useState(['short_answer']);
  const [hwTimeStyle, setHwTimeStyle] = useState('whole_test');
  const [hwTimeValue, setHwTimeValue] = useState(30);
  const [hwQuestionsPerSet, setHwQuestionsPerSet] = useState(2);
  const [hwStress, setHwStress] = useState('none');
  const [hwDueDate, setHwDueDate] = useState('');
  const [hwContentBased, setHwContentBased] = useState(true);
  const [hwPreset, setHwPreset] = useState('custom');

  const handleApplyHwPreset = (preset) => {
    setHwPreset(preset);
    if (preset === 'custom') return;

    const configMap = {
      amc8: {
        title: 'AMC 8 Mock Exam',
        subject: 'Math',
        numQuestions: 25,
        startingDifficulty: 3,
        examFormat: ['multiple_choice'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 40,
      },
      amc10: {
        title: 'AMC 10 Mock Exam',
        subject: 'Math',
        numQuestions: 25,
        startingDifficulty: 4,
        examFormat: ['multiple_choice'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 75,
      },
      amc12: {
        title: 'AMC 12 Mock Exam',
        subject: 'Math',
        numQuestions: 25,
        startingDifficulty: 5,
        examFormat: ['multiple_choice'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 75,
      },
      math_chapter_sprint: {
        title: 'MATHCOUNTS Chapter Sprint',
        subject: 'Math',
        numQuestions: 30,
        startingDifficulty: 1,
        examFormat: ['short_answer'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 40,
      },
      math_state_sprint: {
        title: 'MATHCOUNTS State Sprint',
        subject: 'Math',
        numQuestions: 30,
        startingDifficulty: 2,
        examFormat: ['short_answer'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 40,
      },
      math_nationals_sprint: {
        title: 'MATHCOUNTS Nationals Sprint',
        subject: 'Math',
        numQuestions: 30,
        startingDifficulty: 3,
        examFormat: ['short_answer'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 40,
      },
      math_chapter_target: {
        title: 'MATHCOUNTS Chapter Target',
        subject: 'Math',
        numQuestions: 8,
        startingDifficulty: 2,
        examFormat: ['short_answer'],
        timeLimitStyle: 'per_set',
        timeLimitValue: 6,
        questionsPerSet: 2,
      },
      math_state_target: {
        title: 'MATHCOUNTS State Target',
        subject: 'Math',
        numQuestions: 8,
        startingDifficulty: 3,
        examFormat: ['short_answer'],
        timeLimitStyle: 'per_set',
        timeLimitValue: 6,
        questionsPerSet: 2,
      },
      math_nationals_target: {
        title: 'MATHCOUNTS Nationals Target',
        subject: 'Math',
        numQuestions: 8,
        startingDifficulty: 4,
        examFormat: ['short_answer'],
        timeLimitStyle: 'per_set',
        timeLimitValue: 6,
        questionsPerSet: 2,
      },
      chem_part_1: {
        title: 'Chemistry Part I Mock Exam',
        subject: 'Chemistry',
        numQuestions: 60,
        startingDifficulty: 4,
        examFormat: ['multiple_choice'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 90,
      },
      chem_acs_lse: {
        title: 'Chemistry ACS LSE Mock Exam',
        subject: 'Chemistry',
        numQuestions: 60,
        startingDifficulty: 2,
        examFormat: ['multiple_choice'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 110,
      },
      chem_part_2: {
        title: 'Chemistry Part II Mock Exam',
        subject: 'Chemistry',
        numQuestions: 8,
        startingDifficulty: 5,
        examFormat: ['free_response'],
        timeLimitStyle: 'whole_test',
        timeLimitValue: 105,
      },
    };

    const cfg = configMap[preset];
    if (cfg) {
      setHwTitle(cfg.title);
      setHwSubject(cfg.subject);
      setHwQuestions(cfg.numQuestions);
      setHwDifficulty(cfg.startingDifficulty);
      setHwFormats(cfg.examFormat);
      setHwTimeStyle(cfg.timeLimitStyle);
      setHwTimeValue(cfg.timeLimitValue);
      setHwQuestionsPerSet(cfg.questionsPerSet || 2);
    }
  };

  // Shared questions state
  const [hwSharedQuestions, setHwSharedQuestions] = useState([]);
  const [showAddSharedQuestion, setShowAddSharedQuestion] = useState(false);
  const [sharedQType, setSharedQType] = useState('multiple_choice');
  const [sharedQTopic, setSharedQTopic] = useState('');
  const [sharedQText, setSharedQText] = useState('');
  const [sharedQOptions, setSharedQOptions] = useState(['', '', '', '']);
  const [sharedQAnswer, setSharedQAnswer] = useState('');
  const [sharedQDifficulty, setSharedQDifficulty] = useState(5);
  const [sharedQSolution, setSharedQSolution] = useState('');

  const [lessonError, setLessonError] = useState('');
  const [lessonLoading, setLessonLoading] = useState(false);

  // Tailored homework questions state & handlers
  const [tailoredQuestionsMap, setTailoredQuestionsMap] = useState({});
  const [editingStudentHwKey, setEditingStudentHwKey] = useState(null); // "assignmentId:studentId"
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [loadingTailoredHwKey, setLoadingTailoredHwKey] = useState(null);

  const handleLoadTailoredQuestions = async (assignmentId, studentId) => {
    const key = `${assignmentId}:${studentId}`;
    setLoadingTailoredHwKey(key);
    try {
      const res = await fetch(`/api/teacher-data?route=homework-questions&assignmentId=${assignmentId}`);
      if (!res.ok) throw new Error('Failed to fetch tailored questions');
      const d = await res.json();

      const studentEntry = d.questions.find(q => q.studentId === studentId);
      if (studentEntry) {
        setTailoredQuestionsMap(prev => ({
          ...prev,
          [key]: studentEntry.questions
        }));
      } else {
        setTailoredQuestionsMap(prev => ({
          ...prev,
          [key]: [] // empty or not generated yet
        }));
      }
    } catch (err) {
      console.error(err);
      alert('Error loading tailored questions.');
    } finally {
      setLoadingTailoredHwKey(null);
    }
  };

  const handleStartEditTailoredQuestions = (assignmentId, studentId, currentQs) => {
    setEditingStudentHwKey(`${assignmentId}:${studentId}`);
    setEditingQuestions(JSON.parse(JSON.stringify(currentQs)));
  };

  const handleSaveTailoredQuestions = async (assignmentId, studentId) => {
    const key = `${assignmentId}:${studentId}`;
    try {
      const res = await fetch('/api/teacher-data?route=homework-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          studentId,
          questions: editingQuestions
        })
      });
      if (res.ok) {
        setTailoredQuestionsMap(prev => ({
          ...prev,
          [key]: editingQuestions
        }));
        setEditingStudentHwKey(null);
        alert('Tailored questions saved successfully!');
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to save tailored questions.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving tailored questions.');
    }
  };

  const handleUpdateEditingQuestionField = (qIdx, field, val) => {
    setEditingQuestions(prev => {
      const next = [...prev];
      next[qIdx] = { ...next[qIdx], [field]: val };
      return next;
    });
  };

  const handleUpdateEditingQuestionOption = (qIdx, optIdx, val) => {
    setEditingQuestions(prev => {
      const next = [...prev];
      const q = { ...next[qIdx] };
      const opts = [...(q.options || ['', '', '', ''])];
      opts[optIdx] = val;
      q.options = opts;
      next[qIdx] = q;
      return next;
    });
  };

  const fetchTeacherData = () => {
    if (!user) return;
    fetch(`/api/teacher-data?username=${encodeURIComponent(user.user_id)}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load teacher portal');
        return r.json();
      })
      .then(d => {
        setData(d);
        if (d.accessToken) {
          setAccessToken(d.accessToken);
        }
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
  }, [user?.user_id]);

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

      if (isEditing) {
        payload.lessonId = editingLessonId;
      }

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
            questionsPerSet: hwQuestionsPerSet,
            stressMode: hwStress,
            contentBased: hwContentBased,
            dueDate: hwDueDate ? new Date(hwDueDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            sharedQuestions: hwSharedQuestions
          });
        }
        payload.homework = finalHomework;
      }

      const url = '/api/lessons';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowLessonModal(false);
        setIsEditing(false);
        setEditingLessonId(null);
        setLessonTitle('');
        setLessonDescription('');
        setAssignHomework(false);
        setHomeworkList([]);
        setHwTitle('');
        setHwDueDate('');
        setHwSharedQuestions([]);
        setHwPreset('custom');
        fetchTeacherData();
      } else {
        const d = await res.json();
        setLessonError(d.error || `Failed to ${isEditing ? 'update' : 'create'} lesson.`);
      }
    } catch (err) {
      console.error(err);
      setLessonError(`Connection error ${isEditing ? 'updating' : 'creating'} lesson.`);
    } finally {
      setLessonLoading(false);
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!confirm('Are you sure you want to delete this lesson plan? This will automatically delete all associated homework assignments.')) {
      return;
    }
    try {
      const res = await fetch(`/api/lessons?lessonId=${encodeURIComponent(lessonId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedLesson(null);
        fetchTeacherData();
      } else {
        alert('Failed to delete lesson.');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting lesson.');
    }
  };

  const handleStartEditLesson = (lesson) => {
    setIsEditing(true);
    setEditingLessonId(lesson.lesson_id);
    setLessonTitle(lesson.title);
    setLessonDescription(lesson.description);

    // Get current homework assignments for this lesson
    const lessonHws = assignments
      .filter(a => a.lesson_id === lesson.lesson_id)
      .map(hw => ({
        assignment_id: hw.assignment_id,
        title: hw.title,
        subject: hw.subject,
        numQuestions: hw.num_questions !== undefined ? hw.num_questions : hw.numQuestions,
        startingDifficulty: hw.starting_difficulty !== undefined ? hw.starting_difficulty : hw.startingDifficulty,
        examFormat: (hw.exam_format || hw.examFormat || 'multiple_choice').includes(',') ? (hw.exam_format || hw.examFormat).split(',') : [hw.exam_format || hw.examFormat || 'multiple_choice'],
        timeLimitStyle: hw.time_limit_style || hw.timeLimitStyle || 'whole_test',
        timeLimitValue: hw.time_limit_value !== undefined ? hw.time_limit_value : hw.timeLimitValue || 30,
        questionsPerSet: hw.questions_per_set !== undefined ? hw.questions_per_set : hw.questionsPerSet || 2,
        stressMode: hw.stress_mode || hw.stressMode || 'none',
        contentBased: (hw.content_based !== undefined ? hw.content_based : hw.contentBased) !== false,
        dueDate: (() => {
          const dObj = parseDate(hw.due_date || hw.dueDate);
          return dObj ? dObj.toISOString().slice(0, 16) : '';
        })(),
        sharedQuestions: hw.shared_questions_json ? JSON.parse(hw.shared_questions_json) : []
      }));

    setHomeworkList(lessonHws);
    setAssignHomework(lessonHws.length > 0);

    // Clear draft fields
    setHwTitle('');
    setHwDueDate('');
    setHwSharedQuestions([]);
    setHwPreset('custom');

    // Close details view and open modal
    setSelectedLesson(null);
    setShowLessonModal(true);
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
    setHwPreset('custom');
  };

  const handleAddSharedQuestion = () => {
    if (!sharedQText.trim()) {
      alert('Question text is required.');
      return;
    }
    if (sharedQType === 'multiple_choice') {
      if (sharedQOptions.some(o => !o.trim())) {
        alert('All 4 options are required for multiple choice.');
        return;
      }
      if (!sharedQAnswer) {
        alert('Please select a correct option.');
        return;
      }
      if (!['A', 'B', 'C', 'D'].includes(sharedQAnswer.toUpperCase())) {
        alert('Correct answer must be A, B, C, or D.');
        return;
      }
    } else if (sharedQType === 'short_answer') {
      if (!sharedQAnswer.trim()) {
        alert('Correct answer is required for short answer.');
        return;
      }
    }

    const newQ = {
      id: `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type: sharedQType,
      topic: sharedQTopic.trim() || 'General',
      question: sharedQText.trim(),
      difficulty: Number(sharedQDifficulty) || 5,
      detailedSolution: sharedQSolution.trim() || 'No detailed solution provided.',
      answer: sharedQType === 'multiple_choice' ? sharedQAnswer.toUpperCase() : sharedQAnswer.trim(),
      ...(sharedQType === 'multiple_choice' ? { options: sharedQOptions.map(o => o.trim()) } : {}),
      ...(sharedQType === 'short_answer' ? { keywordExpression: `'${sharedQAnswer.trim()}'` } : {})
    };

    setHwSharedQuestions([...hwSharedQuestions, newQ]);

    // Reset inputs
    setSharedQTopic('');
    setSharedQText('');
    setSharedQOptions(['', '', '', '']);
    setSharedQAnswer('');
    setSharedQDifficulty(5);
    setSharedQSolution('');
    setShowAddSharedQuestion(false);
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
      questionsPerSet: hwQuestionsPerSet,
      stressMode: hwStress,
      contentBased: hwContentBased,
      dueDate: hwDueDate ? new Date(hwDueDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      sharedQuestions: hwSharedQuestions
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
    setHwQuestionsPerSet(2);
    setHwStress('none');
    setHwContentBased(true);
    setHwDueDate('');
    setHwSharedQuestions([]);
    setHwPreset('custom');
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
              <strong>{user.user_organization}</strong>
            </p>
          </div>
        </div>
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
                return (
                  <div key={lesson.lesson_id} className="lesson-card" onClick={() => setSelectedLesson(lesson)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--accent-primary)', fontSize: '0.95rem' }}>{lesson.title}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(lesson.created_at?.value || lesson.created_at).toLocaleDateString()}
                      </span>
                    </div>
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
            <StudentAIInsights
              studentId={selectedStudent}
              teacherId={user.user_id}
            />
            <AnalyticsDashboard
              user={studentAnalyticsUser}
              onBack={() => { }}
              onReviewExam={handleReviewExam}
            />
          </div>
        </div>
      )}

      {/* AI Student Advisor Chatbot */}
      <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Sparkles size={24} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h3 className="text-gradient" style={{ margin: 0, fontSize: '1.5rem' }}>AI Teaching Assistant</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Ask about your students.</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }}></span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Ready</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2.5fr', gap: '1.5rem', alignItems: 'stretch' }}>

          {/* Left panel: Scope and selection */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.05)',
            borderBottom: isMobile ? '1px solid rgba(255,255,255,0.05)' : 'none',
            paddingRight: isMobile ? '0' : '1.5rem',
            paddingBottom: isMobile ? '1.5rem' : '0'
          }}>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setChatScope('class')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    background: chatScope === 'class' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-tertiary)',
                    border: chatScope === 'class' ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: chatScope === 'class' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Whole Class</span>
                </button>

                <button
                  type="button"
                  onClick={() => setChatScope('students')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    background: chatScope === 'students' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-tertiary)',
                    border: chatScope === 'students' ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: chatScope === 'students' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>Specific Students</span>
                </button>
              </div>
            </div>

            {chatScope === 'students' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>Select Students ({chatSelectedStudents.length})</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setChatSelectedStudents(myStudentsList.map(s => s.user_id))}
                      style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}
                    >
                      Select All
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setChatSelectedStudents([])}
                      style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}>
                  {myStudentsList.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.5rem', textAlign: 'center', fontStyle: 'italic' }}>
                      No claimed students.
                    </span>
                  ) : (
                    myStudentsList.map(student => {
                      const isChecked = chatSelectedStudents.includes(student.user_id);
                      return (
                        <label
                          key={student.user_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            padding: '0.3rem 0.5rem',
                            borderRadius: '4px',
                            background: isChecked ? 'rgba(255,255,255,0.02)' : 'transparent',
                            transition: 'background 0.2s'
                          }}
                        >
                          <input
                            type="checkbox"
                            value={student.user_id}
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setChatSelectedStudents(prev =>
                                checked ? [...prev, student.user_id] : prev.filter(id => id !== student.user_id)
                              );
                            }}
                            style={{
                              width: '15px',
                              height: '15px',
                              accentColor: 'var(--accent-primary)',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ fontSize: '0.8rem', color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {student.user_id}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {chatScope === 'class' && (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius-sm)',
                padding: '1rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                flex: 1
              }}>
                <div>
                  <Users size={24} style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem', opacity: 0.7 }} />
                  <p>Analyzing entire class aggregates.</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>No individual student checkboxes will be sent.</p>
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button
                type="button"
                onClick={() => {
                  setChatMessages([{ sender: 'ai', text: 'Hello! I am your AI teaching assistant. Ask me anything about your class or select specific students to analyze their performance, strengths, or weaknesses.', timestamp: new Date() }]);
                  setChatSessionId('sess_' + Math.random().toString(36).substring(2, 9));
                }}
                className="btn btn-outline"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <Trash2 size={14} /> Clear Chat History
              </button>
            </div>
          </div>

          {/* Right panel: Chat messages and input */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '380px' }}>

            {/* Messages box */}
            <div style={{
              flex: 1,
              background: 'rgba(0,0,0,0.15)',
              border: '1px solid rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              overflowY: 'auto',
              maxHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              {chatMessages.map((msg, index) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      width: '100%'
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      padding: '0.75rem 1rem',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isUser
                        ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))'
                        : 'var(--bg-tertiary)',
                      border: isUser ? 'none' : '1px solid rgba(255,255,255,0.06)',
                      boxShadow: isUser ? '0 2px 8px rgba(99,102,241,0.2)' : 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      lineHeight: '1.4',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {!isUser ? (
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}>
                          <Sparkles size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
                          <ChemicalText text={msg.text} theme="dark" />
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                );
              })}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '16px 16px 16px 4px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                    <span>AI is analyzing data...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <textarea
                placeholder={chatScope === 'class' ? "Ask AI about class-wide performance..." : "Ask AI about selected students..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="input-field"
                disabled={chatLoading}
                style={{
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9rem',
                  flex: 1,
                  resize: 'none',
                  minHeight: '44px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  lineHeight: '1.4',
                  fontFamily: 'inherit'
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Overall Class Averages section */}
      <div className="glass-panel" style={{ padding: 'var(--panel-padding)' }}>
        <h3 className="text-gradient" style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Class Analytics
        </h3>

        {myStudentsList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Claim students to view aggregate analytics.</p>
        ) : (
          <AnalyticsDashboard
            user={{
              user_id: claimedStudentIds.join(','),
              math_rating: collectiveStats.avgMath,
              physics_rating: collectiveStats.avgPhys,
              chemistry_rating: collectiveStats.avgChem
            }}
            hideHistory={true}
            onReviewExam={handleReviewExam}
          />
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
                  <ChemicalText text={reviewExam.mistakePatterns} theme="dark" />
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
                        {r.isCorrect ? 'Correct' : 'Incorrect'} ({r.score !== undefined ? Math.round(r.score * 100) : (r.isCorrect ? 100 : 0)}% credit)
                      </span>
                    </div>
                  </div>

                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
                    <ChemicalText text={r.question} theme="dark" />
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>Student Answer:</span>
                      <span style={{ color: r.isCorrect ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                        {(() => {
                          const ans = r.userAnswer;
                          if (r.type === 'multiple_choice' && r.options && Array.isArray(r.options)) {
                            const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(ans).trim().toUpperCase());
                            if (letterIdx !== -1 && r.options[letterIdx]) {
                              const opt = r.options[letterIdx];
                              return isSmiles(opt) ? <SmilesRenderer smiles={opt} width={70} height={70} theme="dark" /> : <ChemicalText text={opt} theme="dark" defaultWidth={70} defaultHeight={70} />;
                            }
                          }
                          return isSmiles(ans) ? <SmilesRenderer smiles={ans} width={70} height={70} theme="dark" /> : <ChemicalText text={ans} theme="dark" defaultWidth={70} defaultHeight={70} />;
                        })()}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>Correct Answer:</span>
                      <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                        {(() => {
                          const ans = r.answer;
                          if (r.type === 'multiple_choice' && r.options && Array.isArray(r.options)) {
                            const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(ans).trim().toUpperCase());
                            if (letterIdx !== -1 && r.options[letterIdx]) {
                              const opt = r.options[letterIdx];
                              return isSmiles(opt) ? <SmilesRenderer smiles={opt} width={70} height={70} theme="dark" /> : <ChemicalText text={opt} theme="dark" defaultWidth={70} defaultHeight={70} />;
                            }
                          }
                          return isSmiles(ans) ? <SmilesRenderer smiles={ans} width={70} height={70} theme="dark" /> : <ChemicalText text={ans} theme="dark" defaultWidth={70} defaultHeight={70} />;
                        })()}
                      </span>
                    </div>
                  </div>

                  {r.feedback && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', borderLeft: '3px solid var(--accent-primary)', paddingLeft: '0.75rem', color: 'var(--text-secondary)' }}>
                      <strong>AI Grading Note:</strong> <ChemicalText text={r.feedback} theme="dark" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lesson Details Modal */}
      {selectedLesson && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto', zIndex: 1001 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '750px', marginBottom: '5vh', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--accent-primary)' }}>
                Lesson Plan: {selectedLesson.title}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-outline" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleStartEditLesson(selectedLesson)}>Edit</button>
                <button className="btn btn-outline" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => handleDeleteLesson(selectedLesson.lesson_id)}>Delete</button>
                <button className="btn btn-outline" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setSelectedLesson(null)}>Close</button>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                CREATED ON: {new Date(selectedLesson.created_at?.value || selectedLesson.created_at).toLocaleDateString()}
              </span>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)' }}>
                {selectedLesson.description}
              </p>
            </div>

            <h4 className="text-gradient" style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem' }}>
              Homework Assignments
            </h4>

            {(() => {
              const lessonHws = assignments.filter(a => a.lesson_id === selectedLesson.lesson_id);
              if (lessonHws.length === 0) {
                return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No homework assigned for this lesson.</p>;
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {lessonHws.map(hw => {
                    const hwSubmissions = submissions.filter(s => s.assignment_id === hw.assignment_id && claimedStudentIds.includes(s.user_id));
                    const completedUserIds = hwSubmissions.map(s => s.user_id);
                    const incompleteStudents = myStudentsList.filter(student => !completedUserIds.includes(student.user_id));

                    return (
                      <div key={hw.assignment_id} style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{hw.title}</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.1rem' }}>
                              Subject: {hw.subject} | {hw.num_questions ?? hw.numQuestions} Qs | Start Diff: {hw.starting_difficulty ?? hw.startingDifficulty}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Due: {(() => {
                              const dObj = parseDate(hw.due_date || hw.dueDate);
                              return dObj ? dObj.toLocaleDateString() + ' ' + dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No due date';
                            })()}
                          </span>
                        </div>

                        {/* Completed Students list */}
                        <div style={{ marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold', display: 'block', marginBottom: '0.35rem' }}>
                            Completed ({hwSubmissions.length})
                          </span>
                          {hwSubmissions.length === 0 ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No students completed yet.</span>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                              {hwSubmissions.map(sub => (
                                <div key={sub.user_id} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>{sub.user_id}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                      Acc: {Math.round(sub.accuracy * 100)}% | ELO: {sub.rating_change !== undefined ? (sub.rating_change >= 0 ? `+${sub.rating_change}` : sub.rating_change) : 'N/A'}
                                    </span>
                                  </div>
                                  <button
                                    className="btn btn-outline"
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto' }}
                                    onClick={() => handleReviewExam(sub)}
                                  >
                                    View
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Incomplete Students list */}
                        <div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 'bold', display: 'block', marginBottom: '0.35rem' }}>
                            Assigned / Not Completed ({incompleteStudents.length})
                          </span>
                          {incompleteStudents.length === 0 ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>All students have completed this assignment!</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {incompleteStudents.map(student => (
                                <span key={student.user_id} style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.15)', color: 'var(--warning)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  {student.user_id}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Student Tailored Questions editor */}
                        <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                            Student-Specific Tailored Questions
                          </span>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {myStudentsList.map(student => {
                              const key = `${hw.assignment_id}:${student.user_id}`;
                              const questions = tailoredQuestionsMap[key];
                              const isLoading = loadingTailoredHwKey === key;
                              const isEditing = editingStudentHwKey === key;

                              return (
                                <div key={student.user_id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{student.user_id}</strong>

                                    {!questions && !isLoading && (
                                      <button
                                        type="button"
                                        className="btn btn-outline"
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto' }}
                                        onClick={() => handleLoadTailoredQuestions(hw.assignment_id, student.user_id)}
                                      >
                                        Load Questions
                                      </button>
                                    )}

                                    {isLoading && (
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading...</span>
                                    )}

                                    {questions && !isEditing && (
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto' }}
                                          onClick={() => handleStartEditTailoredQuestions(hw.assignment_id, student.user_id, questions)}
                                        >
                                          Edit Questions
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto', color: 'var(--text-muted)' }}
                                          onClick={() => setTailoredQuestionsMap(prev => {
                                            const next = { ...prev };
                                            delete next[key];
                                            return next;
                                          })}
                                        >
                                          Collapse
                                        </button>
                                      </div>
                                    )}

                                    {isEditing && (
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto' }}
                                          onClick={() => handleSaveTailoredQuestions(hw.assignment_id, student.user_id)}
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', height: 'auto', minHeight: 'auto' }}
                                          onClick={() => setEditingStudentHwKey(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {questions && !isEditing && (
                                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                      {questions.length === 0 ? (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Questions are still generating in the background or failed to generate. Please try again in a few seconds.</span>
                                      ) : (
                                        questions.map((q, idx) => (
                                          <div key={q.id || idx} style={{ background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                                              <span>Q{idx + 1} ({q.topic || 'General'})</span>
                                              <span>Difficulty: {q.difficulty || 'N/A'} | Type: {q.type}</span>
                                            </div>
                                            <p style={{ margin: '0.25rem 0', color: 'var(--text-primary)' }}>{q.question}</p>
                                            {q.type === 'multiple_choice' && q.options && (
                                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {q.options.map((opt, oIdx) => (
                                                  <span key={oIdx}><strong>{['A', 'B', 'C', 'D'][oIdx]}:</strong> {opt}</span>
                                                ))}
                                              </div>
                                            )}
                                            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--success)' }}>
                                              <strong>Correct Answer:</strong> {q.answer}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}

                                  {isEditing && (
                                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                      {editingQuestions.map((q, idx) => (
                                        <div key={q.id || idx} style={{ background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>Question {idx + 1}</span>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Diff:</label>
                                              <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={q.difficulty || 5}
                                                onChange={(e) => handleUpdateEditingQuestionField(idx, 'difficulty', Number(e.target.value))}
                                                style={{ width: '45px', padding: '0.1rem 0.25rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem' }}
                                              />
                                            </div>
                                          </div>

                                          <div style={{ marginBottom: '0.5rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Topic</label>
                                            <input
                                              type="text"
                                              value={q.topic || ''}
                                              onChange={(e) => handleUpdateEditingQuestionField(idx, 'topic', e.target.value)}
                                              style={{ width: '100%', padding: '0.2rem 0.4rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem' }}
                                            />
                                          </div>

                                          <div style={{ marginBottom: '0.5rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Question Text</label>
                                            <textarea
                                              value={q.question || ''}
                                              onChange={(e) => handleUpdateEditingQuestionField(idx, 'question', e.target.value)}
                                              style={{ width: '100%', minHeight: '60px', padding: '0.2rem 0.4rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem', resize: 'vertical' }}
                                            />
                                          </div>

                                          {q.type === 'multiple_choice' && (
                                            <div style={{ marginBottom: '0.5rem' }}>
                                              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Options</label>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                {(q.options || ['', '', '', '']).map((opt, oIdx) => (
                                                  <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '15px' }}>{['A', 'B', 'C', 'D'][oIdx]}:</span>
                                                    <input
                                                      type="text"
                                                      value={opt}
                                                      onChange={(e) => handleUpdateEditingQuestionOption(idx, oIdx, e.target.value)}
                                                      style={{ flex: 1, padding: '0.2rem 0.4rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem' }}
                                                    />
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>Correct Answer</label>
                                            {q.type === 'multiple_choice' ? (
                                              <select
                                                value={q.answer}
                                                onChange={(e) => handleUpdateEditingQuestionField(idx, 'answer', e.target.value)}
                                                style={{ width: '100%', padding: '0.2rem 0.4rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem' }}
                                              >
                                                <option value="A">A</option>
                                                <option value="B">B</option>
                                                <option value="C">C</option>
                                                <option value="D">D</option>
                                              </select>
                                            ) : (
                                              <input
                                                type="text"
                                                value={q.answer}
                                                onChange={(e) => handleUpdateEditingQuestionField(idx, 'answer', e.target.value)}
                                                style={{ width: '100%', padding: '0.2rem 0.4rem', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.75rem' }}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Create Lesson Modal */}
      {showLessonModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '8vh', overflowY: 'auto', zIndex: 1001 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '600px', marginBottom: '8vh', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-gradient" style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>{isEditing ? 'Edit Lesson Plan' : 'Create New Lesson'}</h3>
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
                  Assigned Homework
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
                              {hw.subject} | {hw.numQuestions} Qs | Diff: {hw.startingDifficulty} | {hw.stressMode === 'none' ? 'No Stress' : `${hw.stressMode} stress`} | {hw.contentBased ? '📚 Content-based' : '🎲 Generic'}
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
                    {homeworkList.length > 0 ? 'Add Another Exam' : 'Configure Exam'}
                  </h4>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Use Preset</label>
                    <select
                      value={hwPreset}
                      onChange={(e) => handleApplyHwPreset(e.target.value)}
                      className="input-field"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', borderColor: hwPreset !== 'custom' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)' }}
                    >
                      <option value="custom">Custom Configuration</option>
                      <optgroup label="Math Presets">
                        <option value="amc8">AMC 8 (25 MCQ, 40 min, Diff 2-4)</option>
                        <option value="amc10">AMC 10 (25 MCQ, 75 min, Diff 3-5)</option>
                        <option value="amc12">AMC 12 (25 MCQ, 75 min, Diff 4-6)</option>
                        <option value="math_nationals_sprint">MATHCOUNTS Nationals Sprint (30 SAQ, 40 min, Diff 3)</option>
                        <option value="math_chapter_target">MATHCOUNTS Chapter Target (8 SAQ, 3 min/q, Diff 1-3)</option>
                        <option value="math_state_target">MATHCOUNTS State Target (8 SAQ, 3 min/q, Diff 2-4)</option>
                        <option value="math_nationals_target">MATHCOUNTS Nationals Target (8 SAQ, 3 min/q, Diff 3-5)</option>
                      </optgroup>
                      <optgroup label="Chemistry Presets">
                        <option value="chem_part_1">Part I (60 MCQ, 90 min, Diff 2-5)</option>
                        <option value="chem_acs_lse">ACS LSE (60 MCQ, 110 min, Diff 1-4)</option>
                        <option value="chem_part_2">Part II (8 FRQ, 105 min, Diff 3-6)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Assignment Title</label>
                    <input
                      type="text"
                      placeholder="E.g., Chapter Sprint Homework"
                      value={hwTitle}
                      onChange={(e) => { setHwTitle(e.target.value); setHwPreset('custom'); }}
                      className="input-field"
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Subject</label>
                      <select value={hwSubject} onChange={(e) => { setHwSubject(e.target.value); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                        <option value="Math">Math</option>
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Questions count</label>
                      <input type="number" min="1" max="60" value={hwQuestions} onChange={(e) => { setHwQuestions(Number(e.target.value)); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start Difficulty (1-10)</label>
                      <input type="number" min="1" max="10" value={hwDifficulty} onChange={(e) => { setHwDifficulty(Number(e.target.value)); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stress Mode</label>
                      <select value={hwStress} onChange={(e) => { setHwStress(e.target.value); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
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
                      <select value={hwTimeStyle} onChange={(e) => { setHwTimeStyle(e.target.value); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}>
                        <option value="per_question">Per Question (sec)</option>
                        <option value="whole_test">Whole Test (min)</option>
                        <option value="per_set">Per Set (min)</option>
                        <option value="none">No Timer (Untimed)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Timer Value</label>
                      <input 
                        type={hwTimeStyle === 'none' ? 'text' : 'number'} 
                        min="1" 
                        value={hwTimeStyle === 'none' ? 'N/A' : hwTimeValue} 
                        disabled={hwTimeStyle === 'none'} 
                        onChange={(e) => { setHwTimeValue(Number(e.target.value)); setHwPreset('custom'); }} 
                        className="input-field" 
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', opacity: hwTimeStyle === 'none' ? 0.5 : 1, cursor: hwTimeStyle === 'none' ? 'not-allowed' : 'default' }} 
                      />
                    </div>
                  </div>

                  {hwTimeStyle === 'per_set' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Questions Per Set</label>
                      <input type="number" min="1" value={hwQuestionsPerSet} onChange={(e) => { setHwQuestionsPerSet(Number(e.target.value)); setHwPreset('custom'); }} className="input-field" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  )}

                  {/* Content-based toggle */}
                  <div style={{ background: hwContentBased ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${hwContentBased ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '6px', padding: '0.6rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="hwContentBased"
                        checked={hwContentBased}
                        onChange={(e) => { setHwContentBased(e.target.checked); setHwPreset('custom'); }}
                        style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div>
                        <label htmlFor="hwContentBased" style={{ fontSize: '0.82rem', color: hwContentBased ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer', userSelect: 'none', display: 'block' }}>
                          {hwContentBased ? '📚 Content-Based Exam' : '🎲 Generic Exam'}
                        </label>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4', display: 'block', marginTop: '0.1rem' }}>
                          {hwContentBased
                            ? 'Questions will be generated based on this lesson\'s syllabus/description.'
                            : 'Questions will be generic for the selected subject (no lesson context).'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Shared Questions Section */}
                  <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', padding: '0.6rem', background: 'rgba(0,0,0,0.15)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'block', marginBottom: '0.35rem' }}>
                      Shared Questions (Optional)
                    </span>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 0.5rem', lineHeight: '1.3' }}>
                      Add manual questions that everyone will have on their test. AI will generate the remainder of the {hwQuestions} questions.
                    </p>

                    {hwSharedQuestions.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.6rem' }}>
                        {hwSharedQuestions.map((q, qidx) => (
                          <div key={q.id || qidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                              Q{qidx + 1}: {q.question}
                            </span>
                            <button
                              type="button"
                              style={{ color: 'var(--danger)', fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer' }}
                              onClick={() => setHwSharedQuestions(hwSharedQuestions.filter((_, i) => i !== qidx))}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!showAddSharedQuestion ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--accent-primary)', borderColor: 'rgba(99,102,241,0.2)', width: 'auto', minHeight: 'auto' }}
                        onClick={() => setShowAddSharedQuestion(true)}
                      >
                        + Add Manual Question
                      </button>
                    ) : (
                      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '0.6rem', background: 'rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Type</label>
                            <select value={sharedQType} onChange={(e) => setSharedQType(e.target.value)} className="input-field" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}>
                              <option value="multiple_choice">Multiple Choice</option>
                              <option value="short_answer">Short Answer</option>
                              <option value="free_response">Free Response</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Topic</label>
                            <input type="text" placeholder="Algebra, etc." value={sharedQTopic} onChange={(e) => setSharedQTopic(e.target.value)} className="input-field" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Difficulty (1-10)</label>
                            <input type="number" min="1" max="10" value={sharedQDifficulty} onChange={(e) => setSharedQDifficulty(Number(e.target.value))} className="input-field" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Question Text</label>
                          <textarea placeholder="Write the question here (LaTeX $...$ supported)..." value={sharedQText} onChange={(e) => setSharedQText(e.target.value)} className="input-field" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', minHeight: '60px' }} />
                        </div>

                        {sharedQType === 'multiple_choice' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Options</label>
                            {['A', 'B', 'C', 'D'].map((opt, oIdx) => (
                              <input
                                key={opt}
                                type="text"
                                placeholder={`Option ${opt}`}
                                value={sharedQOptions[oIdx]}
                                onChange={(e) => {
                                  const updated = [...sharedQOptions];
                                  updated[oIdx] = e.target.value;
                                  setSharedQOptions(updated);
                                }}
                                className="input-field"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                              />
                            ))}
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Correct Option</label>
                            <select value={sharedQAnswer} onChange={(e) => setSharedQAnswer(e.target.value)} className="input-field" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}>
                              <option value="">Select Correct Option</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                              <option value="D">D</option>
                            </select>
                          </div>
                        )}

                        {sharedQType === 'short_answer' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Correct Answer</label>
                            <input type="text" placeholder="E.g. 42 or water" value={sharedQAnswer} onChange={(e) => setSharedQAnswer(e.target.value)} className="input-field" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} />
                          </div>
                        )}

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Detailed Solution / Explanation</label>
                          <textarea placeholder="Step-by-step correct solution..." value={sharedQSolution} onChange={(e) => setSharedQSolution(e.target.value)} className="input-field" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', minHeight: '60px' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                          <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '0.2rem', fontSize: '0.75rem' }} onClick={() => setShowAddSharedQuestion(false)}>Cancel</button>
                          <button type="button" className="btn btn-primary" style={{ flex: 1, padding: '0.2rem', fontSize: '0.75rem' }} onClick={handleAddSharedQuestion}>Add Question</button>
                        </div>
                      </div>
                    )}
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
                    + Add Exam
                  </button>

                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowLessonModal(false); setIsEditing(false); setEditingLessonId(null); setLessonError(''); setHomeworkList([]); }} disabled={lessonLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={lessonLoading}>
                  {lessonLoading ? <Loader2 size={16} className="animate-spin" /> : null} {isEditing ? 'Save Changes' : 'Publish Lesson'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
