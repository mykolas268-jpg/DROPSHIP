/*
 * op-core.js — pure logic shared by the one-product theme components.
 * No DOM access here, so the same file is unit-tested in Node (tests/op-core.test.js).
 *
 * Money values are integers in the smallest currency unit (cents), exactly like Shopify's cart API.
 * Dates are "date-only" values represented as UTC-midnight Date objects to avoid DST bugs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OPCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  /* ---------------------------------------------------------------- pricing */

  /**
   * Returns the tier that applies to a quantity: the tier with the highest `qty` that is <= quantity.
   * Mirrors Shopify automatic discounts with a "minimum quantity of items" requirement where the
   * best eligible discount wins.
   */
  function tierForQuantity(tiers, quantity) {
    let match = null;
    tiers.forEach((tier) => {
      if (tier.qty <= quantity && (!match || tier.qty > match.qty)) match = tier;
    });
    return match;
  }

  /**
   * @param {number[]} unitPrices  price of every mask in the selection, e.g. [2499, 2499]
   * @param {Array<{qty:number, discount:number}>} tiers  discount = fixed amount off EACH mask
   * @param {number[]} [unitCompareAt] optional compare-at price per mask (0/undefined = none)
   */
  function priceBreakdown(unitPrices, tiers, unitCompareAt) {
    const quantity = unitPrices.length;
    const tier = tierForQuantity(tiers, quantity);
    const perUnitDiscount = tier ? Math.max(0, tier.discount || 0) : 0;
    const subtotal = unitPrices.reduce((sum, price) => sum + price, 0);
    // A discount can never push a mask below zero (Shopify behaves the same way).
    const discount = unitPrices.reduce((sum, price) => sum + Math.min(price, perUnitDiscount), 0);
    const total = subtotal - discount;
    let compareAtTotal = 0;
    if (unitCompareAt && unitCompareAt.length === quantity) {
      compareAtTotal = unitCompareAt.reduce((sum, c, i) => sum + Math.max(c || 0, unitPrices[i]), 0);
    }
    return {
      quantity,
      subtotal,
      discount,
      total,
      perUnit: quantity ? Math.round(total / quantity) : 0,
      compareAtTotal: compareAtTotal > subtotal ? compareAtTotal : 0,
    };
  }

  /**
   * Cost of upgrading a single mask to the 2-mask tier, used by the cart nudge.
   * extra = total(2) - total(1); savings = what the 2 masks save vs. buying 2 singles.
   */
  function upgradeOffer(unitPrice, tiers, targetQty) {
    const one = priceBreakdown([unitPrice], tiers);
    const target = priceBreakdown(new Array(targetQty).fill(unitPrice), tiers);
    return { extra: target.total - one.total, savings: target.discount };
  }

  /* ------------------------------------------------------------------ money */

  function formatWithDelimiters(cents, precision, thousands, decimal) {
    thousands = thousands === undefined ? ',' : thousands;
    decimal = decimal === undefined ? '.' : decimal;
    if (isNaN(cents) || cents == null) return '0';
    const fixed = (cents / 100).toFixed(precision);
    const parts = fixed.split('.');
    const dollars = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + thousands);
    return parts[1] ? dollars + decimal + parts[1] : dollars;
  }

  /** Same placeholders as Shopify's money format ({{amount}}, {{amount_no_decimals}}, ...). */
  function formatMoney(cents, format) {
    format = format || '${{amount}}';
    const match = format.match(/\{\{\s*(\w+)\s*\}\}/);
    if (!match) return format;
    let value;
    switch (match[1]) {
      case 'amount_no_decimals':
        value = formatWithDelimiters(cents, 0);
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(cents, 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(cents, 0, '.', ',');
        break;
      case 'amount_with_apostrophe_separator':
        value = formatWithDelimiters(cents, 2, "'", '.');
        break;
      case 'amount_with_space_separator':
        value = formatWithDelimiters(cents, 2, ' ', ',');
        break;
      default:
        value = formatWithDelimiters(cents, 2);
    }
    return format.replace(match[0], value).replace(/<[^>]*>/g, '');
  }

  /** Replaces [token] placeholders in merchant-editable strings. */
  function fill(template, values) {
    return String(template || '').replace(/\[(\w+)\]/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole
    );
  }

  /* ------------------------------------------------------------------ dates */

  const DAY = 86400000;

  function ymd(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseDate(value) {
    const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(value || '');
    if (!match) return null;
    const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    return ymd(date) === `${match[1]}-${match[2]}-${match[3]}` ? date : null;
  }

  /** "2026-11-26, 2026-12-25" (commas, spaces or new lines) -> Set of YYYY-MM-DD strings. */
  function parseDateList(value) {
    const set = new Set();
    String(value || '')
      .split(/[\s,;]+/)
      .forEach((part) => {
        const date = parseDate(part);
        if (date) set.add(ymd(date));
      });
    return set;
  }

  /** Wall-clock date and hour "now" in a given IANA time zone (falls back to the visitor's zone). */
  function zonedNow(now, timeZone) {
    let parts = null;
    if (timeZone) {
      try {
        parts = {};
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(now)
          .forEach((p) => (parts[p.type] = p.value));
      } catch (e) {
        parts = null;
      }
    }
    if (!parts) {
      return {
        date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
        hour: now.getHours(),
      };
    }
    return {
      date: new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day)),
      hour: +parts.hour % 24,
    };
  }

  function isBusinessDay(date, blocked) {
    const day = date.getUTCDay();
    return day !== 0 && day !== 6 && !(blocked && blocked.has(ymd(date)));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * DAY);
  }

  function nextBusinessDay(date, blocked) {
    let d = addDays(date, 1);
    while (!isBusinessDay(d, blocked)) d = addDays(d, 1);
    return d;
  }

  function addBusinessDays(date, count, blocked) {
    let d = date;
    for (let i = 0; i < count; i++) d = nextBusinessDay(d, blocked);
    return d;
  }

  /**
   * The business day an order placed "now" is treated as received.
   * Weekend / non-shipping day / after the daily cutoff -> next business day (conservative).
   */
  function effectiveOrderDay(now, options) {
    const zoned = zonedNow(now, options.timeZone);
    const pastCutoff = typeof options.cutoffHour === 'number' && zoned.hour >= options.cutoffHour;
    if (isBusinessDay(zoned.date, options.blocked) && !pastCutoff) return zoned.date;
    return nextBusinessDay(zoned.date, options.blocked);
  }

  /**
   * @param {Date} now
   * @param {{minDays:number, maxDays:number, cutoffHour?:number, timeZone?:string, blocked?:Set}} options
   *   minDays/maxDays = processing + transit, in business days.
   */
  function deliveryWindow(now, options) {
    const orderDay = effectiveOrderDay(now, options);
    return {
      orderDay,
      earliest: addBusinessDays(orderDay, options.minDays, options.blocked),
      latest: addBusinessDays(orderDay, options.maxDays, options.blocked),
    };
  }

  /**
   * Last business day an order can be placed and still arrive (worst case) BEFORE eventDate.
   * Returns null when that day has already passed -> the banner must not show.
   */
  function eventCutoff(now, eventDate, options) {
    if (!eventDate) return null;
    const orderDay = effectiveOrderDay(now, options);
    let candidate = addDays(eventDate, -1);
    while (candidate >= orderDay) {
      if (
        isBusinessDay(candidate, options.blocked) &&
        addBusinessDays(candidate, options.maxDays, options.blocked) < eventDate
      ) {
        return candidate;
      }
      candidate = addDays(candidate, -1);
    }
    return null;
  }

  function formatDate(date, locale) {
    return date.toLocaleDateString(locale || 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  return {
    tierForQuantity,
    priceBreakdown,
    upgradeOffer,
    formatMoney,
    fill,
    parseDate,
    parseDateList,
    zonedNow,
    isBusinessDay,
    addBusinessDays,
    effectiveOrderDay,
    deliveryWindow,
    eventCutoff,
    formatDate,
    ymd,
  };
});
