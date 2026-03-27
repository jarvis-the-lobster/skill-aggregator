import '@testing-library/jest-dom';

// IntersectionObserver is not available in jsdom — stub it out
global.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};
