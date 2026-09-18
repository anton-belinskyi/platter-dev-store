if (!customElements.get('product-reveal')) {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  class ProductReveal extends HTMLElement {
    connectedCallback() {
      this.list = this.querySelector('[data-slider-track]');
      this.button = this.querySelector('[data-reveal-button]');
      if (!this.button) return;

      this.button.addEventListener('click', () => this.toggle());
      this.addEventListener('shopify:block:select', (event) => this.revealItem(event.target));
    }

    revealItem(item) {
      const index = [...this.list.children].indexOf(item);
      if (index >= 4 && !this.expanded) this.toggle();
    }

    get expanded() {
      return this.button.getAttribute('aria-expanded') === 'true';
    }

    collapsedHeight() {
      const firstHidden = this.list.children[4];
      if (!firstHidden) return this.list.offsetHeight;

      const rowGap = parseFloat(getComputedStyle(this.list).rowGap) || 0;
      return firstHidden.getBoundingClientRect().top - this.list.getBoundingClientRect().top - rowGap;
    }

    async toggle() {
      const expand = !this.expanded;
      const from = this.list.getBoundingClientRect().height;

      this.animation?.cancel();
      this.removeAttribute('data-collapsed');

      const to = expand ? this.list.offsetHeight : this.collapsedHeight();

      this.button.setAttribute('aria-expanded', String(expand));
      this.button.textContent = expand ? this.button.dataset.labelCollapse : this.button.dataset.labelExpand;
      this.list.style.overflow = 'hidden';

      this.animation = this.list.animate(
        { height: [`${from}px`, `${to}px`] },
        { duration: reducedMotionQuery.matches ? 0 : 450, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      );

      try {
        await this.animation.finished;
      } catch {
        return;
      }

      this.list.style.removeProperty('overflow');
      this.toggleAttribute('data-collapsed', !expand);
    }
  }

  customElements.define('product-reveal', ProductReveal);
}
