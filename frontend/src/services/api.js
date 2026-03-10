import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.url} - ${response.status}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    
    // Handle specific error cases
    if (error.response?.status === 404) {
      console.error('Resource not found');
    } else if (error.response?.status === 500) {
      console.error('Server error');
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('Network error - is the backend running?');
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
  }
};

export default api;