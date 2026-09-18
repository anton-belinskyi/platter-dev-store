if (!customElements.get('product-reveal')) {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const HIDDEN_FROM = 4;
  const EXPAND_DURATION = 850;
  const COLLAPSE_DURATION = 350;
  const DECODE_TIMEOUT = 400;

  class ProductReveal extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('[data-slider-track]');
      this.button = this.querySelector('[data-reveal-button]');
      if (!this.button) return;

      this.button.addEventListener('click', () => this.toggle());
      this.button.addEventListener('pointerdown', () => this.prepareImages(), { once: true });
      this.addEventListener('shopify:block:select', (event) => this.revealItem(event.target));

      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;

          this.observer.disconnect();
          this.prepareImages();
        },
        { rootMargin: '200px' },
      );
      this.observer.observe(this.button);
    }

    disconnectedCallback() {
      this.observer?.disconnect();
      cancelAnimationFrame(this.scrollFrame);
    }

    get expanded() {
      return this.button.getAttribute('aria-expanded') === 'true';
    }

    get hiddenItems() {
      return [...this.list.children].slice(HIDDEN_FROM);
    }

    revealItem(item) {
      if (this.hiddenItems.includes(item) && !this.expanded) this.toggle();
    }

    prepareImages() {
      if (!this.imagesReady) {
        const pending = this.hiddenItems
          .flatMap((item) => [...item.querySelectorAll('img')])
          .filter((image) => !image.complete);

        pending.forEach((image) => image.setAttribute('loading', 'eager'));
        this.imagesReady = Promise.allSettled(pending.map((image) => image.decode()));
      }

      return Promise.race([this.imagesReady, new Promise((resolve) => setTimeout(resolve, DECODE_TIMEOUT))]);
    }

    scrollTarget() {
      const section = this.closest('section') || this;
      const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const top = section.getBoundingClientRect().top + window.scrollY - headerHeight;

      return Math.min(Math.max(top, 0), Math.max(maxScroll, 0));
    }

    scrollToTop(duration) {
      const section = this.closest('section') || this;
      if (section.getBoundingClientRect().top >= 0) return;

      if (!duration) {
        window.scrollTo(0, this.scrollTarget());
        return;
      }

      const from = window.scrollY;
      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - (1 - progress) ** 3;

        window.scrollTo(0, from + (this.scrollTarget() - from) * eased);
        if (progress < 1) this.scrollFrame = requestAnimationFrame(step);
      };

      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = requestAnimationFrame(step);
    }

    measure(expand) {
      const from = this.list.getBoundingClientRect().height;
      this.list.style.height = '';
      this.removeAttribute('data-collapsed');

      const fullHeight = this.list.getBoundingClientRect().height;
      const firstHidden = this.hiddenItems[0];
      const rowGap = parseFloat(getComputedStyle(this.list).rowGap) || 0;
      const collapsedHeight = firstHidden
        ? firstHidden.getBoundingClientRect().top - this.list.getBoundingClientRect().top - rowGap
        : fullHeight;

      return { from, to: expand ? fullHeight : collapsedHeight };
    }

    async toggle() {
      const expand = !this.expanded;

      this.button.setAttribute('aria-expanded', String(expand));
      this.button.textContent = expand ? this.button.dataset.labelCollapse : this.button.dataset.labelExpand;

      this.pending = expand;
      if (expand) await this.prepareImages();
      if (this.pending !== expand) return;

      this.animation?.cancel();


      const duration = reducedMotionQuery.matches ? 0 : (expand ? EXPAND_DURATION : COLLAPSE_DURATION);
      const { from, to } = this.measure(expand);

      if (!expand) this.scrollToTop(duration);

      this.list.style.overflow = 'clip';
      this.list.style.contain = 'layout paint';

      this.animation = this.list.animate(
        { height: [`${from}px`, `${to}px`] },
        { duration, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
      );

      try {
        await this.animation.finished;
      } catch {
        return;
      }

      this.list.style.removeProperty('overflow');
      this.list.style.removeProperty('contain');
      this.toggleAttribute('data-collapsed', !expand);
    }
  }

  customElements.define('product-reveal', ProductReveal);
}
