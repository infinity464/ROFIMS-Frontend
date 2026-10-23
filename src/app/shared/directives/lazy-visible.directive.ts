import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

/**
 * Fires `appLazyVisible` once, the first time the host element scrolls within
 * `rootMargin` of the viewport, then stops observing it.
 *
 * Built for long report tables that render expensive per-row content (image
 * thumbnails): the rows the user never scrolls to never pay for their content.
 * A single shared IntersectionObserver per directive instance is cheap — the
 * browser batches callbacks off the main thread's layout work.
 *
 * Environments without IntersectionObserver (or with the directive disabled via
 * `appLazyVisibleDisabled`) emit immediately, so behaviour degrades to eager.
 *
 * Usage: add `LazyVisibleDirective` to the component's `imports: [...]`, then
 *   <td (appLazyVisible)="loadThumb(row)">…</td>
 */
@Directive({
    selector: '[appLazyVisible]',
    standalone: true,
})
export class LazyVisibleDirective implements OnInit, OnDestroy {
    /** Emits once when the host first comes into (or near) view. */
    @Output() appLazyVisible = new EventEmitter<void>();

    /** How far ahead of the viewport to trigger. Default preloads one screen. */
    @Input() lazyVisibleRootMargin = '300px';

    /** Skip observation entirely and emit on init. */
    @Input() appLazyVisibleDisabled = false;

    private observer: IntersectionObserver | null = null;

    constructor(private el: ElementRef<HTMLElement>) {}

    ngOnInit(): void {
        if (this.appLazyVisibleDisabled || typeof IntersectionObserver === 'undefined') {
            this.appLazyVisible.emit();
            return;
        }
        this.observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((e) => e.isIntersecting)) return;
                this.disconnect();
                this.appLazyVisible.emit();
            },
            { rootMargin: this.lazyVisibleRootMargin }
        );
        this.observer.observe(this.el.nativeElement);
    }

    ngOnDestroy(): void {
        this.disconnect();
    }

    private disconnect(): void {
        this.observer?.disconnect();
        this.observer = null;
    }
}
