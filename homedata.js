// Real UK address lookup (23 Aug 2026) -- same provider and same field-name mapping as
// Keystone's own equivalent module (src/homedata.mjs), confirmed against real live API calls
// with James's real key, not just Homedata's own docs (which undersell how different the real
// response shape actually is -- no split address lines on the search endpoint at all, and the
// retrieve endpoint nests everything under an `address` key). Kept as this project's own copy
// rather than shared code since Keystone and FormForge are two separate deployed apps with no
// shared codebase -- reuses James's same Homedata account/key, since usage on both sides
// combined is still comfortably inside the free tier.
const HOMEDATA_API_KEY = process.env.HOMEDATA_API_KEY;
const BASE = 'https://api.homedata.co.uk';

// `configured` (23 Aug 2026) matters beyond just telling the truth: the public form's own
// "must pick a real suggestion" enforcement (see form.js's handleSubmit) has to know whether
// a lookup genuinely exists to pick FROM -- without this flag, an address field would become
// permanently unconfirmable, and therefore unsubmittable, for every applicant the moment
// HOMEDATA_API_KEY is ever unset (e.g. between deploying this feature and actually adding the
// key). The client falls back to accepting typed text as-is whenever configured is false.
async function homedataAutocomplete(term) {
  if (!HOMEDATA_API_KEY) return { suggestions: [], configured: false };
  if (String(term || '').trim().length < 3) return { suggestions: [], configured: true };
  const r = await fetch(`${BASE}/address/find/?q=${encodeURIComponent(term)}`, { headers: { Authorization: `Api-Key ${HOMEDATA_API_KEY}` } });
  if (!r.ok) return { suggestions: [], configured: true };
  const data = await r.json();
  const suggestions = (data.suggestions || []).map(s => ({
    id: s.uprn_token,
    address: [s.address, s.town, s.postcode].filter(Boolean).join(', '),
  }));
  return { suggestions, configured: true };
}

async function homedataGetAddress(token) {
  if (!HOMEDATA_API_KEY || !token) return null;
  const r = await fetch(`${BASE}/property/${encodeURIComponent(token)}/address/`, { headers: { Authorization: `Api-Key ${HOMEDATA_API_KEY}` } });
  if (!r.ok) return null;
  const data = await r.json();
  const a = data.address || {};
  return {
    line_1: a.address_line_1 || a.address || '',
    postcode: a.postcode || '',
    full: [a.address_line_1 || a.address, a.address_line_2, a.address_line_3, a.town_name || a.post_town].filter(Boolean).join(', '),
  };
}

module.exports = { homedataAutocomplete, homedataGetAddress };
