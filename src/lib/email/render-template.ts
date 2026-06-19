import fs from 'fs'
import path from 'path'

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates')

export function renderEmailTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName)
  let html = fs.readFileSync(templatePath, 'utf8')
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(`{{${key}}}`).join(value)
  }
  return html
}
