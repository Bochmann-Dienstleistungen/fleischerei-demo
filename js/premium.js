/* FLEISCHEREI EICHENHOF — PREMIUM LAYER | VALORIS Webdesign */
/* Spring-Interactions, Mouse-Tracking, Magnetic, Pinned Scroll, Clip-Reveal */

/* =====================================================
   FX TOGGLES — auf false setzen um Feature auszuschalten
   ===================================================== */
window.FX = window.FX || {
  pageLoader:         true,   // false = kein Loader
  mouseTrackingGlass: true,   // false = klassisches statisches Glass
  magneticButtons:    true,   // false = keine Maus-Anziehung
  springHovers:       true,   // false = nur CSS-Transitions
  clipReveal:         true,   // false = einfache opacity-Reveals
  pinnedSpecials:     false,  // horizontaler Swipe-Scroll statt Scroll-Hijack (kein „Hängen")
};

(function () {
  'use strict';

  /* ===== Reduced motion respect ===== */
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) {
    Object.keys(window.FX).forEach(k => window.FX[k] = false);
  }

  /* ===== Hardware-Check für ungeeignete Geräte ===== */
  const LOW_END = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
  if (LOW_END) {
    window.FX.mouseTrackingGlass = false;
    window.FX.springHovers = false;
  }

  /* ===========================================================
     1. PAGE LOADER
     =========================================================== */
  function revealHero() {
    document.querySelectorAll('.hero .line-inner, .hero .reveal-clip').forEach(el => {
      el.classList.add('vis');
    });
  }

  function initLoader() {
    if (!window.FX.pageLoader) {
      document.getElementById('page-loader')?.remove();
      // Hero direkt anzeigen
      if (document.readyState !== 'loading') revealHero();
      else document.addEventListener('DOMContentLoaded', revealHero);
      return;
    }
    const loader = document.getElementById('page-loader');
    if (!loader) {
      revealHero();
      return;
    }
    const intro = !!loader.querySelector('.ld-stage');   // Reifekammer nur auf der Startseite
    document.body.style.overflow = 'hidden';
    /* 3D-Tilt auf Mausbewegung — wie loader.html */
    function tilt(e) {
      if (window.innerWidth < 700) return;
      const logo = document.getElementById('loader-logo');
      if (!logo) return;
      const x = (e.clientX / window.innerWidth - .5);
      const y = (e.clientY / window.innerHeight - .5);
      logo.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    }
    if (intro) window.addEventListener('mousemove', tilt);
    let done = false;
    function finish() {
      if (done) return; done = true;
      loader.classList.add('done');
      document.body.style.overflow = '';
      document.body.classList.add('loaded');
      revealHero();
      setTimeout(() => {
        loader.remove();
        window.removeEventListener('mousemove', tilt);
      }, intro ? 900 : 500);
    }
    // Intro-Choreografie spielt bei jedem Startseiten-Aufruf (Unterseiten haben keine .ld-stage)
    const delay   = intro ? 3200 : 200;   // Startseite: 3,2 s volle Choreo; Unterseiten quasi sofort
    const maxWait = intro ? 3600 : 1200;   // harte Obergrenze — Loader hängt nie länger, auch bei langsamen Bildern
    setTimeout(finish, maxWait);
    if (document.readyState === 'complete') setTimeout(finish, delay);
    else window.addEventListener('load', () => setTimeout(finish, delay));
  }
  initLoader();

  /* ===========================================================
     2. CLIP-PATH REVEAL HEADLINES
     =========================================================== */
  function initClipReveal() {
    if (!window.FX.clipReveal) return;

    // Wrap each word/char in .reveal-clip with span (if not already)
    document.querySelectorAll('.reveal-clip').forEach(el => {
      if (el.dataset.split) return;
      const mode = el.dataset.splitMode || 'words';
      const text = el.textContent.trim();
      let parts;
      if (mode === 'chars') {
        parts = text.split('').map((c, i) =>
          `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`
        );
      } else {
        parts = text.split(' ').map((w, i) =>
          `<span style="--i:${i}">${w}&nbsp;</span>`
        );
      }
      el.innerHTML = parts.join('');
      el.dataset.split = '1';
    });

    // Hero line wrappers (already in HTML, just observe)
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('vis');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

    document.querySelectorAll('.reveal-clip, .line-inner').forEach(el => obs.observe(el));
  }

  /* ===========================================================
     3. MOUSE-TRACKING GLASS
     =========================================================== */
  function initMouseTracking() {
    if (!window.FX.mouseTrackingGlass) {
      document.body.classList.add('no-track');
      return;
    }

    const glassEls = () => document.querySelectorAll('.glass');
    let raf = null;
    const targets = new Map();

    function bindGlass(el) {
      el.addEventListener('mouseenter', () => {
        targets.set(el, { mx: 50, my: 50, ma: 1, tx: 50, ty: 50, ta: 1 });
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        const t = targets.get(el);
        if (t) { t.tx = x; t.ty = y; t.ta = 1; }
      });
      el.addEventListener('mouseleave', () => {
        const t = targets.get(el);
        if (t) t.ta = 0;
        setTimeout(() => {
          el.style.setProperty('--ma', 0);
          targets.delete(el);
        }, 400);
      });
    }

    function loop() {
      let active = false;
      targets.forEach((t, el) => {
        t.mx += (t.tx - t.mx) * 0.18;
        t.my += (t.ty - t.my) * 0.18;
        t.ma += (t.ta - t.ma) * 0.12;
        el.style.setProperty('--mx', t.mx + '%');
        el.style.setProperty('--my', t.my + '%');
        el.style.setProperty('--ma', t.ma.toFixed(3));
        if (Math.abs(t.tx - t.mx) > 0.05 || Math.abs(t.ta - t.ma) > 0.01) active = true;
      });
      if (active && targets.size) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }

    glassEls().forEach(bindGlass);

    // Re-bind beim DOM-Change (z.B. Mobile-Nav)
    const mo = new MutationObserver(() => {
      glassEls().forEach(el => {
        if (!el.__mtBound) {
          bindGlass(el);
          el.__mtBound = true;
        }
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ===========================================================
     4. MAGNETIC BUTTONS
     =========================================================== */
  function initMagnetic() {
    if (!window.FX.magneticButtons) return;
    if (window.matchMedia('(hover: none)').matches) return; // Touch-Geräte raus

    const targets = document.querySelectorAll(
      '.btn-red.btn-lg, .btn-gold, .btn-red.btn-sm, .nav-cta .btn, .fab-whatsapp, .add-btn'
    );

    targets.forEach(btn => {
      let rx = 0, ry = 0, tx = 0, ty = 0;
      let raf = null;
      const strength = btn.classList.contains('fab-whatsapp') ? 0.45 : 0.32;

      function loop() {
        rx += (tx - rx) * 0.18;
        ry += (ty - ry) * 0.18;
        btn.style.transform = `translate(${rx.toFixed(2)}px, ${ry.toFixed(2)}px)`;
        if (Math.abs(tx - rx) > 0.1 || Math.abs(ty - ry) > 0.1) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = null;
        }
      }

      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        tx = (e.clientX - r.left - r.width / 2) * strength;
        ty = (e.clientY - r.top - r.height / 2) * strength;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      btn.addEventListener('mouseleave', () => {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
  }

  /* ===========================================================
     5. SPRING-HOVERS (Card Lift)
     =========================================================== */
  function initSpringHovers() {
    if (!window.FX.springHovers) return;
    if (window.matchMedia('(hover: none)').matches) return;

    const cards = document.querySelectorAll(
      '.usp-card, .product-card, .counter-card, .review-card, .pkg-card, .team-card, .award-card, .value-card, .special-card'
    );

    cards.forEach(card => {
      let ry = 0, rx = 0, rs = 1;
      let ty = 0, tx = 0, ts = 1;
      let raf = null;
      const TILT_MAX = 6; // Grad

      function loop() {
        rx += (tx - rx) * 0.15;
        ry += (ty - ry) * 0.15;
        rs += (ts - rs) * 0.15;
        card.style.transform =
          `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${rs.toFixed(3)}) translateY(${rs > 1.005 ? -6 : 0}px)`;
        if (Math.abs(tx - rx) > 0.05 || Math.abs(ty - ry) > 0.05 || Math.abs(ts - rs) > 0.002) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = null;
        }
      }

      card.addEventListener('mouseenter', () => {
        ts = 1.018;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ty = px * TILT_MAX;
        tx = -py * TILT_MAX;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      card.addEventListener('mouseleave', () => {
        tx = 0; ty = 0; ts = 1;
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
  }

  /* ===========================================================
     6. NAV SCROLL STATE
     =========================================================== */
  function initNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    function update() {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ===========================================================
     7. PINNED HORIZONTAL SCROLL für SPECIALS (GSAP)
     =========================================================== */
  function initPinnedSpecials() {
    if (!window.FX.pinnedSpecials) {
      document.querySelector('.specials-pin')?.classList.add('no-pin');
      return;
    }
    if (window.matchMedia('(max-width: 768px)').matches) return;

    function setup() {
      if (!window.gsap || !window.ScrollTrigger) return;
      gsap.registerPlugin(ScrollTrigger);

      const section = document.querySelector('.specials-pin');
      const track = document.querySelector('.specials-pin-track');
      const bar = document.querySelector('.specials-progress-bar');
      if (!section || !track) return;

      const scrollAmt = () => track.scrollWidth - window.innerWidth + 80;

      gsap.to(track, {
        x: () => -scrollAmt(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + scrollAmt(),
          scrub: 0.5,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar) bar.style.transform = `scaleX(${self.progress})`;
          }
        }
      });
    }

    if (window.gsap && window.ScrollTrigger) {
      setup();
    } else {
      // GSAP wird vom inline-script geladen — wir warten
      const wait = setInterval(() => {
        if (window.gsap && window.ScrollTrigger) {
          clearInterval(wait);
          setup();
        }
      }, 50);
      setTimeout(() => clearInterval(wait), 5000);
    }
  }

  /* ===========================================================
     8. HERO PARALLAX VIDEO
     =========================================================== */
  function initHeroParallax() {
    function setup() {
      if (!window.gsap || !window.ScrollTrigger) return;
      gsap.registerPlugin(ScrollTrigger);
      gsap.to('.hero-video', {
        yPercent: 22,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
      gsap.to('.hero-aurora', {
        yPercent: 35,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }
    if (window.gsap && window.ScrollTrigger) {
      setup();
    } else {
      const wait = setInterval(() => {
        if (window.gsap && window.ScrollTrigger) { clearInterval(wait); setup(); }
      }, 50);
      setTimeout(() => clearInterval(wait), 5000);
    }
  }

  /* ===========================================================
     9. INIT ALLES
     =========================================================== */
  function go() {
    initClipReveal();
    initMouseTracking();
    initMagnetic();
    initSpringHovers();
    initNav();
    initPinnedSpecials();
    initHeroParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go);
  } else {
    go();
  }
})();
