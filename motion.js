/*! H.M. Tours & Travels — motion layer (no dependencies)
 *
 * Load order: this file is tiny and runs first (synchronously, in <head>) so the
 * hero can animate and sections can reveal while the very large frontend.js is
 * still downloading. It never touches frontend.js code or its handlers.
 *
 * What it does
 *   1. Adds html.js (gates every "hidden before reveal" CSS state).
 *   2. One passive scroll listener + one rAF loop drives: the progress bar,
 *      hero / about / Hajj scroll-linked depth effects.
 *   3. IntersectionObservers drive: .reveal sections, per-card staggered
 *      reveals, animated counters, and the active nav link.
 *   4. A MutationObserver tags cards that frontend.js re-renders (language
 *      toggle, notices/offers fetched later) so they animate too.
 *   5. Falls back safely: any failure adds html.motion-off and everything shows.
 *
 * Public: window.__hmMotion.destroy() removes every listener/observer.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  if (window.__hmMotion) return;               // never initialise twice
  root.classList.add('js');

  var api = window.__hmMotion = { destroy: function () {} };

  function fail(err) {
    try { root.classList.add('motion-off'); } catch (e) {}
    if (window.console && console.warn) console.warn('[motion] disabled, content left visible:', err);
  }

  if (!('IntersectionObserver' in window) || !window.requestAnimationFrame) {
    root.classList.add('motion-off');
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { fail(e); } }, { once: true });
  } else {
    try { init(); } catch (e) { fail(e); }
  }

  function init() {
    var win = window, doc = document;
    var $  = function (s, c) { return (c || doc).querySelector(s); };
    var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
    var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    var ease  = function (t) { return 1 - Math.pow(1 - t, 3); };

    var cleanups = [];
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      cleanups.push(function () { target.removeEventListener(type, fn, opts); });
    }
    function track(o) { cleanups.push(function () { o.disconnect(); }); return o; }

    /* ---------- Environment ---------- */
    var mqReduce = win.matchMedia('(prefers-reduced-motion: reduce)');
    var mqSmall  = win.matchMedia('(max-width: 980px)');
    var supportsIndividual = !!(win.CSS && CSS.supports && CSS.supports('translate', '0 0') && CSS.supports('scale', '1'));
    var conn = navigator.connection || {};
    var lite = !!(conn.saveData ||
                  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
                  (navigator.deviceMemory && navigator.deviceMemory <= 2));

    function scrubAllowed() {
      return supportsIndividual && !lite && !mqReduce.matches && !mqSmall.matches;
    }
    var scrubOn = false;

    function listenMQ(mq, fn) {
      if (mq.addEventListener) { mq.addEventListener('change', fn); cleanups.push(function () { mq.removeEventListener('change', fn); }); }
      else if (mq.addListener) { mq.addListener(fn); cleanups.push(function () { mq.removeListener(fn); }); }
    }

    /* ---------- Measurements (cached; refreshed on resize / layout change) ---------- */
    var hero = $('.hero');
    var bar = $('#scrollProgress span');
    var maxScroll = 1, heroH = 0, dirty = true;
    function measure() {
      maxScroll = Math.max(1, root.scrollHeight - win.innerHeight);
      heroH = hero ? hero.offsetHeight : 0;
    }
    function scrollY() { return win.pageYOffset || root.scrollTop || 0; }

    /* ---------- Scroll-linked targets ---------- */
    var targets = [];
    var targetIO = track(new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.target.__t) e.target.__t.vis = e.isIntersecting; });
      request();
    }, { rootMargin: '25% 0px 25% 0px' }));

    function addTarget(el, read, write, reset) {
      if (!el) return null;
      var t = { el: el, vis: false, read: read, write: write, reset: reset };
      el.__t = t; targets.push(t); targetIO.observe(el);
      return t;
    }
    function clearProps(el, props) { if (el) props.forEach(function (p) { el.style.removeProperty(p); }); }

    /* Hero: content lags (depth), visual rises faster, glow drifts */
    var heroContent = $('.hero-content'), heroVisual = $('.hero-visual'),
        heroGlow = $('.hero-arch-glow'), heroCue = $('.scroll-cue');
    var hp = 0;
    if (hero) addTarget(hero,
      function () { hp = clamp(scrollY() / ((heroH * 0.9) || 1), 0, 1); },
      function () {
        if (heroContent) { heroContent.style.translate = '0 ' + (hp * 56).toFixed(1) + 'px'; heroContent.style.opacity = (1 - hp * 0.85).toFixed(3); }
        if (heroVisual)  { heroVisual.style.translate  = '0 ' + (-hp * 34).toFixed(1) + 'px'; heroVisual.style.scale = (1 + hp * 0.04).toFixed(4); }
        if (heroGlow)    { heroGlow.style.translate    = '0 ' + (-hp * 70).toFixed(1) + 'px'; heroGlow.style.scale = (1 + hp * 0.12).toFixed(4); }
        if (heroCue)     { heroCue.style.opacity = clamp(1 - hp * 4, 0, 1).toFixed(3); }
      },
      function () {
        clearProps(heroContent, ['translate', 'opacity']);
        clearProps(heroVisual, ['translate', 'scale']);
        clearProps(heroGlow, ['translate', 'scale']);
        clearProps(heroCue, ['opacity']);
      });

    /* About: portrait settles from a slight zoom; badge floats at its own speed */
    var aboutSec = $('#about'), aboutImg = $('.about-photo .arch-frame img'), aboutBadge = $('.about-photo .badge');
    var at = 0;
    if (aboutSec && aboutImg) addTarget(aboutSec,
      function (vh) { var r = aboutSec.getBoundingClientRect(); at = clamp((vh - r.top) / (vh + r.height), 0, 1); },
      function () {
        var z = 1.08 + 0.14 * (1 - ease(clamp((at - 0.1) / 0.4, 0, 1)));   // never < 1.08, so a ±12px shift can't expose an edge
        aboutImg.style.scale = z.toFixed(4);
        aboutImg.style.translate = '0 ' + clamp((0.5 - at) * 24, -12, 12).toFixed(1) + 'px';
        if (aboutBadge) aboutBadge.style.translate = '0 ' + clamp((at - 0.5) * 32, -16, 16).toFixed(1) + 'px';
      },
      function () { clearProps(aboutImg, ['scale', 'translate']); clearProps(aboutBadge, ['translate']); });

    /* Hajj band: scales up on entry, optionally pins, columns drift in opposition */
    var hajjSec = $('#hajj'), hajjBand = $('.hajj-band');
    var hajjCols = hajjSec ? $$('.hajj-gallery > div', hajjSec) : [];
    var hajjImgs = hajjSec ? $$('.hajj-gallery img', hajjSec) : [];
    var pin = null, hajjE = 0, hajjP = 0;

    function unpin() {
      if (!hajjSec) return;
      hajjSec.classList.remove('m-pinned');
      hajjSec.style.removeProperty('--pin-h');
      hajjSec.style.removeProperty('--pin-top');
      pin = null;
    }
    function setupPin() {
      if (!hajjSec || !hajjBand) return;
      unpin();
      if (!scrubOn) return;
      var vh = win.innerHeight, top = 96, bh = hajjBand.offsetHeight;
      if (vh < 640 || bh + top + 24 > vh) return;            // too tall to pin comfortably -> no pin
      var run = Math.round(Math.min(vh * 0.55, 480));
      var padB = parseFloat(win.getComputedStyle(hajjSec).paddingBottom) || 0;
      hajjSec.style.setProperty('--pin-top', top + 'px');
      hajjSec.style.setProperty('--pin-h', (bh + run + padB) + 'px');
      hajjSec.classList.add('m-pinned');
      pin = { run: run, top: top };
    }

    if (hajjSec && hajjBand) addTarget(hajjSec,
      function (vh) {
        var r = hajjSec.getBoundingClientRect();
        if (pin) {
          hajjE = clamp((vh - r.top) / (vh - pin.top), 0, 1);
          var q = clamp((pin.top - r.top) / pin.run, 0, 1);
          hajjP = 0.35 * hajjE + 0.65 * q;
        } else {
          hajjE = clamp((vh - r.top) / (vh * 0.5), 0, 1);
          hajjP = clamp((vh - r.top) / (vh + r.height), 0, 1);
        }
      },
      function () {
        hajjBand.style.scale = (0.94 + 0.06 * ease(hajjE)).toFixed(4);
        var z = 1 + 0.14 * (1 - ease(clamp(hajjP * 1.3, 0, 1)));
        hajjImgs.forEach(function (im) { im.style.scale = z.toFixed(4); });
        if (hajjCols[0]) hajjCols[0].style.translate = ((0.5 - hajjP) * 20).toFixed(1) + 'px ' + ((0.5 - hajjP) * 44).toFixed(1) + 'px';
        if (hajjCols[1]) hajjCols[1].style.translate = ((hajjP - 0.5) * 20).toFixed(1) + 'px ' + ((hajjP - 0.5) * 44).toFixed(1) + 'px';
      },
      function () {
        clearProps(hajjBand, ['scale']);
        hajjImgs.forEach(function (im) { clearProps(im, ['scale']); });
        hajjCols.forEach(function (c) { clearProps(c, ['translate']); });
      });

    /* ---------- The single scroll loop ---------- */
    var ticking = false;
    function request() { if (!ticking) { ticking = true; win.requestAnimationFrame(frame); } }

    function frame() {
      ticking = false;
      if (dirty) { measure(); dirty = false; }
      if (bar) bar.style.transform = 'scaleX(' + clamp(scrollY() / maxScroll, 0, 1).toFixed(4) + ')';
      if (!scrubOn) return;
      var vh = win.innerHeight, i, t;
      for (i = 0; i < targets.length; i++) { t = targets[i]; if (t.vis) t.read(vh); }     // all reads first...
      for (i = 0; i < targets.length; i++) { t = targets[i]; if (t.vis) t.write(); }      // ...then all writes
    }

    function applyMode() {
      scrubOn = scrubAllowed();
      root.classList.toggle('m-scrub', scrubOn);
      if (!scrubOn) { targets.forEach(function (t) { t.reset(); }); unpin(); }
      else { setupPin(); }
      dirty = true; request();
    }

    on(win, 'scroll', request, { passive: true });
    var resizeTimer = 0;
    on(win, 'resize', function () {
      dirty = true; request();
      win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(function () { if (scrubOn) setupPin(); request(); }, 160);
    }, { passive: true });
    listenMQ(mqReduce, applyMode);
    listenMQ(mqSmall, applyMode);

    if ('ResizeObserver' in win) {
      var bodyRO = track(new ResizeObserver(function () { dirty = true; request(); }));
      bodyRO.observe(doc.body);
      if (hajjBand) {
        var bandRO = track(new ResizeObserver(function () { if (scrubOn) { setupPin(); request(); } }));
        bandRO.observe(hajjBand);
      }
    }

    /* ---------- Section reveals (.reveal -> .in). frontend.js also adds .in; both are idempotent ---------- */
    var revealIO = track(new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (e.intersectionRatio >= 0.12 || e.intersectionRect.height >= win.innerHeight * 0.12) {
          e.target.classList.add('in');
          revealIO.unobserve(e.target);
        }
      });
    }, { threshold: [0, 0.05, 0.12, 0.25, 0.5] }));
    $$('.reveal').forEach(function (el) { revealIO.observe(el); });

    /* ---------- Per-card staggered reveals (also catches re-rendered cards) ---------- */
    var ITEM_SEL = [
      '#whyGrid > .why-card', '#svcGrid > .svc-card', '#umrahGrid > .why-card', '#hajjList > div',
      '#galYearWrap .gal-card', '#galYearWrap .gal-year-head',
      '#vidYearWrap .vid-card', '#vidYearWrap .gal-year-head',
      '#teamGrid .team-card', '#noticePanel > *', '#offerPanel > *'
    ].join(',');
    var CONTAINERS = ['whyGrid', 'svcGrid', 'umrahGrid', 'hajjList', 'galYearWrap', 'vidYearWrap', 'teamGrid', 'noticePanel', 'offerPanel'];

    var itemIO = track(new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; }).sort(function (a, b) {
        return (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left);
      });
      batch.forEach(function (e, k) {
        e.target.style.setProperty('--d', Math.min(k, 6) * 70 + 'ms');
        e.target.classList.add('m-in');
        itemIO.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }));

    function tagItems() {
      $$(ITEM_SEL).forEach(function (el) {
        if (el.__m) return;
        el.__m = 1;
        el.classList.add('m-item');
        itemIO.observe(el);
        if (el.matches('.svc-card, .gal-card, .vid-card')) {      // these have click handlers but were mouse-only
          el.setAttribute('tabindex', '0');
          el.setAttribute('role', 'button');
        }
      });
    }
    tagItems();
    var itemMO = track(new MutationObserver(tagItems));
    CONTAINERS.forEach(function (id) {
      var c = doc.getElementById(id);
      if (c) itemMO.observe(c, { childList: true, subtree: true });
    });

    // Keyboard activation for those cards: Enter / Space -> their existing click handler
    on(doc, 'keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches &&
          e.target.matches('.svc-card, .gal-card, .vid-card')) {
        e.preventDefault();
        e.target.click();
      }
    });

    /* ---------- Animated counters (skips the licence number — an ID, not a quantity) ---------- */
    var counterRafs = [];
    var counterIO = track(new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var b = e.target; counterIO.unobserve(b);
        if (mqReduce.matches) return;                           // leave the final number as-is
        var start = win.performance.now(), dur = 1500;
        (function step(now) {
          var t = clamp((now - start) / dur, 0, 1);
          b.textContent = Math.round(b.__n * ease(t)) + b.__sfx;
          if (t < 1) counterRafs.push(win.requestAnimationFrame(step)); else b.textContent = b.__final;
        })(start);
      });
    }, { threshold: 0.6 }));
    $$('.stat b').forEach(function (b) {
      if (b.parentNode.querySelector('[data-i18n="statLic"]')) return;
      var m = /^(\d+)(\D*)$/.exec(b.textContent.trim());
      if (!m) return;
      b.__final = b.textContent; b.__n = parseInt(m[1], 10); b.__sfx = m[2];
      counterIO.observe(b);
    });
    cleanups.push(function () { counterRafs.forEach(win.cancelAnimationFrame); });

    /* ---------- Active navigation link ---------- */
    var navLinks = $$('.navlinks a, .mobile-panel a');
    var linkMap = {};
    navLinks.forEach(function (a) {
      var h = a.getAttribute('href');
      if (h && h.charAt(0) === '#' && h.length > 1) (linkMap[h.slice(1)] = linkMap[h.slice(1)] || []).push(a);
    });
    function setActive(id) {
      navLinks.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      (linkMap[id] || []).forEach(function (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'location'); });
    }
    var navIO = track(new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' }));
    $$('section[id]').forEach(function (s) { navIO.observe(s); });

    /* ---------- Go ---------- */
    api.destroy = function () {
      cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
      cleanups = [];
      targets.forEach(function (t) { t.reset(); });
      unpin();
      root.classList.remove('m-scrub');
      root.classList.add('motion-off');
      delete win.__hmMotion;
    };
    applyMode();
    request();
  }
})();
