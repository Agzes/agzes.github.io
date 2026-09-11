function initDitherBackground() {
    const canvas = document.getElementById("c");
    if (!canvas) return;

    let gl;
    try {
        gl = canvas.getContext("webgl2");
    } catch (e) {
        gl = null;
    }
    if (!gl) {
        document.body.classList.add("no-webgl");
        const ctx = canvas.getContext("2d");
        let w,
            h,
            dots = [];
        const init2D = () => {
            w = canvas.width = Math.ceil(innerWidth / 4);
            h = canvas.height = Math.ceil(innerHeight / 4);
            dots = Array(4)
                .fill(0)
                .map(() => ({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3,
                    r: Math.random() * w * 0.4 + w * 0.1,
                }));
        };
        const loop2D = () => {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = "screen";
            dots.forEach((d) => {
                d.x += d.vx;
                d.y += d.vy;
                if (d.x < -d.r) d.x = w + d.r;
                if (d.x > w + d.r) d.x = -d.r;
                if (d.y < -d.r) d.y = h + d.r;
                if (d.y > h + d.r) d.y = -d.r;
                const grad = ctx.createRadialGradient(
                    d.x,
                    d.y,
                    0,
                    d.x,
                    d.y,
                    d.r,
                );
                grad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
                grad.addColorStop(1, "rgba(255, 255, 255, 0)");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fill();
            });
            requestAnimationFrame(loop2D);
        };
        window.addEventListener("resize", init2D);
        init2D();
        loop2D();
    } else {
        const p = gl.createProgram();
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            gl.attachShader(p, s);
        };
        compile(
            gl.VERTEX_SHADER,
            `#version 300 es
            void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`,
        );
        compile(
            gl.FRAGMENT_SHADER,
            `#version 300 es
            precision highp float;
            out vec4 fragColor;
            uniform vec2 u_res, u_mouse;
            uniform float u_time, u_seed;
            const float PIXEL_SCALE = 2.0;
            const int bayer[64] = int[64](0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21);
            float r(vec2 st) { return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.545); }
            float n(vec2 st) {
                vec2 i = floor(st), f = fract(st), u = f * f * (3.0 - 2.0 * f);
                return mix(mix(r(i), r(i + vec2(1.0, 0.0)), u.x), mix(r(i + vec2(0.0, 1.0)), r(i + 1.0), u.x), u.y);
            }
            float fbm(vec2 st) {
                float v = 0.0, a = 0.5;
                for (int i = 0; i < 6; i++) { v += a * n(st); st *= 2.0; a *= 0.5; }
                return v;
            }
            void main() {
                vec2 coord = floor(gl_FragCoord.xy / PIXEL_SCALE);
                float minSize = min(u_res.x, u_res.y) / PIXEL_SCALE;
                vec2 st = coord / minSize;
                vec2 mouse = (u_mouse * u_res) / min(u_res.x, u_res.y);
                vec2 p = st * 3.0 + u_seed;
                vec2 q = vec2(fbm(p + 0.1 * u_time), fbm(p + vec2(1.0)));
                vec2 r2 = vec2(fbm(p + q + vec2(1.7, 9.2) + 0.15 * u_time), fbm(p + q + vec2(8.3, 2.8) + 0.126 * u_time));
                float f = fbm(p + r2) - exp(-distance(st, mouse) * 12.0) * 0.4;
                float fadeIn = smoothstep(0.0, 1.2, u_time);
                f -= (1.0 - fadeIn) * 1.2;
                float color = smoothstep(0.48, 0.78, f);
                int bX = int(mod(coord.x, 8.0)), bY = int(mod(coord.y, 8.0));
                float threshold = float(bayer[bY * 8 + bX]) / 64.0 + 0.02;
                fragColor = vec4(vec3(step(threshold, color) * 0.7), 1.0);
            }
        `,
        );
        gl.linkProgram(p);
        gl.useProgram(p);
        const uRes = gl.getUniformLocation(p, "u_res");
        const uTime = gl.getUniformLocation(p, "u_time");
        const uMouse = gl.getUniformLocation(p, "u_mouse");
        const uSeed = gl.getUniformLocation(p, "u_seed");
        gl.uniform1f(uSeed, Math.random() * 1000.0);
        let tx = -1,
            ty = -1,
            cx = -1,
            cy = -1,
            start = performance.now();
        const updateCursor = (x, y) => {
            tx = x / innerWidth;
            ty = 1.0 - y / innerHeight;
        };
        window.addEventListener("mousemove", (e) =>
            updateCursor(e.clientX, e.clientY),
        );
        window.addEventListener("touchstart", (e) =>
            updateCursor(e.touches[0].clientX, e.touches[0].clientY),
        );
        const onResize = () => {
            canvas.width = innerWidth;
            canvas.height = innerHeight;
            gl.viewport(0, 0, innerWidth, innerHeight);
            gl.uniform2f(uRes, innerWidth, innerHeight);
        };
        window.addEventListener("resize", onResize);
        onResize();
        const loop = (time) => {
            cx += (tx - cx) * 0.1;
            cy += (ty - cy) * 0.1;
            gl.uniform1f(uTime, (time - start) * 0.001);
            gl.uniform2f(uMouse, cx, cy);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

function initCardGradients() {
    const cards = document.querySelectorAll(
        ".project-row, .stack div, .wallet-card",
    );
    if (!cards.length) return;
    window.addEventListener("mousemove", (e) => {
        cards.forEach((card) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty("--mouse-x", `${x}px`);
            card.style.setProperty("--mouse-y", `${y}px`);
        });
    });
}

function initHeroSticky() {
    const heroInner = document.querySelector(".hero-inner");
    if (!heroInner) return;
    window.addEventListener("scroll", () => {
        if (window.scrollY > 100) {
            heroInner.classList.add("sticky");
        } else {
            heroInner.classList.remove("sticky");
        }
    });
}

function initGitHubStars() {
    const projectCards = document.querySelectorAll(
        ".project-list .project-row",
    );
    if (!projectCards.length) return;
    projectCards.forEach(async (card) => {
        const href = card.getAttribute("href");
        if (href && href.includes("github.com")) {
            const parts = href.split("github.com/")[1].split("/");
            const owner = parts[0],
                repo = parts[1];
            if (owner && repo) {
                try {
                    const response = await fetch(
                        `https://api.github.com/repos/${owner}/${repo}`,
                    );
                    if (response.ok) {
                        const data = await response.json();
                        if (data.stargazers_count > 0) {
                            const starSpan = document.createElement("span");
                            starSpan.className = "star-count";
                            starSpan.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>${data.stargazers_count}`;
                            card.appendChild(starSpan);
                        }
                    }
                } catch (e) {
                    console.error("GitHub fetch error:", e);
                }
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initDitherBackground();
    initCardGradients();
    initHeroSticky();
    initGitHubStars();
});
