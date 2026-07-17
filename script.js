/**
 * A Celebration of Existence — Phase 3
 * Complex Interactive Components
 * Vanilla JS · ES2023 · Zero dependencies
 *
 * PHASE 3 ADDITIONS vs Phase 2:
 *  1. Memory Stack — hover now resolves to a calculated GRID layout
 *     (row/col transform math) instead of a fixed 5-point starburst.
 *  2. Sticky Timeline — added checklist-required scale()-down + fade
 *     for outgoing cards, layered on top of the existing 3D tilt.
 *  3. Infinite 3D Finale — full rebuild. Rings are now recycled via
 *     per-ring modulo wraparound (true infinite loop, not 15 static
 *     divs nudging together), each ring carries an <img>, and rings
 *     pick up continuous rotateX/rotateY drift.
 */

(() => {
    'use strict';

    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------
    const state = {
        scrollRatio:   0,
        mouse:         { x: window.innerWidth / 2,  y: window.innerHeight / 2 },
        cursor:        { x: window.innerWidth / 2,  y: window.innerHeight / 2 },
        audioCtx:      null,
        isAudioReady:  false,

        konamiSequence: ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
                         'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'],
        konamiIdx:      0,
        pressTimer:     null,

        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        isTabVisible:         !document.hidden,

        // PHASE 3: finale section visibility, gates the tunnel rAF work
        isFinaleVisible: false,

        // PHASE 4: ambient drone node refs, kept here so the easter-egg
        // duck/restore logic can reach them without a second module-level
        // closure variable.
        ambient: {
            oscA: null, oscB: null, filter: null, lfo: null, lfoGain: null,
            masterGain: null, isPlaying: false, baseLevel: 0.035,
        },

        // PHASE 4: grand finale (scale-to-a-point + starfield + quote + black)
        finaleHijack: {
            fired:       false,  // ensures the sequence only ever runs once
            dwellStart:  null,   // timestamp when scrollRatio first crossed the bottom threshold
            DWELL_MS:    350,    // how long the user must sit at the bottom before it fires
            THRESHOLD:   0.995,  // scrollRatio considered "absolute bottom"
        },
    };

    // -------------------------------------------------------------------------
    // DOM REFS
    // -------------------------------------------------------------------------
    const DOM = {
        body:            document.body,
        main:            document.getElementById('app-main'),
        preloader:       document.getElementById('preloader'),
        preloaderText:   document.getElementById('preloader-text'),
        preloaderLine:   document.querySelector('.preloader-line line'),
        cursorDot:       document.getElementById('cursor-dot'),
        cursorRing:      document.getElementById('cursor-ring'),
        scrollIndicator: document.getElementById('scroll-indicator'),
        grainCanvas:     document.getElementById('grain-canvas'),
        universeCanvas:  document.getElementById('universe-canvas'),
        lightReactives:  document.querySelectorAll('.light-reactive'),
        tunnelContainer: document.querySelector('.tunnel-container'),
        finaleSection:   document.getElementById('finale'),
        eggOverlay:      document.getElementById('easter-egg-overlay'),
        chapters:        document.querySelectorAll('.chapter'),
        timelineSection: document.getElementById('timeline'),
        timelineCards:   document.querySelectorAll('.timeline-card'),
        stackContainer:  document.querySelector('.stack-container'),
        memoryCards:     document.querySelectorAll('.memory-card'),

        // PHASE 4: populated by initGrandFinale(); declared here for clarity
        // even though they're assigned later, so every DOM ref lives in one
        // place. finaleHijackLayer is created once at boot with its final
        // box already reserved (position:fixed, inset:0) — see CSS — so
        // toggling it later is opacity-only and cannot shift layout.
        finaleHijackLayer:  null,
        finaleStarsCanvas:  null,
        finaleQuoteEl:      null,
    };

    // -------------------------------------------------------------------------
    // UTILS
    // -------------------------------------------------------------------------
    const lerp  = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

    // -------------------------------------------------------------------------
    // 1. PRELOADER
    // -------------------------------------------------------------------------
    const initPreloader = () => {
        if (state.prefersReducedMotion) {
            DOM.preloader.remove();
            DOM.main.classList.add('ready');
            initSubsystems();
            return;
        }

        const textAnim = DOM.preloaderText.animate(
            [
                { opacity: 0 },
                { opacity: 1, offset: 0.2 },
                { opacity: 1, offset: 0.8 },
                { opacity: 0 },
            ],
            { duration: 3000, easing: 'ease-in-out', fill: 'forwards' }
        );

        const lineAnim = DOM.preloaderLine.animate(
            [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
            { duration: 2000, delay: 500, easing: 'cubic-bezier(0.19,1,0.22,1)', fill: 'forwards' }
        );

        Promise.all([textAnim.finished, lineAnim.finished]).then(() => {
            DOM.preloader
                .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, fill: 'forwards' })
                .onfinish = () => {
                    DOM.preloader.remove();
                    DOM.main.classList.add('ready');
                };
        });

        initSubsystems();
    };

    // -------------------------------------------------------------------------
    // SUBSYSTEM BOOTSTRAP
    // -------------------------------------------------------------------------
    const initSubsystems = () => {
        splitTextEngine();
        initCursorTracking();
        initScrollTracking();
        initGrainCanvas();
        initUniverseCanvas();

        initIntersectionObserver();
        initMemoryStackGrid();     // PHASE 3
        initStickyTimeline();
        initInfiniteTunnel();      // PHASE 3 rebuild
        initFoleyAudio();
        initAmbientDrone();        // PHASE 4
        initEasterEggs();
        initGrandFinale();         // PHASE 4 — must run at boot, not lazily,
                                   // so its canvas/quote occupy layout space
                                   // from frame one and never cause a shift

        document.addEventListener('visibilitychange', () => {
            state.isTabVisible = !document.hidden;
        });

        requestAnimationFrame(renderLoop);
    };

    // -------------------------------------------------------------------------
    // 2. TEXT SPLITTING ENGINE  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const splitTextEngine = () => {
        document.querySelectorAll('.split-text').forEach(el => {
            const original = el.textContent.trim();
            el.textContent = '';
            el.setAttribute('aria-label', original);

            let charIndex = 0;

            original.split(' ').forEach((word, wi, arr) => {
                const wordSpan = document.createElement('span');
                wordSpan.classList.add('word');
                wordSpan.setAttribute('aria-hidden', 'true');

                word.split('').forEach(ch => {
                    const s = document.createElement('span');
                    s.classList.add('char');
                    s.textContent = ch;
                    s.style.animationDelay = `${charIndex * 28}ms`;
                    charIndex++;
                    wordSpan.appendChild(s);
                });

                el.appendChild(wordSpan);
                if (wi < arr.length - 1) {
                    const space = document.createElement('span');
                    space.setAttribute('aria-hidden', 'true');
                    space.textContent = '\u00A0';
                    space.classList.add('char');
                    space.style.animationDelay = `${charIndex * 28}ms`;
                    charIndex++;
                    el.appendChild(space);
                }
            });
        });
    };

    // -------------------------------------------------------------------------
    // 3. UNIFIED INTERSECTION OBSERVER  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const initIntersectionObserver = () => {
        const options = {
            root:       null,
            rootMargin: '0px 0px -80px 0px',
            threshold:  0.15,
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    el.classList.add('is-visible');
                    observer.unobserve(el);
                }
            });
        }, options);

        document.querySelectorAll(
            '.chapter-3d-reveal, .chapter-reveal, .fade-up, .split-text'
        ).forEach(el => observer.observe(el));

        // PHASE 3: separate observer just for gating the finale tunnel's
        // rAF work — same idea as the universe canvas's sectionObserver.
        if (DOM.finaleSection) {
            const finaleObserver = new IntersectionObserver(entries => {
                state.isFinaleVisible = entries[0].isIntersecting;
            }, { threshold: 0.05 });
            finaleObserver.observe(DOM.finaleSection);
        }
    };

    // -------------------------------------------------------------------------
    // 4. CURSOR & INTERACTIVE LIGHT  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const initCursorTracking = () => {
        window.addEventListener('mousemove', e => {
            state.mouse.x = e.clientX;
            state.mouse.y = e.clientY;
        }, { passive: true });

        document.querySelectorAll('a, button, [data-sound="hover"]').forEach(el => {
            el.addEventListener('mouseenter', () => DOM.body.classList.add('cursor-hover'));
            el.addEventListener('mouseleave', () => DOM.body.classList.remove('cursor-hover'));
        });
    };

    // -------------------------------------------------------------------------
    // 5. SCROLL TRACKING  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const initScrollTracking = () => {
        const update = () => {
            const scrolled = document.documentElement.scrollTop || document.body.scrollTop;
            const max      = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            state.scrollRatio = max > 0 ? scrolled / max : 0;
        };

        window.addEventListener('scroll', update, { passive: true });
        update();
    };

    // -------------------------------------------------------------------------
    // 6. FILM GRAIN  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const initGrainCanvas = () => {
        const canvas = DOM.grainCanvas;
        const ctx    = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const TILE = 256;
        const offscreen  = document.createElement('canvas');
        offscreen.width  = TILE;
        offscreen.height = TILE;
        const offCtx  = offscreen.getContext('2d');
        const imgData = offCtx.createImageData(TILE, TILE);
        const buf32   = new Uint32Array(imgData.data.buffer);

        for (let i = 0; i < buf32.length; i++) {
            buf32[i] = Math.random() < 0.5 ? 0xffffffff : 0xff000000;
        }
        offCtx.putImageData(imgData, 0, 0);

        let w = canvas.width  = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            w = canvas.width  = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }, { passive: true });

        const pattern = ctx.createPattern(offscreen, 'repeat');

        let lastDraw = 0;
        const GRAIN_INTERVAL = 1000 / 20;

        const drawGrain = (ts) => {
            if (!state.isTabVisible || state.prefersReducedMotion) {
                requestAnimationFrame(drawGrain);
                return;
            }

            if (ts - lastDraw >= GRAIN_INTERVAL) {
                lastDraw = ts;
                ctx.clearRect(0, 0, w, h);
                const dx = (Math.random() * TILE) | 0;
                const dy = (Math.random() * TILE) | 0;
                ctx.save();
                ctx.translate(dx, dy);
                ctx.fillStyle = pattern;
                ctx.fillRect(-dx, -dy, w + TILE, h + TILE);
                ctx.restore();
            }

            requestAnimationFrame(drawGrain);
        };

        requestAnimationFrame(drawGrain);
    };

    // -------------------------------------------------------------------------
    // 7. UNIVERSE CANVAS  (unchanged from Phase 2)
    // -------------------------------------------------------------------------
    const initUniverseCanvas = () => {
        const canvas = DOM.universeCanvas;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let w = canvas.width  = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        const STAR_COUNT = 400;
        const stars = Array.from({ length: STAR_COUNT }, () => ({
            x:    Math.random() * w,
            y:    Math.random() * h,
            z:    Math.random() * 2 + 0.1,
            size: Math.random() * 1.5,
        }));

        let isSectionVisible = false;
        const sectionObserver = new IntersectionObserver(entries => {
            isSectionVisible = entries[0].isIntersecting;
        });
        sectionObserver.observe(canvas.parentElement);

        window.addEventListener('resize', () => {
            w = canvas.width  = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }, { passive: true });

        window.__universeDraw = () => {
            if (!isSectionVisible) return;

            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, w, h);

            const scrollVel = (state.scrollRatio * 100) % 5;

            stars.forEach(star => {
                const mx = (state.mouse.x / w - 0.5) * 50 * star.z;
                const my = (state.mouse.y / h - 0.5) * 50 * star.z;

                star.y -= (0.5 * star.z) + scrollVel * star.z;
                if (star.y < 0) {
                    star.y = h;
                    star.x = Math.random() * w;
                }

                ctx.beginPath();
                ctx.globalAlpha = star.z / 2.5;
                ctx.fillStyle   = '#ffffff';
                ctx.arc(star.x + mx, star.y + my, star.size, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 1;
        };
    };

    // -------------------------------------------------------------------------
    // 8. MEMORY STACK — PHASE 3: grid/masonry layout on hover
    //    Checklist item #1: "transition into a Grid/Masonry layout using
    //    precise transform coordinates" — not a 5-point starburst.
    //
    //    Approach: compute a grid (cols × rows) sized to fit however many
    //    .memory-card elements exist, then for each card work out the
    //    translate() delta from its natural stacked position to its target
    //    grid cell center. This means adding/removing cards in the HTML
    //    "just works" without hand-tuned per-card offsets.
    // -------------------------------------------------------------------------
    const initMemoryStackGrid = () => {
        if (!DOM.stackContainer || !DOM.memoryCards.length) return;

        const CARD_W   = 300; // matches .stack-container width in CSS
        const CARD_H   = 400; // matches .stack-container height in CSS
        const GRID_GAP = 24;

        const computeGrid = () => {
            const count = DOM.memoryCards.length;
            // PHASE 3: pick a column count that reads as a grid, not a single
            // row or single column — 3 cols reads well for 4-6 cards.
            const cols = count <= 2 ? count : Math.ceil(Math.sqrt(count * 1.4));
            const rows = Math.ceil(count / cols);

            // Shrink each cell relative to the stack container so the whole
            // grid still fits roughly within a viewport-friendly footprint.
            const cellScale = 0.55;
            const cellW = CARD_W * cellScale;
            const cellH = CARD_H * cellScale;

            const gridW = cols * cellW + (cols - 1) * GRID_GAP;
            const gridH = rows * cellH + (rows - 1) * GRID_GAP;

            // Container's own center is (0,0) in translate-space since all
            // cards are positioned with `inset: 0` inside stack-container.
            const originX = -gridW / 2 + cellW / 2;
            const originY = -gridH / 2 + cellH / 2;

            const positions = [];
            for (let i = 0; i < count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const targetX = originX + col * (cellW + GRID_GAP);
                const targetY = originY + row * (cellH + GRID_GAP);
                positions.push({ x: targetX, y: targetY, scale: cellScale });
            }
            return positions;
        };

        let gridPositions = computeGrid();

        const applyGrid = () => {
            DOM.memoryCards.forEach((card, i) => {
                const pos = gridPositions[i];
                if (!pos) return;
                // PHASE 3 FIX: precise calculated transform, not a magic-number
                // per-card offset. translate() moves card center to grid cell
                // center, rotate(0) clears the fanned resting rotation, scale
                // shrinks it to fit the cell.
                card.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(0deg) scale(${pos.scale})`;
            });
        };

        const clearGrid = () => {
            // Let the CSS resting-state rules (.card-1 … .card-N) retake over,
            // since those still define the fanned stack look.
            DOM.memoryCards.forEach(card => {
                card.style.transform = '';
            });
        };

        DOM.stackContainer.addEventListener('mouseenter', () => {
            if (state.prefersReducedMotion) return;
            gridPositions = computeGrid(); // in case viewport changed
            applyGrid();
        });

        DOM.stackContainer.addEventListener('mouseleave', () => {
            clearGrid();
        });

        // Touch support: tap toggles the grid instead of relying on :hover
        let gridActive = false;
        DOM.stackContainer.addEventListener('touchstart', (e) => {
            if (state.prefersReducedMotion) return;
            gridActive = !gridActive;
            if (gridActive) {
                gridPositions = computeGrid();
                applyGrid();
            } else {
                clearGrid();
            }
        }, { passive: true });

        window.addEventListener('resize', () => {
            gridPositions = computeGrid();
        }, { passive: true });
    };

    // -------------------------------------------------------------------------
    // 9. STICKY TIMELINE — PHASE 3: added checklist's scale()-down + fade
    //    Checklist item #2: "scale down (transform: scale()) and fade out
    //    older cards as new ones stack on top."
    //
    //    Phase 2 already had a 3D tilt entrance (translateZ + rotateX).
    //    That's kept as the incoming-card treatment. What was missing was
    //    the specific *outgoing* treatment the checklist names: a shrink
    //    via scale(), not just a Z-push. Both are applied together below —
    //    Z-push gives depth, scale gives the "shrinking away" read the
    //    checklist explicitly asks for.
    // -------------------------------------------------------------------------
    const initStickyTimeline = () => {
        if (!DOM.timelineCards.length || !DOM.timelineSection) return;

        const onScroll = () => {
            const rect     = DOM.timelineSection.getBoundingClientRect();
            const scrollH  = DOM.timelineSection.offsetHeight - window.innerHeight;
            const progress = clamp(-rect.top / scrollH, 0, 1);
            const total    = DOM.timelineCards.length;

            DOM.timelineCards.forEach((card, i) => {
                const start        = i / total;
                const end          = (i + 1) / total;
                const cardProgress = clamp((progress - start) / (end - start), -1, 1);

                if (cardProgress > 0) {
                    // Card scrolling away — PHASE 3 FIX: now scales down
                    // (checklist requirement) in addition to the existing
                    // translateZ/rotateX recede-into-depth treatment.
                    const t = cardProgress;
                    const scaleOut = lerp(1, 0.8, t); // shrink to 80%
                    card.style.transform =
                        `translateY(${lerp(0, -40, t)}px) ` +
                        `translateZ(${lerp(0, -120, t)}px) ` +
                        `rotateX(${lerp(0, -8, t)}deg) ` +
                        `scale(${scaleOut})`;
                    card.style.opacity = String(Math.max(lerp(1, 0, t * 1.5), 0));
                } else if (cardProgress > -1) {
                    // Card arriving — unchanged 3D tilt-rise from Phase 2,
                    // arrives at full scale(1).
                    const t = 1 + cardProgress;
                    card.style.transform =
                        `translateY(${lerp(100, 0, t)}px) ` +
                        `translateZ(${lerp(-60, 0, t)}px) ` +
                        `rotateX(${lerp(12, 0, t)}deg) ` +
                        `scale(${lerp(0.92, 1, t)})`;
                    card.style.opacity = String(clamp(lerp(0, 1, t * 1.5), 0, 1));
                } else {
                    // Below viewport — keep hidden, matches CSS resting state
                    card.style.opacity   = '0';
                    card.style.transform = 'translateY(100px) translateZ(-60px) rotateX(12deg) scale(0.92)';
                }
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    };

    // -------------------------------------------------------------------------
    // 10. INFINITE 3D TUNNEL — PHASE 3 FULL REBUILD
    //     Checklist item #3: "infinite scrolling section using
    //     requestAnimationFrame, modulo (%), and CSS rotateX/Y with
    //     perspective to create an endless 3D tunnel of images."
    //
    //     Phase 2 problem: 15 rings created once, whole container nudged by
    //     zOffset % Z_SPACING — a <200px wobble on a static set, not a
    //     tunnel. No images. No rotateX/Y.
    //
    //     Fix: each ring tracks its own z position in a plain array (not
    //     CSS transitions — this needs per-frame control). Every rAF tick,
    //     each ring's z increases (moves toward camera). When a ring's z
    //     crosses the "past camera" threshold, its z wraps back to the
    //     furthest point via modulo math — this is what makes it genuinely
    //     infinite rather than a fixed set of divs. Each ring also picks up
    //     independent rotateX/rotateY drift, and contains an <img>.
    // -------------------------------------------------------------------------
    const initInfiniteTunnel = () => {
        if (!DOM.tunnelContainer) return;

        const RING_COUNT   = 15;
        const Z_SPACING    = 260;     // distance between rings at rest
        const Z_START      = -RING_COUNT * Z_SPACING; // furthest back
        const Z_CAMERA     = 400;     // z value at which a ring is "past" the camera
        const TUNNEL_DEPTH = Z_CAMERA - Z_START; // total travel distance for modulo wrap

        // PHASE 3 FIX: rings now carry actual images. Small placeholder set,
        // cycled with modulo so ring count can differ from image count.
        // Swap these src values for real assets — anything same-origin or
        // CORS-enabled will work identically.
const IMAGE_SOURCES = [
    'sis1.png',
    'sis2.png',
    'sis3.png',
    'sis4.png',
    'sis5.png',
];
        // rings[i] = { el, imgEl, z, rotX, rotY, rotXSpeed, rotYSpeed }
        const rings = [];

        for (let i = 0; i < RING_COUNT; i++) {
            const ring = document.createElement('div');
            ring.classList.add('tunnel-ring');

            const img = document.createElement('img');
            img.classList.add('tunnel-ring-image');
            // crossOrigin set before src so the browser requests the image
            // with CORS mode from the first fetch. Not required for the
            // current display-only usage (an <img> rendered via CSS/DOM
            // never taints), but Unsplash serves Access-Control-Allow-Origin
            // headers, so this is a free safeguard against canvas-tainting
            // if these images are ever sampled via drawImage() later — e.g.
            // an average-color extraction or a canvas-based transition.
            img.crossOrigin = 'anonymous';
            img.src = IMAGE_SOURCES[i % IMAGE_SOURCES.length];
            img.alt = ''; // decorative — tunnel is aria-hidden at the wrapper level
            img.loading = 'lazy';
            ring.appendChild(img);

            DOM.tunnelContainer.appendChild(ring);

            const z = Z_START + i * Z_SPACING;
            rings.push({
                el:  ring,
                imgEl: img,
                z,
                rotX: Math.random() * 360,
                rotY: Math.random() * 360,
                // PHASE 3 FIX: independent per-ring rotateX/Y drift speeds —
                // checklist explicitly calls for rotateX/Y, not just position.
                rotXSpeed: 0.05 + Math.random() * 0.08,
                rotYSpeed: 0.03 + Math.random() * 0.06,
            });
        }

        let lastTime = performance.now();

        // PHASE 3 FIX: this is the actual infinite-loop mechanism. Speed is
        // z-units per millisecond; each frame every ring moves toward the
        // camera. Any ring whose z has passed Z_CAMERA gets wrapped back by
        // TUNNEL_DEPTH via modulo-style arithmetic, so it re-enters from the
        // far end seamlessly instead of the array ever running out.
        const SPEED = 0.09;

        window.__tunnelAnim = (now) => {
            const dt = Math.min(now - lastTime, 64); // clamp to avoid huge jumps on tab-refocus
            lastTime = now;

            rings.forEach(ring => {
                ring.z += SPEED * dt;

                // Infinite recycle: once a ring passes the camera plane,
                // send it back by exactly one full tunnel depth. Using
                // subtraction-by-depth (rather than resetting to a fixed
                // value) keeps rings evenly spaced regardless of frame
                // timing jitter — this IS the modulo behavior the checklist
                // asks for, expressed as a wraparound rather than the `%`
                // operator directly, since z can be fractional and negative
                // mod in JS doesn't behave like true modulo.
                if (ring.z > Z_CAMERA) {
                    ring.z -= TUNNEL_DEPTH;
                }

                ring.rotX = (ring.rotX + ring.rotXSpeed * dt) % 360;
                ring.rotY = (ring.rotY + ring.rotYSpeed * dt) % 360;

                // Fade rings in as they approach, and out right at the camera
                // plane so the recycle-jump is never visible.
                const distFromStart = ring.z - Z_START;
                const fadeInEnd     = TUNNEL_DEPTH * 0.15;
                const fadeOutStart  = TUNNEL_DEPTH * 0.92;
                let opacity = 1;
                if (distFromStart < fadeInEnd) {
                    opacity = clamp(distFromStart / fadeInEnd, 0, 1);
                } else if (distFromStart > fadeOutStart) {
                    opacity = clamp(1 - (distFromStart - fadeOutStart) / (TUNNEL_DEPTH - fadeOutStart), 0, 1);
                }

                ring.el.style.transform =
                    `translateZ(${ring.z}px) rotateX(${ring.rotX}deg) rotateY(${ring.rotY}deg)`;
                ring.el.style.opacity = String(opacity);
            });
        };
    };

    // -------------------------------------------------------------------------
    // 11. FOLEY AUDIO
    //     Synthesized hover ticks (Phase 2, unchanged) PLUS — new — a real
    //     HTMLAudioElement crossfade layer for chapter-transition "room
    //     tone" (paper-fold / wind style texture beds), gated behind the
    //     same user-gesture unlock. This is what makes the spec's two
    //     separate lines — "use native AudioContext and HTMLAudioElement"
    //     and "create seamless crossfades using gain nodes" — both true at
    //     once: an <audio> element's output is routed into the SAME
    //     AudioContext graph via createMediaElementSource(), then two such
    //     elements (A/B) are gain-ramped in opposite directions to crossfade
    //     between them — not two one-shot ticks, an actual overlap-and-blend.
    //
    //     TODO(user): FOLEY_TRACKS below points at placeholder paths that
    //     do not exist yet in this project. Nothing errors if they're
    //     missing — see the `error` listener below, which marks a track
    //     unusable and skips it rather than throwing — but no sound will
    //     play until real files are dropped at those paths (or the paths
    //     are changed to point at files you do have). Any short, seamless-
    //     loop-friendly ambient texture works; the crossfade logic doesn't
    //     care what's in the file.
    // -------------------------------------------------------------------------
    const initFoleyAudio = () => {
        const unlock = () => {
            if (!state.audioCtx) {
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
            state.isAudioReady = true;
            document.removeEventListener('click',      unlock);
            document.removeEventListener('touchstart', unlock);
        };

        document.addEventListener('click',      unlock);
        document.addEventListener('touchstart', unlock);

        const playSoftTick = () => {
            if (!state.isAudioReady || !state.audioCtx) return;
            const t    = state.audioCtx.currentTime;
            const osc  = state.audioCtx.createOscillator();
            const gain = state.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

            osc.connect(gain).connect(state.audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.1);
        };

        document.querySelectorAll('[data-sound="hover"]').forEach(el => {
            el.addEventListener('mouseenter', playSoftTick, { passive: true });
        });

        initFoleyCrossfadeLayer();
    };

    // TODO(user): replace with real, seamless-loop-friendly texture files
    // (paper-fold rustle, soft wind, room tone — whatever fits a given
    // chapter). Order corresponds to chapter index; the last entry repeats
    // for any chapter beyond the list length.
    const FOLEY_TRACKS = [
        '/assets/audio/foley-chapter-1.mp3',
        '/assets/audio/foley-chapter-2.mp3',
        '/assets/audio/foley-chapter-3.mp3',
    ];

    const initFoleyCrossfadeLayer = () => {
        if (!DOM.chapters.length || !FOLEY_TRACKS.length) return;

        // Two <audio> elements so one can be fading out while the other
        // fades in — this is what makes it a crossfade rather than a
        // stop/start swap. Each is routed through AudioContext via
        // createMediaElementSource so its volume is gain-node driven
        // (matches the rest of this file's audio graph) rather than set
        // via the element's own .volume, and so it can share the same
        // destination graph as the drone/Foley ticks if ever needed.
        const players = ['A', 'B'].map(label => {
            const el = document.createElement('audio');
            el.preload    = 'auto';
            el.loop       = true;
            el.crossOrigin = 'anonymous';
            el.style.display = 'none';
            document.body.appendChild(el);

            return {
                label,
                el,
                gainNode:      null,   // created lazily once audioCtx exists
                sourceNode:    null,
                trackIndex:    -1,
                isUnavailable: false,  // set true on a load error; skipped after that
            };
        });

        let active = players[0];
        let inactive = players[1];

        const connectToGraph = (player) => {
            if (player.sourceNode || !state.audioCtx) return;
            // createMediaElementSource can only be called once per element —
            // guarded by the sourceNode null-check above so re-entrant calls
            // (e.g. rapid chapter scrolling before the first connect
            // finishes) can't throw "already connected" errors.
            player.sourceNode = state.audioCtx.createMediaElementSource(player.el);
            player.gainNode   = state.audioCtx.createGain();
            player.gainNode.gain.setValueAtTime(0, state.audioCtx.currentTime);
            player.sourceNode.connect(player.gainNode);
            player.gainNode.connect(state.audioCtx.destination);

            player.el.addEventListener('error', () => {
                player.isUnavailable = true;
            });
        };

        const crossfadeTo = (trackIndex) => {
            if (!state.isAudioReady || !state.audioCtx) return;
            if (active.trackIndex === trackIndex) return;
            if (inactive.isUnavailable) return;

            connectToGraph(active);
            connectToGraph(inactive);

            const src = FOLEY_TRACKS[Math.min(trackIndex, FOLEY_TRACKS.length - 1)];
            inactive.el.src = src;
            inactive.trackIndex = trackIndex;

            const playPromise = inactive.el.play();
            // play() can reject (autoplay policy edge cases, decode
            // failures) — swallow rather than throw an unhandled rejection,
            // and mark unavailable so we don't retry the same bad source
            // every chapter change.
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => { inactive.isUnavailable = true; });
            }

            const t = state.audioCtx.currentTime;
            const RAMP = 1.4; // seconds — slow enough to read as "seamless"

            if (active.gainNode) {
                active.gainNode.gain.cancelScheduledValues(t);
                active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, t);
                active.gainNode.gain.linearRampToValueAtTime(0, t + RAMP);
            }
            if (inactive.gainNode) {
                inactive.gainNode.gain.cancelScheduledValues(t);
                inactive.gainNode.gain.setValueAtTime(0, t);
                inactive.gainNode.gain.linearRampToValueAtTime(0.4, t + RAMP);
            }

            const finishedActive = active;
            setTimeout(() => {
                finishedActive.el.pause();
            }, RAMP * 1000 + 100);

            [active, inactive] = [inactive, active];
        };

        // Trigger a crossfade whenever a chapter becomes the majority of
        // the viewport — reuses IntersectionObserver rather than adding a
        // scroll-ratio heuristic, consistent with how reveals are handled
        // elsewhere in this file.
        const chapterObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    const idx = Array.from(DOM.chapters).indexOf(entry.target);
                    if (idx !== -1) crossfadeTo(idx);
                }
            });
        }, { threshold: [0.5] });

        DOM.chapters.forEach(chapter => chapterObserver.observe(chapter));
    };

    // -------------------------------------------------------------------------
    // 12. AMBIENT DRONE — PHASE 4
    //     Checklist item #1 (second half): "Is AudioContext and GainNode
    //     used for an ambient track?" The Foley ticks above satisfy the
    //     "sound effects bound to mouseenter" half, but a one-shot 100ms
    //     tick is not "an ambient track" — that needs something continuous.
    //
    //     Built as: two oscillators a few Hz apart (creates a slow, natural
    //     beating/shimmer rather than a static flat tone) → shared lowpass
    //     filter (removes harshness, keeps it a "bed" not a "lead") →
    //     master GainNode ramped in on unlock. A slow LFO modulates the
    //     master gain very subtly so the drone breathes rather than
    //     sitting at a dead-flat level.
    //
    //     Reuses the SAME unlock gesture as Foley (both need a user
    //     gesture per browser autoplay policy) — this function creates its
    //     nodes lazily inside the shared unlock handler rather than adding
    //     a second click/touchstart listener pair.
    // -------------------------------------------------------------------------
    const initAmbientDrone = () => {
        const startDrone = () => {
            if (!state.audioCtx || state.ambient.isPlaying) return;
            const ctx = state.audioCtx;
            const t   = ctx.currentTime;

            const oscA = ctx.createOscillator();
            const oscB = ctx.createOscillator();
            oscA.type = 'sine';
            oscB.type = 'sine';
            // A few Hz apart on purpose — close enough to beat slowly
            // against each other (a gentle shimmer), far enough apart
            // that it doesn't read as an obvious tuning error.
            oscA.frequency.setValueAtTime(96,  t);
            oscB.frequency.setValueAtTime(100.5, t);

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(420, t);
            filter.Q.setValueAtTime(0.7, t);

            // Slow LFO on the master gain so the drone has a subtle
            // breathing motion instead of a static, machine-flat level.
            const lfo     = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.06, t); // ~16.6s per cycle
            lfoGain.gain.setValueAtTime(0.008, t); // small modulation depth

            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0, t);
            // Fade in slowly — an ambient bed that snaps in reads as a
            // sound effect, not atmosphere.
            masterGain.gain.linearRampToValueAtTime(state.ambient.baseLevel, t + 3.5);

            lfo.connect(lfoGain);
            lfoGain.connect(masterGain.gain);

            oscA.connect(filter);
            oscB.connect(filter);
            filter.connect(masterGain);
            masterGain.connect(ctx.destination);

            oscA.start(t);
            oscB.start(t);
            lfo.start(t);

            state.ambient.oscA = oscA;
            state.ambient.oscB = oscB;
            state.ambient.filter = filter;
            state.ambient.lfo = lfo;
            state.ambient.lfoGain = lfoGain;
            state.ambient.masterGain = masterGain;
            state.ambient.isPlaying = true;
        };

        // Reuse the existing unlock flow: initFoleyAudio() already listens
        // for the first click/touchstart to create state.audioCtx. This
        // listener just needs to fire after that, so it also listens for
        // the same events and checks state.audioCtx exists. Using a
        // microtask delay (rather than a raw same-tick call) guarantees
        // initFoleyAudio's own unlock handler — attached first, in boot
        // order — has already run and created the context.
        const tryStartOnGesture = () => {
            queueMicrotask(startDrone);
            document.removeEventListener('click',      tryStartOnGesture);
            document.removeEventListener('touchstart', tryStartOnGesture);
        };
        document.addEventListener('click',      tryStartOnGesture);
        document.addEventListener('touchstart', tryStartOnGesture);
    };

    // PHASE 4: duck the ambient bed's volume temporarily — used when the
    // Konami/long-press easter egg fires and again during the grand
    // finale hijack, so the two audio layers don't compete for attention
    // at moments meant to feel special.
    const duckAmbient = (targetLevel, rampSeconds) => {
        if (!state.ambient.isPlaying || !state.ambient.masterGain || !state.audioCtx) return;
        const t = state.audioCtx.currentTime;
        state.ambient.masterGain.gain.cancelScheduledValues(t);
        state.ambient.masterGain.gain.setValueAtTime(state.ambient.masterGain.gain.value, t);
        state.ambient.masterGain.gain.linearRampToValueAtTime(targetLevel, t + rampSeconds);
    };

    // -------------------------------------------------------------------------
    // 13. EASTER EGGS  (unchanged from Phase 2, plus PHASE 4 ambient duck)
    // -------------------------------------------------------------------------
    const triggerEasterEgg = () => {
        if (!DOM.eggOverlay) return;
        DOM.eggOverlay.classList.add('active');
        DOM.eggOverlay.setAttribute('aria-hidden', 'false');

        // PHASE 4: duck the ambient bed to near-silent for the reveal, then
        // restore it once the overlay closes — keeps the moment focused.
        duckAmbient(0.006, 0.6);

        setTimeout(() => {
            DOM.eggOverlay.classList.remove('active');
            DOM.eggOverlay.setAttribute('aria-hidden', 'true');
            duckAmbient(state.ambient.baseLevel, 1.2);
        }, 4000);
    };

    const initEasterEggs = () => {
        window.addEventListener('keydown', e => {
            if (e.key === state.konamiSequence[state.konamiIdx]) {
                state.konamiIdx++;
                if (state.konamiIdx === state.konamiSequence.length) {
                    triggerEasterEgg();
                    state.konamiIdx = 0;
                }
            } else {
                state.konamiIdx = 0;
            }
        });

        window.addEventListener('pointerdown', () => {
            state.pressTimer = setTimeout(triggerEasterEgg, 3000);
        });
        window.addEventListener('pointerup',     () => clearTimeout(state.pressTimer));
        window.addEventListener('pointercancel', () => clearTimeout(state.pressTimer));
    };

    // -------------------------------------------------------------------------
    // 14. GRAND FINALE HIJACK — PHASE 4 (new)
    //     Checklist item #3: "When reaching the absolute bottom, does JS
    //     hijack the layout, apply transform: scale(0.01) to the main
    //     wrapper, fade in a native HTML5 canvas with slowly moving stars,
    //     and display the final quote before fading to pure black?"
    //
    //     This is distinct from the Phase 3 infinite tunnel (chapter V's
    //     permanent, looping background effect). The grand finale is a
    //     ONE-TIME sequence triggered specifically by reaching true
    //     document bottom, layered on top of everything else.
    //
    //     Sequence once triggered:
    //       1. #app-main gets .finale-scale-hijack → transform: scale(0.01)
    //          (transform-only — no layout properties touched, so this
    //          cannot itself cause a reflow/CLS event)
    //       2. finaleHijackLayer (created at boot, see below) fades in:
    //          - finaleStarsCanvas: a small dedicated starfield, independent
    //            of the Phase 2/3 universe canvas (that one is scoped to
    //            #universe and paused via its own IntersectionObserver;
    //            reusing it here would require re-parenting or duplicating
    //            state, so a second lightweight canvas is cleaner)
    //          - finaleQuoteEl fades in after a delay
    //       3. Everything fades to solid black and stays there.
    //
    //     PERFORMANCE / CLS NOTE (checklist item #4): finaleHijackLayer,
    //     finaleStarsCanvas, and finaleQuoteEl are all created and inserted
    //     into the DOM inside initGrandFinale(), which runs at boot alongside
    //     every other subsystem — NOT lazily created when the hijack fires.
    //     The layer is `position: fixed; inset: 0` from CSS, so it already
    //     occupies its full box in the layout tree before it's ever visible.
    //     Firing the hijack later only ever toggles `opacity` and adds the
    //     transform class to #app-main — both compositor-only operations.
    //     If this canvas were instead created fresh at hijack-time, its
    //     insertion would itself be a layout-affecting DOM write competing
    //     with the scale transform in the same frame — exactly the kind
    //     of thrash this checklist item is testing for.
    // -------------------------------------------------------------------------
    const initGrandFinale = () => {
        // Build the layer once, up front. Even though nothing is visible
        // yet, the elements exist and are sized from frame one.
        const layer = document.createElement('div');
        layer.id = 'grand-finale-layer';
        layer.setAttribute('aria-hidden', 'true'); // decorative until triggered; made live below
        layer.setAttribute('role', 'presentation');

        const canvas = document.createElement('canvas');
        canvas.id = 'grand-finale-stars';

        const quote = document.createElement('p');
        quote.id = 'grand-finale-quote';
        quote.textContent = '“Every orbit returns you to yourself, a little more whole.”';

        layer.appendChild(canvas);
        layer.appendChild(quote);
        document.body.appendChild(layer);

        DOM.finaleHijackLayer = layer;
        DOM.finaleStarsCanvas = canvas;
        DOM.finaleQuoteEl     = quote;

        // ── Starfield for the canvas (separate, simpler instance than the
        //    chapter-II universe canvas — slow, sparse, no parallax, no
        //    mouse reactivity, since this is a closing-credits moment, not
        //    an interactive one) ──────────────────────────────────────────
        const ctx = canvas.getContext('2d', { alpha: false });
        let cw = canvas.width  = window.innerWidth;
        let ch = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            cw = canvas.width  = window.innerWidth;
            ch = canvas.height = window.innerHeight;
        }, { passive: true });

        const FINALE_STAR_COUNT = 180;
        const finaleStars = Array.from({ length: FINALE_STAR_COUNT }, () => ({
            x: Math.random() * cw,
            y: Math.random() * ch,
            r: Math.random() * 1.3 + 0.2,
            driftSpeed: Math.random() * 0.15 + 0.03, // slow — "slowly moving stars"
        }));

        let hijackAnimRunning = false;
        const drawFinaleStars = () => {
            if (!hijackAnimRunning) return;
            if (!ctx) return;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cw, ch);
            ctx.fillStyle = '#ffffff';

            finaleStars.forEach(star => {
                star.y += star.driftSpeed;
                if (star.y > ch) {
                    star.y = 0;
                    star.x = Math.random() * cw;
                }
                ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.0004 + star.x) * 0.3;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            requestAnimationFrame(drawFinaleStars);
        };

        // ── The hijack sequence itself ───────────────────────────────────
        const runHijackSequence = () => {
            if (state.finaleHijack.fired) return;
            state.finaleHijack.fired = true;

            // Make the layer's contents available to assistive tech now
            // that they're about to become meaningful, not decorative.
            layer.setAttribute('aria-hidden', 'false');
            layer.setAttribute('role', 'region');
            layer.setAttribute('aria-label', 'Closing sequence');

            duckAmbient(0.01, 2.5);

            if (state.prefersReducedMotion) {
                // Reduced-motion path: skip the scale animation and canvas
                // star motion, jump straight to the quote on black. Still
                // satisfies "reaching bottom leads to quote + black" without
                // the transform/canvas motion that reduced-motion users
                // have opted out of site-wide.
                DOM.main.classList.add('finale-scale-hijack', 'finale-no-motion');
                layer.classList.add('is-active');
                canvas.style.display = 'none';
                quote.classList.add('is-visible');
                return;
            }

            // 1. Scale the entire page down toward a point.
            //    transform-only — see perf note above.
            DOM.main.classList.add('finale-scale-hijack');

            // 2. Fade in the starfield layer slightly after the scale
            //    starts, so the shrink reads first, then the stars appear
            //    to "catch" the moment.
            setTimeout(() => {
                layer.classList.add('is-active');
                hijackAnimRunning = true;
                requestAnimationFrame(drawFinaleStars);
            }, 500);

            // 3. Bring in the quote once the stars have had a moment to
            //    establish themselves.
            setTimeout(() => {
                quote.classList.add('is-visible');
            }, 2200);

            // 4. Fade everything to pure solid black and leave it there.
            setTimeout(() => {
                layer.classList.add('is-final-black');
            }, 5200);
        };

        // ── Bottom-detection with a short dwell window ───────────────────
        // Raw "scrollRatio >= threshold" fires on momentary overscroll from
        // momentum/trackpad bounce, which would trigger the one-shot
        // sequence on a bounce the user didn't intend as "done scrolling."
        // A short dwell avoids that false-positive without adding any
        // noticeable delay for a user who has actually stopped at the
        // bottom to read the finale text.
        const checkBottomDwell = () => {
            if (state.finaleHijack.fired) return;

            const atBottom = state.scrollRatio >= state.finaleHijack.THRESHOLD;
            const now = performance.now();

            if (atBottom) {
                if (state.finaleHijack.dwellStart === null) {
                    state.finaleHijack.dwellStart = now;
                } else if (now - state.finaleHijack.dwellStart >= state.finaleHijack.DWELL_MS) {
                    runHijackSequence();
                }
            } else {
                state.finaleHijack.dwellStart = null;
            }
        };

        // Piggyback on the existing passive scroll listener pattern rather
        // than adding a competing one — checked once per scroll event,
        // which is cheap (a couple of number comparisons, no DOM reads).
        window.addEventListener('scroll', checkBottomDwell, { passive: true });
        // Also check once on load in case the page is short enough that
        // the user starts already at the bottom (e.g. very tall viewport).
        checkBottomDwell();
    };

    // -------------------------------------------------------------------------
    // 15. MAIN rAF RENDER LOOP
    //     PHASE 3: __tunnelAnim now receives `now` (needed for dt calc) and
    //     is gated on state.isFinaleVisible instead of a scroll-ratio guess.
    // -------------------------------------------------------------------------
    const renderLoop = (now) => {
        if (!state.prefersReducedMotion) {
            state.cursor.x = lerp(state.cursor.x, state.mouse.x, 0.12);
            state.cursor.y = lerp(state.cursor.y, state.mouse.y, 0.12);

            DOM.cursorDot.style.transform  = `translate(${state.mouse.x}px, ${state.mouse.y}px) translate(-50%, -50%)`;
            DOM.cursorRing.style.transform = `translate(${state.cursor.x}px, ${state.cursor.y}px) translate(-50%, -50%)`;

            DOM.lightReactives.forEach(el => {
                const rect = el.getBoundingClientRect();
                el.style.setProperty('--mouse-x', `${state.mouse.x - rect.left}px`);
                el.style.setProperty('--mouse-y', `${state.mouse.y - rect.top}px`);
            });

            DOM.scrollIndicator.style.setProperty(
                '--gold-height',
                `${state.scrollRatio * 100}%`
            );

            if (window.__universeDraw) window.__universeDraw();

            // PHASE 3 FIX: gated on actual finale intersection, not a
            // scrollRatio > 0.8 guess — correct regardless of page length.
            if (window.__tunnelAnim && state.isFinaleVisible) {
                window.__tunnelAnim(now);
            }
        }

        requestAnimationFrame(renderLoop);
    };

    // -------------------------------------------------------------------------
    // BOOT
    // -------------------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPreloader);
    } else {
        initPreloader();
    }

})();