const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../models/database');

const DELAY_MS = parseInt(process.env.SCRAPE_DELAY_MS || '1000');
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS_PER_SOURCE || '30');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map skill IDs to human-readable search terms
const SKILL_SEARCH_TERMS = {
  'python': 'Python programming',
  'web-development': 'web development',
  'digital-marketing': 'digital marketing',
  'ui-ux-design': 'UI UX design',
  'data-science': 'data science'
};

const ALL_SKILLS = Object.keys(SKILL_SEARCH_TERMS);

class ScraperService {
  constructor() {
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
  }

  getSearchTerm(skillId) {
    return SKILL_SEARCH_TERMS[skillId] || skillId.replace(/-/g, ' ');
  }

  // ─── Main orchestration ───────────────────────────────────────────────────

  async scrapeSkill(skillId) {
    console.log(`\n🔍 Scraping: ${skillId}`);

    const [youtubeResult, articleResult] = await Promise.allSettled([
      this.scrapeYouTube(skillId),
      this.scrapeArticles(skillId)
    ]);

    const videos = youtubeResult.status === 'fulfilled'
      ? youtubeResult.value
      : (console.error(`  ❌ YouTube failed: ${youtubeResult.reason?.message}`), []);

    const articles = articleResult.status === 'fulfilled'
      ? articleResult.value
      : (console.error(`  ❌ Articles failed: ${articleResult.reason?.message}`), []);

    const validated = this.validateContent({ videos, articles });
    console.log(`  ✅ ${validated.videos.length} videos, ${validated.articles.length} articles`);

    // Save to database
    const allContent = [
      ...validated.videos.map(v => ({ ...v, type: 'video' })),
      ...validated.articles.map(a => ({ ...a, type: 'article' }))
    ];

    if (allContent.length > 0) {
      try {
        await db.saveContent(allContent, skillId);
        await db.updateSkillLastScraped(skillId);
        console.log(`  💾 Saved ${allContent.length} items to database`);
      } catch (err) {
        console.error(`  ❌ DB save failed: ${err.message}`);
      }
    }

    return { skill: skillId, videos: validated.videos, articles: validated.articles, scrapedAt: new Date().toISOString() };
  }

  async scrapeAllSkills() {
    console.log('🚀 Starting full scrape of all skills...\n');
    const summary = [];

    for (let i = 0; i < ALL_SKILLS.length; i++) {
      const skillId = ALL_SKILLS[i];
      try {
        const result = await this.scrapeSkill(skillId);
        summary.push({ skillId, success: true, videos: result.videos.length, articles: result.articles.length });
      } catch (err) {
        console.error(`Failed to scrape ${skillId}: ${err.message}`);
        summary.push({ skillId, success: false, error: err.message });
      }

      if (i < ALL_SKILLS.length - 1) {
        console.log(`  ⏳ Waiting ${DELAY_MS}ms...\n`);
        await sleep(DELAY_MS);
      }
    }

    console.log('\n📊 Scrape Summary:');
    summary.forEach(r => {
      if (r.success) {
        console.log(`  ✅ ${r.skillId}: ${r.videos} videos, ${r.articles} articles`);
      } else {
        console.log(`  ❌ ${r.skillId}: FAILED — ${r.error}`);
      }
    });

    return summary;
  }

  // ─── YouTube Data API v3 ─────────────────────────────────────────────────

  async scrapeYouTube(skillId) {
    if (!this.youtubeApiKey) {
      console.log('  ⚠️  YOUTUBE_API_KEY not set, skipping YouTube');
      return [];
    }

    const searchTerm = this.getSearchTerm(skillId);
    const queries = [
      `${searchTerm} tutorial for beginners`,
      `${searchTerm} crash course`,
      `learn ${searchTerm}`
    ];

    const seen = new Set();
    const allVideos = [];
    const startTime = Date.now();
    let totalQuotaUsed = 0;

    for (const q of queries) {
      try {
        console.log(`  📹 YouTube: "${q}"`);

        // Step 1: search for video IDs (costs 100 quota units per search)
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            key: this.youtubeApiKey,
            q,
            part: 'snippet',
            type: 'video',
            videoCategoryId: '27', // Education
            maxResults: Math.ceil(MAX_RESULTS / queries.length),
            order: 'relevance',
            relevanceLanguage: 'en',
            safeSearch: 'strict'
          },
          timeout: 10000
        });
        totalQuotaUsed += 100; // search.list costs 100 units

        const videoIds = searchRes.data.items.map(i => i.id.videoId).filter(Boolean).join(',');
        if (!videoIds) continue;

