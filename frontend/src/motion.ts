/* ============================================================
   motion.ts — 高级动效引擎（零依赖，事件委托 + 观察者）
   ------------------------------------------------------------
   提供：
   - initMotion()        全局初始化（main.tsx 调用一次）
   - 3D 倾斜 + 高光跟随   .ui-tilt（配合 .ui-tilt-glare 子元素）
   - 磁性悬停             .ui-magnetic
   - 点击涟漪             .ui-ripple
   - 滚动揭示             .ui-scroll-reveal / .ui-grid-item
   - 毛玻璃吸顶状态       .ui-header（滚动后加 .scrolled）
   - 光标氛围光晕         .ui-cursor-glow（自动创建，精细指针设备）
   原则：rAF 逐帧插值（指数平滑）、transform 驱动、
   尊重 prefers-reduced-motion 与 (pointer: fine)
   ============================================================ */

interface TiltEntry {
    tx: number; ty: number; rx: number; ry: number;
    txTarget: number; tyTarget: number; rxTarget: number; ryTarget: number;
    active: boolean;
}

const tiltMap = new Map<HTMLElement, TiltEntry>();
let tiltRaf = 0;

function prefersReduced(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finePointer(): boolean {
    return window.matchMedia('(pointer: fine)').matches;
}

/* ---------------- 3D 倾斜 + 磁性悬停（共用逐帧循环） ---------------- */

function tiltLoop() {
    let running = false;
    for (const [el, s] of tiltMap) {
        s.tx += (s.txTarget - s.tx) * 0.18;
        s.ty += (s.tyTarget - s.ty) * 0.18;
        s.rx += (s.rxTarget - s.rx) * 0.18;
        s.ry += (s.ryTarget - s.ry) * 0.18;
        const settled = Math.abs(s.txTarget - s.tx) < 0.05
            && Math.abs(s.tyTarget - s.ty) < 0.05
            && Math.abs(s.rxTarget - s.rx) < 0.005
            && Math.abs(s.ryTarget - s.ry) < 0.005;
        if (settled && !s.active) {
            tiltMap.delete(el);
            el.style.transform = '';
            continue;
        }
        running = true;
        el.style.transform =
            `perspective(900px) translate3d(${s.tx.toFixed(2)}px, ${s.ty.toFixed(2)}px, 0) ` +
            `rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg)`;
    }
    if (running) tiltRaf = requestAnimationFrame(tiltLoop);
}

function setTiltTargets(el: HTMLElement, tx: number, ty: number, rx: number, ry: number) {
    let s = tiltMap.get(el);
    if (!s) {
        s = {
            tx: 0, ty: 0, rx: 0, ry: 0,
            txTarget: tx, tyTarget: ty, rxTarget: rx, ryTarget: ry,
            active: true,
        };
        tiltMap.set(el, s);
        if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltLoop);
        return;
    }
    s.txTarget = tx; s.tyTarget = ty; s.rxTarget = rx; s.ryTarget = ry;
    s.active = true;
}

function resetTilt(el: HTMLElement) {
    const s = tiltMap.get(el);
    if (!s) return;
    s.txTarget = 0; s.tyTarget = 0; s.rxTarget = 0; s.ryTarget = 0;
    s.active = false;
}

