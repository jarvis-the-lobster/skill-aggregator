import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

const STATUS_OPTIONS = ['active', 'paused', 'completed'];

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800',
};

export function MyCoursesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    apiService.getMyCourses()
      .then(data => setCourses(data.courses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleStatusChange(skillId, newStatus) {
    try {
      await apiService.updateCourseStatus(skillId, newStatus);
      setCourses(prev =>
        prev.map(c => c.skill_id === skillId ? { ...c, status: newStatus } : c)
      );
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Courses</h1>
        <p className="text-gray-500 mb-8">Track your learning journey</p>

        {courses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No courses yet</h2>
            <p className="text-gray-500 mb-6">
              Browse skills to get started on your learning journey.
            </p>
            <Link to="/" className="btn-primary">
              Browse Skills
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map(course => (
              <div
                key={course.skill_id}
                className="bg-white rounded-xl shadow-sm border p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-1">
                    <Link
                      to={`/skills/${course.skill_id}`}
                      className="text-lg font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                    >
                      {course.name}
                    </Link>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[course.status] || STATUS_STYLES.active}`}>
                      {course.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 capitalize mb-3">{course.category}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Enrolled {new Date(course.enrolled_at).toLocaleDateString()}</span>
                    </div>
                    {course.estimated_hours > 0 && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>~{course.estimated_hours}h</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      <span>{course.content_count} resources</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <select
                    value={course.status}
                    onChange={e => handleStatusChange(course.skill_id, e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                  <Link
                    to={`/skills/${course.skill_id}`}
                    className="btn-primary text-sm"
                  >
                    Continue
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
