import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ClipboardCheck, Play, Sparkles, X } from 'lucide-react';

function ProgressPill({ current, total }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-purple-300/70">
        <span>Review progress</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-400 to-sky-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function normalizeKnowledgeChecks(review) {
  const body = review?.body || {};
  if (Array.isArray(body.knowledge_checks) && body.knowledge_checks.length > 0) {
    return body.knowledge_checks;
  }

  const prompts = Array.isArray(body.reflection_prompts) ? body.reflection_prompts : [];
  return prompts.map((prompt, index) => ({
    question: prompt,
    type: 'short_answer',
    placeholder: 'Type a quick answer to prove it stuck',
    expected_points: [],
    id: `fallback-${index + 1}`,
  }));
}

function ReviewStepCard({ check, answer, onAnswerChange }) {
  const expectedPoints = Array.isArray(check?.expected_points) ? check.expected_points : [];

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-purple-300/20 bg-gradient-to-br from-purple-500/12 to-sky-500/8 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-purple-200/70">Knowledge check</p>
        <p className="mt-4 text-xl font-medium leading-8 text-white sm:text-2xl">{check?.question}</p>
        {check?.helper_text && (
          <p className="mt-4 text-sm leading-6 text-slate-300">{check.helper_text}</p>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Your answer</span>
        <textarea
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          rows={4}
          placeholder={check?.placeholder || 'Give a short answer in your own words'}
          className="w-full rounded-2xl border border-white/[0.08] bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400/20"
        />
      </label>

      {expectedPoints.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">What a solid answer should touch</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {expectedPoints.map((point, index) => (
              <li key={`${point}-${index}`} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-purple-300" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ReviewCheckInPanel({ review, dayNumber, onClose }) {
  const prompts = review?.body?.reflection_prompts || [];
  const covered = review?.body?.content_covered || [];
  const knowledgeChecks = normalizeKnowledgeChecks(review);
  const steps = useMemo(() => {
    const introStep = { type: 'intro', id: 'intro' };
    const checkSteps = knowledgeChecks.map((check, index) => ({ type: 'knowledge', id: check.id || `knowledge-${index + 1}`, check }));
    const reflectionStep = prompts.length > 0 ? { type: 'reflection', id: 'reflection' } : null;
    return [introStep, ...checkSteps, ...(reflectionStep ? [reflectionStep] : [])];
  }, [knowledgeChecks, prompts.length]);

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [reflection, setReflection] = useState('');

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const eyebrow = useMemo(() => {
    if (currentStep?.type === 'intro') return 'Weekly checkpoint';
    if (currentStep?.type === 'knowledge') return 'Prove it stuck';
    return 'Quick reflection';
  }, [currentStep]);

  const advance = () => setStepIndex((value) => Math.min(totalSteps - 1, value + 1));
  const retreat = () => setStepIndex((value) => Math.max(0, value - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Day ${dayNumber} review`}>
      <button className="absolute inset-0 cursor-default" aria-label="Close review" onClick={onClose} />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-purple-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(192,132,252,0.18),_transparent_35%),linear-gradient(180deg,rgba(20,18,33,0.98),rgba(11,14,24,0.98))] shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:rounded-3xl">
        <div className="border-b border-white/[0.08] px-5 py-4 sm:px-8 sm:py-5">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-white/10 sm:hidden" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-200/80">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <div>
                <p className="text-sm text-purple-100/70">Day {dayNumber} review</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                  {review?.title || 'Weekly review'}
                </h3>
              </div>
              {review?.body?.summary && (
                <p className="max-w-2xl text-sm leading-6 text-slate-300">{review.body.summary}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="self-start rounded-full border border-white/[0.08] bg-white/[0.03] p-2 text-slate-300 transition hover:border-white/[0.16] hover:text-white"
              aria-label="Close review"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6 px-5 py-5 sm:px-8 sm:py-6">
            <ProgressPill current={stepIndex + 1} total={totalSteps} />

            {currentStep?.type === 'intro' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <ClipboardCheck className="h-4 w-4 text-purple-300" />
                    What you covered this week
                  </div>
                  {covered.length > 0 ? (
                    <div className="space-y-3">
                      {covered.map((item, index) => (
                        <div key={`${item.day}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-slate-950/30 px-4 py-3">
                          <div className="mt-0.5 rounded-full bg-white/[0.06] p-2 text-slate-200">
                            {item.type === 'video' ? <Play className="h-3.5 w-3.5 text-teal-300" /> : <BookOpen className="h-3.5 w-3.5 text-sky-300" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Day {item.day}</p>
                            <p className="mt-1 text-sm font-medium text-slate-100">{item.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No recap bullets yet, which is not ideal, but we can still review.</p>
                  )}
                </div>

                <button
                  onClick={advance}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
                >
                  Start review
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {currentStep?.type === 'knowledge' && (
              <ReviewStepCard
                check={currentStep.check}
                answer={answers[currentStep.id] || ''}
                onAnswerChange={(value) => setAnswers((existing) => ({ ...existing, [currentStep.id]: value }))}
              />
            )}

            {currentStep?.type === 'reflection' && (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-purple-300/20 bg-gradient-to-br from-purple-500/12 to-sky-500/8 p-6">
                  <p className="text-xs uppercase tracking-[0.24em] text-purple-200/70">Reflection</p>
                  <p className="mt-4 text-xl font-medium leading-8 text-white sm:text-2xl">
                    {prompts[0] || 'What still feels fuzzy, and what clicked this week?'}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    Keep it short. The review should test recall first, then make room for a quick honest note.
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Quick reflection</span>
                  <textarea
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    rows={4}
                    placeholder="What felt solid, what felt shaky, and what should next week reinforce?"
                    className="w-full rounded-2xl border border-white/[0.08] bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400/20"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={retreat}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={stepIndex === 0}
              >
                Back
              </button>
              <button
                onClick={currentStep?.type === 'reflection' || stepIndex === totalSteps - 1 ? onClose : advance}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
              >
                {currentStep?.type === 'reflection' || stepIndex === totalSteps - 1 ? 'Finish review' : 'Next'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-t border-white/[0.08] bg-white/[0.02] px-5 py-5 sm:px-8 sm:py-6 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-white/[0.08] bg-slate-950/30 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Why this exists</p>
              <h4 className="mt-3 text-lg font-semibold text-white">Reflection alone is too soft.</h4>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Good reviews should force a little recall. If you can answer in your own words, the material is actually starting to stick.
              </p>
              <div className="mt-5 grid gap-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  Keep answers short, but make them specific.
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  If you blank, that&apos;s a signal for what needs reinforcement next.
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  On mobile this opens as a sheet, so it stays impossible to miss.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
