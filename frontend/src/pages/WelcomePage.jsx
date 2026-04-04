import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, Zap, Shield, Star, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import analytics from '../services/analytics';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Logo } from '../components/Logo';

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

const ATTRIBUTION_SOURCES = [
  { value: 'reddit', label: 'Reddit' },
  { value: 'google-search', label: 'Google' },
  { value: 'friend-referral', label: 'Friend / Referral' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitter-x', label: 'Twitter / X' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS = {
  programming: 'bg-teal/15 text-teal-light',
  business: 'bg-emerald-400/15 text-emerald-400',
  design: 'bg-pink-400/15 text-pink-400',
};

// steps: 0=userType, 1=goal, 2=dailyTime, 3=skillPicker, 4=premiumPitch
// progress bar covers steps 0–3
const STEP_TITLES = [
  'What describes you best?',
  "What's your main goal?",
  'How much time can you commit daily?',
  'Pick your first skill',
];

function ProgressBar({ step }) {
  // Progress bar only shown for the 4 main content steps (0-3); hidden on premium pitch
  if (step === 4) return null;
  const displayStep = step > 3 ? 3 : step;
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i <= displayStep ? 'bg-teal w-10' : 'bg-white/10 w-6'
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
          ? 'border-teal bg-teal/10 shadow-sm'
          : 'border-white/[0.08] bg-[#141929] hover:border-white/20 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl flex-shrink-0">{emoji}</span>
        <div>
          <span className="text-base font-medium text-slate-100">{label}</span>
          {sub && <p className="text-sm text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </button>
  );
}

function AttributionPills({ selected, onSelect }) {
  return (
    <div className="mt-8 pt-6 border-t border-white/[0.06]">
      <p className="text-sm font-medium text-slate-400 mb-3">How did you find us? <span className="text-slate-600">(optional)</span></p>
      <div className="flex flex-wrap gap-2">
        {ATTRIBUTION_SOURCES.map((src) => (
          <button
            key={src.value}
            onClick={() => onSelect(selected === src.value ? null : src.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 ${
              selected === src.value
                ? 'border-teal bg-teal/10 text-teal'
                : 'border-white/[0.12] bg-[#141929] text-slate-400 hover:border-white/25 hover:text-slate-300'
            }`}
          >
            {src.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillPickerCard({ skill, contentCount, onClick }) {
  const categoryColor = CATEGORY_COLORS[skill.category] || 'bg-white/10 text-slate-400';
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border-2 border-white/[0.08] bg-[#141929] hover:border-teal/40 hover:shadow-sm transition-all duration-200 cursor-pointer"
    >
      <h4 className="font-semibold text-slate-100 text-sm leading-tight mb-2">{skill.name}</h4>
      <div className="flex items-center justify-between">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${categoryColor}`}>
          {skill.category}
        </span>
        {contentCount !== undefined && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {contentCount}
          </span>
        )}
      </div>
    </button>
  );
}

function PremiumPitchScreen({ onContinue }) {
  const perks = [
    { icon: <Zap className="w-4 h-4 text-teal" />, text: 'Personalized learning plans' },
    { icon: <BookOpen className="w-4 h-4 text-teal" />, text: 'Unlimited skills & content' },
    { icon: <Shield className="w-4 h-4 text-teal" />, text: 'Streak protection' },
    { icon: <Star className="w-4 h-4 text-teal" />, text: 'Priority new-content access' },
    { icon: <Sparkles className="w-4 h-4 text-teal" />, text: 'AI-assisted learning — coming soon' },
  ];

  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-teal/30 rounded-full text-[13px] font-medium text-teal bg-teal/[0.06] mb-8">
        <Star className="w-3.5 h-3.5" />
        LearnStack Pro
      </div>

      <h2 className="text-3xl font-extrabold text-slate-100 mb-3 leading-tight">
        Start your <span className="text-teal">7-day free trial</span>
      </h2>
      <p className="text-slate-400 text-base mb-8">
        Personalized plans, unlimited skills, streak protection.
      </p>

      {/* Perk list */}
      <div className="w-full bg-[#141929] border border-white/[0.08] rounded-2xl p-5 mb-8 text-left space-y-3">
        {perks.map((perk, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center flex-shrink-0">
              {perk.icon}
            </div>
            <span className="text-sm text-slate-200">{perk.text}</span>
          </div>
        ))}
      </div>

      {/* CTA — non-functional, advances like "Maybe later" */}
      <button
        onClick={onContinue}
        className="w-full bg-teal text-dark-bg font-bold text-base py-4 rounded-xl hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] transition-all duration-200 mb-4"
      >
        Start free trial
      </button>
      <p className="text-xs text-slate-600 mb-4">No credit card required · Cancel anytime</p>

      <button
        onClick={onContinue}
        className="text-slate-500 hover:text-slate-300 text-sm font-medium underline underline-offset-2 transition-colors"
      >
        Maybe later
      </button>
    </div>
  );
}

export function WelcomePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ userType: null, goal: null, dailyTime: null });
  const [attribution, setAttribution] = useState(null);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Step 3 (skill picker) state
  const [skills, setSkills] = useState([]);
  const [contentCounts, setContentCounts] = useState({});
  const [skillSearch, setSkillSearch] = useState('');
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(null);
  const [selectedSkillId, setSelectedSkillId] = useState(null);

  // Guard: redirect if not logged in or already completed
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    apiService.getOnboardingStatus().then(({ completed }) => {
      if (completed) navigate('/', { replace: true });
      else {
        setChecking(false);
        analytics.track('onboarding_started');
      }
    }).catch(() => setChecking(false));
  }, [user, authLoading]);

  // Load skills for step 3 (skill picker)
  useEffect(() => {
    if (step !== 3) return;
    setSkillsLoading(true);
    apiService.getSkills().then((data) => {
      const allSkills = data.skills || data;
      setSkills(allSkills);
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
    return FEATURED_SKILL_IDS
      .map((id) => skills.find((s) => s.id === id))
      .filter(Boolean);
  }, [skills, skillSearch]);

  function advance() {
    setTransitioning(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setTransitioning(false);
    }, 300);
  }

  function selectOption(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    analytics.track('onboarding_step_completed', { step: step + 1, value });

    if (step < 2) {
      // Steps 0 and 1: auto-advance
      advance();
    } else if (step === 2) {
      // Save answers then show skill picker (step 3)
      setSaving(true);
      const payload = {
        userType: answers.userType,
        goal: answers.goal,
        dailyTime: value,
        ...(attribution ? { attributionSource: attribution } : {}),
      };
      apiService.saveOnboarding(payload).then(() => {
        setTransitioning(true);
        setTimeout(() => {
          setStep(3);
          setTransitioning(false);
          setSaving(false);
        }, 300);
      }).catch(() => {
        setSaving(false);
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
    // Store selected skill, show premium pitch before navigating to plan
    setSelectedSkillId(skill.id);
    setStep(4);
    setEnrolling(null);
  }

  function handlePremiumContinue() {
    analytics.track('onboarding_premium_skipped');
    navigate(selectedSkillId ? `/skills/${selectedSkillId}/plan` : '/');
  }

  function handleSkip() {
    analytics.track('onboarding_skipped');
    setSelectedSkillId(null);
    setStep(4);
  }

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Logo link={false} />
        </div>

        <ProgressBar step={step} />

        {step !== 4 && (
          <h2 className="text-2xl font-bold text-slate-100 text-center mb-8">
            {STEP_TITLES[Math.min(step, 3)]}
          </h2>
        )}

        <div className={`transition-opacity duration-200 ${transitioning || saving ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {/* Step 1: User type + attribution */}
          {step === 0 && (
            <div>
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
              <AttributionPills selected={attribution} onSelect={setAttribution} />
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full pl-10 pr-4 py-3 border border-white/[0.08] rounded-xl bg-[#141929] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
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
                <div className="flex items-center justify-center gap-2 mt-6 text-slate-400">
                  <LoadingSpinner />
                  <span className="text-sm">Enrolling...</span>
                </div>
              )}

              <div className="text-center mt-8">
                <button
                  onClick={handleSkip}
                  className="text-slate-500 hover:text-slate-300 text-sm font-medium underline underline-offset-2"
                >
                  Browse on my own
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Premium pitch */}
          {step === 4 && (
            <PremiumPitchScreen onContinue={handlePremiumContinue} />
          )}
        </div>
      </div>
    </div>
  );
}
