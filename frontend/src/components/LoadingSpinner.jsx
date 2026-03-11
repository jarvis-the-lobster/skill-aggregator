export function LoadingSpinner({ size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5 border-2' : 'w-8 h-8 border-4';
  return (
    <div className="flex items-center justify-center">
      <div className={`${sizeClass} border-gray-200 border-t-primary-500 rounded-full animate-spin`}></div>
    </div>
  );
}