        // Step 2: fetch statistics + details for quality signals (1 unit per video)
        const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            key: this.youtubeApiKey,
            id: videoIds,
            part: 'statistics,contentDetails,snippet'
          },
          timeout: 10000
        });
        totalQuotaUsed += statsRes.data.items.length; // videos.list costs 1 unit per video

        for (const item of statsRes.data.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);

          const { snippet, statistics, contentDetails } = item;
          allVideos.push({
            id: `yt_${item.id}`,
            title: snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
            channel: snippet.channelTitle,
            duration: this._parseDuration(contentDetails.duration),
            views: parseInt(statistics.viewCount || '0'),
            likes: parseInt(statistics.likeCount || '0'),
            publishedDate: snippet.publishedAt?.split('T')[0],
            description: (snippet.description || '').slice(0, 500),
            source: 'YouTube'
          });
        }

        await sleep(200); // respect quota between API calls
      } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.error(`  ❌ YouTube query "${q}": ${errMsg}`);
        const isQuotaError = errMsg.includes('quota') || err.response?.status === 403;
        await db.logScrape({
          skill_id: skillId,
          source: 'youtube',
          status: isQuotaError ? 'quota_exceeded' : 'error',
          items_fetched: allVideos.length,
          error_message: errMsg,
          quota_used: totalQuotaUsed,
          duration_ms: Date.now() - startTime
        });
      }
    }

    // Sort by quality: views weighted by like ratio and recency
    const result = allVideos.slice(0, MAX_RESULTS);
    result.sort((a, b) => this._videoScore(b) - this._videoScore(a));

    if (allVideos.length > 0 || totalQuotaUsed > 0) {
      await db.logScrape({
        skill_id: skillId,
        source: 'youtube',
        status: 'success',
        items_fetched: result.length,
        quota_used: totalQuotaUsed,
        duration_ms: Date.now() - startTime
      });
    }

    return result;
  }

  _videoScore(video) {
    const views = video.views || 0;
    const likes = video.likes || 0;
    const likeRatio = views > 0 ? likes / views : 0;
    const ageMs = video.publishedDate ? Date.now() - new Date(video.publishedDate).getTime() : 0;
    const recencyBonus = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 365 * 3)); // decay over 3 years
    return views * (1 + likeRatio * 10) * (1 + recencyBonus * 0.5);
  }

  _parseDuration(iso8601) {
    if (!iso8601) return null;
    const m = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return null;
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    const s = parseInt(m[3] || '0');
    return h > 0
      ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${min}:${String(s).padStart(2, '0')}`;
  }

  // ─── Article scrapers ────────────────────────────────────────────────────

  async scrapeArticles(skillId) {
    const startTimes = { devto: Date.now(), medium: Date.now(), freecodecamp: Date.now() };

    const [devtoResult, mediumResult, fccResult] = await Promise.allSettled([
      this.scrapeDevTo(skillId),
      this.scrapeMediumRSS(skillId),
      this.scrapeFreeCodeCamp(skillId)
    ]);

    const articles = [];

    if (devtoResult.status === 'fulfilled') {
      console.log(`    Dev.to: ${devtoResult.value.length} articles`);
      articles.push(...devtoResult.value);
      await db.logScrape({ skill_id: skillId, source: 'devto', status: 'success', items_fetched: devtoResult.value.length, duration_ms: Date.now() - startTimes.devto });
    } else {
      console.error(`    ❌ Dev.to: ${devtoResult.reason?.message}`);
      await db.logScrape({ skill_id: skillId, source: 'devto', status: 'error', error_message: devtoResult.reason?.message, duration_ms: Date.now() - startTimes.devto });
    }

    if (mediumResult.status === 'fulfilled') {
      console.log(`    Medium: ${mediumResult.value.length} articles`);
      articles.push(...mediumResult.value);
      await db.logScrape({ skill_id: skillId, source: 'medium', status: 'success', items_fetched: mediumResult.value.length, duration_ms: Date.now() - startTimes.medium });
    } else {
      console.error(`    ❌ Medium: ${mediumResult.reason?.message}`);
      await db.logScrape({ skill_id: skillId, source: 'medium', status: 'error', error_message: mediumResult.reason?.message, duration_ms: Date.now() - startTimes.medium });
    }

    if (fccResult.status === 'fulfilled') {
      console.log(`    freeCodeCamp: ${fccResult.value.length} articles`);
      articles.push(...fccResult.value);
      await db.logScrape({ skill_id: skillId, source: 'freecodecamp', status: 'success', items_fetched: fccResult.value.length, duration_ms: Date.now() - startTimes.freecodecamp });
    } else {
      console.error(`    ❌ freeCodeCamp: ${fccResult.reason?.message}`);
      await db.logScrape({ skill_id: skillId, source: 'freecodecamp', status: 'error', error_message: fccResult.reason?.message, duration_ms: Date.now() - startTimes.freecodecamp });
    }

    return articles;
  }

  async scrapeDevTo(skillId) {
    const searchTerm = this.getSearchTerm(skillId);
    // Try the plain tag and a joined variant
    const tags = [...new Set([
      skillId.replace(/-/g, ''),
      searchTerm.replace(/ /g, '').toLowerCase()
    ])];

    const seen = new Set();
    const articles = [];

    for (const tag of tags) {
      try {
        const res = await axios.get('https://dev.to/api/articles', {
          params: { tag, top: 30, per_page: 30 },
          timeout: 10000,
          headers: { 'User-Agent': 'SkillAggregator/1.0' }
        });

        for (const item of res.data) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);

          articles.push({
            id: `devto_${item.id}`,
            title: item.title,
            url: item.url,
            source: 'Dev.to',
            author: item.user?.name,
            publishedDate: item.published_at?.split('T')[0],
            readTime: item.reading_time_minutes ? `${item.reading_time_minutes} min read` : null,
            excerpt: item.description,
            tags: item.tag_list || [],
            views: item.public_reactions_count
          });
        }

        await sleep(300);
      } catch (err) {
        console.error(`    Dev.to tag "${tag}": ${err.message}`);
      }
    }

    return articles.slice(0, MAX_RESULTS);
  }

  async scrapeMediumRSS(skillId) {
    const tag = skillId; // medium uses hyphenated tags
    const url = `https://medium.com/feed/tag/${tag}`;

    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'SkillAggregator/1.0' }
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
      if (i >= MAX_RESULTS) return false;

      const $el = $(el);
      const title = $el.find('title').text().trim();
      const link = $el.find('link').text().trim() || $el.find('guid').text().trim();
      if (!title || !link) return;

      const cleanUrl = link.split('?')[0];
      const pubDate = $el.find('pubDate').text().trim();
      const creator = $el.find('dc\\:creator, creator').text().trim();

      // Extract plain-text excerpt from content:encoded or description
      let excerpt = '';
      const encoded = $el.find('content\\:encoded, encoded').text();
      if (encoded) {
        const $c = cheerio.load(encoded);
        excerpt = $c('p').first().text().slice(0, 300);
      }
      if (!excerpt) {
        const $d = cheerio.load($el.find('description').text());
        excerpt = $d.text().slice(0, 300);
      }

      const tags = [];
      $el.find('category').each((_, cat) => tags.push($(cat).text().trim()));

      articles.push({
        id: `medium_${Buffer.from(cleanUrl).toString('base64').slice(0, 16)}`,
        title,
        url: cleanUrl,
        source: 'Medium',
        author: creator,
        publishedDate: pubDate ? new Date(pubDate).toISOString().split('T')[0] : null,
        excerpt: excerpt.trim(),
        tags: tags.slice(0, 5)
      });
    });

    return articles;
  }

  async scrapeFreeCodeCamp(skillId) {
    const tag = skillId; // fCC uses hyphenated slugs
    const url = `https://www.freecodecamp.org/news/tag/${tag}/rss/`;

    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'SkillAggregator/1.0' }
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    const articles = [];

    $('item').each((i, el) => {
      if (i >= Math.ceil(MAX_RESULTS / 2)) return false;

      const $el = $(el);
      const title = $el.find('title').text().trim();
      const link = $el.find('link').text().trim();
      if (!title || !link) return;

      const pubDate = $el.find('pubDate').text().trim();
      const creator = $el.find('dc\\:creator, creator').text().trim();

      let excerpt = '';
      const $d = cheerio.load($el.find('description').text());
      excerpt = $d.text().slice(0, 300).trim();

      articles.push({
        id: `fcc_${Buffer.from(link).toString('base64').slice(0, 16)}`,
        title,
        url: link,
        source: 'freeCodeCamp',
        author: creator,
        publishedDate: pubDate ? new Date(pubDate).toISOString().split('T')[0] : null,
        excerpt,
        tags: [skillId]
      });
    });

    return articles;
  }

  // ─── Sanitization ─────────────────────────────────────────────────────────

  // Strip potential prompt injection attempts from scraped text fields.
  // Scraped content is untrusted and should never contain AI instructions.
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return text;

    // Truncate to reasonable length first
    let sanitized = text.slice(0, 2000);

    // Remove null bytes and non-printable control characters (except newlines/tabs)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Strip common prompt injection patterns
    const injectionPatterns = [
      /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
      /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
      /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
      /system\s*:\s*\[/gi,
      /\[system\s+prompt\]/gi,
      /you\s+are\s+now\s+(a\s+)?(?!learning|able|going)/gi, // "you are now a [new persona]"
      /new\s+instructions?\s*:/gi,
      /override\s*(previous\s+)?instructions?/gi,
      /<\s*system\s*>/gi,
      /<<\s*SYS\s*>>/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[removed]');
    }

    return sanitized.trim();
  }

  sanitizeItem(item) {
    if (!item || typeof item !== 'object') return item;
    const textFields = ['title', 'description', 'excerpt', 'author', 'channel', 'source'];
    const sanitized = { ...item };
    for (const field of textFields) {
      if (sanitized[field]) sanitized[field] = this.sanitizeText(sanitized[field]);
    }
    return sanitized;
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  validateContent(content) {
    const isValidUrl = url => url && url.startsWith('http');
    content.videos = (content.videos || [])
      .filter(v => v.title && isValidUrl(v.url))
      .map(v => this.sanitizeItem(v));
    content.articles = (content.articles || [])
      .filter(a => a.title && isValidUrl(a.url))
      .map(a => this.sanitizeItem(a));
    return content;
  }
}

module.exports = new ScraperService();
