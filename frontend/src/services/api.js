import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  withCredentials: true,
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.DEV) {
      const status = error.response?.status;
      const url = error.config?.url;
      if (error.code === 'NETWORK_ERROR') {
        console.error(`[API] Network error — is the backend running?`);
      } else if (status >= 500) {
        console.error(`[API] Server error ${status} on ${url}`);
      }
    }
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
  }
};

export default api;