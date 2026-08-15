import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region lib/types/ponytail-settings.js
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
//#endregion
//#region lib/types/index.js
/**
* Ponytail whip plugin, node half. Registers the durable settings namespace
* that backs the browser-side "鞭子设置" settings panel: user-editable,
* grouped hurry-up prompts. The browser half ships via exports["./client"],
* discovered through the package.json dsh.client declaration.
*/
/**
* Durable schema for one prompt row. Blank text is allowed so an added row
* can wait for its wording; the picker skips blank rows.
*/
const PonytailPromptSchema = z.object({
	id: z.string().min(1).max(128),
	text: z.string().max(4e3)
});
/** Durable schema for one group. */
const PonytailGroupSchema = z.object({
	id: z.string().min(1).max(128),
	name: z.string().min(1).max(200),
	enabled: z.boolean().default(true),
	prompts: z.array(PonytailPromptSchema).max(500)
});
/** Durable section: the groups field defaults to the shipped prompt set. */
const PonytailSettingsSchema = z.object({ [PONYTAIL_GROUPS_FIELD]: z.array(PonytailGroupSchema).max(50).default(DEFAULT_PONYTAIL_SETTINGS.groups) });
/**
* Host plugin body: register the settings namespace once a settings provider
* is composed. Without one the plugin still activates — the whip falls back to
* its built-in rotation and the settings page edits are session-local.
* @param ctx - host context.
*/
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(settingsNamespace(PONYTAIL_SETTINGS_NAMESPACE), PonytailSettingsSchema);
	});
}
//#endregion
export { apply };
