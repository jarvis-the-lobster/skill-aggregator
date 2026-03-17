# Skill Aggregator

A smart learning content aggregator that helps people master new skills faster by curating the best YouTube videos, blog posts, and tutorials into structured learning paths.

## Vision

Instead of spending hours searching Google and YouTube for scattered learning materials, get a curated, organized collection of the best content for any skill - from "learn Python" to "become a YouTuber."

## MVP Week 1 Goals

- [x] Project setup
- [ ] Basic web interface for skill search
- [ ] Content scraping for YouTube + key educational blogs  
- [ ] Simple categorization and filtering
- [ ] Clean, responsive design
- [ ] Support for 5-10 high-demand skills initially

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express
- **Database**: SQLite (MVP), PostgreSQL (production)
- **Scraping**: Puppeteer + YouTube API
- **Deployment**: Vercel (frontend) + Railway (backend)

## Repository Structure

```
/frontend          # React application
/backend           # Express API server  
/scraper           # Content scraping services
/database          # Database schema and migrations
/docs              # Documentation
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CRON_SECRET` | Yes (for cron) | Bearer token protecting `POST /api/admin/scrape/nightly` |
| `MAX_SKILLS_PER_RUN` | No | Max skills scraped per nightly run (default: 100) |
| `SCRAPE_DELAY_MS` | No | Delay between skills in nightly scrape (default: 30000) |

## Getting Started

[Coming soon - development setup instructions]

## Team

- **Visionary**: Brent (@Brent1LT)
- **Implementation**: Jarvis (@jarvis-the-lobster)

---

*Building something awesome, one skill at a time* 🦞