import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Search, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import analytics from '../services/analytics';
import { LoadingSpinner } from '../components/LoadingSpinner';

const FEATURED_SKILL_IDS = [
  'python', 'web-development', 'javascript', 'data-science', 'digital-marketing',
  'machine-learning', 'sql', 'cybersecurity', 'aws', 'react-native',
  'product-management', 'personal-finance', 'copywriting', 'figma', 'blender',
  'excel', 'premiere-pro', 'deep-learning', 'devops', 'ui-ux-design',
];

const USER_TYPES = [
  { value: 'student', emoji: '\uD83C\uDF93', label: 'Student' },
  { value: 'self-learner', emoji: '\uD83D\uDCDA', label: 'Self-learner' },
  { value: 'career-switcher', emoji: '\uD83D\uDD04', label: 'Career switcher' },
  { value: 'professional', emoji: '\uD83D\uDCBC', label: 'Working professional' },
  { value: 'freelancer-creator', emoji: '\uD83C\uDFA8', label: 'Freelancer / Creator' },
];

const GOALS = [
  { value: 'new-skill-for-work', emoji: '\uD83D\uDCBB', label: 'Learn a new skill for work' },
  { value: 'school-coursework', emoji: '\uD83C\uDF93', label: 'Keep up with school or coursework' },
  { value: 'interviews-certs', emoji: '\uD83D\uDCDD', label: 'Prepare for exams or certifications' },
  { value: 'career-switch', emoji: '\uD83D\uDE80', label: 'Switch to a new career field' },
  { value: 'personal-interest', emoji: '\uD83C\uDFAF', label: 'Personal interest / hobby' },
  { value: 'side-project', emoji: '\uD83D\uDEE0\uFE0F', label: 'Build a side project' },
];

const DAILY_TIMES = [
  { value: '10-min', emoji: '\u26A1', label: '10 minutes', sub: 'quick daily lessons' },
  { value: '20-min', emoji: '\uD83D\uDCD6', label: '20 minutes', sub: 'steady progress' },
  { value: '30-plus-min', emoji: '\uD83D\uDD25', label: '30+ minutes', sub: 'accelerated learning' },
];

const CATEGORY_COLORS = {
  programming: 'bg-blue-100 text-blue-700',
  business: 'bg-emerald-100 text-emerald-700',
  design: 'bg-purple-100 text-purple-700',
};

const STEP_TITLES = [
  'What describes you best?',
  "What's your main goal?",
  'How much time can you commit daily?',
  'Pick your first skill',
];

function ProgressBar({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i <= step ? 'bg-primary-500 w-10' : 'bg-gray-200 w-6'
          }`}
        />
      ))}
    </div>
  );
}

function OptionCard({ emoji, label, sub, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
        selected
          ? 'border-primary-500 bg-primary-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl flex-shrink-0">{emoji}</span>
        <div>
          <span className="text-base font-medium text-gray-900">{label}</span>
          {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </button>
  );
}

function SkillPickerCard({ skill, contentCount, onClick }) {
  const categoryColor = CATEGORY_COLORS[skill.category] || 'bg-gray-100 text-gray-700';
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all duration-200 cursor-pointer"
    >
      <h4 className="font-semibold text-gray-900 text-sm leading-tight mb-2">{skill.name}</h4>
      <div className="flex items-center justify-between">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${categoryColor}`}>
          {skill.category}
        </span>
        {contentCount !== undefined && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {contentCount}
          </span>
        )}
      </div>
    </button>
  );
}

