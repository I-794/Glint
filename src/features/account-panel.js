// Glint Pro groundwork: the account panel. One place for the plan, the hosted
// AI credits left this month and what Pro will add. It opens from the credits
// chip in the header and from Cmd-K. Checkout and "manage billing" buttons go
// here once they exist. Everything is built with textContent; nothing from the
// server or from Clerk is rendered as HTML.
import { getUser, isConfigured, openSignIn, openUserProfile, signOut, onAuthChange } from './auth.js';
import { getAccount, onAccountChange, refreshAccount, hasOwnKey, resetDay, startCheckout, openBillingPortal, confirmCheckout, pendingCheckout, forgetCheckout } from './account.js';
import { showNotification } from '../ui/notification.js';

let dlg = null;
let body = null;
let welcome = false;   // just upgraded: the Pro box says what that brings

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function button(label, className, run) {
  const b = node('button', `btn ${className}`, label);
  b.type = 'button';
  b.addEventListener('click', run);
  return b;
}

function build() {
  dlg = node('dialog', 'glint-dialog account-panel');
  dlg.setAttribute('aria-labelledby', 'account-panel-title');
  const head = node('div', 'account-head');
  const title = node('h3', '', 'Your account');
  title.id = 'account-panel-title';
  const close = node('button', 'account-close', '✕');
  close.type = 'button';
  close.title = 'Close';
  close.addEventListener('click', () => dlg.close());
  head.append(title, close);
  body = node('div', 'account-body');
  dlg.append(head, body);
  document.body.appendChild(dlg);
  // Keys stay inside, so the editor's shortcuts never act behind the panel.
  dlg.addEventListener('keydown', (e) => e.stopPropagation());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { welcome = false; });
}

function costLine(costs) {
  const one = costs.text || 1;
  const image = costs.image || 5;
  const credits = (n) => `${n} credit${n === 1 ? '' : 's'}`;
  return `A text or vision request, an enhance or one Design Agent step uses ${credits(one)}. An AI image uses ${credits(image)}.`;
}

