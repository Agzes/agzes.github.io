(function () {
    const canvas = document.getElementById("glCanvas");
    const gl =
        canvas.getContext("webgl", {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false,
        }) ||
        canvas.getContext("experimental-webgl", {
            alpha: false,
            antialias: false,
        });

    if (!gl) {
        document.body.classList.add("no-webgl");
        return;
    }

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
    ).matches;

    const CONFIG = {
        text: (canvas.dataset.text || "agzes").trim(),
        textWeight: 900,
        textTracking: 0.02,
        textWidthRatio: 0.86,
        textPosY: 0.48,
        pixelSize: 3.0,
        levels: 8.0,
        ditherSpread: 1.05,
        dotMask: 0.28,
        baseGlowHeight: 0.78,
        baseGlowWidth: 0.82,
        parkedGlowHeight: 0.5,
        parkedGlowWidth: 0.7,
        animSpeed: reducedMotion ? 0.0 : 0.25,
        textIntensity: 1.0,
        textHalo: 0.8,
        textBehind: 0.92,
    };

    const COLORS = {
        base: "#000000",
        deep: "#141414",
        mid: "#6e6e6e",
        core: "#ffffff",
    };

    const vertexShaderSource = `
                    attribute vec2 a_position;
                    void main() {
                        gl_Position = vec4(a_position, 0.0, 1.0);
                    }
                `;

    const fragmentShaderSource = `
                    precision highp float;

                    uniform vec2 u_resolution;
                    uniform float u_time;
                    uniform vec2 u_mouse;
                    uniform float u_pixelSize;
                    uniform float u_levels;
                    uniform float u_ditherSpread;
                    uniform float u_dotMask;
                    uniform float u_glowHeight;
                    uniform float u_glowWidth;
                    uniform float u_glowOffsetY;
                    uniform float u_glowFade;

                    uniform sampler2D u_textTex;
                    uniform float u_textIntensity;
                    uniform float u_textHalo;
                    uniform float u_textBehind;
                    uniform float u_textPosY;
                    uniform float u_textScale;
                    uniform vec2 u_textOffset;
                    uniform float u_textFade;

                    uniform vec3 u_colBase;
                    uniform vec3 u_colDeep;
                    uniform vec3 u_colMid;
                    uniform vec3 u_colBright;
                    uniform vec3 u_colCore;

                    float bayer2(vec2 a) {
                        a = floor(a);
                        return fract(a.x * 0.5 + a.y * a.y * 0.75);
                    }

                    float bayer4(vec2 a) {
                        return bayer2(0.5 * a) * 0.25 + bayer2(a);
                    }

                    float bayer8(vec2 a) {
                        return bayer4(0.5 * a) * 0.25 + bayer2(a);
                    }

                    vec3 sampleHorizonPalette(float t) {
                        t = clamp(t, 0.0, 1.0);
                        vec3 c0 = u_colBase;
                        vec3 c1 = u_colDeep;
                        vec3 c2 = u_colMid;
                        vec3 c3 = u_colBright;
                        vec3 c4 = u_colCore;

                        if (t < 0.25) {
                            return mix(c0, c1, t / 0.25);
                        } else if (t < 0.55) {
                            return mix(c1, c2, (t - 0.25) / 0.30);
                        } else if (t < 0.85) {
                            return mix(c2, c3, (t - 0.55) / 0.30);
                        }
                        return mix(c3, c4, (t - 0.85) / 0.15);
                    }

                    void main() {
                        vec2 pixelCoord = floor(gl_FragCoord.xy / u_pixelSize);
                        vec2 subPixel = fract(gl_FragCoord.xy / u_pixelSize);
                        vec2 gridUV = (pixelCoord + 0.5) * u_pixelSize / u_resolution;

                        float breathe = sin(u_time * 1.4) * 0.022 + cos(u_time * 0.7) * 0.012;

                        vec2 center = vec2(
                            0.5 + (u_mouse.x - 0.5) * 0.14,
                            -0.06 + (u_mouse.y - 0.2) * 0.05 + u_glowOffsetY
                        );

                        vec2 delta = gridUV - center;
                        delta.x /= (u_glowWidth * (1.0 + breathe * 0.4));
                        delta.y /= (u_glowHeight * (1.0 + breathe));

                        float dist = length(delta);
                        float rawGlow = clamp(1.0 - dist, 0.0, 1.0);
                        float glow = pow(rawGlow, 1.38) * u_glowFade;

                        float bayerValue = bayer8(pixelCoord) - 0.5 + (0.5 / 64.0);

                        vec2 parallax = vec2(
                            (u_mouse.x - 0.5) * 0.035,
                            (u_mouse.y - 0.2) * 0.018
                        );
                        vec2 shifted = vec2(
                            gridUV.x - parallax.x - u_textOffset.x,
                            gridUV.y - parallax.y - u_textOffset.y
                        );
                        float textU = 0.5 + (shifted.x - 0.5) * u_textScale;
                        float textV = u_textPosY
                            + (1.0 - u_textPosY - shifted.y) * u_textScale;
                        vec4 texSample = texture2D(
                            u_textTex,
                            clamp(vec2(textU, textV), 0.0, 1.0)
                        );

                        float glyphRaw = texSample.r;
                        float glyphMask = step(0.18, glyphRaw);
                        float glyphGrad = clamp((glyphRaw - 0.18) / 0.82, 0.0, 1.0);
                        float strokeMask = texSample.b;
                        float halo = pow(clamp(texSample.g, 0.0, 1.0), 1.2) * u_textHalo;

                        float frontDomeMask = clamp(
                            pow(rawGlow, 1.12) * u_textBehind * 1.1 * u_glowFade,
                            0.0,
                            1.0
                        );

                        float horizonCurveY = 0.16 + 0.08 * (
                            1.0 - pow(
                                (gridUV.x - center.x) / max(0.2, u_glowWidth),
                                2.0
                            )
                        );
                        float bottomArcOcclusion = (1.0 - smoothstep(
                            horizonCurveY * 0.35,
                            horizonCurveY * (0.85 + u_textBehind * 0.45),
                            gridUV.y
                        )) * u_glowFade;
                        float totalOcclusion = clamp(
                            max(
                                frontDomeMask * 0.88,
                                bottomArcOcclusion * u_textBehind
                            ),
                            0.0,
                            1.0
                        );

                        float activeShape = max(glyphMask, strokeMask * 0.35);
                        float activeGrad = max(glyphGrad, strokeMask * 0.55);

                        float textVisible = activeShape * (1.0 - totalOcclusion * 0.62);
                        float letterLum = u_textIntensity
                            * (0.28 + 0.72 * activeGrad)
                            * (1.0 - totalOcclusion * 0.45);

                        float combinedField = max(
                            glow,
                            letterLum * textVisible * u_textFade
                        );
                        combinedField += halo * 0.38
                            * (1.0 - frontDomeMask * 0.5)
                            * u_textFade;
                        combinedField = mix(combinedField, glow, totalOcclusion * 0.65);
                        combinedField = clamp(combinedField, 0.0, 1.0);

                        float ditheredStep = floor(
                            combinedField * u_levels
                            + bayerValue * u_ditherSpread
                            + 0.5
                        );
                        if (combinedField <= 0.008) ditheredStep = 0.0;

                        float quantizedGlow = clamp(ditheredStep / u_levels, 0.0, 1.0);
                        vec3 color = sampleHorizonPalette(quantizedGlow);

                        if (u_dotMask > 0.001 && u_pixelSize >= 2.0) {
                            vec2 cellEdge = abs(subPixel - 0.5) * 2.0;
                            float boxMetric = max(cellEdge.x, cellEdge.y);
                            float gridFactor = 1.0 - smoothstep(
                                1.0 - u_dotMask * 0.65,
                                1.0,
                                boxMetric
                            ) * u_dotMask;
                            color *= gridFactor;
                        }

                        gl_FragColor = vec4(color, 1.0);
                    }
                `;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("WebGL link error:", gl.getProgramInfoLog(program));
        document.body.classList.add("no-webgl");
        return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
    );

    const posLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
        resolution: gl.getUniformLocation(program, "u_resolution"),
        time: gl.getUniformLocation(program, "u_time"),
        mouse: gl.getUniformLocation(program, "u_mouse"),
        pixelSize: gl.getUniformLocation(program, "u_pixelSize"),
        levels: gl.getUniformLocation(program, "u_levels"),
        ditherSpread: gl.getUniformLocation(program, "u_ditherSpread"),
        dotMask: gl.getUniformLocation(program, "u_dotMask"),
        glowHeight: gl.getUniformLocation(program, "u_glowHeight"),
        glowWidth: gl.getUniformLocation(program, "u_glowWidth"),
        glowOffsetY: gl.getUniformLocation(program, "u_glowOffsetY"),
        glowFade: gl.getUniformLocation(program, "u_glowFade"),
        textTex: gl.getUniformLocation(program, "u_textTex"),
        textIntensity: gl.getUniformLocation(program, "u_textIntensity"),
        textHalo: gl.getUniformLocation(program, "u_textHalo"),
        textBehind: gl.getUniformLocation(program, "u_textBehind"),
        textPosY: gl.getUniformLocation(program, "u_textPosY"),
        textScale: gl.getUniformLocation(program, "u_textScale"),
        textOffset: gl.getUniformLocation(program, "u_textOffset"),
        textFade: gl.getUniformLocation(program, "u_textFade"),
        colBase: gl.getUniformLocation(program, "u_colBase"),
        colDeep: gl.getUniformLocation(program, "u_colDeep"),
        colMid: gl.getUniformLocation(program, "u_colMid"),
        colBright: gl.getUniformLocation(program, "u_colBright"),
        colCore: gl.getUniformLocation(program, "u_colCore"),
    };

    const textCanvas = document.createElement("canvas");
    const textCtx = textCanvas.getContext("2d");

    const textTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    function drawTrackedLine(ctx, text, centerX, centerY, spacingPx, isStroke) {
        if (!text) return;
        const chars = Array.from(text);
        let totalWidth = 0;
        const widths = chars.map((ch) => {
            const w = ctx.measureText(ch).width;
            totalWidth += w;
            return w;
        });
        totalWidth += Math.max(0, chars.length - 1) * spacingPx;

        let currentX = centerX - totalWidth * 0.5;
        for (let i = 0; i < chars.length; i++) {
            const chWidth = widths[i];
            if (isStroke) {
                ctx.strokeText(chars[i], currentX + chWidth * 0.5, centerY);
            } else {
                ctx.fillText(chars[i], currentX + chWidth * 0.5, centerY);
            }
            currentX += chWidth + spacingPx;
        }
    }

    function updateTextTexture() {
        const w = Math.max(1, canvas.width);
        const h = Math.max(1, canvas.height);
        textCanvas.width = w;
        textCanvas.height = h;

        const ctx = textCtx;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);

        const text = CONFIG.text;
        const chars = Array.from(text);

        if (chars.length > 0) {
            const family = '"Montserrat Alternates", sans-serif';
            const weight = CONFIG.textWeight;
            const tracking = CONFIG.textTracking;
            const targetWidth = w * CONFIG.textWidthRatio;
            const measureSize = 200;

            ctx.font = `${weight} ${measureSize}px ${family}`;
            let measured = 0;
            chars.forEach((ch) => {
                measured += ctx.measureText(ch).width;
            });
            measured += Math.max(0, chars.length - 1) * measureSize * tracking;

            const heightCap = window.innerHeight < 620 ? 0.46 : 0.6;
            let fontSize = measureSize * (targetWidth / Math.max(1, measured));
            fontSize = Math.min(fontSize, h * heightCap);
            fontSize = Math.max(fontSize, 24);

            const spacingPx = fontSize * tracking;
            const centerX = w * 0.5;
            const centerY = h * CONFIG.textPosY;

            ctx.font = `${weight} ${fontSize}px ${family}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";

            ctx.globalCompositeOperation = "lighter";

            const haloPasses = [
                { blur: fontSize * 0.55, color: "rgb(0, 105, 0)" },
                { blur: fontSize * 0.25, color: "rgb(0, 115, 0)" },
                { blur: fontSize * 0.1, color: "rgb(0, 95, 0)" },
            ];
            ctx.fillStyle = "rgb(0, 0, 0)";
            haloPasses.forEach((pass) => {
                ctx.shadowColor = pass.color;
                ctx.shadowBlur = pass.blur;
                drawTrackedLine(ctx, text, centerX, centerY, spacingPx, false);
            });

            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";

            const bodyGrad = ctx.createLinearGradient(
                0,
                centerY - fontSize * 0.52,
                0,
                centerY + fontSize * 0.52,
            );
            bodyGrad.addColorStop(0.0, "rgb(255, 0, 0)");
            bodyGrad.addColorStop(0.5, "rgb(230, 0, 0)");
            bodyGrad.addColorStop(0.82, "rgb(165, 0, 0)");
            bodyGrad.addColorStop(1.0, "rgb(115, 0, 0)");
            ctx.fillStyle = bodyGrad;
            drawTrackedLine(ctx, text, centerX, centerY, spacingPx, false);

            ctx.lineWidth = Math.max(2.0, fontSize * 0.032);
            const strokeGrad = ctx.createLinearGradient(
                0,
                centerY - fontSize * 0.52,
                0,
                centerY + fontSize * 0.52,
            );
            strokeGrad.addColorStop(0.0, "rgb(0, 0, 255)");
            strokeGrad.addColorStop(0.65, "rgb(0, 0, 190)");
            strokeGrad.addColorStop(1.0, "rgb(0, 0, 70)");
            ctx.strokeStyle = strokeGrad;
            drawTrackedLine(ctx, text, centerX, centerY, spacingPx, true);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            textCanvas,
        );
    }

    function hexToRgbNormalized(hex) {
        const clean = hex.replace("#", "");
        const num = parseInt(clean, 16);
        return [
            ((num >> 16) & 255) / 255,
            ((num >> 8) & 255) / 255,
            (num & 255) / 255,
        ];
    }

    function computeBrightColor(midRgb, coreRgb) {
        return [
            midRgb[0] * 0.42 + coreRgb[0] * 0.58,
            midRgb[1] * 0.42 + coreRgb[1] * 0.58,
            midRgb[2] * 0.35 + coreRgb[2] * 0.65,
        ];
    }

    let baseRgb = hexToRgbNormalized(COLORS.base);
    let deepRgb = hexToRgbNormalized(COLORS.deep);
    let midRgb = hexToRgbNormalized(COLORS.mid);
    let coreRgb = hexToRgbNormalized(COLORS.core);
    let brightRgb = computeBrightColor(midRgb, coreRgb);

    let wordmarkChangedAt = -Infinity;

    window.__agzesSetWordmark = function (text) {
        var next = String(text || "agzes").trim() || "agzes";
        if (CONFIG.text === next) return;
        CONFIG.text = next;
        wordmarkChangedAt = performance.now();
        updateTextTexture();
    };

    let dpr = 1;

    function resizeCanvas() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssWidth = canvas.clientWidth || window.innerWidth || 1;
        const cssHeight = canvas.clientHeight || window.innerHeight || 1;
        const width = Math.max(1, Math.floor(cssWidth * dpr));
        const height = Math.max(1, Math.floor(cssHeight * dpr));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
            updateTextTexture();
        }
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    if (document.fonts) {
        Promise.all([
            document.fonts.load('900 200px "Montserrat Alternates"'),
            document.fonts.ready,
        ])
            .then(updateTextTexture)
            .catch(updateTextTexture);
    }

    window.addEventListener("load", updateTextTexture);

    const currentMouse = { x: 0.5, y: 0.2 };
    const targetMouse = { x: 0.5, y: 0.2 };

    function updatePointer(x, y) {
        if (reducedMotion) return;
        targetMouse.x = x / window.innerWidth;
        targetMouse.y = 1.0 - y / window.innerHeight;
    }

    window.addEventListener("mousemove", (e) => {
        updatePointer(e.clientX, e.clientY);
    });

    window.addEventListener(
        "touchmove",
        (e) => {
            if (e.touches[0]) {
                updatePointer(e.touches[0].clientX, e.touches[0].clientY);
            }
        },
        { passive: true },
    );

    const scene = {
        textY: 0,
        textScale: 1,
        glowY: 0,
        glowH: CONFIG.baseGlowHeight,
        glowW: CONFIG.baseGlowWidth,
        glowFade: 1,
    };

    const parkedMode = canvas.dataset.textMode === "parked";
    const initialNarrow = window.innerWidth < 700;
    const baseTextScale = parkedMode
        ? initialNarrow
            ? 2.6
            : 3.2
        : parseFloat(canvas.dataset.textScale || "1") || 1;
    const baseTextY = parkedMode
        ? initialNarrow
            ? 0.4
            : 0.34
        : parseFloat(canvas.dataset.textY || "0") || 0;

    function clamp01(v) {
        return Math.min(1, Math.max(0, v));
    }

    const heroSection = document.querySelector(".hero");

    function heroHeight() {
        return Math.max(
            1,
            heroSection ? heroSection.offsetHeight : window.innerHeight,
        );
    }

    function computeSceneTarget() {
        const forcedProgress = Math.min(
            1,
            Math.max(0, parseFloat(canvas.dataset.sceneProgress || "0") || 0),
        );
        const p = Math.max(
            clamp01(window.scrollY / heroHeight()),
            forcedProgress,
        );
        const e = p * p * (3 - 2 * p);
        const narrow = window.innerWidth < 700;
        const parkedScale = narrow ? 2.6 : 3.2;
        const parkY = narrow ? 0.4 : 0.34;
        const baseScale = parkedMode ? parkedScale : baseTextScale;
        const baseY = parkedMode ? parkY : baseTextY;

        return {
            textY: baseY + e * (parkY - baseY),
            textScale: baseScale + e * (parkedScale - baseScale),
            glowY: e * 1.7,
            glowH:
                CONFIG.baseGlowHeight +
                (CONFIG.parkedGlowHeight - CONFIG.baseGlowHeight) * e,
            glowW:
                CONFIG.baseGlowWidth +
                (CONFIG.parkedGlowWidth - CONFIG.baseGlowWidth) * e,
            glowFade: Math.max(0, 1 - e * 1.15),
        };
    }

    const initialScene = computeSceneTarget();
    Object.assign(scene, initialScene);

    const heroMeta = document.getElementById("heroMeta");

    function updateHeroMeta(progress) {
        if (!heroMeta) return;
        const fade = clamp01(1 - progress / 0.3);
        heroMeta.style.opacity = String(fade);
        heroMeta.style.pointerEvents = fade < 0.15 ? "none" : "";
    }

    let accumulatedTime = 0;
    let lastTimestamp = performance.now();

    function renderFrame(now) {
        const dt = Math.min((now - lastTimestamp) * 0.001, 0.1);
        lastTimestamp = now;
        accumulatedTime += dt * CONFIG.animSpeed;

        currentMouse.x += (targetMouse.x - currentMouse.x) * 0.06;
        currentMouse.y += (targetMouse.y - currentMouse.y) * 0.06;

        const target = computeSceneTarget();
        const follow = reducedMotion ? 1 : 0.12;

        scene.textY += (target.textY - scene.textY) * follow;
        scene.textScale += (target.textScale - scene.textScale) * follow;
        scene.glowY += (target.glowY - scene.glowY) * follow;
        scene.glowH += (target.glowH - scene.glowH) * follow;
        scene.glowW += (target.glowW - scene.glowW) * follow;
        scene.glowFade += (target.glowFade - scene.glowFade) * follow;

        const scrollProgress = clamp01(window.scrollY / heroHeight());
        updateHeroMeta(scrollProgress);

        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.time, accumulatedTime);
        gl.uniform2f(uniforms.mouse, currentMouse.x, currentMouse.y);
        gl.uniform1f(uniforms.pixelSize, CONFIG.pixelSize * dpr);
        gl.uniform1f(uniforms.levels, CONFIG.levels);
        gl.uniform1f(uniforms.ditherSpread, CONFIG.ditherSpread);
        gl.uniform1f(uniforms.dotMask, CONFIG.dotMask);
        gl.uniform1f(uniforms.glowHeight, scene.glowH);
        gl.uniform1f(uniforms.glowWidth, scene.glowW);
        gl.uniform1f(uniforms.glowOffsetY, scene.glowY);
        gl.uniform1f(uniforms.glowFade, scene.glowFade);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textTexture);
        gl.uniform1i(uniforms.textTex, 0);
        gl.uniform1f(uniforms.textIntensity, CONFIG.textIntensity);
        gl.uniform1f(uniforms.textHalo, CONFIG.textHalo);
        gl.uniform1f(uniforms.textBehind, CONFIG.textBehind);
        gl.uniform1f(uniforms.textPosY, CONFIG.textPosY);

        const idleX = Math.sin(accumulatedTime * 0.42) * 0.0024;
        const idleY = Math.cos(accumulatedTime * 0.31) * 0.003;
        const idleScale = 1 + Math.sin(accumulatedTime * 0.24) * 0.006;

        const changeAge = (performance.now() - wordmarkChangedAt) / 1000;
        const changeT = changeAge < 0 ? 1 : Math.min(1, changeAge / 0.28);
        const changeEase = 1 - Math.pow(1 - changeT, 3);
        const changeScale = 1.08 - 0.08 * changeEase;

        gl.uniform1f(
            uniforms.textScale,
            scene.textScale * idleScale * changeScale,
        );
        gl.uniform2f(uniforms.textOffset, idleX, scene.textY + idleY);
        gl.uniform1f(uniforms.textFade, changeEase);

        gl.uniform3fv(uniforms.colBase, baseRgb);
        gl.uniform3fv(uniforms.colDeep, deepRgb);
        gl.uniform3fv(uniforms.colMid, midRgb);
        gl.uniform3fv(uniforms.colBright, brightRgb);
        gl.uniform3fv(uniforms.colCore, coreRgb);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function animate(now) {
        renderFrame(now);
        requestAnimationFrame(animate);
    }

    updateTextTexture();
    requestAnimationFrame(animate);
})();

(function () {
    var cells = document.querySelectorAll(".project-cell[data-repo]");

    cells.forEach(function (cell) {
        var repo = cell.getAttribute("data-repo");
        if (!repo) return;

        fetch("https://api.github.com/repos/" + repo)
            .then(function (res) {
                return res.ok ? res.json() : null;
            })
            .then(function (data) {
                if (!data || typeof data.stargazers_count !== "number") {
                    return;
                }
                var box = cell.querySelector(".project-stars");
                if (!box) return;

                box.innerHTML =
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>' +
                    "<span>" +
                    data.stargazers_count +
                    "</span>";
                box.setAttribute(
                    "aria-label",
                    data.stargazers_count + " GitHub stars",
                );
            })
            .catch(function () {});
    });
})();

var QRCodeModel = function (typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
};

QRCodeModel.prototype = {
    addData: function (data) {
        var newData = new QR8bitByte(data);
        this.dataList.push(newData);
        this.dataCache = null;
    },
    isDark: function (row, col) {
        if (
            row < 0 ||
            this.moduleCount <= row ||
            col < 0 ||
            this.moduleCount <= col
        ) {
            throw new Error(row + "," + col);
        }
        return this.modules[row][col];
    },
    getModuleCount: function () {
        return this.moduleCount;
    },
    make: function () {
        if (this.typeNumber < 1) {
            var typeNumber = 1;
            for (typeNumber = 1; typeNumber < 40; typeNumber++) {
                var rsBlocks = QRRSBlock.getRSBlocks(
                    typeNumber,
                    this.errorCorrectLevel,
                );
                var buffer = new QRBitBuffer();
                var totalDataCount = 0;
                for (var i = 0; i < rsBlocks.length; i++) {
                    totalDataCount += rsBlocks[i].dataCount;
                }
                for (var i = 0; i < this.dataList.length; i++) {
                    var data = this.dataList[i];
                    buffer.put(data.mode, 4);
                    buffer.put(
                        data.getLength(),
                        QRUtil.getLengthInBits(data.mode, typeNumber),
                    );
                    data.write(buffer);
                }
                if (buffer.getLengthInBits() <= totalDataCount * 8) break;
            }
            this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function (test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
            this.modules[row] = new Array(this.moduleCount);
            for (var col = 0; col < this.moduleCount; col++) {
                this.modules[row][col] = null;
            }
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) {
            this.setupTypeNumber(test);
        }
        if (this.dataCache == null) {
            this.dataCache = QRCodeModel.createData(
                this.typeNumber,
                this.errorCorrectLevel,
                this.dataList,
            );
        }
        this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function (row, col) {
        for (var r = -1; r <= 7; r++) {
            if (row + r <= -1 || this.moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c++) {
                if (col + c <= -1 || this.moduleCount <= col + c) continue;
                if (
                    (0 <= r && r <= 6 && (c == 0 || c == 6)) ||
                    (0 <= c && c <= 6 && (r == 0 || r == 6)) ||
                    (2 <= r && r <= 4 && 2 <= c && c <= 4)
                ) {
                    this.modules[row + r][col + c] = true;
                } else {
                    this.modules[row + r][col + c] = false;
                }
            }
        }
    },
    getBestMaskPattern: function () {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
            this.makeImpl(true, i);
            var lostPoint = QRUtil.getLostPoint(this);
            if (i == 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
            }
        }
        return pattern;
    },
    setupTimingPattern: function () {
        for (var r = 8; r < this.moduleCount - 8; r++) {
            if (this.modules[r][6] != null) continue;
            this.modules[r][6] = r % 2 == 0;
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
            if (this.modules[6][c] != null) continue;
            this.modules[6][c] = c % 2 == 0;
        }
    },
    setupPositionAdjustPattern: function () {
        var pos = QRUtil.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
            for (var j = 0; j < pos.length; j++) {
                var row = pos[i];
                var col = pos[j];
                if (this.modules[row][col] != null) continue;
                for (var r = -2; r <= 2; r++) {
                    for (var c = -2; c <= 2; c++) {
                        if (
                            r == -2 ||
                            r == 2 ||
                            c == -2 ||
                            c == 2 ||
                            (r == 0 && c == 0)
                        ) {
                            this.modules[row + r][col + c] = true;
                        } else {
                            this.modules[row + r][col + c] = false;
                        }
                    }
                }
            }
        }
    },
    setupTypeNumber: function (test) {
        var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        for (var i = 0; i < 18; i++) {
            var mod = !test && ((bits >> i) & 1) == 1;
            this.modules[Math.floor(i / 3)][
                (i % 3) + this.moduleCount - 8 - 3
            ] = mod;
        }
        for (var i = 0; i < 18; i++) {
            var mod = !test && ((bits >> i) & 1) == 1;
            this.modules[(i % 3) + this.moduleCount - 8 - 3][
                Math.floor(i / 3)
            ] = mod;
        }
    },
    setupTypeInfo: function (test, maskPattern) {
        var data = (this.errorCorrectLevel << 3) | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
            var mod = !test && ((bits >> i) & 1) == 1;
            if (i < 6) {
                this.modules[i][8] = mod;
            } else if (i < 8) {
                this.modules[i + 1][8] = mod;
            } else {
                this.modules[this.moduleCount - 15 + i][8] = mod;
            }
        }
        for (var i = 0; i < 15; i++) {
            var mod = !test && ((bits >> i) & 1) == 1;
            if (i < 8) {
                this.modules[8][this.moduleCount - i - 1] = mod;
            } else if (i < 9) {
                this.modules[8][15 - i - 1 + 1] = mod;
            } else {
                this.modules[8][15 - i - 1] = mod;
            }
        }
        this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData: function (data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col--;
            while (true) {
                for (var c = 0; c < 2; c++) {
                    if (this.modules[row][col - c] == null) {
                        var dark = false;
                        if (byteIndex < data.length) {
                            dark = ((data[byteIndex] >>> bitIndex) & 1) == 1;
                        }
                        var mask = QRUtil.getMask(maskPattern, row, col - c);
                        if (mask) {
                            dark = !dark;
                        }
                        this.modules[row][col - c] = dark;
                        bitIndex--;
                        if (bitIndex == -1) {
                            byteIndex++;
                            bitIndex = 7;
                        }
                    }
                }
                row += inc;
                if (row < 0 || this.moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
    },
};

QRCodeModel.createData = function (typeNumber, errorCorrectLevel, dataList) {
    var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    var buffer = new QRBitBuffer();
    for (var i = 0; i < dataList.length; i++) {
        var data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(
            data.getLength(),
            QRUtil.getLengthInBits(data.mode, typeNumber),
        );
        data.write(buffer);
    }
    var totalDataCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) {
        totalDataCount += rsBlocks[i].dataCount;
    }
    if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw new Error(
            "code length overflow. (" +
                buffer.getLengthInBits() +
                ">" +
                totalDataCount * 8 +
                ")",
        );
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
    }
    while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(QRCodeModel.PAD0, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(QRCodeModel.PAD1, 8);
    }
    return QRCodeModel.createBytes(buffer, rsBlocks);
};

QRCodeModel.PAD0 = 0xec;
QRCodeModel.PAD1 = 0x11;

QRCodeModel.createBytes = function (buffer, rsBlocks) {
    var offset = 0;
    var maxDcCount = 0;
    var maxEcCount = 0;
    var dcdata = new Array(rsBlocks.length);
    var ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) {
            dcdata[r][i] = 0xff & buffer.buffer[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i++) {
            var modIndex = i + modPoly.getLength() - ecdata[r].length;
            ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
        }
    }
    var totalCodeCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) {
        totalCodeCount += rsBlocks[i].totalCount;
    }
    var data = new Array(totalCodeCount);
    var index = 0;
    for (var i = 0; i < maxDcCount; i++) {
        for (var r = 0; r < rsBlocks.length; r++) {
            if (i < dcdata[r].length) {
                data[index++] = dcdata[r][i];
            }
        }
    }
    for (var i = 0; i < maxEcCount; i++) {
        for (var r = 0; r < rsBlocks.length; r++) {
            if (i < ecdata[r].length) {
                data[index++] = ecdata[r][i];
            }
        }
    }
    return data;
};

var QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3,
};

var QRErrorCorrectLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2,
};

var QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7,
};

var QRUtil = {
    PATTERN_POSITION_TABLE: [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170],
    ],
    G15:
        (1 << 10) |
        (1 << 8) |
        (1 << 5) |
        (1 << 4) |
        (1 << 2) |
        (1 << 1) |
        (1 << 0),
    G18:
        (1 << 12) |
        (1 << 11) |
        (1 << 10) |
        (1 << 9) |
        (1 << 8) |
        (1 << 5) |
        (1 << 2) |
        (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo: function (data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^=
                QRUtil.G15 <<
                (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHTypeNumber: function (data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^=
                QRUtil.G18 <<
                (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18));
        }
        return (data << 12) | d;
    },
    getBCHDigit: function (data) {
        var digit = 0;
        while (data != 0) {
            digit++;
            data >>>= 1;
        }
        return digit;
    },
    getPatternPosition: function (typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },
    getMask: function (maskPattern, i, j) {
        switch (maskPattern) {
            case QRMaskPattern.PATTERN000:
                return (i + j) % 2 == 0;
            case QRMaskPattern.PATTERN001:
                return i % 2 == 0;
            case QRMaskPattern.PATTERN010:
                return j % 3 == 0;
            case QRMaskPattern.PATTERN011:
                return (i + j) % 3 == 0;
            case QRMaskPattern.PATTERN100:
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
            case QRMaskPattern.PATTERN101:
                return ((i * j) % 2) + ((i * j) % 3) == 0;
            case QRMaskPattern.PATTERN110:
                return (((i * j) % 2) + ((i * j) % 3)) % 2 == 0;
            case QRMaskPattern.PATTERN111:
                return (((i * j) % 3) + ((i + j) % 2)) % 2 == 0;
            default:
                throw new Error("bad maskPattern:" + maskPattern);
        }
    },
    getErrorCorrectPolynomial: function (errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
    },
    getLengthInBits: function (mode, type) {
        if (1 <= type && type < 10) {
            switch (mode) {
                case QRMode.MODE_NUMBER:
                    return 10;
                case QRMode.MODE_ALPHA_NUM:
                    return 9;
                case QRMode.MODE_8BIT_BYTE:
                    return 8;
                case QRMode.MODE_KANJI:
                    return 8;
                default:
                    throw new Error("mode:" + mode);
            }
        } else if (type < 27) {
            switch (mode) {
                case QRMode.MODE_NUMBER:
                    return 12;
                case QRMode.MODE_ALPHA_NUM:
                    return 11;
                case QRMode.MODE_8BIT_BYTE:
                    return 16;
                case QRMode.MODE_KANJI:
                    return 10;
                default:
                    throw new Error("mode:" + mode);
            }
        } else if (type < 41) {
            switch (mode) {
                case QRMode.MODE_NUMBER:
                    return 14;
                case QRMode.MODE_ALPHA_NUM:
                    return 13;
                case QRMode.MODE_8BIT_BYTE:
                    return 16;
                case QRMode.MODE_KANJI:
                    return 12;
                default:
                    throw new Error("mode:" + mode);
            }
        } else {
            throw new Error("type:" + type);
        }
    },
    getLostPoint: function (qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount; col++) {
                var sameCount = 0;
                var dark = qrCode.isDark(row, col);
                for (var r = -1; r <= 1; r++) {
                    if (row + r < 0 || moduleCount <= row + r) continue;
                    for (var c = -1; c <= 1; c++) {
                        if (col + c < 0 || moduleCount <= col + c) continue;
                        if (r == 0 && c == 0) continue;
                        if (dark == qrCode.isDark(row + r, col + c))
                            sameCount++;
                    }
                }
                if (sameCount > 5) lostPoint += 3 + sameCount - 5;
            }
        }
        for (var row = 0; row < moduleCount - 1; row++) {
            for (var col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row, col)) count++;
                if (qrCode.isDark(row + 1, col)) count++;
                if (qrCode.isDark(row, col + 1)) count++;
                if (qrCode.isDark(row + 1, col + 1)) count++;
                if (count == 0 || count == 4) lostPoint += 3;
            }
        }
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount - 6; col++) {
                if (
                    qrCode.isDark(row, col) &&
                    !qrCode.isDark(row, col + 1) &&
                    qrCode.isDark(row, col + 2) &&
                    qrCode.isDark(row, col + 3) &&
                    qrCode.isDark(row, col + 4) &&
                    !qrCode.isDark(row, col + 5) &&
                    qrCode.isDark(row, col + 6)
                ) {
                    lostPoint += 40;
                }
            }
        }
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount - 6; row++) {
                if (
                    qrCode.isDark(row, col) &&
                    !qrCode.isDark(row + 1, col) &&
                    qrCode.isDark(row + 2, col) &&
                    qrCode.isDark(row + 3, col) &&
                    qrCode.isDark(row + 4, col) &&
                    !qrCode.isDark(row + 5, col) &&
                    qrCode.isDark(row + 6, col)
                ) {
                    lostPoint += 40;
                }
            }
        }
        var darkCount = 0;
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col)) darkCount++;
            }
        }
        var ratio =
            Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
    },
};

var QRMath = {
    glog: function (n) {
        if (n < 1) throw new Error("glog(" + n + ")");
        return QRMath.LOG_TABLE[n];
    },
    gexp: function (n) {
        while (n < 0) n += 255;
        while (n >= 256) n -= 255;
        return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256),
};

for (var i = 0; i < 8; i++) {
    QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
    QRMath.EXP_TABLE[i] =
        QRMath.EXP_TABLE[i - 4] ^
        QRMath.EXP_TABLE[i - 5] ^
        QRMath.EXP_TABLE[i - 6] ^
        QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
    QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
}

function QRPolynomial(num, shift) {
    if (num.length == undefined) throw new Error(num.length + "/" + shift);
    var offset = 0;
    while (offset < num.length && num[offset] == 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) {
        this.num[i] = num[i + offset];
    }
}

QRPolynomial.prototype = {
    get: function (index) {
        return this.num[index];
    },
    getLength: function () {
        return this.num.length;
    },
    multiply: function (e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
            for (var j = 0; j < e.getLength(); j++) {
                num[i + j] ^= QRMath.gexp(
                    QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)),
                );
            }
        }
        return new QRPolynomial(num, 0);
    },
    mod: function (e) {
        if (this.getLength() - e.getLength() < 0) return this;
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) {
            num[i] = this.get(i);
        }
        for (var i = 0; i < e.getLength(); i++) {
            num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
    },
};

function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
];

QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectLevel) {
    var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
    if (rsBlock == undefined) {
        throw new Error(
            "bad rs block @ typeNumber:" +
                typeNumber +
                "/errorCorrectLevel:" +
                errorCorrectLevel,
        );
    }
    var length = rsBlock.length / 3;
    var list = [];
    for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) {
            list.push(new QRRSBlock(totalCount, dataCount));
        }
    }
    return list;
};

QRRSBlock.getRsBlockTable = function (typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
        case QRErrorCorrectLevel.L:
            return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectLevel.M:
            return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectLevel.Q:
            return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectLevel.H:
            return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default:
            return undefined;
    }
};

function QR8bitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
}

QR8bitByte.prototype = {
    getLength: function () {
        return this.data.length;
    },
    write: function (buffer) {
        for (var i = 0; i < this.data.length; i++) {
            buffer.put(this.data.charCodeAt(i), 8);
        }
    },
};

function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
}

QRBitBuffer.prototype = {
    get: function (index) {
        var bufIndex = Math.floor(index / 8);
        return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) == 1;
    },
    put: function (num, length) {
        for (var i = 0; i < length; i++) {
            this.putBit(((num >>> (length - i - 1)) & 1) == 1);
        }
    },
    getLengthInBits: function () {
        return this.length;
    },
    putBit: function (bit) {
        var bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
            this.buffer.push(0);
        }
        if (bit) {
            this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
        }
        this.length++;
    },
};

(function () {
    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function fallbackCopy(text) {
        var temp = document.createElement("textarea");
        temp.value = text;
        temp.setAttribute("readonly", "");
        temp.style.position = "fixed";
        temp.style.top = "-1000px";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        try {
            document.execCommand("copy");
        } catch (e) {}
        document.body.removeChild(temp);
        return Promise.resolve();
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(function () {
                return fallbackCopy(text);
            });
        }
        return fallbackCopy(text);
    }

    function drawQR(address, canvasEl, inverted) {
        if (!canvasEl || typeof QRCodeModel === "undefined") return;
        var ctx = canvasEl.getContext("2d");
        var bg = inverted ? "#f5f5f5" : "#0a0a0b";
        var fg = inverted ? "#0a0a0b" : "#f5f5f5";

        try {
            var qr = new QRCodeModel(0, QRErrorCorrectLevel.Q);
            qr.addData(address);
            qr.make();

            var count = qr.getModuleCount();
            var scale = Math.max(4, Math.floor(240 / (count + 8)));
            var margin = scale * 4;
            var total = count * scale + margin * 2;
            canvasEl.width = total;
            canvasEl.height = total;

            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, total, total);

            ctx.fillStyle = fg;
            for (var row = 0; row < count; row++) {
                for (var col = 0; col < count; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(
                            margin + col * scale,
                            margin + row * scale,
                            scale,
                            scale,
                        );
                    }
                }
            }
        } catch (e) {}
    }

    ready(function () {
        var wallets = document.querySelectorAll(".wallet");
        if (!wallets.length) return;

        var modal = document.getElementById("qr-modal");
        var modalCoin = document.getElementById("qr-coin");
        var modalTokens = document.getElementById("qr-tokens");
        var modalAddr = document.getElementById("qr-addr");
        var modalFrame = modal ? modal.querySelector(".qr-frame") : null;
        var modalCanvas = document.getElementById("qr-canvas");
        var modalCopy = document.getElementById("qr-copy");
        var modalInvert = document.getElementById("qr-invert");
        var currentAddress = "";
        var qrInverted = false;
        var lastFocused = null;

        function renderQr() {
            if (modalFrame) {
                modalFrame.classList.toggle("is-inverted", qrInverted);
            }
            drawQR(currentAddress, modalCanvas, qrInverted);
        }

        function openQr(slide) {
            if (!modal) return;
            currentAddress = slide.getAttribute("data-address") || "";
            if (modalCoin) {
                modalCoin.textContent =
                    slide.getAttribute("data-coin") || "crypto";
            }
            if (modalTokens) {
                modalTokens.textContent =
                    slide.getAttribute("data-tokens") || "";
            }
            if (modalAddr) modalAddr.textContent = currentAddress;
            if (modalCopy) modalCopy.textContent = "copy address";

            renderQr();

            lastFocused = document.activeElement;
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";

            var focusTarget = modal.querySelector("[data-close-modal]");
            requestAnimationFrame(function () {
                if (focusTarget && focusTarget.focus) focusTarget.focus();
            });
        }

        function closeQr() {
            if (!modal) return;
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";

            if (lastFocused && lastFocused.focus) lastFocused.focus();
            lastFocused = null;
        }

        var wordmarkTimer = 0;

        function showCopyFlash(x, y) {
            var flash = document.createElement("div");
            flash.className = "copy-flash";
            flash.textContent = "copied";
            flash.style.left = x + "px";
            flash.style.top = y + "px";
            document.body.appendChild(flash);
            setTimeout(function () {
                flash.remove();
            }, 700);
        }

        wallets.forEach(function (slide) {
            var address = slide.getAttribute("data-address") || "";

            slide.addEventListener("click", function (event) {
                if (event.target.closest && event.target.closest("[data-qr]")) {
                    return;
                }

                copyText(address).then(function () {
                    var rect = slide.getBoundingClientRect();
                    var fx = event.clientX || rect.left + rect.width / 2;
                    var fy = event.clientY || rect.top + rect.height / 2;
                    showCopyFlash(fx, fy);

                    if (window.__agzesSetWordmark) {
                        window.__agzesSetWordmark("copied!");
                        clearTimeout(wordmarkTimer);
                        wordmarkTimer = setTimeout(function () {
                            window.__agzesSetWordmark("agzes");
                        }, 1400);
                    }
                });
            });

            var qrBtn = slide.querySelector("[data-qr]");
            if (qrBtn) {
                qrBtn.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    openQr(slide);
                });
            }
        });

        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) closeQr();
            });

            var closeBtn = modal.querySelector("[data-close-modal]");
            if (closeBtn) closeBtn.addEventListener("click", closeQr);

            document.addEventListener("keydown", function (event) {
                if (!modal.classList.contains("is-open")) return;

                if (event.key === "Escape") {
                    closeQr();
                    return;
                }

                if (event.key !== "Tab") return;
                var focusables = modal.querySelectorAll(
                    "button, [href], input, [tabindex]:not([tabindex='-1'])",
                );
                if (!focusables.length) return;
                var first = focusables[0];
                var last = focusables[focusables.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            });
        }

        function copyModalAddress() {
            if (!currentAddress) return;
            copyText(currentAddress).then(function () {
                if (modalCopy) {
                    modalCopy.textContent = "copied!";
                    setTimeout(function () {
                        modalCopy.textContent = "copy address";
                    }, 1600);
                }
            });
        }

        if (modalCopy) {
            modalCopy.addEventListener("click", copyModalAddress);
        }

        if (modalAddr) {
            modalAddr.addEventListener("click", copyModalAddress);
        }

        if (modalInvert) {
            modalInvert.addEventListener("click", function () {
                qrInverted = !qrInverted;
                modalInvert.textContent = qrInverted ? "dark qr" : "invert";
                renderQr();
            });
        }
    });
})();
