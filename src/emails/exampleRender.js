/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function renderTemplate(templatePath, vars) {
  let html = fs.readFileSync(path.resolve(templatePath), 'utf8');
  for (const k of Object.keys(vars)) {
    html = html.split(`{{${k}}}`).join(vars[k]);
  }
  return html;
}

const templatesDir = path.join(__dirname, 'templates');
const templateArg = process.argv[2] || process.env.TEMPLATE || 'deadline-3days.html';
const templatePath = path.join(templatesDir, templateArg);

if (!fs.existsSync(templatePath)) {
  console.error('Template not found:', templatePath);
  process.exit(2);
}

const vars = {
  name: process.env.NAME || 'Test User',
  case_title: process.env.CASE_TITLE || 'State v. Smith',
  deadline_title: process.env.DEADLINE_TITLE || 'Motion to Dismiss Due',
  deadline_time: process.env.DEADLINE_TIME || '09:00',
  deadline_notes: process.env.DEADLINE_NOTES || 'Draft ready; need final review.',
  deadline_priority: process.env.DEADLINE_PRIORITY || 'medium',
  deadline_date: process.env.DEADLINE_DATE || '2026-03-01',
  days_left: process.env.DAYS_LEFT || '3',
  action_url: process.env.ACTION_URL || 'https://www.mymckenziecs.com/cases/123',
};

const out = renderTemplate(templatePath, vars);
const outPath = path.join('/tmp', 'rendered_email.html');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Rendered template written to', outPath);
console.log('--- preview ---');
console.log(out.slice(0, 1000));
