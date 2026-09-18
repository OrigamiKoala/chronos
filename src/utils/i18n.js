// Bilingual translation system (EN / ZH) for mc.uhsmathclub.org

export const translations = {
  en: {
    // Navigation
    nav: {
      brand: 'UHS Math Club',
      subBrand: 'MATHCOUNTS Portal',
      home: 'Home',
      checkIn: 'Check-In',
      homework: 'Homework',
      pastTests: 'Past Tests',
      faq: 'FAQ',
      practice: 'Practice Sandbox',
      login: 'Sign In',
      logout: 'Sign Out',
      studentBadge: 'Student',
      passcodeBadge: 'PIN'
    },
    // Home Screen
    home: {
      heroTag: 'Excellence in Mathematical Problem Solving',
      heroTitle: 'University High School Math Club',
      heroSubtitle: 'Home of the Rancho San Joaquin MATHCOUNTS training program and competitive mathematics olympiad resources.',
      checkInCta: 'Check In Now',
      homeworkCta: 'View Homework',
      pastTestsCta: 'Browse Past Tests',
      faqCta: 'Read FAQ',
      
      // Quick cards
      quickCheckInTitle: 'Weekly Check-In',
      quickCheckInDesc: 'Sign in to confirm attendance, submit notes to coaches, or report early departure.',
      quickHwTitle: 'Homework Portal',
      quickHwDesc: 'Access problem sets, submit answers, and track your competition training progress.',
      quickFaqTitle: 'Participation FAQ',
      quickFaqDesc: 'Crucial rules regarding multi-competition commitment and schedule conflicts.',

      // Past Tests Section
      testsTitle: 'Past Competitions & Problem Archives',
      testsSubtitle: 'Official problem sets and answer keys curated for competition preparation.',
      filterAll: 'All Tests',
      filterAMC8: 'AMC 8',
      filterAMC10: 'AMC 10',
      filterMathcounts: 'MATHCOUNTS',
      downloadPdf: 'Download PDF',
      viewQuestions: 'Preview',
      questionsCount: 'Questions',
      timeLimit: 'Min',

      // Photos Section
      photosTitle: 'Club Life & Achievements',
      photosSubtitle: 'Snapshots of our competition rounds, whiteboard battles, and trophy ceremonies.',
      photo1Title: 'Countdown Round Intensity',
      photo1Desc: 'Head-to-head buzzer showdown at the Chapter Competition.',
      photo2Title: 'Team Round Strategy',
      photo2Desc: 'Collaborative problem solving on target set challenges.',
      photo3Title: 'State Championship Trophy',
      photo3Desc: 'Celebrating outstanding results at the California State Finals.',
      photo4Title: 'Weekly Training & Analysis',
      photo4Desc: 'Whiteboard breakdown of combinatorics and geometry lemmas.',

      // Footer
      footerText: 'Rancho San Joaquin Middle School & University High School Math Club.',
      advisorNote: 'Advisor: Mrs. Liz Gastelum (Room B6)'
    },
    // Check-In Screen
    checkIn: {
      title: 'Rancho MATHCOUNTS 2025–26',
      subTitle: 'Attendance & Session Check-In',
      updates: 'Announcements & Updates',
      welcome: 'Welcome back',
      checkedInStatus: 'You are checked in for today\'s session.',
      checkInFormHeader: 'Session Check-In',
      studentIdLabel: 'Student ID',
      studentIdPlaceholder: 'Enter 6-digit Student ID',
      passcodeLabel: '3-Digit Passcode',
      passcodePlaceholder: '3-digit PIN (e.g. 789)',
      passcodeHint: 'First time? This passcode will become your secret PIN for Check-In and Homework.',
      messageLabel: 'Message for Coaches (Optional)',
      messagePlaceholder: 'Questions for coaches, questions regarding tests, early leave note, etc.',
      leavingEarlyLabel: 'Leaving Early?',
      leavingTimePlaceholder: 'What time? (e.g. 3:45 PM)',
      submitBtn: 'Submit Check-In',
      submittingBtn: 'Submitting…',
      alreadyCheckedIn: 'Already Checked In',
      backToHome: 'Back to Home',
      advisorContact: 'Questions? Contact Mrs. Gastelum at LizGastelum@iusd.org or Room B6.'
    },
    // Homework Screen
    homework: {
      title: 'Competition Homework Portal',
      subtitle: 'Assigned problem sets, topic drills, and competition exercises.',
      loginPrompt: 'Sign in with your Student ID and 3-digit passcode to view your assignments.',
      studentId: 'Student ID',
      passcode: '3-Digit Passcode',
      loginBtn: 'Enter Homework Portal',
      pendingTitle: 'Assigned Homework',
      completedTitle: 'Completed Assignments',
      noAssignments: 'No pending assignments at this moment. Great job!',
      due: 'Due',
      questions: 'problems',
      difficulty: 'Difficulty',
      startAssignment: 'Start Assignment',
      resumeAssignment: 'Resume Assignment',
      viewScore: 'View Submission',
      statusPending: 'Pending',
      statusCompleted: 'Completed',
      backToHome: 'Back to Home'
    },
    // FAQ Screen
    faq: {
      badge: 'Eligibility & Rules',
      title: 'Frequently Asked Questions',
      subtitle: 'Critical policies regarding competition commitments.',
      question: 'Can you participate in both NHD (National History Day) and MATHCOUNTS?',
      answerEmphatic: 'No. Absolutely not.',
      answerBody: 'Participation in both National History Day (NHD) and MATHCOUNTS is strictly prohibited. Both programs require intensive dedication, rigorous weekly team workshops, mandatory competition dates, and extensive research and preparation. Historical overlap in meeting times and weekend contest schedules creates insurmountable conflicts.',
      rulePoint1Title: 'Irreconcilable Schedule Conflicts',
      rulePoint1Desc: 'Critical Friday preparation meetings, mock countdown rounds, and regional competition dates directly overlap between the two teams.',
      rulePoint2Title: 'Team Integrity & Roster Commitment',
      rulePoint2Desc: 'MATHCOUNTS teams consist of 4 selected members and alternate slots whose scores directly dictate school qualification. Split commitments jeopardize the entire team.',
      rulePoint3Title: 'Strict Faculty Policy',
      rulePoint3Desc: 'Both program directors enforce a single-focus policy so each student can achieve peak performance without burn-out.',
      contactAdvisor: 'For special inquiries, consult Mrs. Gastelum in Room B6.'
    },
    // Common / Buttons
    common: {
      back: 'Back',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      loading: 'Loading…',
      error: 'Error',
      success: 'Success',
      switchLang: '中文'
    }
  },

  zh: {
    // 导航
    nav: {
      brand: 'UHS 数学社',
      subBrand: 'MATHCOUNTS 竞赛门户',
      home: '首页',
      checkIn: '签到',
      homework: '作业',
      pastTests: '历年真题',
      faq: '常见问题',
      practice: '模拟练习',
      login: '登录',
      logout: '登出',
      studentBadge: '学生',
      passcodeBadge: '密码'
    },
    // 首页
    home: {
      heroTag: '卓越数学思维与奥数竞赛',
      heroTitle: '大学高中数学社 (UHS Math Club)',
      heroSubtitle: 'Rancho San Joaquin 中学 MATHCOUNTS 竞赛集训官方平台及中学数学竞赛资源库。',
      checkInCta: '立即签到',
      homeworkCta: '查看作业',
      pastTestsCta: '浏览真题',
      faqCta: '阅读规则问答',

      // 快捷卡片
      quickCheckInTitle: '每周活动签到',
      quickCheckInDesc: '课后训练签到，向教练留言，或登记提早离校时间。',
      quickHwTitle: '课后作业门户',
      quickHwDesc: '查看每周布置的精选题集，提交解题答案并追踪训练进度。',
      quickFaqTitle: '双重竞赛答疑',
      quickFaqDesc: '关于时间冲突与多重参赛资格的明确规则与指引。',

      // 历年真题
      testsTitle: '历年竞赛真题与解析',
      testsSubtitle: '涵盖 AMC 8、AMC 10 及 MATHCOUNTS 各级选拔赛官方题集与解答。',
      filterAll: '全部试卷',
      filterAMC8: 'AMC 8',
      filterAMC10: 'AMC 10',
      filterMathcounts: 'MATHCOUNTS',
      downloadPdf: '下载试题',
      viewQuestions: '快速预览',
      questionsCount: '道题目',
      timeLimit: '分钟',

      // 活动照片
      photosTitle: '社团集训与获奖风采',
      photosSubtitle: '抢答倒计时、白板攻坚与加州州赛领奖的精彩瞬间。',
      photo1Title: '抢答倒计时对决',
      photo1Desc: '分赛区 Countdown Round 抢答台上的极限思维较量。',
      photo2Title: '团队赛协同攻关',
      photo2Desc: '小组分工合作，突破高难度 Target 组题。',
      photo3Title: '州赛冠军领奖时刻',
      photo3Desc: '全队在加州总决赛斩获优异成绩并捧起奖杯。',
      photo4Title: '每周例会白板拆解',
      photo4Desc: '教练与骨干队员深度讲解组合与几何精妙引理。',

      // 页脚
      footerText: 'Rancho San Joaquin 中学与 University High School 数学社联合出品。',
      advisorNote: '指导教师：Mrs. Liz Gastelum（教室 B6）'
    },
    // 签到页面
    checkIn: {
      title: 'Rancho MATHCOUNTS 2025–26',
      subTitle: '社团例会训练签到',
      updates: '最新通知与公告',
      welcome: '欢迎回来',
      checkedInStatus: '你已完成今日例会签到。',
      checkInFormHeader: '例会签到表',
      studentIdLabel: '学生学号 (Student ID)',
      studentIdPlaceholder: '请输入6位数学生学号',
      passcodeLabel: '3位数专属密码 (Passcode)',
      passcodePlaceholder: '3位数密码（例如 789）',
      passcodeHint: '首次使用？输入的3位数密码将自动成为您签到与作业的专属验证码。',
      messageLabel: '给教练留言（选填）',
      messagePlaceholder: '对题目的疑问、想要补充的资料、早退说明等…',
      leavingEarlyLabel: '需要早退？',
      leavingTimePlaceholder: '离校时间（例如 3:45 PM）',
      submitBtn: '提交签到',
      submittingBtn: '提交中…',
      alreadyCheckedIn: '今日已签到',
      backToHome: '返回主页',
      advisorContact: '如有任何问题，请联系指导老师 Mrs. Gastelum (LizGastelum@iusd.org) 或前往 B6 教室。'
    },
    // 作业页面
    homework: {
      title: '竞赛课后作业门户',
      subtitle: '每周精选拔高题、知识点专项训练与考前模考。',
      loginPrompt: '请输入学生学号与3位数密码以查看您的作业列表。',
      studentId: '学生学号',
      passcode: '3位数密码',
      loginBtn: '进入作业系统',
      pendingTitle: '待完成作业',
      completedTitle: '已提交作业',
      noAssignments: '当前没有待完成的作业，继续保持！',
      due: '截止时间',
      questions: '道题',
      difficulty: '难度系数',
      startAssignment: '开始答题',
      resumeAssignment: '继续答题',
      viewScore: '查看得分',
      statusPending: '待完成',
      statusCompleted: '已完成',
      backToHome: '返回主页'
    },
    // 常见问题页面
    faq: {
      badge: '资格与规定',
      title: '常见规则问答',
      subtitle: '关于学生参赛资格与时间精力的重要指引。',
      question: '可以同时参加 NHD (全国历史日竞赛) 和 MATHCOUNTS 吗？',
      answerEmphatic: '绝不可以。坚决不行。',
      answerBody: '学校与竞赛组委会严禁同时参加全国历史日竞赛 (NHD) 和 MATHCOUNTS。两项顶级赛事都需要极高的时间投入、高强度的每周团队集训、强制出席的阶段性预赛，以及大量的课后准备。历年两队在集训时间与周末出赛日程上存在不可调和的严重冲突。',
      rulePoint1Title: '日程完全重叠冲突',
      rulePoint1Desc: '周五核心备战训练、模拟抢答以及分赛区预选赛日期直接撞期，无法兼顾。',
      rulePoint2Title: '团队责任与出场席位',
      rulePoint2Desc: 'MATHCOUNTS 代表队由 4 名正选与候补队员组成，任何队员精力分散都将直接影响全校晋级资格。',
      rulePoint3Title: '指导教师硬性规定',
      rulePoint3Desc: '两位项目指导老师均实行专注单一赛事政策，以保证学生专注发挥最佳水平，避免过度疲倦。',
      contactAdvisor: '如有特殊疑问，请至 B6 教室咨询 Mrs. Gastelum。'
    },
    // 公共按键
    common: {
      back: '返回',
      cancel: '取消',
      confirm: '确认',
      save: '保存',
      loading: '加载中…',
      error: '错误',
      success: '成功',
      switchLang: 'English'
    }
  }
};

export function getStoredLanguage() {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('mc_lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // fallback
  }
  return 'en';
}

export function setStoredLanguage(lang) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('mc_lang', lang);
  } catch {
    // fallback
  }
}
