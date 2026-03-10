#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const scraper = require('../services/scraperService');

async function main() {
  const args = process.argv.slice(2);
  const skillId = args[0]; // optional: scrape a single skill

  if (skillId) {
    console.log(`🔍 Scraping single skill: ${skillId}\n`);
    try {
      await scraper.scrapeSkill(skillId);
      console.log('\n✅ Done!');
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  } else {
    try {
      await scraper.scrapeAllSkills();
      console.log('\n✅ All done!');
    } catch (err) {
      console.error('Fatal error:', err.message);
      process.exit(1);
    }
  }

  // Give DB a moment to flush, then exit
  setTimeout(() => process.exit(0), 500);
}

main();
