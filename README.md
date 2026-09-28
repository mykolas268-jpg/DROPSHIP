# One-product store theme (Dawn 16 + OP sections)

A mobile-first sales page for a single novelty product (3D cat-face balaclava), built on Shopify's Dawn v16.0.0.
All custom code is prefixed `op-`. No apps are embedded in the theme and there is no jQuery.

> **Status:** every product fact field is empty on purpose. Nothing about material, warmth, size range,
> delivery days, guarantee or business details is invented. Those lines stay hidden until you fill them in.

---

## 1. What's in the theme

| Page area (top → bottom) | File | Where to edit |
|---|---|---|
| Announcement bar (hidden while empty) | `sections/announcement-bar.liquid` (Dawn, patched) | Header group |
| Header: logo + cart | `sections/op-header.liquid` | Header group; logo in Theme settings → Logo |
| Gallery, title, price, rating, bundles, color, ATC, delivery, trust row, sticky bar | `sections/op-main-product.liquid` + `snippets/op-buy-box.liquid`, `op-delivery.liquid`, `op-price.liquid` | Product template |
| The reaction (UGC) | `sections/op-reactions.liquid` | Product template |
| Benefits | `sections/op-benefits.liquid` | Product template |
| Use cases (horizontal cards) | `sections/op-use-cases.liquid` | Product template |
| Specs & size + "Good to know" | `sections/op-specs.liquid` | Product template |
| Reviews (Judge.me app block, hidden at 0 reviews) | `sections/op-reviews.liquid` | Product template |
| FAQ (native `<details>` accordion) | `sections/op-faq.liquid` | Product template |
| Final CTA (bundle selector synced with the top one) | `sections/op-final-cta.liquid` | Product template |
| Footer: policy links, email, business name/address | `sections/op-footer.liquid` | Footer group; business info in Theme settings |
| Cart drawer extras | `snippets/op-cart-extras.liquid` (rendered from `snippets/cart-drawer.liquid`) | Theme settings → OP · Cart drawer |

JavaScript (all deferred, vanilla):

- `assets/op-core.js`: pure pricing, money and business-day logic. Unit tested in `tests/op-core.test.js`.
- `assets/op-bundle.js`: one shared state for the top selector, the final CTA and the sticky bar. Handles add to cart, analytics and Shopify standard events.
- `assets/op-media.js`: the swipe gallery with dots. Videos play muted and only while visible, and never for visitors who prefer reduced motion.
- `assets/op-delivery.js`: the delivery estimate and the event cutoff. They run in the browser because Liquid output is cached.
- `assets/op-cart-extras.js`: one-tap "make it 2" and one-tap upsell in the drawer.

The homepage (`templates/index.json`) is the same sales page. It uses **Theme settings → OP · Product & bundles → Store product**.
Send ad traffic to the product URL, not the homepage. The reviews app block needs product context, so it only appears on the product page.

---

## 2. Setup

1. **Tools.** Install Node 18+ and the CLI with `npm i -g @shopify/cli`.
2. **Get the theme.** Run `git clone … && cd DROPSHIP`.
3. **Preview against your store.** Run `shopify theme dev --store your-store.myshopify.com`.
4. **Upload unpublished first.** Run `shopify theme push --unpublished`. Then run the QA checklist (section 9) on your phone using the preview link.
5. **Publish** from Online Store → Themes when QA passes.
6. **Local checks:**
   - `shopify theme check` (must report 0 errors)
   - `node --test tests/op-core.test.js`

### Product setup in Shopify admin