export function WelcomePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ userType: null, goal: null, dailyTime: null });
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Step 4 state
  const [skills, setSkills] = useState([]);
  const [contentCounts, setContentCounts] = useState({});
  const [skillSearch, setSkillSearch] = useState('');
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(null);

  // Guard: redirect if not logged in or already completed
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    apiService.getOnboardingStatus().then(({ completed }) => {
      if (completed) navigate('/', { replace: true });
      else setChecking(false);
    }).catch(() => setChecking(false));
  }, [user, authLoading]);

  // Load skills for step 4
  useEffect(() => {
    if (step !== 3) return;
    setSkillsLoading(true);
    apiService.getSkills().then((data) => {
      const allSkills = data.skills || data;
      setSkills(allSkills);
      // Fetch content counts for featured skills
      const featured = allSkills.filter((s) => FEATURED_SKILL_IDS.includes(s.id));
      Promise.all(
        featured.map((s) =>
          apiService.getSkillContent(s.id).then((d) => ({
            id: s.id,
            count: d.content?.totalCount || (d.content?.videos?.length || 0) + (d.content?.articles?.length || 0),
          })).catch(() => ({ id: s.id, count: 0 }))
        )
      ).then((results) => {
        const counts = {};
        results.forEach((r) => { counts[r.id] = r.count; });
        setContentCounts(counts);
      });
    }).catch(() => {}).finally(() => setSkillsLoading(false));
  }, [step]);

  const displaySkills = useMemo(() => {
    const q = skillSearch.toLowerCase().trim();
    if (q) {
      return skills.filter(
        (s) => s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)
      ).slice(0, 20);
    }
    // Show featured skills in order
    return FEATURED_SKILL_IDS
      .map((id) => skills.find((s) => s.id === id))
      .filter(Boolean);
  }, [skills, skillSearch]);

  function selectOption(key, value, trackLabel) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    analytics.track('onboarding_step_completed', { step: step + 1, value });

    if (step < 2) {
      // Auto-advance with brief delay
      setTransitioning(true);
      setTimeout(() => {
        setStep((s) => s + 1);
        setTransitioning(false);
      }, 300);
    } else if (step === 2) {
      // Save answers then advance to step 4
      setSaving(true);
      const payload = { userType: answers.userType, goal: answers.goal, dailyTime: value };
      apiService.saveOnboarding(payload).then(() => {
        analytics.track('onboarding_completed');
        setTransitioning(true);
        setTimeout(() => {
          setStep(3);
          setTransitioning(false);
          setSaving(false);
        }, 300);
      }).catch(() => {
        setSaving(false);
        // Still advance — don't block the user
        setStep(3);
      });
    }
  }

  async function handleSkillSelect(skill) {
    setEnrolling(skill.id);
    analytics.track('onboarding_skill_selected', { skillId: skill.id });
    try {
      await apiService.enrollCourse(skill.id);
    } catch {
      // If already enrolled or error, still navigate
    }
    navigate(`/skills/${skill.id}/plan`);
  }

  function handleSkip() {
    analytics.track('onboarding_skipped');
    navigate('/');
  }

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="p-2 bg-primary-500 rounded-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">LearnStack</span>
        </div>

        <ProgressBar step={step} />

        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          {STEP_TITLES[step]}
        </h2>

        <div className={`transition-opacity duration-200 ${transitioning || saving ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {/* Step 1: User type */}
          {step === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {USER_TYPES.map((opt) => (
                <OptionCard
                  key={opt.value}
                  emoji={opt.emoji}
                  label={opt.label}
                  selected={answers.userType === opt.value}
                  onClick={() => selectOption('userType', opt.value)}
                />
              ))}
            </div>
          )}

          {/* Step 2: Goal */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GOALS.map((opt) => (
                <OptionCard
                  key={opt.value}
                  emoji={opt.emoji}
                  label={opt.label}
                  selected={answers.goal === opt.value}
                  onClick={() => selectOption('goal', opt.value)}
                />
              ))}
            </div>
          )}

          {/* Step 3: Daily time */}
          {step === 2 && (
            <div className="grid grid-cols-1 gap-3 max-w-md mx-auto">
              {DAILY_TIMES.map((opt) => (
                <OptionCard
                  key={opt.value}
                  emoji={opt.emoji}
                  label={opt.label}
                  sub={opt.sub}
                  selected={answers.dailyTime === opt.value}
                  onClick={() => selectOption('dailyTime', opt.value)}
                />
              ))}
            </div>
          )}

          {/* Step 4: Pick a skill */}
          {step === 3 && (
            <div>
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {skillsLoading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {displaySkills.map((skill) => (
                    <SkillPickerCard
                      key={skill.id}
                      skill={skill}
                      contentCount={contentCounts[skill.id]}
                      onClick={() => handleSkillSelect(skill)}
                    />
                  ))}
                </div>
              )}

              {enrolling && (
                <div className="flex items-center justify-center gap-2 mt-6 text-gray-500">
                  <LoadingSpinner />
                  <span className="text-sm">Enrolling...</span>
                </div>
              )}

              <div className="text-center mt-8">
                <button
                  onClick={handleSkip}
                  className="text-gray-500 hover:text-gray-700 text-sm font-medium underline underline-offset-2"
                >
                  Browse on my own
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
