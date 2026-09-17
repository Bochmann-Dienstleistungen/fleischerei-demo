/* FLEISCHEREI EICHENHOF — Shared JS | VALORIS Webdesign */

document.addEventListener('DOMContentLoaded', () => {

  /* NAV SCROLL */
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      nav.style.background = 'rgba(7,7,7,0.88)';
      nav.style.boxShadow = '0 24px 80px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4), inset 0 1.5px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.2)';
    } else {
      nav.style.background = 'rgba(255,255,255,0.045)';
      nav.style.boxShadow = '';
    }
  }, { passive: true });

  /* MOBILE NAV */
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const mobileClose = document.querySelector('.mobile-nav-close');

  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => mobileNav.classList.add('open'));
    mobileClose?.addEventListener('click', () => mobileNav.classList.remove('open'));
    mobileNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => mobileNav.classList.remove('open'));
    });
  }

  /* SCROLL REVEAL */
  const reveals = document.querySelectorAll('.reveal');
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(r => revealObs.observe(r));
  // Fallback: was beim Laden schon im Viewport steht, sofort zeigen — und nach 4s alles in Sichtweite
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.querySelectorAll('.reveal:not(.visible)').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * 1.1) el.classList.add('visible');
      });
    }, 600);
  });

  /* LEGAL DRAWERS */
  const overlay = document.querySelector('.drawer-overlay');
  const impressumDrawer = document.getElementById('drawer-impressum');
  const datenschutzDrawer = document.getElementById('drawer-datenschutz');

  function openDrawer(drawer) {
    overlay?.classList.add('open');
    drawer?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    overlay?.classList.remove('open');
    impressumDrawer?.classList.remove('open');
    datenschutzDrawer?.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-open="impressum"]').forEach(b => b.addEventListener('click', () => openDrawer(impressumDrawer)));
  document.querySelectorAll('[data-open="datenschutz"]').forEach(b => b.addEventListener('click', () => openDrawer(datenschutzDrawer)));
  document.querySelectorAll('.drawer-close').forEach(b => b.addEventListener('click', closeDrawer));
  overlay?.addEventListener('click', closeDrawer);

  /* COUNTER ANIMATION */
  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const duration = 2000;
    const start = performance.now();
    const isDecimal = el.dataset.decimal === 'true';
    const isYear = el.dataset.year === 'true' || (target >= 1900 && target <= 2100 && Number.isInteger(target));
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const value = ease * target;
      if (isDecimal) {
        el.textContent = value.toFixed(1);
      } else if (isYear) {
        el.textContent = Math.round(value).toString();
      } else {
        el.textContent = Math.round(value).toLocaleString('de-DE');
      }
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target);
        counterObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-target]').forEach(c => counterObs.observe(c));

  /* ACTIVE NAV LINK */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === currentPage || (currentPage === '' && a.getAttribute('href') === 'index.html')) {
      a.classList.add('active');
    }
  });

  /* SET CURRENT YEAR */
  document.querySelectorAll('.year').forEach(el => { el.textContent = new Date().getFullYear(); });

});
