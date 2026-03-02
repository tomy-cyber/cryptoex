/* ============================================================
   CryptoEx – Premium Animations Engine v2
   Cinematic scroll reveals, particle systems, fluid card effects,
   gradient borders, counter animations, micro-interactions
   ============================================================ */

(function() {
  'use strict';

  // ── Performance helpers ────────────────────────────
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.innerWidth < 768;
  const raf = requestAnimationFrame;

  // ── Easing functions ───────────────────────────────
  const ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    outQuart: t => 1 - Math.pow(1 - t, 4),
    outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    spring: t => 1 - Math.pow(Math.cos(t * Math.PI * 0.4), 3) * Math.exp(-t * 6),
  };

  // ══════════════════════════════════════════════════
  //  SCROLL REVEAL — Intersection Observer
  // ══════════════════════════════════════════════════
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.06,
    rootMargin: '0px 0px -50px 0px'
  });

  function initReveal() {
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger').forEach(el => {
      revealObserver.observe(el);
    });
  }

  // ── Auto-apply reveal to common sections ──────────
  function autoReveal() {
    const selectors = [
      '.feature-card', '.summary-card', '.earn-product',
      '.rgb-card', '.profile-section', '.holdings-table-wrap',
      '.donut-wrap', '.recent-orders', '.section-header',
      '.hero-content', '.hero-chart-wrapper', '.earn-left', '.earn-right',
      '.market-stats-bar', '.footer-brand', '.footer-col',
      '.pf-summary-card', '.pf-chart-card', '.pf-holdings-wrap', '.pf-orders-wrap',
      '.pf-performance-wrap', '.pf-tip-card', '.trend-card', '.step-card',
      '.trd-info-item', '.trd-guide-card'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (!el.classList.contains('reveal') && !el.classList.contains('visible')) {
          el.classList.add('reveal');
          el.style.transitionDelay = `${i * 0.07}s`;
        }
      });
    });

    // Stagger grids
    document.querySelectorAll('.features-grid, .portfolio-summary, .earn-products, .footer-grid').forEach(grid => {
      if (!grid.classList.contains('stagger')) {
        grid.classList.add('stagger');
      }
    });
  }

  // ══════════════════════════════════════════════════
  //  3D CARD TILT — Fluid perspective tracking
  // ══════════════════════════════════════════════════
  function init3DCards() {
    if (isMobile || prefersReducedMotion) return;

    const cards = document.querySelectorAll('.hero-card, .feature-card, .summary-card, .rgb-card');

    cards.forEach(card => {
      let animId = null;
      let targetX = 0, targetY = 0;
      let currentX = 0, currentY = 0;

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        targetX = ((y - centerY) / centerY) * -5;
        targetY = ((x - centerX) / centerX) * 5;

        // Dynamic gradient reflection
        const glareX = (x / rect.width) * 100;
        const glareY = (y / rect.height) * 100;
        card.style.setProperty('--glare-x', glareX + '%');
        card.style.setProperty('--glare-y', glareY + '%');

        if (!animId) {
          animId = raf(function tick() {
            currentX += (targetX - currentX) * 0.12;
            currentY += (targetY - currentY) * 0.12;

            if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
              card.style.transform = `perspective(800px) rotateX(${currentX}deg) rotateY(${currentY}deg) translateY(-4px) scale(1.01)`;
              animId = raf(tick);
            } else {
              card.style.transform = `perspective(800px) rotateX(${targetX}deg) rotateY(${targetY}deg) translateY(-4px) scale(1.01)`;
              animId = null;
            }
          });
        }
      });

      card.addEventListener('mouseleave', () => {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        targetX = 0; targetY = 0;

        // Smooth spring-back
        const startX = currentX, startY = currentY;
        const startTime = performance.now();
        const duration = 700;

        function springBack(now) {
          const elapsed = (now - startTime) / duration;
          if (elapsed >= 1) {
            card.style.transform = '';
            currentX = currentY = 0;
            return;
          }
          const t = ease.spring(elapsed);
          currentX = startX * (1 - t);
          currentY = startY * (1 - t);
          card.style.transform = `perspective(800px) rotateX(${currentX}deg) rotateY(${currentY}deg)`;
          raf(springBack);
        }
        raf(springBack);
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  SMOOTH COUNTER ANIMATION
  // ══════════════════════════════════════════════════
  function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = parseFloat(el.dataset.count);
      const duration = 1800;
      const start = performance.now();
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = parseInt(el.dataset.decimals || '0');

      function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = ease.outExpo(progress);
        const current = target * eased;
        el.textContent = prefix + current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
        if (progress < 1) raf(update);
      }
      raf(update);
    });
  }

  // ══════════════════════════════════════════════════
  //  RIPPLE EFFECT — Material Design inspired
  // ══════════════════════════════════════════════════
  function initRipple() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, .trade-btn, .tab, .pct-btn, .bs-btn, .tp-tab, .nav-icon, .sidebar-nav-item, .pair-item, .earn-product');
      if (!target) return;

      const ripple = document.createElement('span');
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position:absolute; width:${size}px; height:${size}px;
        left:${x}px; top:${y}px; border-radius:50%;
        background:radial-gradient(circle, rgba(252,213,53,0.15) 0%, rgba(255,255,255,0.08) 40%, transparent 70%);
        transform:scale(0); pointer-events:none; z-index:1;
      `;

      // Ensure container is positioned
      const pos = getComputedStyle(target).position;
      if (pos !== 'relative' && pos !== 'absolute' && pos !== 'fixed') {
        target.style.position = 'relative';
      }
      target.style.overflow = 'hidden';
      target.appendChild(ripple);

      ripple.animate([
        { transform: 'scale(0)', opacity: 1 },
        { transform: 'scale(1)', opacity: 0 }
      ], { duration: 550, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).onfinish = () => ripple.remove();
    });
  }

  // ══════════════════════════════════════════════════
  //  MAGNETIC BUTTON EFFECT
  // ══════════════════════════════════════════════════
  function initMagneticButtons() {
    if (isMobile || prefersReducedMotion) return;

    document.querySelectorAll('.btn-primary, .btn-lg, .execute-btn-buy, .execute-btn-sell').forEach(btn => {
      let animId = null;
      let cx = 0, cy = 0;

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const tx = x * 0.2;
        const ty = y * 0.2;

        if (!animId) {
          animId = raf(function anim() {
            cx += (tx - cx) * 0.15;
            cy += (ty - cy) * 0.15;
            btn.style.transform = `translate(${cx}px, ${cy}px) scale(1.02)`;
            if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
              animId = raf(anim);
            } else {
              animId = null;
            }
          });
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        btn.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        btn.style.transform = '';
        setTimeout(() => btn.style.transition = '', 400);
        cx = cy = 0;
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  HERO PARALLAX — Smooth depth effect
  // ══════════════════════════════════════════════════
  function initParallax() {
    if (isMobile || prefersReducedMotion) return;

    const hero = document.querySelector('.hero');
    const heroCard = document.querySelector('.hero-card');
    const heroContent = document.querySelector('.hero-content');
    if (!hero || !heroCard) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        raf(() => {
          const scrollY = window.scrollY;
          if (scrollY < 800) {
            const factor1 = scrollY * 0.12;
            const factor2 = scrollY * -0.04;
            const opacity = Math.max(0, 1 - scrollY / 600);
            heroCard.style.transform = `translateY(${factor1}px)`;
            heroCard.style.opacity = opacity;
            if (heroContent) {
              heroContent.style.transform = `translateY(${factor2}px)`;
              heroContent.style.opacity = opacity;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ══════════════════════════════════════════════════
  //  NAVBAR SCROLL EFFECTS
  // ══════════════════════════════════════════════════
  function initNavScroll() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;

    let lastScroll = 0;
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        raf(() => {
          const scrollY = window.scrollY;

          if (scrollY > 60) {
            nav.style.borderBottomColor = 'rgba(255,255,255,0.08)';
            nav.style.boxShadow = `0 4px 30px rgba(0,0,0,${Math.min(0.4, scrollY / 500)})`;
            nav.style.background = `rgba(11,14,17,${Math.min(0.97, 0.92 + scrollY / 3000)})`;
          } else {
            nav.style.borderBottomColor = '';
            nav.style.boxShadow = '';
            nav.style.background = '';
          }

          lastScroll = scrollY;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ══════════════════════════════════════════════════
  //  TABLE ROW HOVER GLOW — Following cursor gradient
  // ══════════════════════════════════════════════════
  function initTableGlow() {
    if (isMobile) return;

    document.querySelectorAll('.market-table tbody, .holdings-table tbody').forEach(tbody => {
      tbody.addEventListener('mousemove', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;

        // Clear siblings
        tbody.querySelectorAll('tr').forEach(tr => {
          if (tr !== row) tr.style.background = '';
        });

        const rect = row.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        row.style.background = `linear-gradient(90deg,
          transparent ${Math.max(0, x - 40)}%,
          rgba(252,213,53,0.03) ${x}%,
          transparent ${Math.min(100, x + 40)}%
        )`;
      });

      tbody.addEventListener('mouseleave', () => {
        tbody.querySelectorAll('tr').forEach(tr => tr.style.background = '');
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  FLOATING PARTICLES — Subtle ambient effect
  // ══════════════════════════════════════════════════
  function initParticles() {
    if (isMobile || prefersReducedMotion) return;

    const hero = document.querySelector('.hero');
    if (!hero) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.4';
    hero.style.position = 'relative';
    hero.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 30;

    function resize() {
      canvas.width = hero.offsetWidth;
      canvas.height = hero.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.4 - 0.1,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: ['#fcd535', '#0ecb81', '#1e9af8', '#a855f7'][Math.floor(Math.random() * 4)]
      });
    }

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      });

      // Draw faint connections
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = '#fcd535';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      raf(drawParticles);
    }
    raf(drawParticles);
  }

  // ══════════════════════════════════════════════════
  //  GRADIENT BORDER GLOW on feature cards
  // ══════════════════════════════════════════════════
  function initGradientBorders() {
    if (isMobile || prefersReducedMotion) return;

    document.querySelectorAll('.feature-card').forEach((card, i) => {
      card.addEventListener('mouseenter', () => {
        const colors = [
          'rgba(252,213,53,0.4)', // gold
          'rgba(30,154,248,0.4)', // blue
          'rgba(14,203,129,0.4)', // green
          'rgba(168,85,247,0.4)', // purple
          'rgba(6,214,160,0.4)',  // cyan
          'rgba(255,107,157,0.4)' // pink
        ];
        const color = colors[i % colors.length];
        card.style.borderColor = color;
        card.style.boxShadow = `0 20px 60px rgba(0,0,0,0.3), 0 0 30px ${color.replace('0.4', '0.08')}`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = '';
        card.style.boxShadow = '';
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  SMOOTH NUMBER TICKER — for live price changes
  // ══════════════════════════════════════════════════
  function initPriceFlash() {
    // Enhanced flash effect for price changes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes priceFlashGreen {
        0% { background: rgba(14,203,129,0.2); }
        100% { background: transparent; }
      }
      @keyframes priceFlashRed {
        0% { background: rgba(246,70,93,0.2); }
        100% { background: transparent; }
      }
      .price-flash-up {
        animation: priceFlashGreen 0.8s ease-out;
        border-radius: 4px;
      }
      .price-flash-down {
        animation: priceFlashRed 0.8s ease-out;
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════
  //  SMOOTH SCROLL for anchor links
  // ══════════════════════════════════════════════════
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  CURSOR GLOW — Subtle ambient light following cursor
  // ══════════════════════════════════════════════════
  function initCursorGlow() {
    if (isMobile || prefersReducedMotion) return;

    const glow = document.createElement('div');
    glow.style.cssText = `
      position:fixed; width:400px; height:400px; border-radius:50%;
      background:radial-gradient(circle, rgba(252,213,53,0.03) 0%, transparent 70%);
      pointer-events:none; z-index:0; transform:translate(-50%,-50%);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(glow);

    let mx = 0, my = 0, gx = 0, gy = 0;

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
    }, { passive: true });

    function updateGlow() {
      gx += (mx - gx) * 0.08;
      gy += (my - gy) * 0.08;
      glow.style.left = gx + 'px';
      glow.style.top = gy + 'px';
      raf(updateGlow);
    }
    raf(updateGlow);
  }

  // ══════════════════════════════════════════════════
  //  CARD HOVER SHINE — Premium shine sweep effect
  // ══════════════════════════════════════════════════
  function initCardShine() {
    if (isMobile || prefersReducedMotion) return;

    const style = document.createElement('style');
    style.textContent = `
      .card-shine-wrap {
        position: relative;
        overflow: hidden;
      }
      .card-shine-wrap::after {
        content: '';
        position: absolute;
        inset: -50%;
        background: linear-gradient(
          115deg,
          transparent 40%,
          rgba(255,255,255,0.03) 45%,
          rgba(255,255,255,0.06) 50%,
          rgba(255,255,255,0.03) 55%,
          transparent 60%
        );
        transform: translateX(-100%) rotate(0deg);
        transition: none;
        pointer-events: none;
        z-index: 2;
      }
      .card-shine-wrap:hover::after {
        animation: shineSwipe 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes shineSwipe {
        from { transform: translateX(-100%) rotate(0deg); }
        to { transform: translateX(100%) rotate(0deg); }
      }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.feature-card, .summary-card, .rgb-card, .earn-product').forEach(card => {
      card.classList.add('card-shine-wrap');
    });
  }

  // ══════════════════════════════════════════════════
  //  STAGGERED ENTRANCE for dynamically loaded content
  // ══════════════════════════════════════════════════
  function staggerElements(parent, delay = 50) {
    if (!parent) return;
    const children = parent.children;
    Array.from(children).forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(16px)';
      child.style.transition = `opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * delay}ms, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * delay}ms`;

      // Trigger in next frame
      raf(() => raf(() => {
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }));
    });
  }

  // ══════════════════════════════════════════════════
  //  TYPEWRITER for hero heading (optional)
  // ══════════════════════════════════════════════════
  function initTextShimmer() {
    const style = document.createElement('style');
    style.textContent = `
      .text-shimmer {
        background: linear-gradient(90deg, var(--accent) 0%, #fff 25%, var(--accent) 50%, #fff 75%, var(--accent) 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: textShimmerAnim 4s linear infinite;
      }
      @keyframes textShimmerAnim {
        0% { background-position: 0% center; }
        100% { background-position: 200% center; }
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════
  //  PAGE LOAD ENTRANCE — Cinematic fade
  // ══════════════════════════════════════════════════
  function pageEntrance() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

    // Double rAF ensures the browser paints opacity:0 first
    raf(() => {
      raf(() => {
        document.body.style.opacity = '1';
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  TOOLTIP on icon hover
  // ══════════════════════════════════════════════════
  function initTooltips() {
    const style = document.createElement('style');
    style.textContent = `
      [data-tooltip] {
        position: relative;
      }
      [data-tooltip]::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: var(--bg4);
        color: var(--text);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid var(--border2);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 100;
      }
      [data-tooltip]:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════
  //  ENHANCED SCROLLBAR — Custom thumb
  // ══════════════════════════════════════════════════
  function initScrollbar() {
    const style = document.createElement('style');
    style.textContent = `
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: rgba(252,213,53,0.15);
        border-radius: 3px;
        transition: background 0.2s;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(252,213,53,0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════
  //  GLASSMORPHISM HOVER — Dynamic glass glow
  // ══════════════════════════════════════════════════
  function initGlassCards() {
    if (isMobile || prefersReducedMotion) return;

    const selectors = '.feature-card, .summary-card, .trend-card, .pf-summary-card, .pf-tip-card, .step-card, .earn-product, .pf-chart-card, .pf-performance-wrap, .pf-orders-wrap, .hero-card, .glass-card';

    document.querySelectorAll(selectors).forEach(card => {
      // Create inner glow element
      const glow = document.createElement('div');
      glow.style.cssText = `
        position:absolute;inset:0;pointer-events:none;z-index:0;
        opacity:0;transition:opacity 0.3s ease;border-radius:inherit;
      `;

      const pos = getComputedStyle(card).position;
      if (pos !== 'relative' && pos !== 'absolute' && pos !== 'fixed') {
        card.style.position = 'relative';
      }
      card.appendChild(glow);

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        glow.style.opacity = '1';
        glow.style.background = `radial-gradient(600px circle at ${x}px ${y}px, rgba(252,213,53,0.04), rgba(30,154,248,0.02), transparent 60%)`;
      });

      card.addEventListener('mouseleave', () => {
        glow.style.opacity = '0';
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  MEGA MENU INTERACTIONS
  // ══════════════════════════════════════════════════
  function initMegaMenuInteractions() {
    if (isMobile) return;

    // Smooth height transition for mega menus
    document.querySelectorAll('.mega-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        const icon = item.querySelector('.mega-item-icon');
        if (icon) {
          icon.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
          icon.style.transform = 'scale(1.1) rotate(3deg)';
        }
      });
      item.addEventListener('mouseleave', () => {
        const icon = item.querySelector('.mega-item-icon');
        if (icon) {
          icon.style.transform = '';
        }
      });
    });

    // Add glow behind mega menu on hover
    document.querySelectorAll('.nav-links > li').forEach(li => {
      const mega = li.querySelector('.mega-menu');
      if (!mega) return;

      li.addEventListener('mouseenter', () => {
        mega.style.filter = 'drop-shadow(0 0 40px rgba(252,213,53,0.05))';
      });
      li.addEventListener('mouseleave', () => {
        mega.style.filter = '';
      });
    });
  }

  // ══════════════════════════════════════════════════
  //  GLASS REFLECTION — Cursor-following light
  // ══════════════════════════════════════════════════
  function initCardGlassReflection() {
    if (isMobile || prefersReducedMotion) return;

    const style = document.createElement('style');
    style.textContent = `
      .glass-reflection-wrap {
        position: relative;
        overflow: hidden;
      }
      .glass-reflection-wrap .glass-ref {
        position: absolute;
        width: 200px;
        height: 200px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%);
        pointer-events: none;
        z-index: 3;
        opacity: 0;
        transition: opacity 0.3s;
        transform: translate(-50%, -50%);
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════
  //  INITIALIZE ALL
  // ══════════════════════════════════════════════════
  function init() {
    pageEntrance();
    autoReveal();
    initReveal();
    init3DCards();
    initRipple();
    initMagneticButtons();
    initParallax();
    initNavScroll();
    initTableGlow();
    initParticles();
    initGradientBorders();
    initPriceFlash();
    initSmoothScroll();
    initCursorGlow();
    initCardShine();
    initTextShimmer();
    initTooltips();
    initScrollbar();
    initGlassCards();
    initMegaMenuInteractions();
    initCardGlassReflection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API for dynamic content
  window.CryptoExAnims = { init, initReveal, autoReveal, init3DCards, animateCounters, staggerElements, initGlassCards, initMegaMenuInteractions };
})();
