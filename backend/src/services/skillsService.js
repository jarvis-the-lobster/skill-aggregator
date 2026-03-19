const db = require('../models/database');
const scraper = require('./scraperService');

const MVP_SKILLS = [
  {
    id: 'python',
    name: 'Python Programming',
    category: 'programming',
    difficulty: 'beginner',
    description: 'Learn Python from basics to advanced concepts',
    estimatedHours: 40
  },
  {
    id: 'web-development',
    name: 'Web Development',
    category: 'programming',
    difficulty: 'beginner',
    description: 'HTML, CSS, JavaScript, and modern web frameworks',
    estimatedHours: 60
  },
  {
    id: 'digital-marketing',
    name: 'Digital Marketing',
    category: 'business',
    difficulty: 'beginner',
    description: 'SEO, social media, email marketing, and analytics',
    estimatedHours: 30
  },
  {
    id: 'ui-ux-design',
    name: 'UI/UX Design',
    category: 'design',
    difficulty: 'beginner',
    description: 'User interface and experience design principles',
    estimatedHours: 35
  },
  {
    id: 'data-science',
    name: 'Data Science',
    category: 'programming',
    difficulty: 'intermediate',
    description: 'Statistics, machine learning, and data visualization',
    estimatedHours: 80
  }
];

// Map alternate slugs/abbreviations to canonical skill IDs
// Reduces duplicate skill creation and YouTube quota waste
const SLUG_ALIASES = {
  // === Programming Languages ===
  'python-programming': 'python',
  'py': 'python',
  'python3': 'python',
  'python-3': 'python',
  'js': 'javascript',
  'javascript-programming': 'javascript',
  'ecmascript': 'javascript',
  'es6': 'javascript',
  'ts': 'typescript',
  'typescript-programming': 'typescript',
  'cpp': 'c-sharp',          // no dedicated C++ skill — c-sharp covers .NET/C-family; revisit if cpp skill added
  'c-plus-plus': 'c-sharp',  // normalizeSkillId turns "C++" into "c-plus-plus"
  'csharp': 'c-sharp',
  'c-number': 'c-sharp',
  'dotnet': 'c-sharp',
  'net': 'c-sharp',          // ".NET" → normalizeSkillId → "dotnet" or "net"
  'golang': 'go',
  'go-lang': 'go',
  'go-programming': 'go',
  'rust-lang': 'rust',
  'rust-programming': 'rust',
  'ruby-programming': 'ruby',
  'rb': 'ruby',
  'java-programming': 'java',
  'kotlin-programming': 'kotlin',
  'kt': 'kotlin',
  'swift-programming': 'swift',
  'php-programming': 'php',
  'r-language': 'r-programming',
  'r-stats': 'r-programming',
  'rlang': 'r-programming',
  'solidity-programming': 'solidity',
  'sol': 'solidity',
  'bash-scripting': 'bash',
  'shell-scripting': 'bash',
  'shell': 'bash',
  'zsh': 'bash',
  'matlab-programming': 'matlab',

  // === Web Development ===
  'web-dev': 'web-development',
  'webdev': 'web-development',
  'frontend': 'web-development',
  'front-end': 'web-development',
  'fullstack': 'web-development',
  'full-stack': 'web-development',
  'react': 'react-js',
  'reactjs': 'react-js',
  'react-native-development': 'react-native',
  'rn': 'react-native',
  'vue': 'vue-js',
  'vuejs': 'vue-js',
  'vue-3': 'vue-js',
  'angular-development': 'angular',
  'angularjs': 'angular',
  'node': 'node-js',
  'nodejs': 'node-js',
  'express': 'node-js',
  'expressjs': 'node-js',
  'graphql-api': 'graphql',
  'gql': 'graphql',
  'rest': 'rest-api',
  'restful': 'rest-api',
  'restful-api': 'rest-api',
  'api-design': 'rest-api',
  'web-scraper': 'web-scraping',
  'scraping': 'web-scraping',
  'html-css': 'web-development',
  'html': 'web-development',
  'css': 'web-design',

  // === Mobile Development ===
  'ios': 'ios-development',
  'ios-dev': 'ios-development',
  'iphone-development': 'ios-development',
  'android': 'android-development',
  'android-dev': 'android-development',
  'flutter-development': 'flutter',
  'dart': 'flutter',

  // === Data & AI ===
  'ml': 'machine-learning',
  'ai': 'machine-learning',
  'artificial-intelligence': 'machine-learning',
  'deep-learning-ai': 'deep-learning',
  'dl': 'deep-learning',
  'neural-networks': 'deep-learning',
  'nlp-ai': 'nlp',
  'natural-language-processing': 'nlp',
  'computer-vision-ai': 'computer-vision',
  'cv': 'computer-vision',
  'data-science': 'machine-learning',   // no dedicated data-science skill; ML is closest
  'data-analysis': 'data-engineering',
  'tensorflow-ml': 'tensorflow',
  'tf': 'tensorflow',
  'pytorch-ml': 'pytorch',
  'torch': 'pytorch',
  'pandas': 'python',
  'numpy': 'python',
  'scikit-learn': 'machine-learning',
  'sklearn': 'machine-learning',

  // === Databases ===
  'postgres': 'postgresql',
  'pg': 'postgresql',
  'mongo': 'mongodb',
  'mongo-db': 'mongodb',
  'redis-db': 'redis',
  'mysql': 'sql',
  'sqlite': 'sql',
  'database': 'sql',
  'databases': 'sql',

  // === DevOps & Cloud ===
  'amazon-web-services': 'aws',
  'amazon-aws': 'aws',
  'google-cloud': 'gcp',
  'google-cloud-platform': 'gcp',
  'azure-cloud': 'azure',
  'microsoft-azure': 'azure',
  'k8s': 'kubernetes',
  'kube': 'kubernetes',
  'docker-containers': 'docker',
  'containers': 'docker',
  'containerization': 'docker',
  'terraform-iac': 'terraform',
  'infrastructure-as-code': 'terraform',
  'iac': 'terraform',
  'ci-cd-pipeline': 'ci-cd',
  'cicd': 'ci-cd',
  'continuous-integration': 'ci-cd',
  'continuous-deployment': 'ci-cd',
  'github-actions': 'ci-cd',
  'jenkins': 'ci-cd',
  'dev-ops': 'devops',
  'linux-admin': 'linux',
  'linux-administration': 'linux',
  'ubuntu': 'linux',
  'debian': 'linux',
  'sysadmin': 'linux',
  'system-administration': 'linux',
  'microservices-architecture': 'microservices',
  'micro-services': 'microservices',
  'system-design-interview': 'system-design',
  'sys-design': 'system-design',
  'version-control': 'git',
  'github': 'git',
  'gitlab': 'git',
  'git-version-control': 'git',

  // === Design ===
  'ui-ux': 'ui-ux-design',
  'ux-design': 'ui-ux-design',
  'ux': 'ui-ux-design',
  'ui-design': 'ui-ux-design',
  'user-experience': 'ui-ux-design',
  'user-interface': 'ui-ux-design',
  'figma-design': 'figma',
  'sketch-design': 'sketch',
  'sketch-app': 'sketch',
  'adobe-illustrator': 'illustrator',
  'ai-illustrator': 'illustrator',
  'adobe-photoshop': 'photoshop',
  'ps': 'photoshop',
  'adobe-premiere': 'premiere-pro',
  'premiere': 'premiere-pro',
  'adobe-after-effects': 'after-effects',
  'ae': 'after-effects',
  'after-effects-motion': 'after-effects',
  'motion-graphics': 'motion-design',
  'mograph': 'motion-design',
  '3d': '3d-modeling',
  '3d-design': '3d-modeling',
  'blender-3d': 'blender',
  'unity': 'unity-game-dev',
  'unity3d': 'unity-game-dev',
  'unity-game-development': 'unity-game-dev',
  'unreal': 'unreal-engine',
  'ue5': 'unreal-engine',
  'ue4': 'unreal-engine',
  'unreal-engine-5': 'unreal-engine',
  'game-development': 'game-design',
  'game-dev': 'game-design',
  'gamedev': 'game-design',
  'graphic-design': 'digital-art',
  'digital-illustration': 'digital-art',
  'logo': 'logo-design',
  'logos': 'logo-design',
  'branding': 'brand-design',
  'brand-identity': 'brand-design',
  'wireframe': 'wireframing',
  'wireframes': 'wireframing',
  'prototype': 'prototyping',
  'prototypes': 'prototyping',
  'color-palette': 'color-theory',
  'colors': 'color-theory',
  'type-design': 'typography',
  'fonts': 'typography',
  'icon-design-ui': 'icon-design',
  'icons': 'icon-design',
  'design-system': 'design-systems',
  'a11y': 'accessibility-design',
  'web-accessibility': 'accessibility-design',
  'accessibility': 'accessibility-design',
  'responsive-design': 'mobile-design',
  'mobile-ui': 'mobile-design',
  'landing-page': 'landing-page-design',
  'landing-pages': 'landing-page-design',
  'package-design': 'packaging-design',
  'print': 'print-design',

  // === Marketing ===
  'seo-marketing': 'seo',
  'search-engine-optimization': 'seo',
  'local-search': 'local-seo',
  'smm': 'social-media-marketing',
  'social-media': 'social-media-marketing',
  'social-marketing': 'social-media-marketing',
  'email': 'email-marketing',
  'email-campaigns': 'email-marketing',
  'content-strategy': 'content-marketing',
  'content-creation': 'content-marketing',
  'google-adwords': 'google-ads',
  'adwords': 'google-ads',
  'ppc': 'google-ads',
  'pay-per-click': 'google-ads',
  'fb-ads': 'facebook-ads',
  'meta-ads': 'facebook-ads',
  'instagram-ads': 'facebook-ads',
  'tiktok': 'tiktok-marketing',
  'tiktok-ads': 'tiktok-marketing',
  'twitter': 'twitter-marketing',
  'x-marketing': 'twitter-marketing',
  'linkedin': 'linkedin-marketing',
  'reddit': 'reddit-marketing',
  'youtube': 'youtube-content',
  'youtube-marketing': 'youtube-content',
  'youtube-channel': 'youtube-content',
  'affiliate': 'affiliate-marketing',
  'influencer': 'influencer-marketing',
  'growth': 'growth-hacking',
  'growth-marketing': 'growth-hacking',
  'cro': 'conversion-optimization',
  'conversion-rate': 'conversion-optimization',
  'conversion-rate-optimization': 'conversion-optimization',
  'marketing-data': 'marketing-analytics',
  'web-analytics': 'marketing-analytics',
  'google-analytics': 'marketing-analytics',
  'pr': 'pr-communications',
  'public-relations': 'pr-communications',
  'blog': 'blogging',
  'blog-writing': 'blogging',
  'community': 'community-building',
  'community-management': 'community-building',
  'newsletter': 'newsletter-writing',
  'newsletters': 'newsletter-writing',
  'podcast': 'podcast-production',
  'podcasting': 'podcast-production',
  'podcast-marketing-strategy': 'podcast-marketing',
  'video-content': 'video-marketing',
  'video-production': 'videography',

  // === Business & Finance ===
  'startup': 'entrepreneurship',
  'startups': 'entrepreneurship',
  'lean-methodology': 'lean-startup',
  'pm': 'product-management',
  'product-manager': 'product-management',
  'pmp': 'project-management',
  'agile-methodology': 'agile',
  'agile-development': 'agile',
  'scrum-master': 'scrum',
  'scrum-methodology': 'scrum',
  'ops': 'operations',
  'supply-chain-management': 'supply-chain',
  'logistics': 'supply-chain',
  'consulting-skills': 'consulting',
  'management-consulting': 'consulting',
  'team-lead': 'team-management',
  'people-management': 'team-management',
  'leader': 'leadership',
  'leadership-skills': 'leadership',
  'negotiation-skills': 'negotiation',
  'negotiate': 'negotiation',
  'public-speaking-tips': 'public-speaking',
  'speaking': 'public-speaking',
  'presentations': 'public-speaking',
  'business-analytics': 'business-analysis',
  'ba': 'business-analysis',
  'technical-writer': 'technical-writing',
  'tech-writing': 'technical-writing',
  'copywrite': 'copywriting',
  // 'copy' removed — too generic
  'business-write': 'business-writing',
  'professional-writing': 'business-writing',
  'ab-test': 'a-b-testing',
  'ab-testing': 'a-b-testing',
  'split-testing': 'a-b-testing',
  'user-testing': 'user-research',
  'ux-research': 'user-research',

  // === Finance & Investing ===
  'stocks': 'stock-trading',
  'stock-market': 'stock-trading',
  'day-trading': 'stock-trading',
  'options': 'options-trading',
  'forex': 'forex-trading',
  'fx-trading': 'forex-trading',
  'crypto': 'crypto-trading',
  'cryptocurrency': 'crypto-trading',
  'bitcoin': 'crypto-trading',
  'dividends': 'dividend-investing',
  'dividend-stocks': 'dividend-investing',
  'etf': 'index-funds',
  'etfs': 'index-funds',
  'index-fund': 'index-funds',
  'vanguard': 'index-funds',
  'invest': 'investing',
  'investment': 'investing',
  'real-estate': 'real-estate-investing',
  'property-investing': 'real-estate-investing',
  'rental-property': 'real-estate-investing',
  'passive': 'passive-income',
  'side-hustle': 'passive-income',
  'dropship': 'dropshipping',
  'ecommerce': 'e-commerce',
  'shopify': 'e-commerce',
  'saas': 'saas-business',
  'software-as-a-service': 'saas-business',
  'personal-finance-tips': 'personal-finance',
  'money-management': 'personal-finance',
  'budget': 'budgeting',
  'budgets': 'budgeting',
  'retire': 'retirement-planning',
  'retirement': 'retirement-planning',
  'fire': 'retirement-planning',
  'tax': 'tax-planning',
  'taxes': 'tax-planning',
  'tax-strategy': 'tax-planning',
  'financial-model': 'financial-modeling',
  'dcf': 'financial-modeling',
  'valuation-model': 'valuation',
  'company-valuation': 'valuation',
  'vc': 'venture-capital',
  'venture': 'venture-capital',
  'quickbooks-accounting': 'quickbooks',
  'qb': 'quickbooks',
  'bookkeeper': 'bookkeeping',
  'excel-spreadsheet': 'excel',
  'spreadsheets': 'excel',
  'google-sheets': 'excel',
  'excel-for-finance': 'excel-finance',
  'financial-excel': 'excel-finance',
  'financial-analyst': 'financial-analysis',
  'power-bi-dashboard': 'power-bi',
  'powerbi': 'power-bi',
  'tableau-dashboard': 'tableau',
  'data-visualization': 'tableau',
  'dataviz': 'tableau',

  // === Security ===
  'cybersec': 'cybersecurity',
  'cyber-security': 'cybersecurity',
  'infosec': 'cybersecurity',
  'information-security': 'cybersecurity',
  'penetration-testing': 'ethical-hacking',
  'pentest': 'ethical-hacking',
  'pentesting': 'ethical-hacking',
  'bug-bounty': 'ethical-hacking',
  'hacking': 'ethical-hacking',
  'web3-development': 'web3',
  'blockchain-development': 'blockchain',
  'smart-contracts': 'solidity',
  'embedded': 'embedded-systems',
  'iot': 'embedded-systems',
  'internet-of-things': 'embedded-systems',

  // === Testing ===
  'qa': 'testing',
  'quality-assurance': 'testing',
  'test-automation': 'testing',
  'unit-testing': 'testing',
  'tdd': 'testing',
  'test-driven-development': 'testing',
  'algorithms-data-structures': 'algorithms',
  'dsa': 'algorithms',
  'data-structures': 'algorithms',
  'leetcode': 'algorithms',
  'coding-interview': 'algorithms',

  // === Creative & Media ===
  'creative-write': 'creative-writing',
  'writing': 'creative-writing',
  'fiction': 'fiction-writing',
  'novel-writing': 'fiction-writing',
  'screenplay': 'screenwriting',
  'script-writing': 'screenwriting',
  'comedy': 'comedy-writing',
  'standup': 'comedy-writing',
  'songwrite': 'songwriting',
  'music': 'music-production',
  'music-making': 'music-production',
  'beat-making': 'music-production',
  'animation-2d': 'animation',
  'animation-3d': 'animation',
  'animate': 'animation',
  'photo': 'photography',
  'photos': 'photography',
  'camera': 'photography',
  'street-photo': 'street-photography',
  'food-photo': 'food-photography',
  'video': 'videography',
  'filmmaking': 'videography',
  'film': 'videography',
  'documentary': 'documentary-making',
  'doc-filmmaking': 'documentary-making',
  'draw': 'drawing',
  'sketching': 'drawing',
  'illustration': 'drawing',
  'storytell': 'storytelling',
  'narrative': 'storytelling',

  // === Languages ===
  'espanol': 'spanish',
  'learn-spanish': 'spanish',
  'francais': 'french',
  'learn-french': 'french',
  'deutsch': 'german',
  'learn-german': 'german',
  'italiano': 'italian',
  'learn-italian': 'italian',
  'portugues': 'portuguese',
  'learn-portuguese': 'portuguese',
  'nihongo': 'japanese',
  'learn-japanese': 'japanese',
  'hangul': 'korean',
  'learn-korean': 'korean',
  'zhongwen': 'mandarin',
  'chinese': 'mandarin',
  'learn-chinese': 'mandarin',
  'learn-mandarin': 'mandarin',
  'learn-arabic': 'arabic',
  'learn-russian': 'russian',
  'learn-greek': 'greek',
  'learn-latin': 'latin',
  'asl': 'sign-language',
  'american-sign-language': 'sign-language',
  'learn-english': 'english-writing',
  'english': 'english-writing',
  'grammar': 'english-writing',

  // === Health & Wellness ===
  'workout': 'fitness',
  'exercise': 'fitness',
  'gym': 'fitness',
  'weight-training': 'strength-training',
  'weightlifting': 'strength-training',
  'lifting': 'strength-training',
  'resistance-training': 'strength-training',
  'run': 'running',
  'jogging': 'running',
  'marathon': 'running',
  'sport': 'sports-performance',
  'sports': 'sports-performance',
  'athletic-performance': 'sports-performance',
  'injury-prevention-fitness': 'injury-prevention',
  'rehab': 'injury-prevention',
  'prehab': 'injury-prevention',
  'meditate': 'meditation',
  'mindfulness': 'meditation',
  'breathe': 'breathwork',
  'breathing': 'breathwork',
  'breathing-exercises': 'breathwork',
  'sleep': 'sleep-optimization',
  'sleep-better': 'sleep-optimization',
  'insomnia': 'sleep-optimization',
  'stress': 'stress-management',
  'anxiety': 'stress-management',
  'mental-wellness': 'mental-health',
  'therapy': 'mental-health',
  'habits': 'habit-building',
  'atomic-habits': 'habit-building',
  'habit': 'habit-building',
  'diet': 'nutrition',
  'healthy-eating': 'nutrition',
  'macros': 'nutrition',
  'vegan': 'plant-based-diet',
  'plant-based': 'plant-based-diet',
  'vegetarian': 'plant-based-diet',
  'fasting': 'intermittent-fasting',
};