- **One product.** Its option **must be named `Color`**, or change Theme settings → OP · Product & bundles → Color option name. Create one variant per color, each mapped to its supplier SKU in your dropship app. Each mask in a mixed pack is added as its own variant line, so the supplier app fulfils the right colors.
- **Swatch colors (optional):** link the Color option to Shopify's color metafield/swatches. Otherwise the swatch uses the variant image, or text if there is no image.
- **Media goes on the product in admin, not in `/assets`.** Shopify themes cannot have subfolders in `assets/`, and theme assets don't get responsive `image_url` srcsets.
  - Order: best still photo **first** (it's the LCP image and is preloaded), UGC video **second**.
  - Upload videos as product media so Shopify transcodes them and makes the poster.
- **UGC for "The reaction":** upload to Content → Files and pick it in the section blocks. Only use content you own or have written permission to use.
- **Price:** the variant price is the single-mask price.
  - Leave **compare-at empty** unless it's a real price you previously charged.
  - Compare-at is also hidden unless you tick *Show compare-at price* in theme settings.

---

## 3. Pricing: why the page price always equals the checkout price

**Mechanism:** two native Shopify **automatic discounts** with a fixed amount off *each* mask, triggered by quantity. No app.

- **Why this one.** It's free and runs inside Shopify checkout. It also keeps one line per color, so the dropship app maps each color's SKU.
- **Why not a volume app** (Kaching, etc.). An app has the same two-places-to-edit problem, plus its own widget and free-plan limits.
- **Why not "1/2/4-pack" variants.** Those would turn per-mask colors into line-item properties, which dropship apps can't map to SKUs.
- **The one risk.** Tier amounts live in two places: the Shopify discount and the theme setting. If you change one, change the other.
  - The theme uses the *same number* (cents off each mask), so it's a 1:1 copy.
  - The cart drawer always shows Shopify's real totals (`cart.total_price`, `cart.total_discount`), so any mismatch is visible before checkout.
- Use **fixed amounts, not percentages.** A percentage is rounded per line, and different colors are different lines, so totals can drift by a cent.

### Exact discount configuration

Example with a $24.99 mask, 2-pack at $19.99/mask ($39.98) and 4-pack at $16.99/mask ($67.96). Replace the numbers with your real ones.

**Discount A (2+ masks).** Discounts → Create discount → **Amount off products** → Method: **Automatic**.

| Field | Value |
|---|---|
| Title (shown in cart/checkout) | `Pack discount` |
| Discount value | **Fixed amount** `5.00` |
| Applies to | **Specific products** → the mask product only |
| Only apply discount once per order | **Unchecked** (so it applies to every mask) |
| Minimum purchase requirements | **Minimum quantity of items** → `2` |
| Combinations | **None ticked** (Shopify then applies the single best discount) |
| Active dates | Start now, no end date |

**Discount B (4+ masks).** Same as Discount A, except:

| Field | Value |
|---|---|
| Discount value | **Fixed amount** `8.00` |
| Minimum quantity of items | `4` |

**Theme settings → OP · Product & bundles:**

| Setting | Value |
|---|---|
| Tier 2 masks | `2` |
| Tier 2 discount per mask, in cents | `500` |
| Tier 3 masks | `4` |
| Tier 3 discount per mask, in cents | `800` |

A cart with 3 masks gets the 2+ price for all 3. The page and cart compute this the same way.

**Must verify on your store (QA items 1–3).** Confirm the minimum quantity counts only the mask, not the upsell item. Confirm that with 4 masks Shopify applies discount B, not A.

**Currency:** keep **one market (United States, USD)**. With multi-currency, Shopify converts the fixed discount at its own rate, and the theme's cent values would no longer match.

### Free shipping bar

In Settings → Shipping and delivery → your US zone, add a **free rate** with the condition **Based on order price**, minimum = your threshold.

Set **Theme settings → OP · Cart drawer → Free shipping threshold, in cents** to the same value.

- The threshold must be **≤ the discounted 2-pack total**, not two full-price masks.
  - Example: the 2-pack costs $39.98, so a $40.00 threshold does **not** qualify. The tests caught exactly this.
  - Use e.g. `3998` or lower.
- The bar compares against the cart total after discounts. Confirm in QA that Shopify's rate uses the same basis.

---

## 4. Theme editor: what to fill in

**Theme settings → OP · Product & bundles**
- **Store product:** required for the homepage and the cart nudge.
- **Tier labels, badges and discount cents** (see section 3). The tier 2 badge defaults to "Best for pairs". Only change it to "Most popular" once your sales data shows it.
- **Preselected tier:** default is tier 2.
- **Selector text strings** (tokens: `[price]`, `[amount]`, `[n]`).

**Theme settings → OP · Delivery estimate**
- **Processing min/max and transit min/max, in business days.** Use the real worst case. Empty = the estimate is hidden.
- **Daily cutoff hour and time zone** (e.g. `14` and `America/New_York`).
- **Non-shipping dates:** holidays, as `YYYY-MM-DD`.
- **Event name and date** (e.g. `Halloween`, `2026-10-31`).
  - The banner shows "Order by [date] to get it before Halloween" only while a worst-case order placed now still arrives *before* that date. It hides itself after the cutoff.
  - After Halloween, switch it to the next real event, or clear it.

**Theme settings → OP · Cart drawer**
- **Cart type** must be *Drawer* (Theme settings → Cart). It is already set in `settings_data.json`.
- **Free shipping threshold** (cents).
- **Upgrade nudge text and button.**
- **Upsell product:** a product with one variant. It is hidden while already in the cart.
- **Savings line.**
- **Dynamic checkout buttons:** Shop Pay, Apple Pay, Google Pay. They must also be enabled in Settings → Payments.

**Theme settings → OP · Business info**
- Legal name, address, support email (shown in the footer).

**Settings → Policies:** fill in Refund, Shipping, Privacy and Terms. The footer links to whatever exists there.

**Product template sections**

| Section | What to fill in |
|---|---|
| **OP · Product** | Trust row text 2 = your guarantee in a few words (empty = hidden). Keep "Tracked shipping" only if it's true. Tune *max gallery height on phones* (default 44%). |
| **The reaction** | Add video/photo blocks. Blocks without media are hidden. |
| **Benefits / Use cases** | The copy is generic and makes no product claims. Edit it freely, but stay inside your product facts. |
| **Specs & size** | Fill each row's value. **Empty rows are hidden.** Fit and Coverage are prefilled from your brief. Put what it is NOT in "Good to know" (e.g. "Lightweight: not a thermal winter mask"), from your real sample. |
| **FAQ** | Questions without an answer are hidden. Answers must come from your facts and policies. |
| **Announcement bar** | One true message, e.g. a real shipping cutoff. Empty = no bar. |

---

## 5. Reviews (Judge.me, free plan)

1. Install **Judge.me Product Reviews** and enable its theme app embed (Online Store → Themes → Customize → App embeds).
2. In the product template, open **OP · Reviews (Judge.me)** → Add block → *Judge.me Review Widget*.
3. Judge.me keeps the standard metafields `reviews.rating` / `reviews.rating_count` in sync.
   - Both the star rating under the title and the whole reviews section read `rating_count`.
   - With 0 published reviews, both are hidden. In the editor you'll see a dashed note instead.
4. Never import or write reviews you didn't receive.

---

## 6. Analytics (TikTok / Meta via Customer Events)

Custom pixels in **Customer Events** run sandboxed and **cannot read the page DOM**. `data-*` attributes alone are therefore invisible to them. The theme exposes clicks in three ways.

**1. Shopify standard events.** The bundle and cart-drawer buttons dispatch the same events Dawn's native forms use. The official TikTok and Meta channel apps pick up `product_viewed`, `product_added_to_cart` and `checkout_started` automatically.

**2. Custom events** via `Shopify.analytics.publish`:

| Event | Payload |
|---|---|
| `op_bundle_selected` | context, tier, quantity, total |
| `op_color_selected` | context, variant_id |
| `op_mix_colors_toggled` | context, enabled |
| `op_add_to_cart_click` | context (`main` / `final` / `sticky`), tier, quantity, mixed_colors, total, items |
| `op_add_to_cart_error` | context, message |
| `op_sticky_atc_click` | tier, quantity |
| `op_sticky_change_click` | tier |
| `op_cart_upgrade_click` | quantity |
| `op_cart_upsell_click` | variant_id, product |
| `op_gallery_dot` | index |

**3. Data attributes** for heatmap tools (Clarity etc.):

| Element | Attributes |
|---|---|
| Bundle cards | `data-op-track="bundle_card"` + `data-op-tier`, `data-op-qty`, `data-op-context` |
| Sticky bar | `data-op-track="sticky_bar"` / `"sticky_atc"` / `"sticky_change"`, plus `data-op-tier` |
| Cart | `data-op-track="cart_upgrade"` / `"cart_upsell"` + `data-op-upsell` |
| Other | `ugc_item`, `use_case`, `faq`, `color`, `mix_colors`, `add_to_cart` |

Example custom pixel (Settings → Customer events → Add custom pixel):

```js
// Forward theme custom events. Replace console.log with your TikTok/Meta calls.
[
  'op_bundle_selected', 'op_add_to_cart_click', 'op_sticky_atc_click',
  'op_cart_upgrade_click', 'op_cart_upsell_click', 'op_mix_colors_toggled',
].forEach((name) => {
  analytics.subscribe(name, (event) => {
    console.log(name, event.customData);
    // e.g. ttq.track('ClickButton', { content_name: name, ...event.customData });
  });
});
```

---

## 7. Post-purchase upsell (not built into the theme, by design)

Recommended apps (both have a free tier or trial; check current pricing):

- **AfterSell Post Purchase Upsell**: simple one-click offer page after payment.
- **ReConvert Upsell & Cross Sell**: post-purchase and thank-you page offers.

**One sensible offer:** "Add another mask for the group"

1. Create a funnel triggered by *order contains the mask*.
2. Offer: the mask (let the customer pick a color), quantity 1, discounted to the **same per-mask price as your 2-pack**.
   - Keep it honest: the same price they could get on the page, with no fake scarcity.
3. Enable it only for orders **under the 4-pack**. Someone who bought 4 doesn't need a 5th.
4. **Limitations to note:**
   - Post-purchase pages only show for payment methods Shopify supports there (e.g. cards, Shop Pay), not every wallet.
   - The accepted offer is added to the same order and ships with it.

---

## 8. Known limitations and things only a real store can confirm

- **Local testing is not Shopify.** Local testing used a mock renderer (liquidjs + a mock cart that applies the same discount rule) plus Chromium. It confirmed layout, JS and state sync at 360/390/430/768/1280 px. **It does not replace QA on your store.**
- **Express checkout buttons** in the drawer are re-rendered after each cart change. Confirm they still appear and work after adding and removing items (QA item 9).
- **Mask cap.** The bundle selector adds up to the largest tier's quantity (4). Customers can still change quantities in the cart drawer, and Shopify's discounts apply to any quantity.

---

## 9. 15-point phone QA checklist (do this on a real phone, ideally inside the TikTok in-app browser)

1. **2-pack price.** Add the 2-pack. The drawer total equals the price on the 2-pack card to the cent, and checkout shows the same.
2. **4-pack price.** Add the 4-pack with 2 different colors. Drawer and checkout totals equal the 4-pack card, and each color is its own line.
3. **Upsell doesn't trigger discounts.** Cart with 1 mask + the upsell product: no pack discount is applied.
4. **Stale settings check.** Change a theme discount setting by 1 cent without changing the Shopify discount. The mismatch shows in the drawer. Change it back.
5. **First screen.** It shows the gallery, title, price and bundle cards, and an Add to cart button (main or sticky) is visible without scrolling.
6. **Gallery.** Swipes, dots update, and the video plays muted only when on screen. It stays paused with iOS Low Power Mode or reduced motion, where controls are shown instead.
7. **Sticky bar.** It appears once the main button is off screen, shows the selected pack and price, adds the right items, and disappears at the final CTA. No content jumps when it appears.
8. **Sync.** Changing pack, color or mixed colors at the top is reflected in the final CTA and the sticky bar, and vice versa.
9. **Cart drawer:**
   - The free-shipping bar is correct for 1 mask and unlocked for the 2-pack.
   - "Make it 2" upgrades in one tap to the 2-pack price.
   - The upsell adds in one tap and disappears.
   - "You save" matches checkout.
   - Shop Pay / Apple Pay / Google Pay still show after changing quantities.
10. **Delivery estimate.** Dates match your real worst case (check a weekday after the cutoff hour and a weekend). The event banner disappears the day after its cutoff (set a test event date to confirm).
11. **Empty facts.** No empty rows, dangling labels or placeholder text anywhere. Specs, FAQ, trust row and footer only show what you filled in.
12. **Reviews.** With 0 reviews there are no stars and no reviews section. After one real review is published, both appear.
13. **Footer.** Refund, shipping, privacy and terms links work, and the business name, address and support email are correct.
14. **Accessibility.**
    - Everything is usable with VoiceOver: bundle cards and swatches announce their state, and FAQ items open with a double tap.
    - Text is readable at 200% zoom.
    - Nothing requires a pinch.
15. **Speed.** PageSpeed Insights (mobile) on the live product URL: LCP < 2.5 s and CLS < 0.1. If LCP fails, compress the first product image (≤ 200 KB, 1500 px) before touching code.

---

## 10. Tests

```bash
node --test tests/op-core.test.js   # pricing tiers, money format, business days, cutoff, event banner
shopify theme check                 # expects 0 errors (9 warnings are Dawn's own)
```
