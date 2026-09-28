/*
 * op-delivery.js — <op-delivery> computes the delivery estimate and the optional event cutoff
 * in the browser (Liquid output is cached, so "today" must be evaluated client side).
 */
(function () {
  if (customElements.get('op-delivery')) return;
  const OP = window.OPCore;

  function num(value) {
    if (value === '' || value === undefined || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  class OPDelivery extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      const d = this.dataset;
      const pMin = num(d.processingMin) || 0;
      const pMax = num(d.processingMax) || pMin;
      const tMin = num(d.transitMin) || 0;
      const tMax = num(d.transitMax) || tMin;
      const cutoffHour = num(d.cutoffHour);
      const options = {
        minDays: pMin + tMin,
        maxDays: Math.max(pMax + tMax, pMin + tMin),
        cutoffHour: cutoffHour !== null && cutoffHour >= 0 && cutoffHour <= 23 ? cutoffHour : undefined,
        timeZone: d.timeZone || undefined,
        blocked: OP.parseDateList(d.blocked),
      };
      const now = new Date();

      const estimate = this.querySelector('[data-op-estimate]');
      if (estimate && options.maxDays > 0) {
        const w = OP.deliveryWindow(now, options);
        const early = OP.formatDate(w.earliest);
        const late = OP.formatDate(w.latest);
        const dates = early === late ? early : `${early} – ${late}`;
        estimate.querySelector('[data-op-estimate-text]').textContent = OP.fill(d.estimateText, { dates });
        estimate.classList.add('is-ready');
      } else if (estimate) {
        estimate.hidden = true;
      }

      const banner = this.querySelector('[data-op-event]');
      if (!banner) return;
      const eventDate = OP.parseDate(d.eventDate);
      const cutoff = eventDate && options.maxDays > 0 ? OP.eventCutoff(now, eventDate, options) : null;
      if (!cutoff) {
        banner.hidden = true;
        return;
      }
      let label = OP.formatDate(cutoff);
      if (options.cutoffHour !== undefined) {
        const hour = options.cutoffHour % 12 || 12;
        const suffix = options.cutoffHour < 12 ? 'AM' : 'PM';
        let zone = '';
        if (options.timeZone) {
          try {
            zone =
              ' ' +
              new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone, timeZoneName: 'short' })
                .formatToParts(now)
                .find((p) => p.type === 'timeZoneName').value;
          } catch (e) {
            zone = '';
          }
        }
        label += `, ${hour} ${suffix}${zone}`;
      }
      banner.querySelector('[data-op-event-text]').textContent = OP.fill(d.eventText, {
        cutoff: label,
        event: d.eventName,
      });
      banner.hidden = false;
      banner.classList.add('is-ready');
    }
  }
  customElements.define('op-delivery', OPDelivery);
})();
