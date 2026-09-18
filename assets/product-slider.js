  if (!customElements.get('product-slider')) {
  const desktopQuery = window.matchMedia('(min-width: 48rem)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;
  const HOLD_DELAY = 150;
  const HOLD_MOVE_TOLERANCE = 8;

  class ProductSlider extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-slider-track]');
      this.bar = this.querySelector('[data-slider-bar]');
      this.thumb = this.querySelector('[data-slider-thumb]');
      this.update = this.update.bind(this);

      this.track.addEventListener('scroll', this.update, { passive: true });
      this.track.addEventListener('dragstart', (event) => event.preventDefault());
      this.track.addEventListener('pointerdown', (event) => this.startTrackDrag(event));
      this.bar.addEventListener('pointerdown', (event) => this.startBarDrag(event));
      this.track.addEventListener('wheel', () => this.stopSettle(), { passive: true });
      this.track.addEventListener('pointerdown', (event) => this.startMediaHold(event));
      this.addEventListener('shopify:block:select', (event) => this.scrollToItem(event.target));

      this.resizeObserver = new ResizeObserver(this.update);
      this.resizeObserver.observe(this.track);
      this.resizeObserver.observe(this.bar);
    }

    disconnectedCallback() {
      this.resizeObserver.disconnect();
      this.stopSettle();
    }

    get maxScroll() {
      return this.track.scrollWidth - this.track.clientWidth;
    }

    update() {
      const { scrollLeft, scrollWidth, clientWidth } = this.track;
      const barWidth = this.bar.clientWidth;
      const thumbWidth = scrollWidth > 0 ? Math.max((barWidth * clientWidth) / scrollWidth, 48) : 0;
      const progress = this.maxScroll > 0 ? scrollLeft / this.maxScroll : 0;

      this.bar.hidden = this.maxScroll <= 0;
      this.thumb.style.width = `${thumbWidth}px`;
      this.thumb.style.transform = `translateX(${(barWidth - thumbWidth) * progress}px)`;
    }

    itemOffset(item) {
      const trackLeft = this.track.getBoundingClientRect().left;
      const scrollPadding = parseFloat(getComputedStyle(this.track).scrollPaddingLeft) || 0;

      return clamp(item.getBoundingClientRect().left - trackLeft + this.track.scrollLeft - scrollPadding, 0, this.maxScroll);
    }

    scrollToItem(item) {
      if (!desktopQuery.matches || !this.track.contains(item)) return;

      this.stopSettle();
      this.track.scrollTo({ left: this.itemOffset(item), behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
    }

    nearestSnapOffset() {
      const { scrollLeft } = this.track;
      const offsets = [...this.track.children].map((item) => this.itemOffset(item));

      return [...offsets, this.maxScroll].reduce((nearest, offset) => (Math.abs(offset - scrollLeft) < Math.abs(nearest - scrollLeft) ? offset : nearest));
    }

    settle() {
      this.stopSettle();

      const from = this.track.scrollLeft;
      const distance = this.nearestSnapOffset() - from;
      const duration = reducedMotionQuery.matches ? 0 : clamp(Math.abs(distance) * 2, 250, 500);

      if (Math.abs(distance) < 1 || duration === 0) {
        this.track.scrollLeft = from + distance;
        this.track.removeAttribute('data-dragging');
        return;
      }

      const start = performance.now();

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        this.track.scrollLeft = from + distance * easeOutCubic(progress);

        if (progress < 1) {
          this.settleFrame = requestAnimationFrame(step);
          return;
        }

        this.settleFrame = null;
        this.track.removeAttribute('data-dragging');
      };

      this.settleFrame = requestAnimationFrame(step);
    }

    stopSettle() {
      if (!this.settleFrame) return;

      cancelAnimationFrame(this.settleFrame);
      this.settleFrame = null;
      this.track.removeAttribute('data-dragging');
    }

    startTrackDrag(event) {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !desktopQuery.matches) return;

      this.stopSettle();

      const startX = event.clientX;
      const startScroll = this.track.scrollLeft;
      let dragging = false;

      const controller = new AbortController();
      const { signal } = controller;

      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;

        if (!dragging && Math.abs(delta) > 4) {
          dragging = true;
          this.track.setPointerCapture(moveEvent.pointerId);
          this.track.toggleAttribute('data-dragging', true);
        }

        if (dragging) this.track.scrollLeft = startScroll - delta;
      };

      const end = () => {
        controller.abort();
        if (!dragging) return;

        this.settle();
        this.track.addEventListener('click', (clickEvent) => clickEvent.preventDefault(), { capture: true, once: true });
      };

      window.addEventListener('pointermove', move, { signal });
      window.addEventListener('pointerup', end, { signal });
      window.addEventListener('pointercancel', end, { signal });
    }

    startMediaHold(event) {
      if (event.pointerType === 'mouse') return;

      const media = event.target.closest('[data-media]');
      if (!media) return;

      const controller = new AbortController();
      const { signal } = controller;
      let held = false;

      const timer = setTimeout(() => {
        held = true;
        media.toggleAttribute('data-media-active', true);
      }, HOLD_DELAY);

      const end = () => {
        clearTimeout(timer);
        controller.abort();
        media.removeAttribute('data-media-active');
        if (held) media.addEventListener('click', (clickEvent) => clickEvent.preventDefault(), { capture: true, once: true });
      };

      const move = (moveEvent) => {
        const moved = Math.abs(moveEvent.clientX - event.clientX) > HOLD_MOVE_TOLERANCE || Math.abs(moveEvent.clientY - event.clientY) > HOLD_MOVE_TOLERANCE;
        if (moved) end();
      };

      window.addEventListener('pointermove', move, { signal });
      window.addEventListener('pointerup', end, { signal });
      window.addEventListener('pointercancel', end, { signal });
    }

    startBarDrag(event) {
      if (event.button !== 0 || this.maxScroll <= 0) return;

      event.preventDefault();
      this.stopSettle();
      this.bar.setPointerCapture(event.pointerId);
      this.bar.toggleAttribute('data-active', true);
      this.track.toggleAttribute('data-dragging', true);

      const barRect = this.bar.getBoundingClientRect();
      const thumbRect = this.thumb.getBoundingClientRect();
      const onThumb = event.clientX >= thumbRect.left && event.clientX <= thumbRect.right;
      const grabOffset = onThumb ? event.clientX - thumbRect.left : thumbRect.width / 2;

      const scrollTo = (clientX) => {
        const ratio = (clientX - barRect.left - grabOffset) / (barRect.width - thumbRect.width);
        this.track.scrollLeft = clamp(ratio, 0, 1) * this.maxScroll;
      };

      const controller = new AbortController();
      const { signal } = controller;

      const end = () => {
        controller.abort();
        this.bar.removeAttribute('data-active');
        this.settle();
      };

      if (!onThumb) scrollTo(event.clientX);
      this.bar.addEventListener('pointermove', (moveEvent) => scrollTo(moveEvent.clientX), { signal });
      this.bar.addEventListener('pointerup', end, { signal });
      this.bar.addEventListener('pointercancel', end, { signal });
    }
  }

  customElements.define('product-slider', ProductSlider);
}
