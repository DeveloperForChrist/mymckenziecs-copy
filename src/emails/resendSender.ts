import fs from "fs";
import path from "path";
import Resend from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");
const FROM = process.env.FROM_EMAIL || "noreply@yourdomain";

export function renderTemplate(templatePath: string, vars: Record<string, string>) {
  let html = fs.readFileSync(path.resolve(templatePath), "utf8");
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

export async function send(opts: { to: string; subject: string; templatePath: string; vars?: Record<string, string>; }) {
  const html = renderTemplate(opts.templatePath, opts.vars || {});
  const res = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html,
  });
  return res;
}

export default { send, renderTemplate };
