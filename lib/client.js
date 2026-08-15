window.__ModuleLoader__.load({
	id: "dsh-client-ui-ponytail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		//#region src/client/pet.ts
		/**
		* Whip-triggered DeepSeek Pet handoff.
		*
		* A whip crack dispatches one bare `deepseek-pet:whip` CustomEvent. The
		* deepseek-pet plugin owns the whole response: it listens for the event,
		* picks one of its own reaction poses (`public/defense.png`,
		* `public/frightened.png`, `public/giggle.png`), shows it as the pet sprite,
		* and speaks the matching line in its `.dsh-live2d-bubble`.
		*/
		/** CustomEvent name consumed by the deepseek-pet plugin. */
		const PET_WHIP_EVENT = "deepseek-pet:whip";
		/** Notify the deepseek-pet plugin that a whip crack just happened. */
		function triggerPetWhip() {
			window.dispatchEvent(new CustomEvent(PET_WHIP_EVENT));
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
		const css$1 = ".uTuufG_dock{user-select:none;justify-content:flex-end;padding:2px 4px;display:flex}.uTuufG_button,.uTuufG_buttonArmed{color:inherit;cursor:pointer;background:0 0;border:1px solid #8c8c8c73;border-radius:999px;align-items:center;gap:6px;padding:3px 10px;font-size:12px;line-height:1.4;transition:background-color .12s,border-color .12s,color .12s;display:inline-flex}.uTuufG_button:hover{background:#8c8c8c1f}.uTuufG_buttonArmed{color:#d97706;background:#b453092e;border-color:#d97706}.uTuufG_buttonArmed:hover{background:#b4530947}.uTuufG_overlay{pointer-events:none;z-index:2147483000;width:100vw;height:100vh;position:fixed;inset:0}";
		const tagId$1 = "dsh-client-ui-ponytail/WhipDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-client-ui-ponytail";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var WhipDock_module_css_default = {
			"buttonArmed": "uTuufG_buttonArmed",
			"button": "uTuufG_button",
			"dock": "uTuufG_dock",
			"overlay": "uTuufG_overlay"
		};
		//#endregion
		//#region src/client/WhipDock.tsx
		/**
		* Ponytail whip dock: a composer-dock toggle plus (while armed) a full-viewport
		* canvas overlay drawing a cursor-following rope whip. Clicking the
		* conversation transcript cracks the whip — the flick wave travels to the tip,
		* a synthesized crack plays, sparks spawn, a hurry-up message is sent
		* through the session input machine, and the DeepSeek Pet is notified via the
		* `deepseek-pet:whip` event. Pure easter egg: all state is
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
		* Spawn sparks at the tip, play the crack, notify the DeepSeek Pet, and send
		* the next hurry-up line.
		* @param sim - live simulation (tip position source).
		* @param sparks - in-place spark pool.
		* @param now - frame timestamp for spark birth.
		* @param inputActions - session input write path (setDraft + submit).
		* @param lastHurryRef - rotation memory (never repeats the previous line).
		* @param pickPrompt - settings-backed prompt picker; '' skips sending.
		*/
		function fireCrack(sim, sparks, now, inputActions, lastHurryRef, pickPrompt) {
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
			triggerPetWhip();
			const line = pickPrompt(lastHurryRef.current);
			if (line === "") return;
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
		function WhipOverlay({ inputActions, pickPrompt, onDisarm }) {
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
						fireCrack(sim, sparks, now, inputActions, lastHurryRef, pickPrompt);
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
			}, [
				inputActions,
				pickPrompt,
				onDisarm
			]);
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
				ref: canvasRef,
				className: WhipDock_module_css_default.overlay,
				"aria-hidden": "true"
			}), document.body);
		}
		/** The dock toggle: a small pill that arms/disarms the whip. */
		function WhipDock(props) {
			const { inputActions, pickPrompt } = props;
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
					pickPrompt,
					onDisarm: toggle
				})]
			});
		}
		//#endregion
		//#region src/ponytail-settings.ts
		/**
		* Durable settings contract shared by the ponytail plugin's node and browser
		* halves: the settings namespace, the grouped hurry-prompt model, the shipped
		* defaults, and the pure selection/validation helpers.
		*
		* The node half turns this shape into the registered schemastery schema; the
		* browser half validates against the same plain-data rules when it narrows the
		* wire section. This file must stay free of Host-only or browser-only imports
		* so both compilation faces can include it.
		*/
		/** Settings namespace owned by this plugin (lowercase kebab-case). */
		const PONYTAIL_SETTINGS_NAMESPACE = "dsh-client-ui-ponytail";
		/** Scalar field inside the namespace section that carries the prompt groups. */
		const PONYTAIL_GROUPS_FIELD = "groups";
		/** Shipped hurry-up lines (the pre-settings rotation pool). */
		const DEFAULT_HURRY_LINES = [
			"⏩ 快马加鞭！请立即收敛思路，跳过无关展开，直接给出最终结果。",
			"🏇 驾！别再磨蹭了，聚焦最小可行实现，马上交付可运行版本。",
			"⚡ 提速！停止过度思考，先跑通主流程，其余细节留到后续再说。",
			"🔥 抓紧时间！放弃可选验证和锦上添花，直接输出结论。",
			"🪢 啪！快进到答案，不要复述思路，直接给出最终代码或结论。",
			"💨 加速加速！压缩解释，直接产出结果，别让用户再等。"
		];
		/** Stable ids for the built-in prompts so edits/deletes never depend on array indices. */
		const DEFAULT_PROMPT_IDS = [
			"default-fast",
			"default-ride",
			"default-speed",
			"default-urgent",
			"default-snap",
			"default-boost"
		];
		/**
		* Shipped section: one enabled group carrying the original hurry-up lines.
		* The schema default resolves to this when the user layer has no `groups`.
		*/
		const DEFAULT_PONYTAIL_SETTINGS = { groups: [{
			id: "default",
			name: "默认催促",
			enabled: true,
			prompts: DEFAULT_HURRY_LINES.map((text, index) => ({
				id: DEFAULT_PROMPT_IDS[index] ?? `default-${index + 1}`,
				text
			}))
		}] };
		/**
		* Clone one settings value into mutable plain data. Defaults are frozen, so
		* every editor starts from a detached copy and can never mutate the shipped
		* fallback in place.
		*/
		function clonePonytailSettings(settings) {
			return { groups: settings.groups.map((group) => ({
				id: group.id,
				name: group.name,
				enabled: group.enabled,
				prompts: group.prompts.map((prompt) => ({
					id: prompt.id,
					text: prompt.text
				}))
			})) };
		}
		/**
		* Trim one prompt for the rotation. Empty/whitespace-only prompts never get
		* sent, but they remain editable in the page until removed.
		*/
		function promptText(prompt) {
			return prompt.text.trim();
		}
		/**
		* All sendable prompt texts in group-then-row order, from enabled groups only.
		*/
		function collectPromptTexts(settings) {
			const texts = [];
			for (const group of settings.groups) {
				if (!group.enabled) continue;
				for (const prompt of group.prompts) {
					const text = promptText(prompt);
					if (text !== "") texts.push(text);
				}
			}
			return texts;
		}
		/**
		* Pick the next hurry-up line from one settings value, never repeating the
		* immediately previous line. Returns the empty string when the user disabled
		* or deleted every sendable prompt (the whip then stays silent).
		* @param settings - current settings value.
		* @param previous - the last line sent, if any.
		* @returns the next line, or '' when no prompt is sendable.
		*/
		function nextPromptFromSettings(settings, previous) {
			const pool = collectPromptTexts(settings);
			if (pool.length === 0) return "";
			const candidates = pool.filter((line) => line !== previous);
			if (candidates.length === 0) return pool[0] ?? "";
			return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? "";
		}
		/**
		* Pick the next line from a literal pool (used by the legacy `nextHurry`
		* export and by tests that exercise the rotation itself).
		*/
		function nextPromptFromTexts(texts, previous) {
			const pool = texts.filter((text) => text.trim() !== "");
			if (pool.length === 0) return "";
			const candidates = pool.filter((line) => line !== previous);
			if (candidates.length === 0) return pool[0] ?? "";
			return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? "";
		}
		/** Generate a collision-resistant-enough id for user-created groups/prompts. */
		function newPonytailId(prefix) {
			return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		}
		/**
		* Narrow an unknown wire value to {@link PonytailSettings} with the same
		* runtime rules the schema enforces (minus cross-field uniqueness, which the
		* editor never produces). Returns undefined so the client keeps its last good
		* value when an externally edited document is malformed.
		*/
		function parsePonytailSettings(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const rawGroups = value.groups;
			if (!Array.isArray(rawGroups)) return void 0;
			const groups = [];
			for (const rawGroup of rawGroups) {
				if (typeof rawGroup !== "object" || rawGroup === null || Array.isArray(rawGroup)) return void 0;
				const candidate = rawGroup;
				if (typeof candidate["id"] !== "string" || candidate["id"] === "") return void 0;
				if (typeof candidate["name"] !== "string") return void 0;
				if (candidate["enabled"] !== void 0 && typeof candidate["enabled"] !== "boolean") return void 0;
				if (!Array.isArray(candidate["prompts"])) return void 0;
				const prompts = [];
				for (const rawPrompt of candidate["prompts"]) {
					if (typeof rawPrompt !== "object" || rawPrompt === null || Array.isArray(rawPrompt)) return void 0;
					const prompt = rawPrompt;
					if (typeof prompt["id"] !== "string" || prompt["id"] === "") return void 0;
					if (typeof prompt["text"] !== "string") return void 0;
					prompts.push({
						id: prompt["id"],
						text: prompt["text"]
					});
				}
				groups.push({
					id: candidate["id"],
					name: candidate["name"],
					enabled: candidate["enabled"] !== false,
					prompts
				});
			}
			return { groups };
		}
		//#endregion
		//#region \0dsh-css:/home/makuraly/deepseek-harness/packages/client/ui-ponytail/src/client/PonytailSettingsSection.module.css.mjs
		const css = ".R7ek2q_section{flex-direction:column;gap:12px;min-width:0;display:flex}.R7ek2q_heading{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.R7ek2q_title{margin:0;font-size:18px;font-weight:650;line-height:1.35}.R7ek2q_intro{color:var(--dsw-alias-label-secondary,#808080f2);max-width:620px;margin:6px 0 0;font-size:13px;line-height:1.6}.R7ek2q_headingActions{flex:none;align-items:center;gap:8px;display:inline-flex}.R7ek2q_groups{flex-direction:column;gap:10px;display:flex}.R7ek2q_group{border:1px solid var(--dsw-alias-border-l1,#8c8c8c47);background:var(--dsw-alias-bg-layer-1,transparent);border-radius:10px;overflow:hidden}.R7ek2q_summary{cursor:pointer;user-select:none;align-items:center;gap:10px;min-height:40px;padding:8px 12px;list-style:none;display:flex}.R7ek2q_summary::-webkit-details-marker{display:none}.R7ek2q_groupEnabled{accent-color:#d97706;cursor:pointer;flex:none;width:15px;height:15px}.R7ek2q_groupName{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650;overflow:hidden}.R7ek2q_groupNameInput{min-width:120px;color:inherit;font:inherit;background:0 0;border:1px solid #8c8c8c73;border-radius:6px;flex:0 260px;padding:4px 8px}.R7ek2q_groupCount{color:var(--dsw-alias-label-secondary,#808080f2);flex:none;margin-left:auto;font-size:12px}.R7ek2q_summaryActions{flex:none;align-items:center;gap:6px;display:inline-flex}.R7ek2q_groupBody{border-top:1px solid var(--dsw-alias-border-l1,#8c8c8c2e);flex-direction:column;gap:10px;padding:10px 12px 12px 37px;display:flex}.R7ek2q_prompts{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}.R7ek2q_promptRow{background:var(--dsw-alias-bg-layer-2,#8080800a);border:1px solid #8c8c8c38;border-radius:8px;padding:8px 10px}.R7ek2q_promptView{flex-direction:column;gap:8px;display:flex}.R7ek2q_promptText{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:13px;line-height:1.6}.R7ek2q_promptTextEmpty{color:var(--dsw-alias-label-secondary,#808080f2);font-style:italic}.R7ek2q_promptFooter{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;display:flex}.R7ek2q_groupSelectLabel{color:var(--dsw-alias-label-secondary,#808080f2);align-items:center;gap:6px;font-size:12px;display:inline-flex}.R7ek2q_select{max-width:240px;color:inherit;font:inherit;background:0 0;border:1px solid #8c8c8c73;border-radius:6px;padding:3px 6px}.R7ek2q_promptEditor{flex-direction:column;gap:8px;display:flex}.R7ek2q_textarea{resize:vertical;width:100%;min-height:52px;color:inherit;font:inherit;box-sizing:border-box;background:0 0;border:1px solid #8c8c8c73;border-radius:8px;padding:7px 9px;font-size:13px;line-height:1.6}.R7ek2q_textarea:focus,.R7ek2q_textInput:focus,.R7ek2q_select:focus,.R7ek2q_groupNameInput:focus{outline-offset:1px;border-color:#d97706;outline:2px solid #d9770673}.R7ek2q_textInput{min-width:160px;color:inherit;font:inherit;background:0 0;border:1px solid #8c8c8c73;border-radius:8px;flex:320px;padding:6px 10px}.R7ek2q_inlineForm{flex-wrap:wrap;align-items:flex-start;gap:8px;display:flex}.R7ek2q_rowActions{flex:none;align-items:center;gap:6px;display:inline-flex}.R7ek2q_primaryButton,.R7ek2q_secondaryButton,.R7ek2q_dangerButton,.R7ek2q_addPromptButton{color:inherit;cursor:pointer;background:0 0;border:1px solid #8c8c8c73;border-radius:7px;align-items:center;gap:5px;padding:5px 10px;font-size:12px;line-height:1.45;transition:background-color .12s,border-color .12s,color .12s;display:inline-flex}.R7ek2q_primaryButton{color:#d97706;background:#b4530924;border-color:#d97706}.R7ek2q_primaryButton:hover:not(:disabled){background:#b4530942}.R7ek2q_secondaryButton:hover:not(:disabled){background:#8c8c8c1f}.R7ek2q_dangerButton{color:#e05b52;border-color:#dc50468c}.R7ek2q_dangerButton:hover:not(:disabled){background:#dc50461f}.R7ek2q_primaryButton:disabled,.R7ek2q_secondaryButton:disabled,.R7ek2q_dangerButton:disabled,.R7ek2q_addPromptButton:disabled{opacity:.5;cursor:default}.R7ek2q_addPromptButton{color:var(--dsw-alias-label-secondary,#808080f2);border-style:dashed;align-self:flex-start}.R7ek2q_addPromptButton:hover{background:#8c8c8c1a}.R7ek2q_empty,.R7ek2q_emptyPrompts,.R7ek2q_statusLine,.R7ek2q_notice,.R7ek2q_error{margin:0;font-size:13px;line-height:1.6}.R7ek2q_empty,.R7ek2q_emptyPrompts,.R7ek2q_statusLine{color:var(--dsw-alias-label-secondary,#808080f2)}.R7ek2q_notice{color:#b45309}.R7ek2q_error{color:#e05b52}";
		const tagId = "dsh-client-ui-ponytail/PonytailSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-client-ui-ponytail";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PonytailSettingsSection_module_css_default = {
			"prompts": "R7ek2q_prompts",
			"group": "R7ek2q_group",
			"groupCount": "R7ek2q_groupCount",
			"select": "R7ek2q_select",
			"emptyPrompts": "R7ek2q_emptyPrompts",
			"groupNameInput": "R7ek2q_groupNameInput",
			"inlineForm": "R7ek2q_inlineForm",
			"title": "R7ek2q_title",
			"promptTextEmpty": "R7ek2q_promptTextEmpty",
			"intro": "R7ek2q_intro",
			"groupEnabled": "R7ek2q_groupEnabled",
			"rowActions": "R7ek2q_rowActions",
			"secondaryButton": "R7ek2q_secondaryButton",
			"dangerButton": "R7ek2q_dangerButton",
			"groupName": "R7ek2q_groupName",
			"promptEditor": "R7ek2q_promptEditor",
			"groups": "R7ek2q_groups",
			"empty": "R7ek2q_empty",
			"error": "R7ek2q_error",
			"addPromptButton": "R7ek2q_addPromptButton",
			"headingActions": "R7ek2q_headingActions",
			"promptView": "R7ek2q_promptView",
			"textInput": "R7ek2q_textInput",
			"section": "R7ek2q_section",
			"promptFooter": "R7ek2q_promptFooter",
			"primaryButton": "R7ek2q_primaryButton",
			"notice": "R7ek2q_notice",
			"promptText": "R7ek2q_promptText",
			"summaryActions": "R7ek2q_summaryActions",
			"summary": "R7ek2q_summary",
			"groupBody": "R7ek2q_groupBody",
			"promptRow": "R7ek2q_promptRow",
			"statusLine": "R7ek2q_statusLine",
			"heading": "R7ek2q_heading",
			"groupSelectLabel": "R7ek2q_groupSelectLabel",
			"textarea": "R7ek2q_textarea"
		};
		//#endregion
		//#region src/client/PonytailSettingsSection.tsx
		/**
		* Ponytail settings section: user-editable, grouped hurry-up prompts.
		* Registers into `settings.section`, so it renders as one page of the dsh
		* settings panel sidebar. Editing state is component-local; every committed
		* change goes through {@link PonytailSettingsController}, which persists to
		* the Host settings document when available.
		*/
		/** Number of non-empty prompts one group would actually send. */
		function sendableCount(group) {
			return group.prompts.reduce((count, prompt) => count + (promptText(prompt) === "" ? 0 : 1), 0);
		}
		/**
		* Render the Ponytail settings page.
		* @param props - slot-composed props (inject face arrives flat).
		*/
		function PonytailSettingsSection({ controller }) {
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
			const [addingGroup, setAddingGroup] = (0, react.useState)(false);
			const [newGroupName, setNewGroupName] = (0, react.useState)("");
			const [editingGroup, setEditingGroup] = (0, react.useState)(void 0);
			const [groupNameDraft, setGroupNameDraft] = (0, react.useState)("");
			const [editingPrompt, setEditingPrompt] = (0, react.useState)(void 0);
			const [promptDraft, setPromptDraft] = (0, react.useState)("");
			const [addingPromptFor, setAddingPromptFor] = (0, react.useState)(void 0);
			const [newPromptDraft, setNewPromptDraft] = (0, react.useState)("");
			const { settings, status, writable, saving, error } = snapshot;
			const startEditPrompt = (groupId, promptId, text) => {
				setAddingPromptFor(void 0);
				setEditingPrompt({
					groupId,
					promptId,
					text
				});
				setPromptDraft(text);
			};
			const savePromptEdit = () => {
				if (editingPrompt === void 0) return;
				controller.updatePrompt(editingPrompt.groupId, editingPrompt.promptId, promptDraft);
				setEditingPrompt(void 0);
				setPromptDraft("");
			};
			const saveAddedPrompt = (groupId) => {
				controller.addPrompt(groupId, newPromptDraft);
				setAddingPromptFor(void 0);
				setNewPromptDraft("");
			};
			const startEditGroup = (groupId, name) => {
				setEditingGroup({
					groupId,
					name
				});
				setGroupNameDraft(name);
			};
			const saveGroupName = () => {
				if (editingGroup === void 0) return;
				controller.renameGroup(editingGroup.groupId, groupNameDraft);
				setEditingGroup(void 0);
				setGroupNameDraft("");
			};
			const saveNewGroup = () => {
				controller.addGroup(newGroupName);
				setAddingGroup(false);
				setNewGroupName("");
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PonytailSettingsSection_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PonytailSettingsSection_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: PonytailSettingsSection_module_css_default.title,
							children: "Ponytail 提示词"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PonytailSettingsSection_module_css_default.intro,
							children: "自定义抽鞭时发送给模型的催促提示词。按分组整理；抽鞭时会从所有启用分组中随机挑选一条。"
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PonytailSettingsSection_module_css_default.headingActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PonytailSettingsSection_module_css_default.secondaryButton,
								disabled: saving,
								onClick: () => {
									if (window.confirm("恢复为默认提示词？当前的所有分组和编辑都会被覆盖。")) controller.resetToDefaults();
								},
								children: "恢复默认"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PonytailSettingsSection_module_css_default.primaryButton,
								disabled: saving,
								onClick: () => {
									setAddingGroup(true);
									setNewGroupName("");
								},
								children: "＋ 新建分组"
							})]
						})]
					}),
					status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PonytailSettingsSection_module_css_default.statusLine,
						children: "正在读取设置…"
					}) : null,
					!writable && status !== "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PonytailSettingsSection_module_css_default.notice,
						children: "设置存储不可写：本次修改只在当前页面内生效。"
					}) : null,
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: PonytailSettingsSection_module_css_default.error,
						role: "alert",
						children: ["保存失败：", error]
					}) : null,
					saving ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PonytailSettingsSection_module_css_default.statusLine,
						role: "status",
						children: "正在保存…"
					}) : null,
					addingGroup ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PonytailSettingsSection_module_css_default.inlineForm,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: PonytailSettingsSection_module_css_default.textInput,
								value: newGroupName,
								autoFocus: true,
								placeholder: "分组名称，例如：通用、代码、文档",
								"aria-label": "新分组名称",
								onChange: (event) => {
									setNewGroupName(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter") saveNewGroup();
									if (event.key === "Escape") setAddingGroup(false);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PonytailSettingsSection_module_css_default.primaryButton,
								onClick: saveNewGroup,
								children: "创建"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PonytailSettingsSection_module_css_default.secondaryButton,
								onClick: () => setAddingGroup(false),
								children: "取消"
							})
						]
					}) : null,
					settings.groups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PonytailSettingsSection_module_css_default.empty,
						children: "还没有分组。点击「新建分组」创建第一个分组，再往里面添加提示词。"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: PonytailSettingsSection_module_css_default.groups,
						children: settings.groups.map((group) => {
							const editingName = editingGroup?.groupId === group.id;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: PonytailSettingsSection_module_css_default.group,
								open: true,
								"data-group-id": group.id,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
									className: PonytailSettingsSection_module_css_default.summary,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											className: PonytailSettingsSection_module_css_default.groupEnabled,
											checked: group.enabled,
											"aria-label": `启用分组「${group.name}」`,
											title: group.enabled ? "点击停用该分组" : "点击启用该分组",
											onClick: (event) => {
												event.stopPropagation();
											},
											onChange: (event) => {
												controller.setGroupEnabled(group.id, event.target.checked);
											}
										}),
										editingName ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: PonytailSettingsSection_module_css_default.groupNameInput,
											value: groupNameDraft,
											autoFocus: true,
											"aria-label": "分组名称",
											onClick: (event) => {
												event.stopPropagation();
											},
											onChange: (event) => {
												setGroupNameDraft(event.target.value);
											},
											onKeyDown: (event) => {
												if (event.key === "Enter") saveGroupName();
												if (event.key === "Escape") setEditingGroup(void 0);
											}
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: PonytailSettingsSection_module_css_default.groupName,
											children: group.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: PonytailSettingsSection_module_css_default.groupCount,
											children: [
												sendableCount(group),
												" / ",
												group.prompts.length,
												" 条可发送"
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: PonytailSettingsSection_module_css_default.summaryActions,
											children: editingName ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.secondaryButton,
												onClick: (event) => {
													event.preventDefault();
													saveGroupName();
												},
												children: "保存"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.secondaryButton,
												onClick: (event) => {
													event.preventDefault();
													setEditingGroup(void 0);
												},
												children: "取消"
											})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.secondaryButton,
												onClick: (event) => {
													event.preventDefault();
													startEditGroup(group.id, group.name);
												},
												children: "重命名"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.dangerButton,
												onClick: (event) => {
													event.preventDefault();
													if (window.confirm(`删除分组「${group.name}」及其中的 ${group.prompts.length} 条提示词？`)) {
														controller.deleteGroup(group.id);
														if (editingPrompt?.groupId === group.id) setEditingPrompt(void 0);
														if (addingPromptFor === group.id) setAddingPromptFor(void 0);
													}
												},
												children: "删除分组"
											})] })
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: PonytailSettingsSection_module_css_default.groupBody,
									children: [group.prompts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: PonytailSettingsSection_module_css_default.emptyPrompts,
										children: "该分组还没有提示词。"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: PonytailSettingsSection_module_css_default.prompts,
										children: group.prompts.map((prompt) => {
											const editing = editingPrompt !== void 0 && editingPrompt.groupId === group.id && editingPrompt.promptId === prompt.id;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
												className: PonytailSettingsSection_module_css_default.promptRow,
												"data-prompt-id": prompt.id,
												children: editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: PonytailSettingsSection_module_css_default.promptEditor,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
														className: PonytailSettingsSection_module_css_default.textarea,
														value: promptDraft,
														autoFocus: true,
														rows: 2,
														"aria-label": "提示词内容",
														onChange: (event) => {
															setPromptDraft(event.target.value);
														}
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: PonytailSettingsSection_module_css_default.rowActions,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: PonytailSettingsSection_module_css_default.primaryButton,
															onClick: savePromptEdit,
															children: "保存"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: PonytailSettingsSection_module_css_default.secondaryButton,
															onClick: () => {
																setEditingPrompt(void 0);
																setPromptDraft("");
															},
															children: "取消"
														})]
													})]
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: PonytailSettingsSection_module_css_default.promptView,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: promptText(prompt) === "" ? `${PonytailSettingsSection_module_css_default.promptText} ${PonytailSettingsSection_module_css_default.promptTextEmpty}` : PonytailSettingsSection_module_css_default.promptText,
														children: promptText(prompt) === "" ? "空提示词（不会被发送）" : promptText(prompt)
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: PonytailSettingsSection_module_css_default.promptFooter,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															className: PonytailSettingsSection_module_css_default.groupSelectLabel,
															children: ["分组", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
																className: PonytailSettingsSection_module_css_default.select,
																value: group.id,
																"aria-label": "提示词所属分组",
																onChange: (event) => {
																	controller.movePrompt(group.id, prompt.id, event.target.value);
																},
																children: settings.groups.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
																	value: candidate.id,
																	children: [candidate.name, candidate.enabled ? "" : "（停用）"]
																}, candidate.id))
															})]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: PonytailSettingsSection_module_css_default.rowActions,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: PonytailSettingsSection_module_css_default.secondaryButton,
																onClick: () => startEditPrompt(group.id, prompt.id, prompt.text),
																children: "编辑"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: PonytailSettingsSection_module_css_default.dangerButton,
																onClick: () => {
																	if (window.confirm("删除这条提示词？")) controller.deletePrompt(group.id, prompt.id);
																},
																children: "删除"
															})]
														})]
													})]
												})
											}, prompt.id);
										})
									}), addingPromptFor === group.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: PonytailSettingsSection_module_css_default.inlineForm,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: PonytailSettingsSection_module_css_default.textarea,
												value: newPromptDraft,
												autoFocus: true,
												rows: 2,
												placeholder: "输入抽鞭时发送给模型的提示词",
												"aria-label": "新提示词内容",
												onChange: (event) => {
													setNewPromptDraft(event.target.value);
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.primaryButton,
												onClick: () => saveAddedPrompt(group.id),
												children: "添加"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: PonytailSettingsSection_module_css_default.secondaryButton,
												onClick: () => {
													setAddingPromptFor(void 0);
													setNewPromptDraft("");
												},
												children: "取消"
											})
										]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: PonytailSettingsSection_module_css_default.addPromptButton,
										onClick: () => {
											setEditingPrompt(void 0);
											setAddingPromptFor(group.id);
											setNewPromptDraft("");
										},
										children: "＋ 添加提示词"
									})]
								})]
							}, group.id);
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/settings-controller.ts
		/** Human-readable failure for the settings page notice. */
		function describeError(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Single owner of effective prompt settings and the Host write path.
		* Constructed once per plugin apply (never at module scope).
		*/
		var PonytailSettingsController = class {
			host;
			listeners = /* @__PURE__ */ new Set();
			snapshot = {
				status: "loading",
				settings: clonePonytailSettings(DEFAULT_PONYTAIL_SETTINGS),
				writable: false,
				saving: false,
				error: void 0,
				revision: 0
			};
			/**
			* @param host - settings-namespace scope bound by the owning plugin fiber.
			*/
			constructor(host) {
				this.host = host;
			}
			/** Subscribe to snapshot replacements (stable bound callbacks for uSES). */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** Current immutable snapshot (stable reference until the next publish). */
			getSnapshot = () => this.snapshot;
			/**
			* Attach to the Host scope: adopt its current value now and on every push.
			* @returns the disposer removing the subscription (called from ctx.effect).
			*/
			attach() {
				const dispose = this.host.subscribe(() => {
					this.adopt();
				});
				this.adopt();
				return dispose;
			}
			/** Pick the next hurry line for a whip crack, honoring user edits. */
			nextPrompt(previous) {
				return nextPromptFromSettings(this.snapshot.settings, previous);
			}
			/** Add one group and return its new id. */
			addGroup(name) {
				const cleanName = name.trim();
				const group = {
					id: newPonytailId("group"),
					name: cleanName === "" ? "未命名分组" : cleanName,
					enabled: true,
					prompts: []
				};
				this.commit({ groups: [...this.snapshot.settings.groups, group] });
				return group.id;
			}
			/** Rename a group; blank names fall back to a placeholder. */
			renameGroup(groupId, name) {
				this.commit({ groups: this.snapshot.settings.groups.map((group) => group.id === groupId ? {
					...group,
					name: name.trim() === "" ? "未命名分组" : name.trim()
				} : group) });
			}
			/** Enable/disable one group in the whip-crack rotation. */
			setGroupEnabled(groupId, enabled) {
				this.commit({ groups: this.snapshot.settings.groups.map((group) => group.id === groupId ? {
					...group,
					enabled
				} : group) });
			}
			/** Delete a group and every prompt inside it. */
			deleteGroup(groupId) {
				this.commit({ groups: this.snapshot.settings.groups.filter((group) => group.id !== groupId) });
			}
			/** Add a prompt to one group; blank text is kept for inline editing and never sent. */
			addPrompt(groupId, text) {
				const settings = this.snapshot.settings;
				if (!settings.groups.some((group) => group.id === groupId)) return;
				this.commit({ groups: settings.groups.map((group) => group.id === groupId ? {
					...group,
					prompts: [...group.prompts, {
						id: newPonytailId("prompt"),
						text
					}]
				} : group) });
			}
			/** Replace one prompt's text. */
			updatePrompt(groupId, promptId, text) {
				this.commit({ groups: this.snapshot.settings.groups.map((group) => group.id === groupId ? {
					...group,
					prompts: group.prompts.map((prompt) => prompt.id === promptId ? {
						...prompt,
						text
					} : prompt)
				} : group) });
			}
			/** Delete one prompt. */
			deletePrompt(groupId, promptId) {
				this.commit({ groups: this.snapshot.settings.groups.map((group) => group.id === groupId ? {
					...group,
					prompts: group.prompts.filter((prompt) => prompt.id !== promptId)
				} : group) });
			}
			/** Move one prompt into another group (also its "分组" reassignment). */
			movePrompt(fromGroupId, promptId, toGroupId) {
				if (fromGroupId === toGroupId) return;
				const groups = this.snapshot.settings.groups;
				const from = groups.find((group) => group.id === fromGroupId);
				const prompt = from?.prompts.find((candidate) => candidate.id === promptId);
				if (from === void 0 || prompt === void 0) return;
				if (!groups.some((group) => group.id === toGroupId)) return;
				this.commit({ groups: groups.map((group) => {
					if (group.id === fromGroupId) return {
						...group,
						prompts: group.prompts.filter((candidate) => candidate.id !== promptId)
					};
					if (group.id === toGroupId) return {
						...group,
						prompts: [...group.prompts, { ...prompt }]
					};
					return group;
				}) });
			}
			/** Reset to the shipped default section (unset the user override). */
			resetToDefaults() {
				const defaults = clonePonytailSettings(DEFAULT_PONYTAIL_SETTINGS);
				this.publish({
					settings: defaults,
					saving: true,
					error: void 0
				});
				if (!this.snapshot.writable) {
					this.publish({ saving: false });
					return;
				}
				this.host.unset(PONYTAIL_GROUPS_FIELD).then(() => {
					this.publish({
						saving: false,
						error: void 0
					});
				}, (error) => {
					this.publish({
						saving: false,
						error: describeError(error)
					});
				});
			}
			/**
			* Adopt a pushed Host value, keeping in-flight edit state. A malformed or
			* still-loading section keeps the current effective settings.
			*/
			adopt() {
				const host = this.host.getSnapshot();
				const settings = host.value === void 0 ? this.snapshot.settings : clonePonytailSettings(host.value);
				this.publish({
					status: host.status,
					settings,
					writable: host.status === "ready" && host.writable
				});
			}
			/**
			* Publish one optimistic edit locally, then persist when the transport
			* allows it. Rapid edits queue on the Host scope in call order; only the
			* latest snapshot is authoritative for the picker.
			*/
			commit(next) {
				const settings = clonePonytailSettings(next);
				this.publish({
					settings,
					saving: true,
					error: void 0
				});
				if (!this.snapshot.writable) {
					this.publish({ saving: false });
					return;
				}
				this.host.set(PONYTAIL_GROUPS_FIELD, settings.groups).then(() => {
					this.publish({
						saving: false,
						error: void 0
					});
				}, (error) => {
					this.publish({
						saving: false,
						error: describeError(error)
					});
				});
			}
			/** Swap in a new immutable snapshot and notify subscribers. */
			publish(patch) {
				this.snapshot = {
					...this.snapshot,
					...patch,
					revision: this.snapshot.revision + 1
				};
				for (const listener of [...this.listeners]) listener();
			}
		};
		//#endregion
		//#region src/client/hurry.ts
		/**
		* Hurry-up instructions the whip sends to the model on each crack. These are
		* model-facing content (delivered as an ordinary user message), not UI copy,
		* so they stay literal data rather than a locale dictionary.
		*
		* `HURRIES` / `nextHurry` are the legacy literal-pool face; the live whip path
		* consumes the user-editable settings through
		* {@link PonytailSettingsController.nextPrompt}.
		*/
		/** The shipped rotation pool of hurry-up lines. */
		const HURRIES = DEFAULT_HURRY_LINES;
		/**
		* Pick the next hurry line from the shipped pool, never repeating the
		* immediately previous one.
		* @param previous - the last line sent, if any.
		* @returns a line from {@link HURRIES}.
		*/
		function nextHurry(previous) {
			return nextPromptFromTexts(HURRIES, previous);
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* Services required before either registration can run. The target slots are
		* declared by ui-conversation / ui-settings-general; `connection`, `remote`,
		* and `settingsScope` arrive through the packages listed in dsh.client.inject.
		*/
		const inject = [
			"slots",
			"connection",
			"remote",
			"settingsScope"
		];
		/**
		* Client plugin body: register the whip toggle into the composer dock and the
		* prompt editor into the settings panel sidebar, both sharing one settings
		* controller.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const controller = new PonytailSettingsController(ctx.settingsScope.bind({
				namespace: PONYTAIL_SETTINGS_NAMESPACE,
				decode: parsePonytailSettings
			}));
			ctx.effect(() => controller.attach(), "dsh-client-ui-ponytail: settings scope adoption");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "ponytail",
				order: 20,
				inject: () => ({ pickPrompt: (previous) => controller.nextPrompt(previous) })
			}, WhipDock));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "ponytail",
				order: 30,
				label: "Ponytail（鞭子）",
				inject: () => ({ controller })
			}, PonytailSettingsSection));
		}
		//#endregion
		exports.HURRIES = HURRIES;
		exports.PET_WHIP_EVENT = PET_WHIP_EVENT;
		exports.PonytailSettingsController = PonytailSettingsController;
		exports.PonytailSettingsSection = PonytailSettingsSection;
		exports.WhipDock = WhipDock;
		exports.WhipSimulation = WhipSimulation;
		exports.apply = apply;
		exports.inject = inject;
		exports.nextHurry = nextHurry;
		exports.triggerPetWhip = triggerPetWhip;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map