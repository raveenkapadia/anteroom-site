/* ANTEROOM — one source of truth for prices and currency.
 *
 * Every price on the site is stored once, in USD, in PRICES below.
 * Detection runs in two stages so nothing ever waits on the network:
 *   1. synchronous guess from the browser timezone / locale, available immediately
 *   2. IP lookup via /api/geo (Vercel edge headers), which overrides the guess
 *      a moment later if it disagrees. Pages subscribe with AR_MONEY.ready().
 * If /api/geo is unreachable (offline, blocked, local file), stage 1 stands.
 */
(function (w) {
  'use strict';

  // Every price on the site, in USD. Change it here and it changes everywhere.
  var PRICES = { entry: 750, three: 1875, six: 4500, founding: 500, language: 150 };

  var rates = {
    USD: [1, '$'],
    AED: [3.6725, 'AED '],   // pegged — this conversion is exact
    SAR: [3.75, 'SAR '],     // pegged
    EUR: [0.92, '€'],
    GBP: [0.79, '£'],
    INR: [87.4, '₹'],
    RUB: [92, '₽'],
    CHF: [0.8, 'CHF '],
    AUD: [1.52, 'A$'],
    CAD: [1.37, 'C$'],
    SGD: [1.29, 'S$']
  };

  var PEGGED = { AED: 1, SAR: 1, USD: 1 };

  // ISO country code → [currency, place name]
  var countryMap = {
    AE: ['AED', 'the UAE'], OM: ['AED', 'Oman'],
    SA: ['SAR', 'Saudi Arabia'], QA: ['SAR', 'Qatar'], BH: ['SAR', 'Bahrain'], KW: ['SAR', 'Kuwait'],
    GB: ['GBP', 'the UK'],
    IN: ['INR', 'India'], RU: ['RUB', 'Russia'], CH: ['CHF', 'Switzerland'],
    AU: ['AUD', 'Australia'], CA: ['CAD', 'Canada'], SG: ['SGD', 'Singapore'],
    DE: ['EUR', 'Germany'], FR: ['EUR', 'France'], ES: ['EUR', 'Spain'], IT: ['EUR', 'Italy'],
    NL: ['EUR', 'the Netherlands'], PT: ['EUR', 'Portugal'], AT: ['EUR', 'Austria'],
    BE: ['EUR', 'Belgium'], IE: ['EUR', 'Ireland'], GR: ['EUR', 'Greece'],
    US: ['USD', 'the United States']
  };

  // timezone → [currency, city label], used only until the IP answer lands
  var zoneMap = {
    'Asia/Dubai': ['AED', 'Dubai'], 'Asia/Muscat': ['AED', 'Muscat'],
    'Asia/Riyadh': ['SAR', 'Riyadh'], 'Asia/Jeddah': ['SAR', 'Jeddah'], 'Asia/Bahrain': ['SAR', 'Manama'],
    'Asia/Qatar': ['SAR', 'Doha'], 'Asia/Kuwait': ['SAR', 'Kuwait City'],
    'Europe/London': ['GBP', 'London'], 'Europe/Dublin': ['EUR', 'Dublin'],
    'Europe/Paris': ['EUR', 'Paris'], 'Europe/Berlin': ['EUR', 'Berlin'], 'Europe/Madrid': ['EUR', 'Madrid'],
    'Europe/Rome': ['EUR', 'Rome'], 'Europe/Amsterdam': ['EUR', 'Amsterdam'], 'Europe/Lisbon': ['EUR', 'Lisbon'],
    'Europe/Vienna': ['EUR', 'Vienna'], 'Europe/Brussels': ['EUR', 'Brussels'], 'Europe/Athens': ['EUR', 'Athens'],
    'Europe/Zurich': ['CHF', 'Zurich'], 'Europe/Geneva': ['CHF', 'Geneva'],
    'Asia/Kolkata': ['INR', 'Mumbai'], 'Asia/Calcutta': ['INR', 'Mumbai'],
    'Europe/Moscow': ['RUB', 'Moscow'], 'Asia/Singapore': ['SGD', 'Singapore'],
    'Australia/Sydney': ['AUD', 'Sydney'], 'Australia/Melbourne': ['AUD', 'Melbourne'],
    'America/Toronto': ['CAD', 'Toronto'], 'America/Vancouver': ['CAD', 'Vancouver'],
    'America/New_York': ['USD', 'New York'], 'America/Chicago': ['USD', 'Chicago'],
    'America/Los_Angeles': ['USD', 'Los Angeles']
  };

  function guess() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && zoneMap[tz]) return zoneMap[tz];
      var loc = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      var reg = (loc.split('-')[1] || '').toUpperCase();
      if (reg && countryMap[reg]) return countryMap[reg];
      if (tz) return ['USD', tz.split('/').pop().replace(/_/g, ' ')];
    } catch (e) {}
    return ['USD', ''];
  }

  var resolved = guess();
  var subs = [];

  function fmt(usd) {
    var c = resolved[0], r = rates[c] || rates.USD;
    if (c === 'USD') return r[1] + usd.toLocaleString('en-US');
    var raw = usd * r[0];
    // Round to a clean hundred when that moves the number less than 3%,
    // otherwise to the nearest ten. Keeps AED 2,800 instead of AED 2,754.
    var h = Math.round(raw / 100) * 100;
    var v = (h > 0 && Math.abs(h - raw) / raw < 0.03) ? h : Math.round(raw / 10) * 10;
    return r[1] + v.toLocaleString('en-US');
  }

  function note() {
    // The VAT line is only true for UAE customers, so only they are shown it.
    var vat = resolved[0] === 'AED' ? ' 5% VAT is added at invoice.' : '';
    if (resolved[0] === 'USD') return 'Prices in USD.' + vat;
    var how = PEGGED[resolved[0]]
      ? 'Shown in ' + resolved[0] + ' for ' + (resolved[1] || 'your region') + ', at the fixed rate to the US dollar.'
      : 'Shown in ' + resolved[0] + ' for ' + (resolved[1] || 'your region') + ', converted from US dollars and rounded. Invoiced in US dollars unless we agree otherwise.';
    return how + vat;
  }

  var M = w.AR_MONEY = {
    PRICES: PRICES,
    fmt: fmt,
    note: note,
    cur: function () { return resolved[0]; },
    place: function () { return resolved[1]; },
    // cb runs only if the IP answer changes the currency we already guessed
    ready: function (cb) { if (typeof cb === 'function') subs.push(cb); }
  };

  // Stage 2 — IP. Never blocks anything; failure leaves the guess in place.
  try {
    if (w.fetch && w.location && /^https?:/.test(w.location.protocol)) {
      w.fetch('/api/geo', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (g) {
          if (!g || !g.country) return;
          var hit = countryMap[g.country];
          if (!hit) hit = ['USD', g.city || ''];
          if (hit[0] === resolved[0]) return;   // guess was already right
          resolved = [hit[0], g.city || hit[1]];
          for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (e) {} }
        })
        .catch(function () {});
    }
  } catch (e) {}
})(window);
