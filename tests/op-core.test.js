// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const OP = require('../assets/op-core.js');

const tiers = [
  { qty: 1, discount: 0 },
  { qty: 2, discount: 500 },
  { qty: 4, discount: 800 },
];
const d = (s) => OP.parseDate(s);

test('tier selection mirrors "best eligible minimum-quantity discount"', () => {
  assert.equal(OP.tierForQuantity(tiers, 1).qty, 1);
  assert.equal(OP.tierForQuantity(tiers, 2).qty, 2);
  assert.equal(OP.tierForQuantity(tiers, 3).qty, 2);
  assert.equal(OP.tierForQuantity(tiers, 4).qty, 4);
  assert.equal(OP.tierForQuantity(tiers, 9).qty, 4);
});

test('bundle totals: fixed amount off each mask', () => {
  const two = OP.priceBreakdown([2499, 2499], tiers);
  assert.deepEqual([two.subtotal, two.discount, two.total, two.perUnit], [4998, 1000, 3998, 1999]);
  const four = OP.priceBreakdown([2499, 2499, 2499, 2999], tiers);
  assert.equal(four.discount, 3200);
  assert.equal(four.total, 10496 - 3200);
  const one = OP.priceBreakdown([2499], tiers);
  assert.equal(one.discount, 0);
});

test('discount never pushes a mask below zero', () => {
  assert.equal(OP.priceBreakdown([300, 300], tiers).total, 0);
});

test('compare-at only reported when higher than price', () => {
  assert.equal(OP.priceBreakdown([2499], tiers, [0]).compareAtTotal, 0);
  assert.equal(OP.priceBreakdown([2499], tiers, [3499]).compareAtTotal, 3499);
});

test('cart upgrade offer 1 -> 2', () => {
  assert.deepEqual(OP.upgradeOffer(2499, tiers, 2), { extra: 1499, savings: 1000 });
});

test('money formats', () => {
  assert.equal(OP.formatMoney(123456, '${{amount}}'), '$1,234.56');
  assert.equal(OP.formatMoney(123456, '${{amount_no_decimals}}'), '$1,235');
  assert.equal(OP.formatMoney(123456, '{{amount_with_comma_separator}} €'), '1.234,56 €');
  assert.equal(OP.formatMoney(1999, '<span class=money>${{ amount }}</span>'), '$19.99');
});

test('fill tokens', () => {
  assert.equal(OP.fill('Save [amount] on [qty]', { amount: '$5', qty: 2 }), 'Save $5 on 2');
  assert.equal(OP.fill('Keep [unknown]', {}), 'Keep [unknown]');
});

test('parseDate rejects invalid input', () => {
  assert.equal(OP.parseDate('2026-02-30'), null);
  assert.equal(OP.parseDate('10/31/2026'), null);
  assert.equal(OP.ymd(OP.parseDate('2026-10-31')), '2026-10-31');
  assert.deepEqual([...OP.parseDateList('2026-11-26, 2026-12-25\nbad')], ['2026-11-26', '2026-12-25']);
});

test('business days skip weekends and blocked dates', () => {
  // Fri 2026-10-02 + 1 BD = Mon 2026-10-05
  assert.equal(OP.ymd(OP.addBusinessDays(d('2026-10-02'), 1)), '2026-10-05');
  const blocked = OP.parseDateList('2026-10-05');
  assert.equal(OP.ymd(OP.addBusinessDays(d('2026-10-02'), 1, blocked)), '2026-10-06');
});

test('order day: before/after cutoff and weekends (store time zone)', () => {
  const tz = 'America/New_York';
  // Mon 2026-09-28 10:00 New York = 14:00 UTC
  const mondayMorning = new Date('2026-09-28T14:00:00Z');
  assert.equal(OP.ymd(OP.effectiveOrderDay(mondayMorning, { cutoffHour: 14, timeZone: tz })), '2026-09-28');
  // Mon 15:00 New York = 19:00 UTC -> past cutoff -> Tue
  const mondayAfternoon = new Date('2026-09-28T19:00:00Z');
  assert.equal(OP.ymd(OP.effectiveOrderDay(mondayAfternoon, { cutoffHour: 14, timeZone: tz })), '2026-09-29');
  // Sat -> Mon
  const saturday = new Date('2026-10-03T15:00:00Z');
  assert.equal(OP.ymd(OP.effectiveOrderDay(saturday, { timeZone: tz })), '2026-10-05');
  // 02:00 UTC Tuesday is still Monday evening in New York
  const lateMonday = new Date('2026-09-29T02:00:00Z');
  assert.equal(OP.ymd(OP.effectiveOrderDay(lateMonday, { timeZone: tz })), '2026-09-28');
});

test('delivery window', () => {
  const now = new Date('2026-09-28T14:00:00Z'); // Mon
  const w = OP.deliveryWindow(now, { minDays: 7, maxDays: 12, timeZone: 'America/New_York' });
  assert.equal(OP.ymd(w.earliest), '2026-10-07');
  assert.equal(OP.ymd(w.latest), '2026-10-14');
});

test('event cutoff: latest order day whose worst-case arrival is before the event', () => {
  const opts = { minDays: 7, maxDays: 17, timeZone: 'America/New_York' };
  const halloween = d('2026-10-31');
  const cutoff = OP.eventCutoff(new Date('2026-09-28T14:00:00Z'), halloween, opts);
  assert.equal(OP.ymd(cutoff), '2026-10-07');
  // arrival check
  assert.ok(OP.addBusinessDays(cutoff, 17) < halloween);
  assert.ok(!(OP.addBusinessDays(OP.addBusinessDays(cutoff, 1), 17) < halloween));
  // after the cutoff the banner must disappear
  assert.equal(OP.eventCutoff(new Date('2026-10-08T14:00:00Z'), halloween, opts), null);
  // on the cutoff day but after the daily cutoff hour -> gone too
  assert.equal(
    OP.eventCutoff(new Date('2026-10-07T20:00:00Z'), halloween, { ...opts, cutoffHour: 14 }),
    null
  );
});
