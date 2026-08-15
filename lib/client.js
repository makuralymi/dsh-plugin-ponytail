window.__ModuleLoader__.load({
	id: "dsh-client-ui-ponytail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/hurry.ts
		/**
		* Hurry-up instructions the whip sends to the model on each crack. These are
		* model-facing content (delivered as an ordinary user message), not UI copy,
		* so they stay literal data rather than a locale dictionary.
		*/
		/** The rotation pool of hurry-up lines. */
		const HURRIES = [
			"⏩ 快马加鞭！请立即收敛思路，跳过无关展开，直接给出最终结果。",
			"🏇 驾！别再磨蹭了，聚焦最小可行实现，马上交付可运行版本。",
			"⚡ 提速！停止过度思考，先跑通主流程，其余细节留到后续再说。",
			"🔥 抓紧时间！放弃可选验证和锦上添花，直接输出结论。",
			"🪢 啪！快进到答案，不要复述思路，直接给出最终代码或结论。",
			"💨 加速加速！压缩解释，直接产出结果，别让用户再等。"
		];
		/**
		* Pick the next hurry line, never repeating the immediately previous one.
		* @param previous - the last line sent, if any.
		* @returns a line from {@link HURRIES}.
		*/
		function nextHurry(previous) {
			if (HURRIES.length <= 1) return HURRIES[0] ?? "";
			const candidates = HURRIES.filter((line) => line !== previous);
			return candidates[Math.floor(Math.random() * candidates.length)] ?? HURRIES[0] ?? "";
		}
		//#endregion
		//#region src/client/crack.ts
		/**
		* Whip-crack audio: plays a random MP3 from the plugin's own public/
		* directory (whip1..4.mp3). The client-modules node half serves a plugin's
		* public/ directory under /plugins/<id>/public/, so the sound files travel
		* with the plugin (shareable) instead of depending on the web app's public
		* directory. Files are referenced by their public/-relative names; the base
		* is derived from the plugin id so a rename updates every URL in one place.
		*/
		/** This plugin's module-table id (also its /plugins/<id>/public/ base). */
		const PLUGIN_ID = "dsh-client-ui-ponytail";
		/** Sound files, relative to the plugin's public/ directory. */
		const WHIP_FILES = [
			"whip1.mp3",
			"whip2.mp3",
			"whip3.mp3",
			"whip4.mp3"
		];
		/** Cached audio elements by URL (lazy, rewound on each crack). */
		const cache = /* @__PURE__ */ new Map();
		/** Play one random whip crack; silent when audio is unavailable or blocked. */
		function playCrack() {
			const file = WHIP_FILES[Math.floor(Math.random() * WHIP_FILES.length)];
			if (file === void 0) return;
			const url = `/plugins/${PLUGIN_ID}/public/${file}`;
			let audio = cache.get(url);
			if (audio === void 0) {
				audio = new Audio(url);
				audio.preload = "auto";
				cache.set(url, audio);
			}
			audio.currentTime = 0;
			audio.play().catch(() => {});
		}
		//#endregion
		//#region src/client/whipPhysics.ts
		/**
		* The whip: a pinned head chases a target, the handle stays a rigid rod, the
		* body softens toward the tip (thick-and-stiff root, thin-and-soft tail), and
		* gravity droops the tail. A crack is a single fast head flick whose wave
		* travels to the tip; the caller reads {@link tipSpeed} to decide when it
		* fires.
		*/
		var WhipSimulation = class {
			points;
			segmentLength;
			damping;
			iterations;
			stiffness;
			tipFlex;
			gravity;
			flickAmplitude;
			flickDuration;
			/** Number of points in the rigid handle (including the head). */
			handlePoints;
			/** Fixed handle angle in radians (screen coords), or undefined to follow motion. */
			handleAngle;
			/** Mouse target the head chases. */
			targetX = 0;
			/** Mouse target the head chases. */
			targetY = 0;
			/** Live crack, or undefined while idle. */
			crack;
			/** Smoothed tip speed, in pixels per second. */
			tipSpeed = 0;
			/**
			* @param options - optional tuning; defaults target the dock overlay's whip.
			*/
			constructor(options = {}) {
				const count = options.points ?? 22;
				this.handlePoints = options.handlePoints ?? 5;
				this.segmentLength = options.segmentLength ?? 9;
				this.damping = options.damping ?? .85;
				this.iterations = options.iterations ?? 3;
				this.stiffness = options.stiffness ?? .7;
				this.tipFlex = options.tipFlex ?? .9;
				this.gravity = options.gravity ?? 700;
				this.flickAmplitude = options.flickAmplitude ?? 46;
				this.flickDuration = options.flickDuration ?? .15;
				this.handleAngle = options.handleAngle;
				this.points = [];
				for (let i = 0; i < count; i += 1) this.points.push({
					x: 0,
					y: 0,
					px: 0,
					py: 0
				});
			}
			/** Read-only whip points for rendering. */
			rope() {
				return this.points;
			}
			/**
			* Read one whip point. The array is fully populated at construction and
			* never resized, so every in-bounds index resolves; the assertion satisfies
			* `noUncheckedIndexedAccess`.
			*/
			at(i) {
				return this.points[i];
			}
			/** Bending stiffness at one point index: rigid handle, softening body. */
			stiffnessAt(i) {
				const n = this.points.length;
				if (i < this.handlePoints) return 1;
				const bodyPos = (i - this.handlePoints) / (n - 1 - this.handlePoints);
				return this.stiffness * (1 - this.tipFlex * bodyPos);
			}
			/**
			* Snap the whole whip to a start position so the first mount does not let
			* the tail fly in from the origin.
			* @param x - head x.
			* @param y - head y.
			*/
			seed(x, y) {
				for (let i = 0; i < this.points.length; i += 1) {
					const p = this.at(i);
					p.x = x;
					p.y = y + i * this.segmentLength;
					p.px = p.x;
					p.py = p.y;
				}
				this.targetX = x;
				this.targetY = y;
				if (this.handleAngle !== void 0) {
					const head = this.at(0);
					const dx = Math.cos(this.handleAngle) * this.segmentLength;
					const dy = Math.sin(this.handleAngle) * this.segmentLength;
					for (let i = 1; i <= this.handlePoints; i += 1) {
						const p = this.at(i);
						p.x = head.x + dx * i;
						p.y = head.y + dy * i;
						p.px = p.x;
						p.py = p.y;
					}
				}
			}
			/**
			* Trigger a crack at a point. The head flick runs perpendicular to the
			* whip's head tangent so the wave snaps sideways, like a real whip crack.
			* @param mx - mouse x (also snapped into the target).
			* @param my - mouse y (also snapped into the target).
			*/
			crackAt(mx, my) {
				this.targetX = mx;
				this.targetY = my;
				const head = this.at(0);
				const neck = this.points.length > 1 ? this.at(1) : head;
				let tx = head.x - neck.x;
				let ty = head.y - neck.y;
				const len = Math.hypot(tx, ty);
				if (len < .001) {
					tx = 1;
					ty = 0;
				} else {
					tx /= len;
					ty /= len;
				}
				this.crack = {
					remaining: this.flickDuration,
					duration: this.flickDuration,
					dirX: -ty,
					dirY: tx
				};
			}
			/**
			* Advance the simulation.
			* @param dt - frame delta in seconds (clamped to 50ms for tab-switch stability).
			*/
			step(dt) {
				const clamped = Math.min(dt, .05);
				const dtSq = clamped * clamped;
				let headX = this.targetX;
				let headY = this.targetY;
				if (this.crack !== void 0) {
					const p = 1 - this.crack.remaining / this.crack.duration;
					const envelope = Math.sin(p * Math.PI);
					const wave = Math.sin(p * Math.PI * 2);
					const amp = this.flickAmplitude * envelope * wave;
					headX += this.crack.dirX * amp;
					headY += this.crack.dirY * amp;
					this.crack.remaining -= dt;
					if (this.crack.remaining <= 0) this.crack = void 0;
				}
				const head = this.at(0);
				head.px = head.x;
				head.py = head.y;
				head.x = headX;
				head.y = headY;
				if (this.handleAngle !== void 0) {
					const dx = Math.cos(this.handleAngle) * this.segmentLength;
					const dy = Math.sin(this.handleAngle) * this.segmentLength;
					for (let i = 1; i <= this.handlePoints; i += 1) {
						const p = this.at(i);
						p.px = p.x;
						p.py = p.y;
						p.x = head.x + dx * i;
						p.y = head.y + dy * i;
					}
				}
				const friction = this.damping;
				for (let i = 1; i < this.points.length; i += 1) {
					const p = this.at(i);
					const vx = (p.x - p.px) * friction;
					const vy = (p.y - p.py) * friction;
					p.px = p.x;
					p.py = p.y;
					p.x += vx;
					p.y += vy + this.gravity * dtSq;
				}
				for (let iter = 0; iter < this.iterations; iter += 1) for (let i = 1; i < this.points.length; i += 1) {
					const a = this.at(i - 1);
					const b = this.at(i);
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const dist = Math.hypot(dx, dy) || .001;
					const diff = (dist - this.segmentLength) / dist;
					b.x -= dx * diff;
					b.y -= dy * diff;
				}
				for (let i = 1; i < this.points.length - 1; i += 1) {
					const p = this.at(i);
					const prev = this.at(i - 1);
					const next = this.at(i + 1);
					const s = this.stiffnessAt(i);
					const midX = (prev.x + next.x) * .5;
					const midY = (prev.y + next.y) * .5;
					p.x += (midX - p.x) * s;
					p.y += (midY - p.y) * s;
				}
				const tip = this.at(this.points.length - 1);
				const frameDt = Math.max(clamped, .001);
				const speed = Math.hypot((tip.x - tip.px) / frameDt, (tip.y - tip.py) / frameDt);
				this.tipSpeed += (speed - this.tipSpeed) * .2;
			}
		};
		//#endregion
		//#region \0dsh-css:/home/makuraly/deepseek-harness/packages/client/ui-ponytail/src/client/WhipDock.module.css.mjs
		const css = ".uTuufG_dock{user-select:none;justify-content:flex-end;padding:2px 4px;display:flex}.uTuufG_button,.uTuufG_buttonArmed{color:inherit;cursor:pointer;background:0 0;border:1px solid #8c8c8c73;border-radius:999px;align-items:center;gap:6px;padding:3px 10px;font-size:12px;line-height:1.4;transition:background-color .12s,border-color .12s,color .12s;display:inline-flex}.uTuufG_button:hover{background:#8c8c8c1f}.uTuufG_buttonArmed{color:#d97706;background:#b453092e;border-color:#d97706}.uTuufG_buttonArmed:hover{background:#b4530947}.uTuufG_overlay{pointer-events:none;z-index:2147483000;width:100vw;height:100vh;position:fixed;inset:0}";
		const tagId = "dsh-client-ui-ponytail/WhipDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-client-ui-ponytail";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WhipDock_module_css_default = {
			"dock": "uTuufG_dock",
			"button": "uTuufG_button",
			"buttonArmed": "uTuufG_buttonArmed",
			"overlay": "uTuufG_overlay"
		};
		//#endregion
		//#region src/client/WhipDock.tsx
		/**
		* Ponytail whip dock: a composer-dock toggle plus (while armed) a full-viewport
		* canvas overlay drawing a cursor-following rope whip. Clicking the
		* conversation transcript cracks the whip — the flick wave travels to the tip,
		* a synthesized crack plays, sparks spawn, and a hurry-up message is sent
		* through the session input machine. Pure easter egg: all state is
		* component-local, the overlay is a body portal, and no cordis service exists.
		*/
		/** Tip speed (px/s) above which a pending crack counts as snapped. */
		const CRACK_SPEED = 320;
		/** Safety window (ms): a flick that never snaps the tip fires anyway. */
		const CRACK_DEADLINE_MS = 450;
		/** Fixed handle direction in radians: 135° counter-clockwise from +x (up-left, second quadrant) on the screen plane. */
		const HANDLE_ANGLE = -(Math.PI * 3) / 4;
		/** True when the pointer landed in the transcript (scrollport, not the composer seat). */
		function isTranscriptTarget(target) {
			if (!(target instanceof Element)) return false;
			if (target.closest("[data-conversation-scroll]") === null) return false;
			return target.closest("[data-composer-seat]") === null;
		}
		/** Interpolate the tail stroke colour from handle brown to tip tan. */
		function whipColor(t) {
			return `rgb(${Math.round(107 + 109 * t)}, ${Math.round(68 + 108 * t)}, ${Math.round(35 + 87 * t)})`;
		}
		/**
		* Spawn sparks at the tip, play the crack, and send the next hurry-up line.
		* @param sim - live simulation (tip position source).
		* @param sparks - in-place spark pool.
		* @param now - frame timestamp for spark birth.
		* @param inputActions - session input write path (setDraft + submit).
		* @param lastHurryRef - rotation memory (never repeats the previous line).
		*/
		function fireCrack(sim, sparks, now, inputActions, lastHurryRef) {
			const rope = sim.rope();
			const tip = rope[rope.length - 1];
			if (tip === void 0) return;
			for (let i = 0; i < 18; i += 1) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 120 + Math.random() * 260;
				sparks.push({
					x: tip.x,
					y: tip.y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					bornAt: now,
					ttl: 220 + Math.random() * 180
				});
			}
			playCrack();
			const line = nextHurry(lastHurryRef.current);
			lastHurryRef.current = line;
			inputActions.setDraft(line);
			inputActions.submit();
		}
		/** Draw sparks, dropping expired ones (mutates the pool in place). */
		function drawSparks(ctx, sparks, now) {
			if (sparks.length === 0) return;
			for (let i = sparks.length - 1; i >= 0; i -= 1) {
				const s = sparks[i];
				if (s === void 0) continue;
				const age = now - s.bornAt;
				if (age > s.ttl) {
					sparks.splice(i, 1);
					continue;
				}
				ctx.globalAlpha = 1 - age / s.ttl;
				ctx.fillStyle = "#ffd98a";
				ctx.beginPath();
				ctx.arc(s.x + s.vx * age / 1e3, s.y + s.vy * age / 1e3, 1.6, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		}
		/** Render one frame of the whip onto the overlay canvas. */
		function draw(canvas, sim, sparks, now) {
			if (canvas === null) return;
			const dpr = window.devicePixelRatio || 1;
			const w = window.innerWidth;
			const h = window.innerHeight;
			const pw = Math.round(w * dpr);
			const ph = Math.round(h * dpr);
			if (canvas.width !== pw || canvas.height !== ph) {
				canvas.width = pw;
				canvas.height = ph;
			}
			const ctx = canvas.getContext("2d");
			if (ctx === null) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);
			const rope = sim.rope();
			const n = rope.length;
			const head = rope[0];
			const tip = rope[n - 1];
			if (head === void 0 || tip === void 0) return;
			const handleEnd = sim.handlePoints - 1;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			const handleTip = rope[handleEnd];
			if (handleTip !== void 0) {
				ctx.strokeStyle = "#3a2412";
				ctx.lineWidth = 8;
				ctx.beginPath();
				ctx.moveTo(head.x, head.y);
				ctx.lineTo(handleTip.x, handleTip.y);
				ctx.stroke();
			}
			for (let i = sim.handlePoints; i < n; i += 1) {
				const a = rope[i - 1];
				const b = rope[i];
				const t = (i - sim.handlePoints) / (n - sim.handlePoints);
				ctx.strokeStyle = whipColor(t);
				ctx.lineWidth = 5 * (1 - t) + 1.2;
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
			ctx.fillStyle = "#2b1a0d";
			ctx.beginPath();
			ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#e8c39a";
			ctx.beginPath();
			ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
			ctx.fill();
			drawSparks(ctx, sparks, now);
		}
		/**
		* Body-portal overlay: binds the global pointer/keyboard listeners, runs the
		* rAF loop, and owns the cursor: none swap for the armed lifetime.
		*/
		function WhipOverlay({ inputActions, onDisarm }) {
			const canvasRef = (0, react.useRef)(null);
			const lastHurryRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				const previousCursor = document.body.style.cursor;
				document.body.style.cursor = "none";
				const sim = new WhipSimulation({ handleAngle: HANDLE_ANGLE });
				sim.seed(window.innerWidth / 2, window.innerHeight / 2);
				const sparks = [];
				let pendingCrack = false;
				let pendingDeadline = 0;
				const onMove = (event) => {
					sim.targetX = event.clientX;
					sim.targetY = event.clientY;
				};
				const onDown = (event) => {
					if (event.button !== 0) return;
					if (!isTranscriptTarget(event.target)) return;
					sim.targetX = event.clientX;
					sim.targetY = event.clientY;
					sim.crackAt(event.clientX, event.clientY);
					pendingCrack = true;
					pendingDeadline = performance.now() + CRACK_DEADLINE_MS;
				};
				const onKey = (event) => {
					if (event.key === "Escape") onDisarm();
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerdown", onDown, true);
				window.addEventListener("keydown", onKey);
				let raf = 0;
				let last = performance.now();
				const frame = (now) => {
					const dt = (now - last) / 1e3;
					last = now;
					sim.step(dt);
					if (pendingCrack && (sim.tipSpeed > CRACK_SPEED || now > pendingDeadline)) {
						pendingCrack = false;
						fireCrack(sim, sparks, now, inputActions, lastHurryRef);
					}
					draw(canvasRef.current, sim, sparks, now);
					raf = requestAnimationFrame(frame);
				};
				raf = requestAnimationFrame(frame);
				return () => {
					cancelAnimationFrame(raf);
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerdown", onDown, true);
					window.removeEventListener("keydown", onKey);
					document.body.style.cursor = previousCursor;
				};
			}, [inputActions, onDisarm]);
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
				ref: canvasRef,
				className: WhipDock_module_css_default.overlay,
				"aria-hidden": "true"
			}), document.body);
		}
		/** The dock toggle: a small pill that arms/disarms the whip. */
		function WhipDock(props) {
			const { inputActions } = props;
			const [armed, setArmed] = (0, react.useState)(false);
			const toggle = (0, react.useCallback)(() => {
				setArmed((prev) => !prev);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WhipDock_module_css_default.dock,
				"data-ponytail-dock": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: armed ? WhipDock_module_css_default.buttonArmed : WhipDock_module_css_default.button,
					"data-ponytail-toggle": true,
					"aria-pressed": armed,
					title: armed ? "鞭子已就绪：点击对话区抽鞭催促；再次点击取消" : "鞭子模式：把鼠标变成鞭子，点击对话区抽鞭催促模型",
					onClick: toggle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "🪢"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: armed ? "鞭子就绪" : "鞭子" })]
				}), armed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WhipOverlay, {
					inputActions,
					onDisarm: toggle
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Services required before the dock entry can register. */
		const inject = ["slots"];
		/**
		* Client plugin body: register the whip toggle into the composer dock.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "ponytail",
				order: 20
			}, WhipDock));
		}
		//#endregion
		exports.HURRIES = HURRIES;
		exports.WhipDock = WhipDock;
		exports.WhipSimulation = WhipSimulation;
		exports.apply = apply;
		exports.inject = inject;
		exports.nextHurry = nextHurry;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map