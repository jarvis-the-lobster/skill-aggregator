import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="pt-16 pb-8 bg-dark-footer border-t border-white/[0.08]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-12">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight mb-4">
              <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center text-white text-base font-extrabold">
                L
              </div>
              <span className="text-slate-100">Learn<span className="text-teal">Stack</span></span>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-[280px]">
              The free skill-learning aggregator. Curated videos and articles for 200+ skills, structured into 30-day learning plans.
            </p>
          </div>
          {/* Skills */}
          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-wider mb-4 text-slate-100">Skills</h4>
            <div className="flex flex-col">
              {[
                { to: '/skills/python', label: 'Python' },
                { to: '/skills/javascript', label: 'JavaScript' },
                { to: '/skills/ui-ux-design', label: 'UI/UX Design' },
                { to: '/skills/machine-learning', label: 'Machine Learning' },
              ].map((link) => (
                <Link key={link.to} to={link.to} className="text-sm text-slate-400 py-1 hover:text-teal transition-colors">
                  {link.label}
                </Link>
              ))}
              <a href="/#skills" className="text-sm text-slate-400 py-1 hover:text-teal transition-colors">
                Browse All &rarr;
              </a>
            </div>
          </div>
          {/* Company */}
          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-wider mb-4 text-slate-100">Company</h4>
            <div className="flex flex-col">
              {[
                { to: '/about', label: 'About' },
                { to: '/early-access', label: 'Newsletter' },
              ].map((link) => (
                <Link key={link.to} to={link.to} className="text-sm text-slate-400 py-1 hover:text-teal transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          {/* Contact */}
          <div>
            <h4 className="text-[13px] font-semibold uppercase tracking-wider mb-4 text-slate-100">Contact</h4>
            <div className="flex flex-col">
              <a href="mailto:hello@learnstack.dev" className="text-sm text-slate-400 py-1 hover:text-teal transition-colors">
                hello@learnstack.dev
              </a>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[13px] text-slate-400">&copy; 2026 LearnStack. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
