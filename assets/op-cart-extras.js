/*
 * op-cart-extras.js — one-tap actions inside Dawn's cart drawer:
 *   [data-op-cart-action="upgrade"]  change the single mask line to the 2-mask tier quantity
 *   [data-op-cart-action="add"]      add the upsell product
 * Uses event delegation because the drawer markup is re-rendered after every cart change.
 */
(function () {
  if (window.OPCartExtras) return;
  window.OPCartExtras = true;

  function track(name, payload) {
    if (window.OPTrack) return window.OPTrack(name, payload);
    try {
      if (window.Shopify && Shopify.analytics && Shopify.analytics.publish) Shopify.analytics.publish(name, payload);
    } catch (e) {
      /* never block the cart */
    }
  }

  function linesEvent(source, action, lines) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent) return null;
    const deferred = CartLinesUpdateEvent.createPromise();
    source.dispatchEvent(
      new CartLinesUpdateEvent({ action, context: 'dialog', lines, promise: deferred.promise })
    );
    return deferred;
  }

  async function request(url, body, button, deferred) {
    const drawer = document.querySelector('cart-drawer');
    body.sections = ['cart-drawer', 'cart-icon-bubble'];
    body.sections_url = window.location.pathname;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      // A non-JSON error page must never leak a parser message to the shopper.
      const json = await response.json().catch(() => ({ status: response.status }));
      if (!response.ok || json.status || json.errors) throw new Error(json.description || (typeof json.errors === 'string' ? json.errors : '') || '');
      if (deferred) {
        fetch(`${window.routes.cart_url}.js`)
          .then((r) => r.json())
          .then((cart) => deferred.resolve({ cart: window.StandardEvents.CartLinesUpdateEvent.createCartFromAjaxResponse(cart) }))
          .catch((e) => deferred.reject(e));
      }
      if (drawer) {
        drawer.classList.toggle('is-empty', json.item_count === 0);
        drawer.renderContents(json);
      }
      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'op-cart-extras', cartData: json });
      }
    } catch (error) {
      if (deferred) deferred.reject(error);
      button.disabled = false;
      button.removeAttribute('aria-busy');
      const errors = document.getElementById('CartDrawer-CartErrors');
      if (errors) errors.textContent = error.message || (window.cartStrings && window.cartStrings.error) || '';
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-op-cart-action]');
    if (!button || button.disabled) return;
    event.preventDefault();

    if (button.dataset.opCartAction === 'upgrade') {
      const quantity = Number(button.dataset.quantity) || 2;
      track('op_cart_upgrade_click', { quantity });
      const deferred = button.dataset.lineKey
        ? linesEvent(button, 'update', [{ id: button.dataset.lineKey, quantity }])
        : null;
      request(`${window.routes.cart_change_url}.js`, { line: Number(button.dataset.line), quantity }, button, deferred);
    } else if (button.dataset.opCartAction === 'add') {
      const id = Number(button.dataset.variantId);
      track('op_cart_upsell_click', { variant_id: id, product: button.dataset.opUpsell });
      const deferred = linesEvent(button, 'add', [{ merchandiseId: String(id), quantity: 1 }]);
      request(`${window.routes.cart_add_url}.js`, { items: [{ id, quantity: 1 }] }, button, deferred);
    }
  });
})();
