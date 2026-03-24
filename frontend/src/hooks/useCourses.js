import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import analytics from '../services/analytics';

export function useEnrollment(skillId) {
  const { user } = useAuth();
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState(null);

  useEffect(() => {
    if (!user || !skillId) return;
    let cancelled = false;
    setLoading(true);
    apiService.getEnrollmentStatus(skillId)
      .then(data => {
        if (!cancelled) {
          setIsEnrolled(data.enrolled);
          setCourse(data.course);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, skillId]);

  const enroll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.enrollCourse(skillId);
      setIsEnrolled(true);
      setCourse(data.course);
      analytics.track('course_enrolled', { skillId });
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  const unenroll = useCallback(async () => {
    setLoading(true);
    try {
      await apiService.unenrollCourse(skillId);
      setIsEnrolled(false);
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  return { isEnrolled, loading, course, enroll, unenroll };
}
