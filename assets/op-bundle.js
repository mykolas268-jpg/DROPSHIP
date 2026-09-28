/*
 * op-bundle.js — one shared bundle state for every <op-bundle> (main + final CTA) and <op-sticky-atc>.
 * Depends on op-core.js (window.OPCore) and Dawn's global.js / cart-drawer.js when the drawer is enabled.
 *
 * Analytics: every tracked interaction is
 *   1) marked with data-op-track / data-op-tier / data-op-context attributes (heatmaps, GTM)
 *   2) published via Shopify.analytics.publish('op_*', payload) so Customer Events custom pixels
 *      (which run sandboxed and can NOT read the DOM) can subscribe. See README → Analytics.
 */
(function () {
  if (window.OPStore) return;

  const OP = window.OPCore;

  function track(name, payload) {
    try {
      if (window.Shopify && Shopify.analytics && typeof Shopify.analytics.publish === 'function') {
        Shopify.analytics.publish(name, payload || {});
      }
    } catch (e) {
      /* analytics must never break the purchase flow */
    }
    document.dispatchEvent(new CustomEvent(name, { detail: payload || {} }));
  }
  window.OPTrack = track;

  /* ------------------------------------------------------------------ store */

  const OPStore = {
    data: null,
    state: null,
    listeners: new Set(),

    init(data) {
      if (this.data) return;
      data.tiers.sort((a, b) => a.qty - b.qty);
      this.data = data;
      const tier = data.tiers.find((t) => t.index === data.defaultTier) || data.tiers[0];
      const first = data.variants.find((v) => v.available) || data.variants[0];
      const initial = this.variant(data.initialVariant) || first;
      const maxQty = Math.max.apply(null, data.tiers.map((t) => t.qty));
      this.state = {
        tierIndex: tier.index,
        variantId: initial.id,
        mix: false,
        units: new Array(maxQty).fill(initial.id),
        busy: false,
      };
    },

    tier() {
      return this.data.tiers.find((t) => t.index === this.state.tierIndex) || this.data.tiers[0];
    },

    variant(id) {
      return this.data.variants.find((v) => v.id === Number(id));
    },

    /** Variant id of every mask for a given quantity (respects "mix colors"). */
    unitsFor(qty) {
      if (!this.state.mix) return new Array(qty).fill(this.state.variantId);
      return this.state.units.slice(0, qty).map((id) => id || this.state.variantId);
    },

    breakdown(qty) {
      const ids = this.unitsFor(qty);
      const variants = ids.map((id) => this.variant(id));
      return OP.priceBreakdown(
        variants.map((v) => v.price),
        this.data.tiers,
        this.data.showCompare ? variants.map((v) => v.compare) : null
      );
    },

    available(qty) {
      return this.unitsFor(qty).every((id) => {
        const v = this.variant(id);
        return v && v.available;
      });
    },

    money(cents) {
      return OP.formatMoney(cents, this.data.moneyFormat);
    },

    set(patch) {
      Object.assign(this.state, patch);
      if (patch.variantId && !this.state.mix) this.state.units.fill(patch.variantId);
      this.listeners.forEach((fn) => fn(this.state));
    },

    subscribe(fn) {
      this.listeners.add(fn);
      if (this.state) fn(this.state);
      return () => this.listeners.delete(fn);
    },

    items() {
      const counts = new Map();
      this.unitsFor(this.tier().qty).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
      return Array.from(counts, ([id, quantity]) => ({ id, quantity }));
    },

    /** Shopify standard events (feeds product_added_to_cart for Customer Events pixels). */
    lineEvent(source, items) {
      const { CartLinesUpdateEvent } = window.StandardEvents || {};
      if (!CartLinesUpdateEvent || !source) return null;
      const deferred = CartLinesUpdateEvent.createPromise();
      source.dispatchEvent(
        new CartLinesUpdateEvent({
          action: 'add',
          context: 'product',
          lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
          promise: deferred.promise,
        })
      );
      return deferred;
    },

    async add(context, source) {
      if (this.state.busy) return;
      const tier = this.tier();
      const items = this.items();
      const breakdown = this.breakdown(tier.qty);
      this.set({ busy: true, error: null });

      track('op_add_to_cart_click', {
        context,
        tier: tier.index + 1,
        quantity: tier.qty,
        mixed_colors: this.state.mix,
        total: breakdown.total / 100,
        items,
      });

      const deferred = this.lineEvent(source, items);
      const drawer = document.querySelector('cart-drawer');
      const body = { items };
      if (drawer) {
        body.sections = ['cart-drawer', 'cart-icon-bubble'];
        body.sections_url = window.location.pathname;
      }

      try {
        const response = await fetch(`${window.routes ? window.routes.cart_add_url : '/cart/add'}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        // A non-JSON error page must never leak a parser message to the shopper.
        const json = await response.json().catch(() => ({ status: response.status }));
        if (!response.ok || json.status) throw new Error(json.description || json.message || '');

        if (deferred) {
          fetch(`${(window.routes && window.routes.cart_url) || '/cart'}.js`)
            .then((r) => r.json())
            .then((cart) => deferred.resolve({ cart: window.StandardEvents.CartLinesUpdateEvent.createCartFromAjaxResponse(cart) }))
            .catch((e) => deferred.reject(e));
        }

        if (drawer && typeof drawer.renderContents === 'function') {
          drawer.classList.remove('is-empty');
          drawer.renderContents(json);
          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: 'op-bundle', cartData: json });
          }
        } else {
          window.location.href = this.data.cartUrl || '/cart';
          return;
        }
        this.set({ busy: false });
      } catch (error) {
        if (deferred) deferred.reject(error);
        const { CartErrorEvent } = window.StandardEvents || {};
        if (CartErrorEvent && source) source.dispatchEvent(new CartErrorEvent({ error: error.message, code: 'INVALID' }));
        track('op_add_to_cart_error', { context, message: error.message });
        this.set({ busy: false, error: error.message || this.data.strings.error });
      }
    },
  };
  window.OPStore = OPStore;

  /* ------------------------------------------------------------- <op-bundle> */

  class OPBundle extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      const json = this.querySelector('[data-op-json]');
      if (!json) return;
      OPStore.init(JSON.parse(json.textContent));
      this.context = this.dataset.context;

      this.addEventListener('change', this.onChange.bind(this));
      this.addEventListener('click', this.onClick.bind(this));
      this.unsubscribe = OPStore.subscribe(this.render.bind(this));
    }

    disconnectedCallback() {
      if (this.unsubscribe) this.unsubscribe();
    }

    onChange(event) {
      const target = event.target;
      if (target.classList.contains('op-tier__input')) {
        const index = Number(target.value);
        OPStore.set({ tierIndex: index });
        const tier = OPStore.tier();
        track('op_bundle_selected', {
          context: this.context,
          tier: index + 1,
          quantity: tier.qty,
          total: OPStore.breakdown(tier.qty).total / 100,
        });
      } else if (target.classList.contains('op-swatch__input')) {
        OPStore.set({ variantId: Number(target.value) });
        track('op_color_selected', { context: this.context, variant_id: Number(target.value) });
      } else if (target.hasAttribute('data-op-unit-select')) {
        const unit = Number(target.closest('[data-op-unit]').dataset.opUnit);
        const units = OPStore.state.units.slice();
        units[unit] = Number(target.value);
        OPStore.set({ units });
      }
    }

    onClick(event) {
      const toggle = event.target.closest('[data-op-mix-toggle]');
      if (toggle) {
        const mix = !OPStore.state.mix;
        const units = mix ? OPStore.state.units.slice() : OPStore.state.units.slice().fill(OPStore.state.variantId);
        OPStore.set({ mix, units });
        track('op_mix_colors_toggled', { context: this.context, enabled: mix });
        return;
      }
      if (event.target.closest('[data-op-atc]')) OPStore.add(this.context, this);
    }

    render(state) {
      const data = OPStore.data;
      const strings = data.strings;
      const current = OPStore.tier();

      this.querySelectorAll('.op-tier').forEach((card) => {
        const input = card.querySelector('.op-tier__input');
        const tier = data.tiers.find((t) => t.index === Number(input.value));
        if (!tier) return;
        const b = OPStore.breakdown(tier.qty);
        input.checked = tier.index === state.tierIndex;
        card.classList.toggle('is-selected', input.checked);
        card.querySelector('[data-op-tier-total]').textContent = OPStore.money(b.total);
        const compare = card.querySelector('[data-op-tier-compare]');
        if (compare) {
          compare.hidden = !b.compareAtTotal;
          compare.textContent = b.compareAtTotal ? OPStore.money(b.compareAtTotal) : '';
        }
        card.querySelector('[data-op-tier-each]').textContent =
          tier.qty > 1 ? OP.fill(strings.each, { price: OPStore.money(b.perUnit) }) : '';
        const save = card.querySelector('[data-op-tier-save]');
        save.hidden = b.discount <= 0;
        save.textContent = b.discount > 0 ? OP.fill(strings.save, { amount: OPStore.money(b.discount) }) : '';
      });

      this.querySelectorAll('.op-swatch__input').forEach((input) => {
        input.checked = Number(input.value) === state.variantId;
        input.closest('.op-swatch').classList.toggle('is-unavailable', input.hasAttribute('data-unavailable'));
      });
      const name = this.querySelector('[data-op-color-name]');
      const variant = OPStore.variant(state.variantId);
      if (name && variant) name.textContent = variant.name;

      const mix = this.querySelector('[data-op-mix]');
      if (mix) {
        mix.hidden = current.qty < 2;
        const toggle = mix.querySelector('[data-op-mix-toggle]');
        const panel = mix.querySelector('.op-mix__units');
        toggle.setAttribute('aria-expanded', String(state.mix));
        panel.hidden = !state.mix;
        this.querySelector('.op-swatches').classList.toggle('is-muted', state.mix && current.qty > 1);
        mix.querySelectorAll('[data-op-unit]').forEach((row) => {
          const unit = Number(row.dataset.opUnit);
          row.hidden = unit >= current.qty;
          const select = row.querySelector('select');
          const value = String(state.units[unit] || state.variantId);
          if (select.value !== value) select.value = value;
        });
      }

      const button = this.querySelector('[data-op-atc]');
      const available = OPStore.available(current.qty);
      button.disabled = state.busy || !available;
      button.setAttribute('aria-busy', String(state.busy));
      button.querySelector('[data-op-atc-text]').textContent = !available
        ? strings.soldOut
        : state.busy
        ? strings.adding
        : strings.atc;
      button.querySelector('[data-op-atc-price]').textContent = OPStore.money(OPStore.breakdown(current.qty).total);

      const error = this.querySelector('[data-op-error]');
      error.hidden = !state.error;
      error.textContent = state.error || '';
    }
  }
  customElements.define('op-bundle', OPBundle);

  /* --------------------------------------------------------- <op-sticky-atc> */

  class OPStickyATC extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      const visible = new Set();
      // Visible whenever no in-page add-to-cart button is on screen (including on first load).
      const targets = document.querySelectorAll('op-bundle [data-op-atc]');
      if (!targets.length) return;

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
        this.toggle(visible.size === 0);
      });
      targets.forEach((el) => this.observer.observe(el));

      this.querySelector('[data-op-sticky-atc]').addEventListener('click', () => {
        track('op_sticky_atc_click', { tier: OPStore.state.tierIndex + 1, quantity: OPStore.tier().qty });
        OPStore.add('sticky', this);
      });
      const change = this.querySelector('[data-op-sticky-change]');
      if (change) {
        change.addEventListener('click', () => {
          track('op_sticky_change_click', { tier: OPStore.state.tierIndex + 1 });
          const target = document.querySelector('op-bundle[data-context="main"] .op-tiers');
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const checked = target.querySelector('input:checked');
            if (checked) checked.focus({ preventScroll: true });
          }
        });
      }
      this.unsubscribe = OPStore.subscribe(this.render.bind(this));
    }

    disconnectedCallback() {
      if (this.observer) this.observer.disconnect();
      if (this.unsubscribe) this.unsubscribe();
    }

    toggle(show) {
      this.classList.toggle('is-visible', show);
      this.toggleAttribute('inert', !show);
      this.setAttribute('aria-hidden', String(!show));
    }

    render(state) {
      if (!OPStore.data) return;
      const tier = OPStore.tier();
      const b = OPStore.breakdown(tier.qty);
      const available = OPStore.available(tier.qty);
      this.querySelector('[data-op-sticky-label]').textContent = tier.label;
      this.querySelector('[data-op-sticky-price]').textContent = OPStore.money(b.total);
      this.dataset.opTier = tier.index + 1;
      const button = this.querySelector('[data-op-sticky-atc]');
      button.dataset.opTier = tier.index + 1;
      button.disabled = state.busy || !available;
      button.querySelector('[data-op-sticky-text]').textContent = !available
        ? OPStore.data.strings.soldOut
        : state.busy
        ? OPStore.data.strings.adding
        : OPStore.data.strings.atc;
    }
  }

  // op-bundle must upgrade first so the store exists.
  customElements.whenDefined('op-bundle').then(() => customElements.define('op-sticky-atc', OPStickyATC));
})();
