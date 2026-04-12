import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ClipboardCheck, Play, Sparkles } from 'lucide-react';

function ProgressPill({ current, total }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-purple-300/70">
        <span>Glorious little progress bar</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-400 to-sky-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ReviewCheckInPanel({ review, dayNumber, onClose }) {
  const prompts = review?.body?.reflection_prompts || [];
  const covered = review?.body?.content_covered || [];
  const totalSteps = Math.max(prompts.length + 1, 1);
  const [stepIndex, setStepIndex] = useState(0);

  const currentPrompt = prompts[stepIndex - 1] || null;
  const eyebrow = useMemo(() => {
    if (stepIndex === 0) return 'Tiny vibe check';
    if (stepIndex === totalSteps - 1) return 'Last one, no essay required';
    return 'Keep it loose';
  }, [stepIndex, totalSteps]);

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-purple-400/20 bg-[radial-gradient(circle_at_top_left,_rgba(192,132,252,0.18),_transparent_35%),linear-gradient(180deg,rgba(20,18,33,0.98),rgba(11,14,24,0.98))] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="border-b border-white/[0.08] px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-200/80">
              <Sparkles className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
            <div>
              <p className="text-sm text-purple-100/70">Day {dayNumber} check-in</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {review?.title || 'Weekly check-in'}
              </h3>
            </div>
            {review?.body?.summary && (
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                {review.body.summary}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="self-start rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-white/[0.16] hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6 px-6 py-6 sm:px-8">
          <ProgressPill current={stepIndex + 1} total={totalSteps} />

          {stepIndex === 0 ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <ClipboardCheck className="h-4 w-4 text-purple-300" />
                  What you apparently survived this week
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
                  <p className="text-sm text-slate-400">No recap bullets yet. A little mysterious, honestly.</p>
                )}
              </div>

              <button
                onClick={() => setStepIndex(prompts.length > 0 ? 1 : 0)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
              >
                {prompts.length > 0 ? 'Start the vibe check' : 'Cool, got it'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[28px] border border-purple-300/20 bg-gradient-to-br from-purple-500/12 to-sky-500/8 p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-purple-200/70">
                  Prompt {stepIndex} of {prompts.length}
                </p>
                <p className="mt-4 text-xl font-medium leading-8 text-white sm:text-2xl">
                  {currentPrompt}
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No quiz energy here. Just pause for a second and notice what clicked, what felt weird, and what you want to poke at next.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={stepIndex === 0}
                >
                  Back
                </button>
                <button
                  onClick={() => setStepIndex((value) => Math.min(totalSteps - 1, value + 1))}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
                >
                  {stepIndex === totalSteps - 1 ? 'Done lurking' : 'Next tiny thought'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.08] bg-white/[0.02] px-6 py-6 sm:px-8 lg:border-l lg:border-t-0">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/30 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Mood of the room</p>
            <h4 className="mt-3 text-lg font-semibold text-white">This is not a test.</h4>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Think of it more like brushing the dust off what you learned so your brain stops pretending it never saw it.
            </p>
            <div className="mt-5 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                Keep answers short. A sentence is plenty.
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                If something felt muddy, that&apos;s useful, not bad.
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                The point is momentum, not school vibes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