// Normalize arbitrary query string to a slug ID
// "Machine Learning" -> "machine-learning"
// "C++" -> "c-plus-plus"
// "C#" -> "c-sharp"
// "Node.js" -> "nodejs"
function normalizeSkillId(query) {
  return query
    .replace(/c\+\+/gi, 'c-plus-plus')
    .replace(/c#/gi, 'c-sharp')
    .replace(/\.js\b/gi, 'js')       // Node.js -> Nodejs, Vue.js -> Vuejs
    .replace(/\.ts\b/gi, 'ts')       // Deno.ts etc.
    .replace(/\.net\b/gi, 'dotnet')  // .NET -> dotnet
    .replace(/\./g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Title-case the original query string
function normalizeSkillName(query) {
  return query
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Map a raw DB row to a consistent JS object
function mapSkillRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'general',
    difficulty: row.difficulty || 'beginner',
    description: row.description || `Learn ${row.name}`,
    estimatedHours: row.estimated_hours || 0,
    status: row.status || 'pending',
    lastScrapedAt: row.last_scraped_at || null
  };
}

class SkillsService {
  // Seed the 5 MVP skills into DB on startup (idempotent)
  async seedMVPSkills() {
    for (const skill of MVP_SKILLS) {
      const existing = await db.getSkillById(skill.id);
      if (!existing) {
        await db.insert(
          'INSERT INTO skills (id, name, category, difficulty, description, estimated_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [skill.id, skill.name, skill.category, skill.difficulty, skill.description, skill.estimatedHours, 'ready']
        );
      } else if (!existing.status || existing.status === 'pending') {
        // Existing row missing status — mark ready since content may already be in DB
        await db.updateSkillStatus(skill.id, 'ready');
      }
    }
  }

  async getAllSkills() {
    const rows = await db.getSkills();
    return rows.map(mapSkillRow);
  }

  // Create a brand-new skill record with status "pending"
  async createSkill(id, name) {
    await db.insert(
      'INSERT OR IGNORE INTO skills (id, name, status) VALUES (?, ?, ?)',
      [id, name, 'pending']
    );
    return mapSkillRow(await db.getSkillById(id));
  }

  // Search for a skill by arbitrary query; creates + scrapes if not found
  async searchSkill(query) {
    const rawId = normalizeSkillId(query);
    const skillId = SLUG_ALIASES[rawId] || rawId;
    const skillName = normalizeSkillName(query);

    const existing = await db.getSkillById(skillId);

    if (existing) {
      if (existing.status === 'ready') {
        const content = await this.getCuratedContent(skillId, {}, existing);
        return { skill: mapSkillRow(existing), status: 'ready', content };
      }
      return { skill: mapSkillRow(existing), status: existing.status || 'scraping' };
    }

    // Not found — create and kick off a background scrape
    const skill = await this.createSkill(skillId, skillName);
    this.scrapeSkillContent(skillId).catch(err =>
      console.error(`Background scrape failed for ${skillId}:`, err.message)
    );
    return { skill, status: 'scraping', message: 'Gathering content...' };
  }

  // Get full skill details + content (used by SkillPage for polling)
  async getSkillContent(skillId, filters = {}) {
    try {
      const skillRow = await db.getSkillById(skillId);

      if (!skillRow) {
        // Auto-create with skillId as name (handles direct URL navigation)
        const skillName = skillId
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const skill = await this.createSkill(skillId, skillName);
        this.scrapeSkillContent(skillId).catch(err =>
          console.error(`Background scrape failed for ${skillId}:`, err.message)
        );
        return { skill, status: 'scraping', content: { videos: [], articles: [], courses: [] } };
      }

      if (skillRow.status === 'ready') {
        const content = await this.getCuratedContent(skillId, filters, skillRow);
        // If marked ready but has no content and was never scraped, re-trigger
        const isEmpty = content.videos.length === 0 && content.articles.length === 0;
        if (isEmpty && !skillRow.last_scraped_at) {
          this.scrapeSkillContent(skillId).catch(err =>
            console.error(`Re-trigger scrape failed for ${skillId}:`, err.message)
          );
        }
        return { skill: mapSkillRow(skillRow), status: isEmpty && !skillRow.last_scraped_at ? 'scraping' : 'ready', content };
      }

      // Re-trigger if stuck pending with no scrape ever attempted
      if ((skillRow.status === 'pending' || skillRow.status === 'error') && !skillRow.last_scraped_at) {
        this.scrapeSkillContent(skillId).catch(err =>
          console.error(`Re-trigger scrape failed for ${skillId}:`, err.message)
        );
      }

      return {
        skill: mapSkillRow(skillRow),
        status: skillRow.status || 'scraping',
        content: { videos: [], articles: [], courses: [] }
      };
    } catch (error) {
      console.error('Error getting skill content:', error);
      throw error;
    }
  }

  async getCuratedContent(skillId, filters = {}, skillRow = null) {
    const rows = await db.getSkillContent(skillId, filters.type || null);

    const videos = rows
      .filter(r => r.type === 'video')
      .map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        channel: r.author,
        duration: r.duration,
        views: r.views,
        likes: r.likes,
        rating: r.rating,
        thumbnail: r.thumbnail,
        description: r.description,
        publishedDate: r.published_date,
        tags: r.tags ? JSON.parse(r.tags) : []
      }));

    const articles = rows
      .filter(r => r.type === 'article')
      .map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        author: r.author,
        readTime: r.read_time,
        excerpt: r.description,
        publishedDate: r.published_date,
        tags: r.tags ? JSON.parse(r.tags) : []
      }));

    return { videos, articles, courses: [], totalCount: rows.length, lastScrapedAt: skillRow?.last_scraped_at || null };
  }

  async updateStatus(skillId, status) {
    await db.updateSkillStatus(skillId, status);
  }

  async scrapeSkillContent(skillId, { force = false } = {}) {
    const skillRow = await db.getSkillById(skillId);

    if (!force) {
      // Guard: don't start a second concurrent scrape
      if (skillRow?.status === 'scraping') {
        return;
      }

      // Guard: don't re-scrape within 24 hours
      if (skillRow?.last_scraped_at) {
        const hoursSince = (Date.now() - new Date(skillRow.last_scraped_at).getTime()) / 3600000;
        if (hoursSince < 24) {
          return;
        }
      }
    }

    await db.updateSkillStatus(skillId, 'scraping');

    try {
      const result = await scraper.scrapeSkill(skillId);
      await db.updateSkillStatus(skillId, 'ready');
      await db.updateSkillLastScraped(skillId);
      return result;
    } catch (err) {
      await db.updateSkillStatus(skillId, 'error');
      console.error(`❌ Scrape failed for ${skillId}:`, err.message);
      throw err;
    }
  }

  async getSkillStats(skillId) {
    const rows = await db.getSkillContent(skillId);
    const videos = rows.filter(r => r.type === 'video');
    const articles = rows.filter(r => r.type === 'article');
    const ratings = rows.filter(r => r.rating).map(r => r.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      totalVideos: videos.length,
      totalArticles: articles.length,
      totalCourses: 0,
      avgRating: Math.round(avgRating * 10) / 10,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = new SkillsService();
