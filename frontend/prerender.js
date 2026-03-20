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