function initTiltMagnetic() {
    if (prefersReduced()) return;
    let current: HTMLElement | null = null;

    const onMove = (e: MouseEvent) => {
        const t = e.target as Element | null;
        const el = t?.closest?.('.ui-tilt, .ui-magnetic') as HTMLElement | null;
        if (el !== current) {
            if (current) resetTilt(current);
            current = el;
        }
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        // 磁性位移：按比例跟随，限制在卡片一半范围内
        const mag = el.classList.contains('ui-magnetic') ? 0.22 : 0;
        const capX = r.width * 0.5;
        const capY = r.height * 0.5;
        const tx = Math.max(-capX, Math.min(capX, dx * mag));
        const ty = Math.max(-capY, Math.min(capY, dy * mag));
        // 3D 倾斜：归一化到 -1..1
        let rx = 0;
        let ry = 0;
        if (el.classList.contains('ui-tilt')) {
            const max = Number(el.dataset.tiltMax || 8);
            const px = dx / (r.width / 2);
            const py = dy / (r.height / 2);
            ry = Math.max(-1, Math.min(1, px)) * max;
            rx = Math.max(-1, Math.min(1, py)) * -max;
            el.style.setProperty('--mx', `${Math.max(-1, Math.min(1, px)) * 50 + 50}%`);
            el.style.setProperty('--my', `${Math.max(-1, Math.min(1, py)) * 50 + 50}%`);
        }
        setTiltTargets(el, tx, ty, rx, ry);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
}

/* ---------------- 点击涟漪 ---------------- */

function initRipple() {
    const onClick = (e: MouseEvent) => {
        const t = e.target as Element | null;
        const host = t?.closest?.('.ui-ripple') as HTMLElement | null;
        if (!host) return;
        const r = host.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const ink = document.createElement('span');
        ink.className = 'ui-ripple-ink';
        ink.style.width = `${size}px`;
        ink.style.height = `${size}px`;
        ink.style.left = `${e.clientX - r.left - size / 2}px`;
        ink.style.top = `${e.clientY - r.top - size / 2}px`;
        host.appendChild(ink);
        ink.addEventListener('animationend', () => ink.remove(), { once: true });
    };
    // 捕获阶段：保证在 React stopPropagation 之前拿到事件
    document.addEventListener('click', onClick, true);
}

/* ---------------- 滚动揭示 ---------------- */

function initReveal() {
    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            el.classList.add('is-revealed');
            io.unobserve(el);
            // 揭示过渡结束后解除过渡：让位给 3D 倾斜 / 按钮悬停等后续微交互
            const delay = parseFloat(el.style.getPropertyValue('--reveal-delay') || '0');
            window.setTimeout(() => el.classList.add('is-settled'), delay * 1000 + 750);
        }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    const observeEl = (el: HTMLElement) => {
        if (el.classList.contains('is-revealed') || el.classList.contains('is-settled')) return;
        io.observe(el);
    };

    document.querySelectorAll<HTMLElement>('.ui-scroll-reveal, .ui-grid-item').forEach(observeEl);

    // SPA 路由切换后新挂载的节点：MutationObserver 持续接管
    const mo = new MutationObserver((records) => {
        for (const rec of records) {
            rec.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                const el = node as HTMLElement;
                if (el.matches?.('.ui-scroll-reveal, .ui-grid-item')) observeEl(el);
                el.querySelectorAll?.('.ui-scroll-reveal, .ui-grid-item').forEach((sub) => observeEl(sub as HTMLElement));
            });
        }
    });
    mo.observe(document.body, { childList: true, subtree: true });
}

/* ---------------- 毛玻璃吸顶 ---------------- */

function initHeader() {
    const onScroll = () => {
        document.querySelectorAll<HTMLElement>('.ui-header').forEach((el) => {
            el.classList.toggle('scrolled', window.scrollY > 8);
        });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---------------- 光标氛围光晕 ---------------- */

function initCursorGlow() {
    if (prefersReduced() || !finePointer()) return;
    const el = document.createElement('div');
    el.className = 'ui-cursor-glow';
    document.body.appendChild(el);
    const target = { x: -300, y: -300 };
    const cur = { x: -300, y: -300 };
    let raf = 0;
    let visible = false;
    const onMove = (e: MouseEvent) => {
        target.x = e.clientX;
        target.y = e.clientY;
        if (!visible) {
            visible = true;
            cur.x = target.x;
            cur.y = target.y;
            el.style.opacity = '1';
            if (!raf) raf = requestAnimationFrame(tick);
        }
    };
    const onLeaveDoc = () => {
        visible = false;
        el.style.opacity = '0';
    };
    const tick = () => {
        cur.x += (target.x - cur.x) * 0.12;
        cur.y += (target.y - cur.y) * 0.12;
        el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
        if (visible) {
            raf = requestAnimationFrame(tick);
        } else {
            raf = 0;
        }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeaveDoc);
    document.addEventListener('mouseenter', () => {
        visible = true;
        el.style.opacity = '1';
        if (!raf) raf = requestAnimationFrame(tick);
    });
}

/* ---------------- FLIP 布局动画 ---------------- */

/**
 * flipLayout — FLIP 动画：对容器内带 [data-flip] 的元素，
 * 在布局变化（尺寸/排序/增删后的重排）时测量首末位置，
 * 用 transform 反向补偿实现平滑过渡（无回流，仅合成层）。
 * 用法：在 React 的 useEffect 里，依赖布局变化的 state 变化时调用。
 */
export function flipLayout(container: HTMLElement, duration = 0.4): void {
    if (prefersReduced()) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>('[data-flip]'));
    if (els.length === 0) return;
    const first = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    requestAnimationFrame(() => {
        for (const { el, r } of first) {
            const r2 = el.getBoundingClientRect();
            const dx = r.left - r2.left;
            const dy = r.top - r2.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
            el.style.transition = 'none';
            el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
            requestAnimationFrame(() => {
                el.style.transition = `transform ${duration}s cubic-bezier(0.34, 1.56, 0.64, 1)`;
                el.style.transform = '';
                el.addEventListener('transitionend', () => {
                    el.style.transition = '';
                    el.style.transform = '';
                }, { once: true });
            });
        }
    });
}

/* ---------------- 初始化 ---------------- */

export function initMotion(): void {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.add('js-motion');
    initTiltMagnetic();
    initRipple();
    initReveal();
    initHeader();
    initCursorGlow();
}
