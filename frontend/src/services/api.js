import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

// Request interceptor — attach Bearer token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export const apiService = {
  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  },

  // Skills endpoints
  async getSkills() {
    const response = await api.get('/skills');
    return response.data;
  },

  async getSkillContent(skillId, filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await api.get(`/skills/${skillId}?${params}`);
    return response.data;
  },

  async scrapeSkillContent(skillId) {
    const response = await api.post(`/skills/${skillId}/scrape`);
    return response.data;
  },

  async getSkillStats(skillId) {
    const response = await api.get(`/skills/${skillId}/stats`);
    return response.data;
  },

  // Search for a skill by arbitrary query string (normalizes + creates if needed)
  async searchSkill(query) {
    const response = await api.get(`/skills/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  // Courses endpoints
  async getEnrollmentStatus(skillId) {
    const response = await api.get(`/courses/enrollment/${skillId}`);
    return response.data;
  },

  async enrollCourse(skillId) {
    const response = await api.post(`/courses/enroll/${skillId}`);
    return response.data;
  },

  async unenrollCourse(skillId) {
    const response = await api.delete(`/courses/enroll/${skillId}`);
    return response.data;
  },

  async getMyCourses() {
    const response = await api.get('/courses/my');
    return response.data;
  },

  async updateCourseStatus(skillId, status) {
    const response = await api.patch(`/courses/${skillId}/status`, { status });
    return response.data;
  },

  // Newsletter endpoints
  async subscribeToNewsletter(email, categories = []) {
    const response = await api.post('/newsletter/subscribe', { email, categories });
    return response.data;
  },

  async getSubscriberCount() {
    const response = await api.get('/newsletter/subscribers/count');
    return response.data;
  },

  // Learning plan endpoints
  async getLearningPlan(skillId) {
    const response = await api.get(`/learning-plans/${skillId}`);
    return response.data;
  },

  async generateLearningPlan(skillId) {
    const response = await api.post(`/learning-plans/${skillId}/generate`);
    return response.data;
  },

  async enrollLearningPlan(skillId) {
    const response = await api.post(`/learning-plans/${skillId}/enroll`);
    return response.data;
  },

  async getPlanProgress(skillId) {
    const response = await api.get(`/learning-plans/${skillId}/my-progress`);
    return response.data;
  },

  async completePlanDay(skillId, day) {
    const response = await api.post(`/learning-plans/${skillId}/complete-day`, { day });
    return response.data;
  },

  async refreshPlan(skillId) {
    const response = await api.post(`/learning-plans/${skillId}/refresh`);
    return response.data;
  },

  async submitReview(skillId, dayNumber, { answers, reflection }) {
    const response = await api.post(`/learning-plans/${skillId}/review/${dayNumber}/submit`, { answers, reflection });
    return response.data;
  },

  // Ratings endpoints
  async rateContent(contentId, rating) {
    const response = await api.post(`/ratings/${contentId}`, { rating });
    return response.data;
  },

  async getRatings(contentIds) {
    const params = new URLSearchParams({ contentIds: contentIds.join(',') });
    const response = await api.get(`/ratings?${params}`);
    return response.data;
  },

  // Streak endpoints
  async getStreak() {
    const response = await api.get('/streaks');
    return response.data;
  },

  async recordStreakActivity() {
    const response = await api.post('/streaks/activity');
    return response.data;
  },

  // Push notification endpoints
  async getVapidKey() {
    const response = await api.get('/push/vapid-key');
    return response.data;
  },

  async subscribePush(subscription) {
    const response = await api.post('/push/subscribe', subscription);
    return response.data;
  },

  async unsubscribePush(endpoint) {
    const response = await api.delete('/push/unsubscribe', { data: { endpoint } });
    return response.data;
  },

  // Onboarding endpoints
  async getOnboardingStatus() {
    const response = await api.get('/onboarding');
    return response.data;
  },

  async saveOnboarding(data) {
    const response = await api.post('/onboarding', data);
    return response.data;
  },

  // Notification endpoints
  async getNotifications({ limit = 20, offset = 0 } = {}) {
    const response = await api.get(`/notifications?limit=${limit}&offset=${offset}`);
    return response.data;
  },

  async markNotificationRead(id) {
    const response = await api.post(`/notifications/${id}/read`);
    return response.data;
  },

  async markAllNotificationsRead() {
    const response = await api.post('/notifications/read-all');
    return response.data;
  },

  async getSkillContentCounts(ids = []) {
    if (!ids.length) return {};
    const params = new URLSearchParams({ ids: ids.join(',') });
    const response = await api.get(`/skills/counts?${params}`);
    return response.data.counts || {};
  }
};

export default api;