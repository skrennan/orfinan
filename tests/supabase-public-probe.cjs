// Read-only production probe. Never fetches financial rows, tokens, or credentials.
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const endpoint = source.match(/const SUPABASE_URL = "([^"]+)"/)[1];
const publishable = source.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)[1];
(async () => {
  const report = {checked_at:new Date().toISOString(),host:new URL(endpoint).host,authenticated_tests:false};
  for (const table of ['profiles','financial_data']) {
    const response = await fetch(`${endpoint}/rest/v1/${table}?select=*&limit=0`,{headers:{apikey:publishable},signal:AbortSignal.timeout(15000)});
    report[table] = {anonymous_http_status:response.status,financial_rows_requested:0};
    await response.body?.cancel();
  }
  const response = await fetch(`${endpoint}/auth/v1/settings`,{headers:{apikey:publishable},signal:AbortSignal.timeout(15000)});
  report.auth_http_status = response.status;
  if (response.ok) {
    const settings = await response.json();
    report.public_auth_settings = {signup_disabled:settings.disable_signup,email_auto_confirm:settings.mailer_autoconfirm,google_enabled:settings.external?.google,anonymous_enabled:settings.external?.anonymous};
  }
  console.log(JSON.stringify(report,null,2));
})().catch(error => { console.error('Public probe could not complete:',error.message); process.exitCode=1; });
