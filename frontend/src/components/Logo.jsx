import { Link } from 'react-router-dom';

export function Logo({ size = 'md', link = true }) {
  const sizes = {
    sm: { box: 'w-6 h-6 text-sm', text: 'text-lg' },
    md: { box: 'w-8 h-8 text-base', text: 'text-[22px]' },
    lg: { box: 'w-10 h-10 text-lg', text: 'text-2xl' },
  };
  const s = sizes[size] || sizes.md;

  const content = (
    <>
      <div className={`${s.box} bg-teal rounded-lg flex items-center justify-center text-white font-extrabold`}>
        L
      </div>
      <span className={`${s.text} font-extrabold tracking-tight text-slate-100`}>
        Learn<span className="text-teal">Stack</span>
      </span>
    </>
  );

  if (!link) {
    return <div className="flex items-center gap-2">{content}</div>;
  }

  return (
    <Link to="/" className="flex items-center gap-2">
      {content}
    </Link>
  );
}
