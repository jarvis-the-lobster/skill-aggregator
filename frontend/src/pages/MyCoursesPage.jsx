import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookOpen, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { StreakWidget } from '../components/StreakWidget';
import { PushOptIn } from '../components/PushOptIn';
import { useStreak } from '../hooks/useStreak';

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-400',
  completed: 'bg-teal/15 text-teal',
};

export function MyCoursesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const { streak } = useStreak();

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



  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-dark-bg p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-dark-surface rounded w-1/3"></div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-dark-surface rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <Helmet>
        <title>My Courses — LearnStack</title>
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/my-courses`} />
      </Helmet>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-4">
          <PushOptIn streak={streak} />
        </div>
        <div className="mb-8">
          <StreakWidget />
        </div>

        <h1 className="text-3xl font-bold text-slate-100 mb-2">My Courses</h1>
        <p className="text-slate-400 mb-8">Track your learning journey</p>

        {courses.length === 0 ? (
          <div className="bg-dark-card rounded-xl border border-white/[0.08] p-12 text-center">
            <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-100 mb-2">No courses yet</h2>
            <p className="text-slate-400 mb-6">
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
                className="bg-dark-card rounded-xl border border-white/[0.08] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-1">
                    <Link
                      to={`/skills/${course.skill_id}`}
                      className="text-lg font-semibold text-slate-100 hover:text-teal transition-colors"
                    >
                      {course.name}
                    </Link>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[course.status] || STATUS_STYLES.active}`}>
                      {course.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 capitalize mb-3">{course.category}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
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
                  {course.status === 'completed' ? (
                    <Link
                      to={`/skills/${course.skill_id}/plan`}
                      className="btn-secondary text-sm"
                    >
                      ✅ Completed — Review
                    </Link>
                  ) : (
                    <Link
                      to={`/skills/${course.skill_id}/plan`}
                      className="btn-primary text-sm"
                    >
                      Continue
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