function creditsBox(usage, offer) {
  const box = node('div', 'account-box');
  const left = Math.max(0, usage.limit - usage.used);
  const count = node('div', 'account-count');
  count.append(node('strong', '', String(left)), node('span', '', `of ${usage.limit} hosted AI credits left this month`));
  const bar = node('div', 'account-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${left} of ${usage.limit} credits left`);
  const fill = node('i');
  fill.style.width = `${usage.limit > 0 ? Math.round((left / usage.limit) * 100) : 0}%`;
  bar.append(fill);
  box.append(count, bar);
  const day = usage.resets ? resetDay(usage.resets) : '';
  if (day) box.append(node('p', 'account-note', `They start over on ${day}.`));
  box.append(node('p', 'account-note', costLine((offer && offer.costs) || {})));
  if (hasOwnKey()) {
    box.append(node('p', 'account-note', 'This browser has your own API key saved, so AI features use that key and spend no credits.'));
  } else if (left === 0) {
    box.append(node('p', 'account-note', 'Out of credits? Your own API key (AI settings) works without any.'));
  }
  return box;
}

// A button that sends the person away to Stripe: it says so while it waits,
// and comes back to life if the hand-off did not happen.
function leavingButton(label, waiting, className, go) {
  const b = button(label, className, async () => {
    b.disabled = true;
    b.textContent = waiting;
    const left = await go();
    if (!left) { b.disabled = false; b.textContent = label; }
  });
  return b;
}

function proBox(usage, offer, signedIn) {
  const box = node('div', 'account-box');
  const billing = Boolean(offer && offer.billing);
  if (usage && usage.plan === 'pro') {
    if (welcome) {
      const list = node('ul', 'account-perks');
      [
        `${usage.limit} hosted AI credits every month, starting now`,
        'They refill on the first of each month',
        'Cancel or change your card any time from this panel',
      ].forEach((line) => list.append(node('li', '', line)));
      box.append(node('h4', '', 'Welcome to Glint Pro'), node('p', 'account-note', 'Thank you for backing Glint. Here is what you have now:'), list);
    } else {
      box.append(node('h4', '', 'You are on Glint Pro'), node('p', 'account-note', 'Thank you for backing Glint.'));
    }
    if (billing && usage.canManage) {
      box.append(
        node('p', 'account-note', 'Cancel, change your card or see receipts on the billing page, run by Stripe.'),
        leavingButton('Manage billing', 'Opening billing...', 'btn-secondary', openBillingPortal),
      );
    }
    return box;
  }
  const pro = offer && offer.proCredits;
  const credits = pro ? `${pro} hosted AI credits a month` : 'More hosted AI credits';
  if (billing) {
    const price = offer.priceLabel ? ` for ${offer.priceLabel}` : '';
    box.append(
      node('h4', '', 'Glint Pro'),
      node('p', 'account-note', `${credits}${price}. Cancel any time. The studio itself stays free.`),
    );
    if (signedIn) {
      box.append(
        leavingButton('Upgrade to Glint Pro', 'Opening checkout...', 'btn-primary', startCheckout),
        node('p', 'account-note', 'Payment is handled by Stripe, which sells Glint Pro on our behalf.'),
      );
    } else {
      box.append(node('p', 'account-note', 'Sign in first, then upgrade from here.'));
    }
    return box;
  }
  box.append(
    node('h4', '', 'Glint Pro is coming'),
    node('p', 'account-note', `${credits} and share links that last. The studio itself stays free.`),
  );
  const link = node('a', 'btn btn-primary', 'Join the waitlist');
  link.href = '/pricing/#pro';
  link.target = '_blank';
  link.rel = 'noopener';
  box.append(link);
  return box;
}

function render() {
  if (!dlg || !dlg.open) return;
  const user = getUser();
  const { usage, offer, loadFailed } = getAccount();
  const parts = [];

  if (!isConfigured()) {
    parts.push(node('p', 'account-note', 'Accounts are not set up on this copy of Glint. Everything in the studio works without one, and AI features use your own API key.'));
  } else if (!user) {
    const free = offer && offer.freeCredits;
    const box = node('div', 'account-box');
    box.append(
      node('h4', '', 'Sign in for free AI credits'),
      node('p', 'account-note', `A free account gives you ${free || 'a set of'} hosted AI credits every month. The studio needs no account, and neither does your own API key.`),
      button('Sign in', 'btn-primary', () => { dlg.close(); openSignIn(); }),
    );
    parts.push(box, proBox(null, offer, false));
  } else {
    const who = node('div', 'account-who');
    const text = node('div', 'account-who-text');
    text.append(node('div', 'account-name', user.name));
    if (user.email && user.email !== user.name) text.append(node('div', 'account-email', user.email));
    const isPro = Boolean(usage && usage.plan === 'pro');
    who.append(text, node('span', `account-plan${isPro ? ' is-pro' : ''}`, isPro ? 'Glint Pro' : 'Free'));
    parts.push(who);

    if (usage) {
      parts.push(creditsBox(usage, offer));
    } else {
      const box = node('div', 'account-box');
      if (loadFailed) {
        box.append(node('p', 'account-note', 'Your credits could not be loaded. Check your connection and try again.'), button('Try again', 'btn-secondary', () => refreshAccount()));
      } else if (offer && !offer.hosted) {
        box.append(node('p', 'account-note', 'Hosted AI is off on this copy of Glint, so there are no credits to count. AI features use your own API key.'));
      } else {
        box.append(node('p', 'account-note', 'Loading your credits...'));
      }
      parts.push(box);
    }
    parts.push(proBox(usage, offer, true));

    const actions = node('div', 'account-actions');
    actions.append(
      button('Manage account', 'btn-secondary', () => { dlg.close(); openUserProfile(); }),
      button('Sign out', 'btn-secondary', async () => { dlg.close(); await signOut(); }),
    );
    parts.push(actions);
  }
  // Keep focus where it was when a refresh redraws the panel under the reader.
  const hadFocus = body.contains(document.activeElement);
  body.replaceChildren(...parts);
  if (hadFocus) dlg.querySelector('.account-close').focus();
}

export function openAccountPanel() {
  if (!dlg) build();
  if (!dlg.open) dlg.showModal();
  render();
  // The chip can be a little behind (another tab, another device).
  if (isConfigured()) refreshAccount();
}

// Back from Stripe's checkout. The address says how it went (#pro=success or
// #pro=cancel) and this browser remembers which checkout it started, so the
// server can read the result from Stripe at once. A checkout that was started
// and never seen to finish (the tab was closed, the return landed elsewhere)
// is checked quietly the next time the editor opens.
function handleCheckoutReturn() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(window.location.search);
  const result = fromHash.get('pro') || fromQuery.get('pro');
  if (result) {
    // Clean the address at once, so a reload never repeats this.
    fromQuery.delete('pro');
    fromQuery.delete('session_id');
    const rest = fromQuery.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }
  const saved = pendingCheckout();
  if (result === 'cancel') { forgetCheckout(); return; }
  if (!saved) return;
  const cameBack = result === 'success';
  let done = false;
  // Wait for sign-in to settle: the server only confirms for the buyer.
  onAuthChange(async (user) => {
    if (done || !user) return;
    done = true;
    const outcome = await confirmCheckout(saved.id);
    if (outcome === 'pro') {
      forgetCheckout();
      welcome = true;
      showNotification('Welcome to Glint Pro.', 'success', { duration: 7000 });
      openAccountPanel();
    } else if (!cameBack) {
      // Never finished, as far as Stripe knows. Stop asking after an hour.
      if (Date.now() - saved.at > 3600 * 1000) forgetCheckout();
    } else if (outcome === 'pending') {
      showNotification('Thanks. Your payment is still being confirmed; your plan updates as soon as it is.', 'info', { duration: 9000 });
      setTimeout(() => refreshAccount(), 6000);
    } else {
      showNotification('Your payment could not be checked just now. If you paid, your plan updates within a minute.', 'info', { duration: 9000 });
      setTimeout(() => refreshAccount(), 15000);
    }
  });
}

export function bindAccountPanel() {
  const chip = document.getElementById('ai-credits');
  if (chip) chip.addEventListener('click', openAccountPanel);
  onAccountChange(render);
  onAuthChange(render);
  handleCheckoutReturn();
}
