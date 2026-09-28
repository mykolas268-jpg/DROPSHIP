/*
 * op-media.js — swipeable gallery with dots (<op-gallery>) and "play only while visible" videos.
 * Videos never autoplay for visitors who prefer reduced motion; they get native controls instead.
 */
(function () {
  if (customElements.get('op-gallery')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Plays muted looping videos while at least 60% visible, pauses otherwise. */
  const videoObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const video = entry.target;
              if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && !document.hidden) {
                if (video.preload === 'none') video.preload = 'metadata';
                const attempt = video.play();
                if (attempt && attempt.catch) attempt.catch(() => (video.controls = true));
              } else if (!video.paused) {
                video.pause();
              }
            });
          },
          { threshold: [0, 0.6] }
        )
      : null;

  function watchVideos(root) {
    root.querySelectorAll('[data-op-autoplay] video, video[data-op-autoplay]').forEach((video) => {
      if (video.dataset.opWatched) return;
      video.dataset.opWatched = 'true';
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      if (reduceMotion || !videoObserver) {
        video.controls = true;
        return;
      }
      videoObserver.observe(video);
    });
  }
  window.OPWatchVideos = watchVideos;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('[data-op-autoplay] video').forEach((v) => v.pause());
  });

  class OPGallery extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.track = this.querySelector('[data-op-gallery-track]');
      this.slides = Array.from(this.querySelectorAll('[data-op-slide]'));
      this.dots = Array.from(this.querySelectorAll('[data-op-dot]'));
      watchVideos(this);
      if (this.slides.length < 2) return;

      this.dots.forEach((dot, index) =>
        dot.addEventListener('click', () => {
          this.go(index);
          if (window.OPTrack) window.OPTrack('op_gallery_dot', { index: index + 1 });
        })
      );

      this.slideObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) this.setActive(this.slides.indexOf(entry.target));
          });
        },
        { root: this.track, threshold: [0.55] }
      );
      this.slides.forEach((slide) => this.slideObserver.observe(slide));

      this.track.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') this.go(Math.min(this.active + 1, this.slides.length - 1));
        if (event.key === 'ArrowLeft') this.go(Math.max(this.active - 1, 0));
      });
      this.setActive(0);
    }

    go(index) {
      const slide = this.slides[index];
      if (!slide) return;
      this.track.scrollTo({ left: slide.offsetLeft - this.track.offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
      this.setActive(index);
    }

    setActive(index) {
      if (index < 0 || index === this.active) return;
      this.active = index;
      this.dots.forEach((dot, i) => dot.setAttribute('aria-current', i === index ? 'true' : 'false'));
      this.slides.forEach((slide, i) => slide.setAttribute('aria-hidden', i === index ? 'false' : 'true'));
    }

    disconnectedCallback() {
      if (this.slideObserver) this.slideObserver.disconnect();
    }
  }
  customElements.define('op-gallery', OPGallery);

  /* Generic wrapper so any section can opt its videos into visible-only autoplay. */
  class OPAutoplay extends HTMLElement {
    connectedCallback() {
      watchVideos(this);
    }
  }
  customElements.define('op-autoplay', OPAutoplay);
})();
