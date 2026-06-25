export const REMINDER_TEMPLATE = `
<div style="margin:0; padding:0 16px; background:#ffffff; font-family:Helvetica, Arial, sans-serif; color:#17202a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; margin:0 auto; background:#ffffff;" data-mymckenziecs-email="plain">
    <tr>
      <td style="padding:30px 0 18px; border-bottom:2px solid #17324d;">
        <div style="font-size:18px; font-weight:800; letter-spacing:0.01em; color:#17324d;">MyMcKenzieCS</div>
        <div style="margin-top:4px; font-size:12px; color:#5b6775; letter-spacing:0.08em; text-transform:uppercase;">Secure legal case workspace</div>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 0 26px;">
        <h1 style="margin:0 0 18px; font-size:26px; line-height:1.25; color:#17202a;">{{title}}</h1>
        <p style="margin:0 0 12px; font-size:15px; line-height:1.6;">Hi{{name_suffix}},</p>
        <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#344054;">
          You have <strong>{{events_count}}</strong> upcoming event{{events_plural}} in the next <strong>{{lookahead_days}} days</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px; border-top:1px solid #d9e2ec; border-bottom:1px solid #d9e2ec;">
          <tr>
            <td style="padding:12px 0; font-size:14px; color:#4b5563;">
              {{intro}}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{{rows_html}}</table>
        <p style="margin:20px 0 0;">
          <a href="{{calendar_url}}" style="display:inline-block; background:#17324d; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:12px 16px;">Open Calendar</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 0 34px; border-top:1px solid #d9e2ec; font-size:12px; color:#667085; line-height:1.6;">
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
