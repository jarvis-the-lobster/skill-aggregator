import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const serverEntry = path.resolve(__dirname, 'dist/server/entry-server.js');

const API_BASE = 'https://api.learnstack.dev';

async function prerender() {
  // Load the SSR bundle
  const { render } = await import(serverEntry);

  // Read the built index.html template
  const template = fs.readFileSync(path.resolve(distDir, 'index.html'), 'utf-8');

  // Fetch skills from the production API
  let skills = [];
  try {
    const res = await fetch(`${API_BASE}/api/skills`);
    const data = await res.json();
    skills = data.skills || [];
    console.log(`Fetched ${skills.length} skills from API`);
  } catch (err) {
    console.warn('Failed to fetch skills from API:', err.message);
    console.warn('Continuing with static pages only...');
  }

  // Build route list
  const staticRoutes = ['/', '/about', '/early-access'];
  const skillRoutes = skills.flatMap(s => [
    `/skills/${s.id}`,
    `/skills/${s.id}/plan`,
  ]);
  const routes = [...staticRoutes, ...skillRoutes];

  console.log(`Prerendering ${routes.length} routes...`);

  let rendered = 0;
  let failed = 0;

  for (const route of routes) {
    try {
      const { html: appHtml, helmet } = render(route);

      // Build head tags from helmet
      const headTags = [
        helmet.title?.toString() || '',
        helmet.meta?.toString() || '',
        helmet.link?.toString() || '',
        helmet.script?.toString() || '',
      ].filter(Boolean).join('\n    ');

      // Inject into template
      let page = template
        .replace('<!--app-html-->', appHtml)
        .replace('<!--head-tags-->', headTags);

      // Inject per-page SEO meta tags
      const BASE_URL = 'https://learnstack.dev';
      const DEFAULT_TITLE = 'LearnStack — Learn Any Skill with Curated Resources';
      const DEFAULT_DESC = 'Discover the best YouTube videos and articles for any skill — curated and quality-ranked so you skip the noise and get straight to learning.';

      const skillMatch = route.match(/^\/skills\/([^/]+)(\/plan)?$/);
      let pageTitle = DEFAULT_TITLE;
      let pageDesc = DEFAULT_DESC;
      let canonical = `${BASE_URL}${route === '/' ? '/' : route}`;

      if (skillMatch) {
        const skillId = skillMatch[1];
        const isPlan = !!skillMatch[2];
        const skill = skills.find(s => s.id === skillId);

        if (skill) {
          if (isPlan) {
            pageTitle = `30-Day ${skill.name} Learning Plan | LearnStack`;
            pageDesc = `Follow a structured 30-day learning plan for ${skill.name} with curated videos and articles.`;
          } else {
            pageTitle = `Learn ${skill.name} — Curated Videos & Articles | LearnStack`;
            pageDesc = `Discover the best curated YouTube videos and articles to learn ${skill.name}. Quality-ranked content for ${skill.difficulty || 'all'} learners.`;
          }
        }
      } else if (route === '/about') {
        pageTitle = 'About LearnStack';
      } else if (route === '/early-access') {
        pageTitle = 'Get Early Access — LearnStack';
      }

      // Replace default tags with per-page values
      page = page
        .replace(`<title>${DEFAULT_TITLE}</title>`, `<title>${pageTitle}</title>`)
        .replace(
          `<meta name="description" content="${DEFAULT_DESC}" />`,
          `<meta name="description" content="${pageDesc}" />`,
        )
        .replace(
          '<link rel="canonical" href="/" />',
          `<link rel="canonical" href="${canonical}" />`,
        )
        .replace(
          `<meta property="og:title" content="${DEFAULT_TITLE}" />`,
          `<meta property="og:title" content="${pageTitle}" />`,
        )
        .replace(
          `<meta property="og:description" content="${DEFAULT_DESC}" />`,
          `<meta property="og:description" content="${pageDesc}" />`,
        );

      // Add OG URL and Twitter card tags before </head>
      const socialTags = [
        `<meta property="og:url" content="${canonical}" />`,
        '<meta name="twitter:card" content="summary_large_image" />',
        `<meta name="twitter:title" content="${pageTitle}" />`,
        `<meta name="twitter:description" content="${pageDesc}" />`,
        '<meta name="twitter:image" content="https://learnstack.dev/learnstack.png" />',
      ].join('\n    ');
      page = page.replace('</head>', `    ${socialTags}\n  </head>`);

      // Inject JSON-LD structured data for skill pages
      if (skillMatch) {
        const skillId = skillMatch[1];
        const isPlan = !!skillMatch[2];
        const skill = skills.find(s => s.id === skillId);
        if (skill) {
          const jsonLd = isPlan ? {
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: `30-Day ${skill.name} Learning Plan`,
            description: pageDesc,
            provider: { '@type': 'Organization', name: 'LearnStack', url: 'https://learnstack.dev' },
            educationalLevel: skill.difficulty || 'Beginner',
            timeRequired: 'P30D',
            isAccessibleForFree: true,
            url: canonical,
          } : {
            '@context': 'https://schema.org',
            '@type': ['Course', 'LearningResource'],
            name: `Learn ${skill.name}`,
            description: pageDesc,
            provider: { '@type': 'Organization', name: 'LearnStack', url: 'https://learnstack.dev' },
            educationalLevel: skill.difficulty || 'Beginner',
            isAccessibleForFree: true,
            url: canonical,
            about: { '@type': 'Thing', name: skill.name },
            learningResourceType: 'curated collection',
          };
          const ldScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
          page = page.replace('</head>', `    ${ldScript}\n  </head>`);
        }
      }

      // Remove empty Helmet title tag
      page = page.replace(/<title data-rh="true"><\/title>/g, '');

      // Determine output path
      let filePath;
      if (route === '/') {
        filePath = path.resolve(distDir, 'index.html');
      } else {
        // e.g. /skills/python → dist/skills/python/index.html
        const routePath = route.replace(/^\//, '');
        const dir = path.resolve(distDir, routePath);
        fs.mkdirSync(dir, { recursive: true });
        filePath = path.resolve(dir, 'index.html');
      }

      fs.writeFileSync(filePath, page);
      rendered++;
    } catch (err) {
      console.warn(`  ⚠ Failed to render ${route}: ${err.message}`);
      failed++;
    }
  }

  console.log(`Done! ${rendered} pages rendered, ${failed} failed.`);
}

prerender().catch(err => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
