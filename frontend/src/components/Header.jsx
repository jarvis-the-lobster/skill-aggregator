import { Link } from 'react-router-dom';
import { Search, BookOpen, Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="p-2 bg-primary-500 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">SkillAggregator</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link 
              to="/" 
              className="text-gray-700 hover:text-primary-600 font-medium transition-colors"
            >
              Home
            </Link>
            <Link 
              to="/about" 
              className="text-gray-700 hover:text-primary-600 font-medium transition-colors"
            >
              About
            </Link>
          </nav>

          {/* CTA Button */}
          <div className="flex items-center space-x-4">
            <button className="btn-primary flex items-center space-x-2">
              <BookOpen className="w-4 h-4" />
              <span>Start Learning</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}