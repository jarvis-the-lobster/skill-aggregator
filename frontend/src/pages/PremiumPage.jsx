import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, CalendarCheck2, Clock3, Lock, MessageSquare, Sparkles, Target, CheckCircle2 } from 'lucide-react';

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnstack.dev';

const premiumFeatures = [
  {
    icon: Target,
    title: 'Outcome-based plans',
    description: 'Tell LearnStack what you actually want to accomplish in the next 30 days, not just what skill you want to browse.',
  },
  {
    icon: Clock3,
    title: 'Built around your real schedule',
    description: 'Generate a plan that fits 15 minute weekdays, weekend deep work, or anything in between.',
  },
  {
    icon: Sparkles,
    title: 'Smarter content selection',
    description: 'Use your goal, current level, and preferred format to pull a tighter, more relevant path from our curated library.',
  },
  {
    icon: CalendarCheck2,
    title: 'Adaptive replanning',
    description: 'Missed a few days, moving too fast, or changed goals? Update the plan without starting over.',
  },
  {
    icon: MessageSquare,
    title: 'Plan-aware AI help',
    description: 'Ask for help on today’s lesson, get a recap, quiz yourself, or simplify a concept without generic chatbot drift.',
  },
  {
    icon: Brain,
    title: 'Progress memory',
    description: 'Keep context on what you completed, what felt hard, and what the next best step should be.',
  },
];

const exampleInputs = [
  'I want to learn enough Python in 30 days to automate repetitive spreadsheet work.',
  'I already know piano basics, help me build a realistic month-long practice plan for chord transitions.',
  'I have 20 minutes on weekdays and want to start UI/UX without getting overwhelmed.',
];

const planPreview = [
  { day: 'Day 1', title: 'Define your outcome + baseline', meta: '10 min setup, 15 min lesson' },
  { day: 'Day 4', title: 'Focused lesson matched to your level', meta: '1 curated video + 1 short article' },
  { day: 'Day 12', title: 'Checkpoint and skill check-in', meta: 'Adjust pace based on progress' },
  { day: 'Day 23', title: 'Project day tied to your goal', meta: 'Build something small and useful' },
  { day: 'Day 30', title: 'Review, recap, and next-step plan', meta: 'See what to learn next' },
];

export function PremiumPage() {
  return (
    <div className="bg-dark-bg text-slate-100">
      <Helmet>
        <title>LearnStack Premium — Personalized 30-Day Skill Plans</title>
        <meta
          name="description"
          content="Preview LearnStack Premium, a personalized 30-day learning plan built around your goals, schedule, and current level."
        />
        <link rel="canonical" href={`${SITE_URL}/premium`} />
      </Helmet>

      <section className="relative overflow-hidden border-b border-white/[0.08]">
        <div className="absolute left-1/2 top-0 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-teal/10 blur-[140px]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-28 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal/20 bg-teal/10 px-4 py-2 text-sm font-medium text-teal">
              <Lock className="h-4 w-4" />
              Premium preview
            </div>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Personalized plans that help you <span className="gradient-text-teal">actually make progress.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              LearnStack Premium is built for people who do not need more random content. They need a realistic 30-day plan matched to their goal, time, and current level.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="https://tally.so/r/waitlist-learnstack-premium"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-300 hover:-translate-y-px hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_12px_32px_rgba(0,191,166,0.35)]"
              >
                Join the premium waitlist
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
              >
                Keep exploring free plans
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              This is an early concept page for validation. We’re looking for feedback before building the full experience.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/[0.08] bg-dark-card p-8 shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Example setup
            </div>
            <h2 className="text-2xl font-bold text-white">What Premium would ask first</h2>
            <div className="mt-6 space-y-3">
              {exampleInputs.map((input) => (
                <div key={input} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
                  {input}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-teal/20 bg-teal/10 p-4 text-sm text-teal-light">
              The goal is to make the plan feel intentional and personal, not auto-generated and generic.
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-dark-card p-8 shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Example plan
            </div>
            <h2 className="text-2xl font-bold text-white">What a tailored month could look like</h2>
            <div className="mt-6 space-y-3">
              {planPreview.map((item) => (
                <div key={item.day} className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal" />
                  <div>
                    <div className="text-sm font-semibold text-white">{item.day} · {item.title}</div>
                    <div className="mt-1 text-sm text-slate-400">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.08] bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Premium features
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Built for clarity, consistency, and less decision fatigue.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              Premium should feel like a learning copilot with taste, memory, and restraint, not a noisy chatbot bolted onto a content directory.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {premiumFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-3xl border border-white/[0.08] bg-dark-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-teal/20 hover:shadow-[0_20px_48px_rgba(0,0,0,0.28)]"
                >
                  <div className="inline-flex rounded-2xl border border-teal/20 bg-teal/10 p-3 text-teal">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-[32px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(0,191,166,0.14),rgba(20,25,41,1))] p-8 sm:p-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
              Early access
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Want early access when Premium is ready?
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-200/90">
              Join the waitlist if personalized plans, adaptive pacing, and plan-aware AI help sound useful. We’ll use the feedback to decide what gets built first.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="https://tally.so/r/waitlist-learnstack-premium"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-dark-bg transition-all duration-300 hover:-translate-y-px hover:scale-[1.02]"
              >
                Join the waitlist
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/about"
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.04] px-6 py-3 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
              >
                Read about LearnStack
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
