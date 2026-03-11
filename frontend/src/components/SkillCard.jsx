import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const SKILL_ICONS = {
  'python': '🐍',
  'web-development': '🌐',
  'digital-marketing': '📱',
  'ui-ux-design': '🎨',
  'data-science': '📊',
};

const CATEGORY_COLORS = {
  'programming': 'bg-blue-100 text-blue-700',
  'business': 'bg-emerald-100 text-emerald-700',
  'design': 'bg-purple-100 text-purple-700',
};

const DIFFICULTY_COLORS = {
  'beginner': 'bg-green-100 text-green-700',
  'intermediate': 'bg-yellow-100 text-yellow-700',
  'advanced': 'bg-red-100 text-red-700',
};

export function SkillCard({ skill, contentCount }) {
  const icon = SKILL_ICONS[skill.id] || '📚';
  const categoryColor = CATEGORY_COLORS[skill.category] || 'bg-gray-100 text-gray-700';
  const difficultyColor = DIFFICULTY_COLORS[skill.difficulty] || 'bg-gray-100 text-gray-700';

  return (
    <Link
      to={`/skills/${skill.id}`}
      className="skill-card group flex flex-col"
    >
      <div className="flex items-start space-x-4 mb-3">
        <span className="text-4xl" role="img" aria-label={skill.name}>{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors leading-tight">
            {skill.name}
          </h3>
          <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full capitalize ${categoryColor}`}>
            {skill.category}
          </span>
        </div>
      </div>

      <p className="text-gray-500 text-sm flex-1 mb-4 leading-relaxed">
        {skill.description}
      </p>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-1 text-gray-500">
          <BookOpen className="w-4 h-4" />
          <span>
            {contentCount !== undefined
              ? `${contentCount} resource${contentCount !== 1 ? 's' : ''}`
              : '— resources'}
          </span>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${difficultyColor}`}>
          {skill.difficulty}
        </span>
      </div>
    </Link>
  );
}
