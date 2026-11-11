// Builds static landing pages (index.html = Thai, en.html = English) from the CoreDash Nexus design file.
// usage: node tools/build-landing.cjs <Main.dc.html> <outDir>
const fs = require('fs');
const path = require('path');
const [src, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const js = html.split(/<script type="text\/x-dc"[^>]*>/)[1].split('</script>')[0];
const helmet = html.split('<helmet>')[1].split('</helmet>')[0];
const body = html.split('</helmet>')[1].split('</x-dc>')[0];
class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(u) { Object.assign(this.state, typeof u === 'function' ? u(this.state) : u); } }
const C = new Function('DCLogic', js + '\nreturn Component')(DCLogic);
const LINKS = { 'Console.dc.html': 'app/', 'Scada.dc.html': 'app/#scada', 'Mobile.dc.html': 'app/', 'System.dc.html': 'app/#control', 'Main.dc.html': './' };
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const lang of ['th', 'en']) {
  const c = new C({ lang }); const v = c.renderVals();
  let b = body.replace(/<sc-for list="\{\{(\w+)\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (m, list, as, inner) => {
    if (list === 'langs') return `<a href="./" style="${lang === 'th' ? 'background:#1F5FFF;color:#FFFFFF' : 'color:#3A4256'};text-decoration:none;border-radius:4px;padding:4px 10px;font-size:13px;font-weight:700">TH</a><a href="en.html" style="${lang === 'en' ? 'background:#1F5FFF;color:#FFFFFF' : 'color:#3A4256'};text-decoration:none;border-radius:4px;padding:4px 10px;font-size:13px;font-weight:700">EN</a>`;
    return (v[list] || []).map((it) => inner.replace(new RegExp('\\{\\{' + as + '\\.(\\w+)\\}\\}', 'g'), (_, f) => esc(it[f]))).join('');
  });
  // headline: break only at spaces between words (Thai has no spaces inside words)
  b = b.replace(/\{\{t\.(h1a|h1b)\}\}/g, (_, k) => v.t[k].split(' ').map((w) => `<span style="white-space:nowrap">${esc(w)}</span>`).join(' '));
  b = b.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => esc(get(v, p) ?? ''));
  b = b.replace(/href="([\w]+\.dc\.html)"/g, (_, f) => `href="${LINKS[f] || './'}"`);
  b = b.replace(/ onClick="[^"]*"/g, '').replace(/ aria-pressed="[^"]*"/g, '');
  const page = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CoreDash Nexus — ${lang === 'th' ? 'ระบบ SCADA อัจฉริยะ' : 'Smart SCADA'} · CoreDash Technology</title>
<meta name="description" content="${esc(v.t.lead)}">
<meta name="theme-color" content="#0A1230">
<link rel="icon" type="image/png" href="app/icons/favicon.png">
<link rel="apple-touch-icon" href="app/icons/apple-touch-icon.png">
${helmet.replace(/\/_blob\/3353ddf3885774ddddd0281473c4be27/g, 'app/icons/logo-green.webp').replace(/\/_blob\/54f267992420689b9fbe320fb232c91a/g, 'app/icons/logo-red.webp').trim()}
<style>html{scroll-behavior:smooth}</style>
</head>
<body>
${b.replace(/\/_blob\/3353ddf3885774ddddd0281473c4be27/g, 'app/icons/logo-green.webp').replace(/\/_blob\/54f267992420689b9fbe320fb232c91a/g, 'app/icons/logo-red.webp').trim()}
</body>
</html>
`;
  fs.writeFileSync(path.join(out, lang === 'th' ? 'index.html' : 'en.html'), page);
  if (/\{\{|sc-for|sc-if|_blob/.test(page)) console.warn('leftover template syntax in', lang);
}
console.log('landing pages written to', out);
