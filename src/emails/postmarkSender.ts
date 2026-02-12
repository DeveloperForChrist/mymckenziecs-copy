import fs from "fs";
import path from "path";
const FROM = process.env.FROM_EMAIL || "noreply@yourdomain";

function renderTemplate(templatePath: string, vars: Record<string, string>) {
  let html = fs.readFileSync(path.resolve(templatePath), "utf8");
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

export async function send(opts: { to: string; subject: string; templatePath: string; vars?: Record<string, string>; }) {
  const moduleName = "postmark";
  const postmarkModule = await import(moduleName);
  const client = new postmarkModule.ServerClient(process.env.POSTMARK_API_KEY || "");
  const html = renderTemplate(opts.templatePath, opts.vars || {});
  const res = await client.sendEmail({
    From: FROM,
    To: opts.to,
    Subject: opts.subject,
    HtmlBody: html,
  });
  return res;
}

export default { send };
