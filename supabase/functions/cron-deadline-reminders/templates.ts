export const REMINDER_TEMPLATE = `
<div style="margin:0; padding:24px 12px; background:#f3f4f6; font-family:Helvetica, Arial, sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
    <tr>
      <td style="padding:20px 24px; background:{{header_bg}}; color:#ffffff;">
        <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">MyMcKenzieCS</div>
        <h2 style="margin:8px 0 0; font-size:24px; line-height:1.3; color:#ffffff;">{{title}}</h2>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px; font-size:16px; line-height:1.6;">Hi{{name_suffix}},</p>
        <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#374151;">
          You have <strong>{{events_count}}</strong> upcoming event{{events_plural}} in the next <strong>{{lookahead_days}} days</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr>
            <td style="padding:12px 14px; border:1px solid {{panel_border}}; border-radius:10px; background:{{panel_bg}}; font-size:13px; color:#4b5563;">
              {{intro}}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{{rows_html}}</table>
        <p style="margin:20px 0 0;">
          <a href="{{calendar_url}}" style="display:inline-block; background:{{cta_bg}}; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 18px; border-radius:8px;">Open Calendar</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 22px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; line-height:1.6;">
        You are receiving this because event reminders are enabled for your account.
      </td>
    </tr>
  </table>
</div>
`;

export const ALERT_FAILURE_TEMPLATE = `
<div style="font-family:Helvetica,Arial,sans-serif; color:#111827;">
  <h2 style="margin:0 0 12px;">Deadline reminder cron partial failure</h2>
  <p style="margin:0 0 12px; color:#374151;">
    Summary: sent {{sent}}, failed {{failed}}, users {{users}}, events {{events}}, lookahead {{lookahead_days}} days.
  </p>
  <ul style="margin:0; padding-left:18px; color:#374151;">
    {{failures_list}}
  </ul>
</div>
`;
