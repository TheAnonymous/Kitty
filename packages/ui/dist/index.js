import { Teleport, computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, toValue, useId, watch } from "vue";
//#region src/components/foundations.ts
var content = (slots) => slots.default?.();
var KvProvider = defineComponent({
	name: "KvProvider",
	props: {
		tokens: {
			type: Object,
			default: () => ({})
		},
		grain: {
			type: Boolean,
			default: true
		}
	},
	setup(props, { slots }) {
		return () => {
			const style = Object.fromEntries(Object.entries(props.tokens).filter(([key]) => key.startsWith("--kv-")));
			return h("div", {
				class: "kv-provider",
				"data-kv-root": "",
				"data-kv-grain": props.grain || void 0,
				style
			}, content(slots));
		};
	}
});
var KvContainer = defineComponent({
	name: "KvContainer",
	props: {
		size: {
			type: String,
			default: "lg"
		},
		as: {
			type: String,
			default: "div"
		}
	},
	setup: (props, { slots }) => () => h(props.as, { class: ["kv-container", `kv-container--${props.size}`] }, content(slots))
});
var KvStack = defineComponent({
	name: "KvStack",
	props: {
		gap: {
			type: String,
			default: "md"
		},
		as: {
			type: String,
			default: "div"
		}
	},
	setup: (props, { slots }) => () => h(props.as, { class: ["kv-stack", `kv-stack--${props.gap}`] }, content(slots))
});
var KvCluster = defineComponent({
	name: "KvCluster",
	props: {
		gap: {
			type: String,
			default: "sm"
		},
		align: {
			type: String,
			default: "center"
		},
		justify: {
			type: String,
			default: "start"
		},
		as: {
			type: String,
			default: "div"
		}
	},
	setup: (props, { slots }) => () => h(props.as, { class: [
		"kv-cluster",
		`kv-cluster--${props.gap}`,
		`kv-cluster--align-${props.align}`,
		`kv-cluster--justify-${props.justify}`
	] }, content(slots))
});
var KvGrid = defineComponent({
	name: "KvGrid",
	props: {
		min: {
			type: String,
			default: "15rem"
		},
		gap: {
			type: String,
			default: "md"
		},
		as: {
			type: String,
			default: "div"
		}
	},
	setup: (props, { slots }) => () => h(props.as, {
		class: ["kv-grid", `kv-grid--${props.gap}`],
		style: { "--kv-grid-min": props.min }
	}, content(slots))
});
var KvDivider = defineComponent({
	name: "KvDivider",
	props: { orientation: {
		type: String,
		default: "horizontal"
	} },
	setup: (props) => () => h("div", {
		class: ["kv-divider", `kv-divider--${props.orientation}`],
		role: "separator",
		"aria-orientation": props.orientation
	})
});
var KvVisuallyHidden = defineComponent({
	name: "KvVisuallyHidden",
	props: {
		as: {
			type: String,
			default: "span"
		},
		focusable: Boolean
	},
	setup: (props, { slots }) => () => h(props.as, { class: ["kv-visually-hidden", props.focusable && "kv-visually-hidden--focusable"] }, content(slots))
});
var KvHeading = defineComponent({
	name: "KvHeading",
	props: {
		level: {
			type: Number,
			default: 2
		},
		eyebrow: String
	},
	setup: (props, { slots }) => () => h("div", { class: "kv-heading-wrap" }, [props.eyebrow && h("span", { class: "kv-heading__eyebrow" }, props.eyebrow), h(`h${props.level}`, { class: ["kv-heading", `kv-heading--${props.level}`] }, content(slots))])
});
var KvText = defineComponent({
	name: "KvText",
	props: {
		as: {
			type: String,
			default: "p"
		},
		size: {
			type: String,
			default: "md"
		},
		tone: {
			type: String,
			default: "default"
		}
	},
	setup: (props, { slots }) => () => h(props.as, { class: [
		"kv-text",
		`kv-text--${props.size}`,
		`kv-text--${props.tone}`
	] }, content(slots))
});
var KvLink = defineComponent({
	name: "KvLink",
	props: {
		href: {
			type: String,
			required: true
		},
		external: Boolean
	},
	setup: (props, { slots }) => () => h("a", {
		class: "kv-link",
		href: props.href,
		target: props.external ? "_blank" : void 0,
		rel: props.external ? "noreferrer noopener" : void 0
	}, content(slots))
});
var KvCode = defineComponent({
	name: "KvCode",
	props: { block: Boolean },
	setup: (props, { slots }) => () => props.block ? h("pre", { class: "kv-code kv-code--block" }, h("code", content(slots))) : h("code", { class: "kv-code" }, content(slots))
});
//#endregion
//#region src/components/actions.ts
var buttonProps = {
	variant: {
		type: String,
		default: "primary"
	},
	size: {
		type: String,
		default: "md"
	},
	type: {
		type: String,
		default: "button"
	},
	disabled: Boolean,
	loading: Boolean
};
var KvButton = defineComponent({
	name: "KvButton",
	props: {
		...buttonProps,
		block: Boolean
	},
	emits: ["click"],
	setup(props, { slots, emit }) {
		return () => h("button", {
			class: [
				"kv-button",
				`kv-button--${props.variant}`,
				`kv-button--${props.size}`,
				props.block && "kv-button--block"
			],
			type: props.type,
			disabled: props.disabled || props.loading,
			"aria-busy": props.loading || void 0,
			onClick: (event) => emit("click", event)
		}, [
			props.loading && h("span", {
				class: "kv-button__loader",
				"aria-hidden": "true"
			}),
			slots.leading?.(),
			h("span", { class: "kv-button__label" }, slots.default?.()),
			slots.trailing?.()
		]);
	}
});
var KvIconButton = defineComponent({
	name: "KvIconButton",
	props: {
		...buttonProps,
		label: {
			type: String,
			required: true
		}
	},
	emits: ["click"],
	setup(props, { slots, emit }) {
		return () => h("button", {
			class: [
				"kv-icon-button",
				`kv-icon-button--${props.variant}`,
				`kv-icon-button--${props.size}`
			],
			type: props.type,
			disabled: props.disabled || props.loading,
			"aria-label": props.label,
			"aria-busy": props.loading || void 0,
			onClick: (event) => emit("click", event)
		}, props.loading ? h("span", {
			class: "kv-button__loader",
			"aria-hidden": "true"
		}) : slots.default?.());
	}
});
var KvButtonGroup = defineComponent({
	name: "KvButtonGroup",
	props: {
		label: {
			type: String,
			required: true
		},
		orientation: {
			type: String,
			default: "horizontal"
		},
		attached: Boolean
	},
	setup: (props, { slots }) => () => h("div", {
		class: [
			"kv-button-group",
			`kv-button-group--${props.orientation}`,
			props.attached && "kv-button-group--attached"
		],
		role: "group",
		"aria-label": props.label
	}, slots.default?.())
});
//#endregion
//#region src/composables/useKvControllable.ts
function useKvControllable(props, propName, defaultValue, emit) {
	const internal = ref(defaultValue);
	return computed({
		get: () => props[propName] === void 0 ? internal.value : props[propName],
		set: (value) => {
			if (props[propName] === void 0) internal.value = value;
			emit(`update:${propName}`, value);
		}
	});
}
//#endregion
//#region src/composables/useKvId.ts
function useKvId(prefix, provided) {
	const vueId = useId().replace(/:/g, "");
	return computed(() => toValue(provided) || `kv-${prefix}-${vueId}`);
}
//#endregion
//#region src/internal/field.ts
var kvFieldKey = Symbol("KvField");
//#endregion
//#region src/components/forms.ts
var KvField = defineComponent({
	name: "KvField",
	props: {
		id: String,
		label: {
			type: String,
			required: true
		},
		description: String,
		error: String,
		required: Boolean,
		disabled: Boolean
	},
	setup(props, { slots }) {
		const inputId = useKvId("field", () => props.id);
		const descriptionId = computed(() => `${inputId.value}-description`);
		const errorId = computed(() => `${inputId.value}-error`);
		provide(kvFieldKey, {
			inputId,
			describedBy: computed(() => [props.description && descriptionId.value, props.error && errorId.value].filter(Boolean).join(" ") || void 0),
			invalid: computed(() => Boolean(props.error)),
			disabled: computed(() => props.disabled),
			required: computed(() => props.required)
		});
		return () => h("div", { class: [
			"kv-field",
			props.error && "kv-field--invalid",
			props.disabled && "kv-field--disabled"
		] }, [
			h("label", {
				class: "kv-field__label",
				for: inputId.value
			}, [props.label, props.required && h("span", {
				class: "kv-field__required",
				"aria-hidden": "true"
			}, " *")]),
			slots.default?.(),
			props.description && h("div", {
				class: "kv-field__description",
				id: descriptionId.value
			}, props.description),
			props.error && h("div", {
				class: "kv-field__error",
				id: errorId.value,
				role: "alert"
			}, props.error)
		]);
	}
});
var valueProps = {
	modelValue: {
		type: [String, Number],
		default: void 0
	},
	defaultValue: {
		type: [String, Number],
		default: ""
	},
	size: {
		type: String,
		default: "md"
	},
	disabled: {
		type: Boolean,
		default: void 0
	},
	required: {
		type: Boolean,
		default: void 0
	},
	invalid: {
		type: Boolean,
		default: void 0
	}
};
function useFieldAttributes(props) {
	const field = inject(kvFieldKey, null);
	return computed(() => ({
		id: props.id || field?.inputId.value,
		disabled: props.disabled ?? field?.disabled.value,
		required: props.required ?? field?.required.value,
		"aria-invalid": (props.invalid ?? field?.invalid.value) || void 0,
		"aria-describedby": props["aria-describedby"] || field?.describedBy.value
	}));
}
var KvInput = defineComponent({
	name: "KvInput",
	inheritAttrs: false,
	props: {
		...valueProps,
		id: String,
		type: {
			type: String,
			default: "text"
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, attrs }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const fieldAttrs = useFieldAttributes(props);
		return () => h("input", {
			...attrs,
			...fieldAttrs.value,
			class: [
				"kv-input",
				`kv-input--${props.size}`,
				attrs.class
			],
			type: props.type,
			value: value.value,
			onInput: (event) => value.value = event.target.value,
			onChange: (event) => emit("change", event)
		});
	}
});
var KvTextarea = defineComponent({
	name: "KvTextarea",
	inheritAttrs: false,
	props: {
		...valueProps,
		id: String,
		rows: {
			type: Number,
			default: 4
		},
		resize: {
			type: String,
			default: "vertical"
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, attrs }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const fieldAttrs = useFieldAttributes(props);
		return () => h("textarea", {
			...attrs,
			...fieldAttrs.value,
			class: [
				"kv-textarea",
				`kv-input--${props.size}`,
				attrs.class
			],
			rows: props.rows,
			value: value.value,
			style: { resize: props.resize },
			onInput: (event) => value.value = event.target.value,
			onChange: (event) => emit("change", event)
		});
	}
});
var KvSelect = defineComponent({
	name: "KvSelect",
	inheritAttrs: false,
	props: {
		...valueProps,
		id: String,
		options: {
			type: Array,
			default: () => []
		},
		placeholder: String
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, attrs, slots }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const fieldAttrs = useFieldAttributes(props);
		return () => h("div", { class: "kv-select-wrap" }, [h("select", {
			...attrs,
			...fieldAttrs.value,
			class: [
				"kv-select",
				`kv-input--${props.size}`,
				attrs.class
			],
			value: value.value,
			onChange: (event) => {
				value.value = event.target.value;
				emit("change", event);
			}
		}, [props.placeholder && h("option", {
			value: "",
			disabled: props.required
		}, props.placeholder), ...slots.default?.() ?? props.options.map((option) => h("option", {
			value: option.value,
			disabled: option.disabled
		}, option.label))]), h("span", {
			class: "kv-select__chevron",
			"aria-hidden": "true"
		}, "⌄")]);
	}
});
var KvCombobox = defineComponent({
	name: "KvCombobox",
	inheritAttrs: false,
	props: {
		modelValue: {
			type: String,
			default: void 0
		},
		defaultValue: {
			type: String,
			default: ""
		},
		options: {
			type: Array,
			default: () => []
		},
		placeholder: String,
		id: String,
		disabled: {
			type: Boolean,
			default: void 0
		},
		required: {
			type: Boolean,
			default: void 0
		},
		invalid: {
			type: Boolean,
			default: void 0
		},
		size: {
			type: String,
			default: "md"
		},
		noResultsText: {
			type: String,
			default: "No matches"
		}
	},
	emits: [
		"update:modelValue",
		"select",
		"open",
		"close"
	],
	setup(props, { emit, attrs }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const open = ref(false);
		const active = ref(-1);
		const query = ref(props.options.find((option) => option.value === value.value)?.label ?? value.value);
		const root = ref(null);
		const fieldAttrs = useFieldAttributes(props);
		const listId = useKvId("combobox-list");
		const filtered = computed(() => {
			const needle = query.value.trim().toLocaleLowerCase();
			return props.options.filter((option) => !needle || option.label.toLocaleLowerCase().includes(needle));
		});
		const setOpen = (next) => {
			if (open.value === next) return;
			open.value = next;
			emit(next ? "open" : "close");
			if (next) active.value = Math.max(0, filtered.value.findIndex((option) => !option.disabled));
		};
		const choose = (option) => {
			if (option.disabled) return;
			value.value = option.value;
			query.value = option.label;
			emit("select", option);
			setOpen(false);
		};
		const move = (direction) => {
			if (!filtered.value.filter((option) => !option.disabled).length) return;
			let next = active.value;
			do
				next = (next + direction + filtered.value.length) % filtered.value.length;
			while (filtered.value[next]?.disabled && next !== active.value);
			active.value = next;
		};
		const onKeydown = (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				setOpen(true);
				move(event.key === "ArrowDown" ? 1 : -1);
			} else if (event.key === "Home" && open.value) {
				event.preventDefault();
				active.value = 0;
			} else if (event.key === "End" && open.value) {
				event.preventDefault();
				active.value = filtered.value.length - 1;
			} else if (event.key === "Enter" && open.value && filtered.value[active.value]) {
				event.preventDefault();
				choose(filtered.value[active.value]);
			} else if (event.key === "Escape" && open.value) {
				event.preventDefault();
				setOpen(false);
			}
		};
		const pointer = (event) => {
			if (!root.value?.contains(event.target)) setOpen(false);
		};
		onMounted(() => document.addEventListener("pointerdown", pointer));
		onBeforeUnmount(() => document.removeEventListener("pointerdown", pointer));
		watch(() => props.modelValue, (next) => {
			if (next === void 0) return;
			query.value = props.options.find((option) => option.value === next)?.label ?? next;
		});
		return () => h("div", {
			ref: root,
			class: "kv-combobox"
		}, [h("input", {
			...attrs,
			...fieldAttrs.value,
			class: [
				"kv-input",
				`kv-input--${props.size}`,
				attrs.class
			],
			role: "combobox",
			value: query.value,
			placeholder: props.placeholder,
			autocomplete: "off",
			"aria-autocomplete": "list",
			"aria-expanded": open.value,
			"aria-controls": listId.value,
			"aria-activedescendant": open.value && active.value >= 0 ? `${listId.value}-${active.value}` : void 0,
			onInput: (event) => {
				query.value = event.target.value;
				setOpen(true);
			},
			onFocus: () => setOpen(true),
			onKeydown
		}), open.value && h("ul", {
			class: "kv-listbox",
			id: listId.value,
			role: "listbox"
		}, filtered.value.length ? filtered.value.map((option, index) => h("li", {
			id: `${listId.value}-${index}`,
			class: ["kv-listbox__option", index === active.value && "is-active"],
			role: "option",
			"aria-selected": option.value === value.value,
			"aria-disabled": option.disabled || void 0,
			onPointerdown: (event) => event.preventDefault(),
			onClick: () => choose(option)
		}, option.label)) : h("li", { class: "kv-listbox__empty" }, props.noResultsText))]);
	}
});
var KvCheckbox = defineComponent({
	name: "KvCheckbox",
	props: {
		modelValue: {
			type: Boolean,
			default: void 0
		},
		defaultValue: Boolean,
		label: {
			type: String,
			required: true
		},
		description: String,
		disabled: Boolean,
		indeterminate: Boolean,
		value: String
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit }) {
		const checked = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const input = ref(null);
		const sync = () => {
			if (input.value) input.value.indeterminate = props.indeterminate;
		};
		onMounted(sync);
		watch(() => props.indeterminate, sync);
		return () => h("label", { class: ["kv-choice", props.disabled && "kv-choice--disabled"] }, [
			h("input", {
				ref: input,
				class: "kv-choice__native",
				type: "checkbox",
				checked: checked.value,
				disabled: props.disabled,
				value: props.value,
				onChange: (event) => {
					checked.value = event.target.checked;
					emit("change", event);
				}
			}),
			h("span", {
				class: "kv-choice__control",
				"aria-hidden": "true"
			}),
			h("span", { class: "kv-choice__content" }, [h("span", { class: "kv-choice__label" }, props.label), props.description && h("span", { class: "kv-choice__description" }, props.description)])
		]);
	}
});
var KvRadioGroup = defineComponent({
	name: "KvRadioGroup",
	props: {
		modelValue: {
			type: [String, Number],
			default: void 0
		},
		defaultValue: {
			type: [String, Number],
			default: ""
		},
		options: {
			type: Array,
			default: () => []
		},
		label: {
			type: String,
			required: true
		},
		name: String,
		disabled: Boolean,
		orientation: {
			type: String,
			default: "vertical"
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const name = useKvId("radio", () => props.name);
		return () => h("fieldset", {
			class: ["kv-radio-group", `kv-radio-group--${props.orientation}`],
			disabled: props.disabled
		}, [h("legend", { class: "kv-radio-group__legend" }, props.label), ...props.options.map((option) => h("label", { class: ["kv-choice", option.disabled && "kv-choice--disabled"] }, [
			h("input", {
				class: "kv-choice__native",
				type: "radio",
				name: name.value,
				value: option.value,
				checked: value.value === option.value,
				disabled: option.disabled,
				onChange: (event) => {
					value.value = option.value;
					emit("change", event);
				}
			}),
			h("span", {
				class: "kv-choice__control kv-choice__control--radio",
				"aria-hidden": "true"
			}),
			h("span", { class: "kv-choice__label" }, option.label)
		]))]);
	}
});
var KvSwitch = defineComponent({
	name: "KvSwitch",
	props: {
		modelValue: {
			type: Boolean,
			default: void 0
		},
		defaultValue: Boolean,
		label: {
			type: String,
			required: true
		},
		description: String,
		disabled: Boolean
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit }) {
		const checked = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const toggle = () => {
			if (props.disabled) return;
			checked.value = !checked.value;
			emit("change", checked.value);
		};
		return () => h("button", {
			class: "kv-switch",
			type: "button",
			role: "switch",
			disabled: props.disabled,
			"aria-checked": checked.value,
			onClick: toggle
		}, [h("span", {
			class: "kv-switch__track",
			"aria-hidden": "true"
		}, h("span", { class: "kv-switch__thumb" })), h("span", { class: "kv-choice__content" }, [h("span", { class: "kv-choice__label" }, props.label), props.description && h("span", { class: "kv-choice__description" }, props.description)])]);
	}
});
var KvSlider = defineComponent({
	name: "KvSlider",
	inheritAttrs: false,
	props: {
		modelValue: {
			type: Number,
			default: void 0
		},
		defaultValue: {
			type: Number,
			default: 0
		},
		min: {
			type: Number,
			default: 0
		},
		max: {
			type: Number,
			default: 100
		},
		step: {
			type: Number,
			default: 1
		},
		id: String,
		disabled: {
			type: Boolean,
			default: void 0
		},
		showValue: {
			type: Boolean,
			default: true
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, attrs }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const fieldAttrs = useFieldAttributes(props);
		return () => h("div", { class: "kv-slider" }, [h("input", {
			...attrs,
			...fieldAttrs.value,
			class: ["kv-slider__input", attrs.class],
			type: "range",
			min: props.min,
			max: props.max,
			step: props.step,
			value: value.value,
			style: { "--kv-slider-position": `${(value.value - props.min) / (props.max - props.min) * 100}%` },
			onInput: (event) => value.value = Number(event.target.value),
			onChange: (event) => emit("change", event)
		}), props.showValue && h("output", {
			class: "kv-slider__value",
			for: fieldAttrs.value.id
		}, String(value.value))]);
	}
});
var KvFileInput = defineComponent({
	name: "KvFileInput",
	inheritAttrs: false,
	props: {
		id: String,
		accept: String,
		multiple: Boolean,
		disabled: {
			type: Boolean,
			default: void 0
		},
		prompt: {
			type: String,
			default: "Choose file"
		},
		emptyText: {
			type: String,
			default: "No file selected"
		}
	},
	emits: ["update:files", "change"],
	setup(props, { emit, attrs }) {
		const files = ref([]);
		const fieldAttrs = useFieldAttributes(props);
		const update = (event) => {
			files.value = Array.from(event.target.files ?? []);
			emit("update:files", files.value);
			emit("change", event);
		};
		return () => h("label", { class: ["kv-file-input", fieldAttrs.value.disabled && "kv-file-input--disabled"] }, [
			h("input", {
				...attrs,
				...fieldAttrs.value,
				class: "kv-file-input__native",
				type: "file",
				accept: props.accept,
				multiple: props.multiple,
				onChange: update
			}),
			h("span", { class: "kv-file-input__action" }, props.prompt),
			h("span", { class: "kv-file-input__name" }, files.value.length ? files.value.map((file) => file.name).join(", ") : props.emptyText)
		]);
	}
});
//#endregion
//#region src/composables/useKvPosition.ts
var gap = 8;
var edge = 8;
function opposite(side) {
	return {
		top: "bottom",
		bottom: "top",
		left: "right",
		right: "left"
	}[side] ?? side;
}
function useKvPosition(anchor, floating, open, placement) {
	const style = ref({
		position: "fixed",
		visibility: "hidden"
	});
	const resolvedPlacement = ref(placement.value);
	let mounted = false;
	const update = async () => {
		if (!mounted || !open.value) return;
		await nextTick();
		if (!anchor.value || !floating.value) return;
		const a = anchor.value.getBoundingClientRect();
		const f = floating.value.getBoundingClientRect();
		let [side, align = "center"] = placement.value.split("-");
		if (side === "top" && a.top - f.height - gap < edge || side === "bottom" && a.bottom + f.height + gap > window.innerHeight - edge || side === "left" && a.left - f.width - gap < edge || side === "right" && a.right + f.width + gap > window.innerWidth - edge) side = opposite(side);
		let top = a.bottom + gap;
		let left = a.left + (a.width - f.width) / 2;
		if (side === "top") top = a.top - f.height - gap;
		if (side === "left") {
			top = a.top + (a.height - f.height) / 2;
			left = a.left - f.width - gap;
		}
		if (side === "right") {
			top = a.top + (a.height - f.height) / 2;
			left = a.right + gap;
		}
		if (side === "bottom") top = a.bottom + gap;
		if (side === "top" || side === "bottom") {
			if (align === "start") left = a.left;
			if (align === "end") left = a.right - f.width;
		} else {
			if (align === "start") top = a.top;
			if (align === "end") top = a.bottom - f.height;
		}
		top = Math.max(edge, Math.min(top, window.innerHeight - f.height - edge));
		left = Math.max(edge, Math.min(left, window.innerWidth - f.width - edge));
		resolvedPlacement.value = `${side}${align === "center" ? "" : `-${align}`}`;
		style.value = {
			position: "fixed",
			top: `${Math.round(top)}px`,
			left: `${Math.round(left)}px`,
			visibility: "visible"
		};
	};
	const listener = () => void update();
	onMounted(() => {
		mounted = true;
		window.addEventListener("resize", listener);
		window.addEventListener("scroll", listener, true);
		update();
	});
	watch([open, placement], () => void update(), { flush: "post" });
	onBeforeUnmount(() => {
		window.removeEventListener("resize", listener);
		window.removeEventListener("scroll", listener, true);
	});
	return {
		style,
		resolvedPlacement,
		update
	};
}
//#endregion
//#region src/components/navigation.ts
var KvTabs = defineComponent({
	name: "KvTabs",
	props: {
		modelValue: {
			type: String,
			default: void 0
		},
		defaultValue: String,
		items: {
			type: Array,
			required: true
		},
		orientation: {
			type: String,
			default: "horizontal"
		},
		label: {
			type: String,
			default: "Tabs"
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, slots }) {
		const value = useKvControllable(props, "modelValue", props.defaultValue ?? props.items.find((item) => !item.disabled)?.id ?? "", emit);
		const baseId = useKvId("tabs");
		const buttons = ref([]);
		const select = (item, focus = false) => {
			if (item.disabled) return;
			value.value = item.id;
			emit("change", item.id);
			if (focus) nextTick(() => buttons.value[props.items.indexOf(item)]?.focus());
		};
		const onKeydown = (event, index) => {
			const previousKey = props.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
			const nextKey = props.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
			const enabledIndexes = props.items.flatMap((item, itemIndex) => item.disabled ? [] : [itemIndex]);
			if (!enabledIndexes.length) return;
			let next;
			if (event.key === "Home") next = enabledIndexes[0];
			else if (event.key === "End") next = enabledIndexes.at(-1);
			else if (event.key === previousKey) next = (index - 1 + props.items.length) % props.items.length;
			else if (event.key === nextKey) next = (index + 1) % props.items.length;
			else return;
			event.preventDefault();
			while (props.items[next]?.disabled && next !== index) next = (next + (event.key === previousKey ? -1 : 1) + props.items.length) % props.items.length;
			if (props.items[next]) select(props.items[next], true);
		};
		return () => {
			const active = props.items.find((item) => item.id === value.value) ?? props.items[0];
			buttons.value = [];
			return h("div", { class: ["kv-tabs", `kv-tabs--${props.orientation}`] }, [h("div", {
				class: "kv-tabs__list",
				role: "tablist",
				"aria-label": props.label,
				"aria-orientation": props.orientation
			}, props.items.map((item, index) => h("button", {
				ref: (element) => {
					if (element) buttons.value[index] = element;
				},
				class: "kv-tabs__tab",
				type: "button",
				role: "tab",
				disabled: item.disabled,
				id: `${baseId.value}-tab-${item.id}`,
				"aria-controls": `${baseId.value}-panel-${item.id}`,
				"aria-selected": item.id === value.value,
				tabindex: item.id === value.value ? 0 : -1,
				onClick: () => select(item),
				onKeydown: (event) => onKeydown(event, index)
			}, item.label))), active && h("div", {
				class: "kv-tabs__panel",
				role: "tabpanel",
				tabindex: 0,
				id: `${baseId.value}-panel-${active.id}`,
				"aria-labelledby": `${baseId.value}-tab-${active.id}`
			}, slots[`panel-${active.id}`]?.({ item: active }) ?? slots.default?.({ item: active }))]);
		};
	}
});
var KvBreadcrumbs = defineComponent({
	name: "KvBreadcrumbs",
	props: {
		items: {
			type: Array,
			required: true
		},
		label: {
			type: String,
			default: "Breadcrumb"
		}
	},
	setup: (props) => () => h("nav", {
		class: "kv-breadcrumbs",
		"aria-label": props.label
	}, h("ol", props.items.map((item, index) => h("li", { class: "kv-breadcrumbs__item" }, [index > 0 && h("span", {
		class: "kv-breadcrumbs__separator",
		"aria-hidden": "true"
	}, "/"), item.href && index < props.items.length - 1 ? h("a", {
		class: "kv-link",
		href: item.href
	}, item.label) : h("span", { "aria-current": index === props.items.length - 1 ? "page" : void 0 }, item.label)]))))
});
var KvPagination = defineComponent({
	name: "KvPagination",
	props: {
		modelValue: {
			type: Number,
			default: void 0
		},
		defaultValue: {
			type: Number,
			default: 1
		},
		total: {
			type: Number,
			required: true
		},
		pageSize: {
			type: Number,
			default: 10
		},
		siblingCount: {
			type: Number,
			default: 1
		},
		label: {
			type: String,
			default: "Pagination"
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit }) {
		const page = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const count = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
		const pages = computed(() => {
			const values = /* @__PURE__ */ new Set([1, count.value]);
			for (let index = Math.max(1, page.value - props.siblingCount); index <= Math.min(count.value, page.value + props.siblingCount); index++) values.add(index);
			const sorted = [...values].sort((a, b) => a - b);
			return sorted.flatMap((item, index) => index > 0 && item - sorted[index - 1] > 1 ? [-1, item] : [item]);
		});
		const go = (next) => {
			const bounded = Math.max(1, Math.min(count.value, next));
			if (bounded === page.value) return;
			page.value = bounded;
			emit("change", bounded);
		};
		return () => h("nav", {
			class: "kv-pagination",
			"aria-label": props.label
		}, [
			h("button", {
				class: "kv-pagination__button",
				type: "button",
				disabled: page.value <= 1,
				"aria-label": "Previous page",
				onClick: () => go(page.value - 1)
			}, "‹"),
			...pages.value.map((item) => item === -1 ? h("span", {
				class: "kv-pagination__ellipsis",
				"aria-hidden": "true"
			}, "…") : h("button", {
				class: "kv-pagination__button",
				type: "button",
				"aria-label": `Page ${item}`,
				"aria-current": item === page.value ? "page" : void 0,
				onClick: () => go(item)
			}, String(item))),
			h("button", {
				class: "kv-pagination__button",
				type: "button",
				disabled: page.value >= count.value,
				"aria-label": "Next page",
				onClick: () => go(page.value + 1)
			}, "›")
		]);
	}
});
var KvSteps = defineComponent({
	name: "KvSteps",
	props: {
		items: {
			type: Array,
			required: true
		},
		current: {
			type: [Number, String],
			default: 0
		},
		label: {
			type: String,
			default: "Progress"
		}
	},
	setup(props) {
		const index = computed(() => typeof props.current === "number" ? props.current : props.items.findIndex((item) => item.id === props.current));
		return () => h("ol", {
			class: "kv-steps",
			"aria-label": props.label
		}, props.items.map((item, itemIndex) => h("li", {
			class: "kv-steps__item",
			"data-state": itemIndex < index.value ? "complete" : itemIndex === index.value ? "current" : "pending",
			"aria-current": itemIndex === index.value ? "step" : void 0
		}, [h("span", {
			class: "kv-steps__marker",
			"aria-hidden": "true"
		}, itemIndex < index.value ? "✓" : String(itemIndex + 1).padStart(2, "0")), h("span", { class: "kv-steps__content" }, [h("span", { class: "kv-steps__label" }, item.label), item.description && h("span", { class: "kv-steps__description" }, item.description)])])));
	}
});
var KvDropdownMenu = defineComponent({
	name: "KvDropdownMenu",
	props: {
		open: {
			type: Boolean,
			default: void 0
		},
		defaultOpen: Boolean,
		items: {
			type: Array,
			required: true
		},
		triggerLabel: {
			type: String,
			default: "Open menu"
		},
		placement: {
			type: String,
			default: "bottom-start"
		}
	},
	emits: ["update:open", "select"],
	setup(props, { emit, slots }) {
		const isOpen = useKvControllable(props, "open", props.defaultOpen, emit);
		const trigger = ref(null);
		const menu = ref(null);
		const mounted = ref(false);
		const active = ref(0);
		const { style, resolvedPlacement } = useKvPosition(trigger, menu, isOpen, computed(() => props.placement));
		const close = (restore = true) => {
			isOpen.value = false;
			if (restore) nextTick(() => trigger.value?.focus());
		};
		const focusActive = () => void nextTick(() => menu.value?.querySelectorAll("[role=\"menuitem\"]")[active.value]?.focus());
		const move = (direction) => {
			if (!props.items.some((item) => !item.disabled)) return;
			do
				active.value = (active.value + direction + props.items.length) % props.items.length;
			while (props.items[active.value]?.disabled);
			focusActive();
		};
		const onKeydown = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				move(1);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				move(-1);
			} else if (event.key === "Home") {
				event.preventDefault();
				active.value = 0;
				focusActive();
			} else if (event.key === "End") {
				event.preventDefault();
				active.value = props.items.length - 1;
				focusActive();
			}
		};
		const select = (item) => {
			if (item.disabled) return;
			emit("select", item);
			close();
		};
		const pointer = (event) => {
			if (!isOpen.value || trigger.value?.contains(event.target) || menu.value?.contains(event.target)) return;
			close(false);
		};
		onMounted(() => {
			mounted.value = true;
			document.addEventListener("pointerdown", pointer);
		});
		onBeforeUnmount(() => document.removeEventListener("pointerdown", pointer));
		return () => h("div", { class: "kv-dropdown" }, [h("button", {
			ref: trigger,
			class: "kv-dropdown__trigger",
			type: "button",
			"aria-label": props.triggerLabel,
			"aria-haspopup": "menu",
			"aria-expanded": isOpen.value,
			onClick: () => {
				isOpen.value = !isOpen.value;
				if (isOpen.value) focusActive();
			},
			onKeydown: (event) => {
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					isOpen.value = true;
					active.value = event.key === "ArrowDown" ? 0 : props.items.length - 1;
					focusActive();
				}
			}
		}, slots.trigger?.() ?? props.triggerLabel), isOpen.value && h(Teleport, {
			to: "body",
			disabled: !mounted.value
		}, h("div", {
			ref: menu,
			class: "kv-menu",
			role: "menu",
			style: style.value,
			"data-placement": resolvedPlacement.value,
			onKeydown
		}, props.items.map((item, index) => h("button", {
			class: ["kv-menu__item", item.danger && "kv-menu__item--danger"],
			type: "button",
			role: "menuitem",
			tabindex: index === active.value ? 0 : -1,
			disabled: item.disabled,
			onPointerenter: () => {
				active.value = index;
			},
			onClick: () => select(item)
		}, [item.icon && h(item.icon, { "aria-hidden": "true" }), item.label]))))]);
	}
});
//#endregion
//#region src/composables/useKvFocusTrap.ts
var focusableSelector = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");
var scrollLocks = 0;
var previousOverflow = "";
function lockScroll() {
	if (scrollLocks++ === 0) {
		previousOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
	}
}
function unlockScroll() {
	scrollLocks = Math.max(0, scrollLocks - 1);
	if (scrollLocks === 0) document.documentElement.style.overflow = previousOverflow;
}
function useKvFocusTrap(root, active, options = {}) {
	let mounted = false;
	let returnTarget = null;
	let locked = false;
	const focusInitial = async () => {
		await nextTick();
		(options.initialFocus?.value ?? root.value?.querySelector(focusableSelector) ?? root.value)?.focus();
	};
	const handleKeydown = (event) => {
		if (!active.value || !root.value) return;
		if (event.key === "Escape") {
			event.preventDefault();
			options.onEscape?.();
			return;
		}
		if (event.key !== "Tab") return;
		const candidates = [...root.value.querySelectorAll(focusableSelector)].filter((element) => {
			const styles = window.getComputedStyle(element);
			return !element.hidden && styles.display !== "none" && styles.visibility !== "hidden";
		});
		if (candidates.length === 0) {
			event.preventDefault();
			root.value.focus();
			return;
		}
		const first = candidates[0];
		const last = candidates.at(-1);
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	};
	const activate = () => {
		if (!mounted) return;
		returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		document.addEventListener("keydown", handleKeydown);
		if (options.lockBodyScroll && !locked) {
			lockScroll();
			locked = true;
		}
		focusInitial();
	};
	const deactivate = () => {
		document.removeEventListener("keydown", handleKeydown);
		if (locked) {
			unlockScroll();
			locked = false;
		}
		if (options.restoreFocus !== false) returnTarget?.focus();
		returnTarget = null;
	};
	onMounted(() => {
		mounted = true;
		if (active.value) activate();
	});
	watch(active, (value, previous) => {
		if (value && !previous) activate();
		if (!value && previous) deactivate();
	});
	onBeforeUnmount(deactivate);
	return { focusInitial };
}
//#endregion
//#region src/components/overlays.ts
function createModal(name, role, drawer = false) {
	return defineComponent({
		name,
		props: {
			open: {
				type: Boolean,
				default: void 0
			},
			defaultOpen: Boolean,
			title: {
				type: String,
				required: true
			},
			description: String,
			closeLabel: {
				type: String,
				default: "Close"
			},
			closeOnOutside: {
				type: Boolean,
				default: true
			},
			closeOnEscape: {
				type: Boolean,
				default: true
			},
			teleportTo: {
				type: String,
				default: "body"
			},
			side: {
				type: String,
				default: "right"
			},
			size: {
				type: String,
				default: "md"
			},
			cancelLabel: {
				type: String,
				default: "Cancel"
			},
			confirmLabel: {
				type: String,
				default: "Confirm"
			},
			destructive: Boolean
		},
		emits: [
			"update:open",
			"close",
			"cancel",
			"confirm"
		],
		setup(props, { emit, slots }) {
			const isOpen = useKvControllable(props, "open", props.defaultOpen, emit);
			const panel = ref(null);
			const initialFocus = ref(null);
			const mounted = ref(false);
			const titleId = useKvId(name === "KvDrawer" ? "drawer-title" : "dialog-title");
			const descriptionId = useKvId(name === "KvDrawer" ? "drawer-description" : "dialog-description");
			const close = (reason = "programmatic") => {
				if (!isOpen.value) return;
				isOpen.value = false;
				emit("close", reason);
			};
			useKvFocusTrap(panel, isOpen, {
				onEscape: () => {
					if (props.closeOnEscape) close("escape");
				},
				lockBodyScroll: true,
				initialFocus: role === "alertdialog" ? initialFocus : void 0
			});
			onMounted(() => {
				mounted.value = true;
			});
			return () => {
				if (!isOpen.value) return null;
				const actions = role === "alertdialog" ? slots.actions?.({ close }) ?? [h("button", {
					ref: initialFocus,
					class: "kv-button kv-button--secondary kv-button--md",
					type: "button",
					onClick: () => {
						emit("cancel");
						close("cancel");
					}
				}, props.cancelLabel), h("button", {
					class: [
						"kv-button",
						props.destructive ? "kv-button--danger" : "kv-button--primary",
						"kv-button--md"
					],
					type: "button",
					onClick: () => emit("confirm")
				}, props.confirmLabel)] : slots.footer?.({ close });
				const content = h("div", {
					class: ["kv-overlay", drawer && "kv-overlay--drawer"],
					onPointerdown: (event) => {
						if (event.target === event.currentTarget && props.closeOnOutside) close("outside");
					}
				}, h("section", {
					ref: panel,
					class: [
						drawer ? "kv-drawer" : "kv-dialog",
						drawer && `kv-drawer--${props.side}`,
						drawer && `kv-drawer--${props.size}`
					],
					role,
					"aria-modal": "true",
					"aria-labelledby": titleId.value,
					"aria-describedby": props.description ? descriptionId.value : void 0,
					tabindex: -1
				}, [
					h("header", { class: drawer ? "kv-drawer__header" : "kv-dialog__header" }, [h("div", [h("h2", {
						class: "kv-dialog__title",
						id: titleId.value
					}, props.title), props.description && h("p", {
						class: "kv-dialog__description",
						id: descriptionId.value
					}, props.description)]), h("button", {
						class: "kv-dialog__close",
						type: "button",
						"aria-label": props.closeLabel,
						onClick: () => close("button")
					}, "×")]),
					h("div", { class: drawer ? "kv-drawer__body" : "kv-dialog__body" }, slots.default?.({ close })),
					actions && h("footer", { class: drawer ? "kv-drawer__footer" : "kv-dialog__footer" }, actions)
				]));
				return h(Teleport, {
					to: props.teleportTo,
					disabled: !mounted.value
				}, content);
			};
		}
	});
}
var KvDialog = createModal("KvDialog", "dialog");
var KvAlertDialog = createModal("KvAlertDialog", "alertdialog");
var KvDrawer = createModal("KvDrawer", "dialog", true);
var KvPopover = defineComponent({
	name: "KvPopover",
	props: {
		open: {
			type: Boolean,
			default: void 0
		},
		defaultOpen: Boolean,
		placement: {
			type: String,
			default: "bottom"
		},
		triggerLabel: {
			type: String,
			default: "Toggle popover"
		},
		closeOnOutside: {
			type: Boolean,
			default: true
		},
		teleportTo: {
			type: String,
			default: "body"
		}
	},
	emits: ["update:open", "close"],
	setup(props, { emit, slots }) {
		const isOpen = useKvControllable(props, "open", props.defaultOpen, emit);
		const trigger = ref(null);
		const content = ref(null);
		const mounted = ref(false);
		const { style, resolvedPlacement } = useKvPosition(trigger, content, isOpen, computed(() => props.placement));
		const close = (reason, restore = false) => {
			if (!isOpen.value) return;
			isOpen.value = false;
			emit("close", reason);
			if (restore) nextTick(() => trigger.value?.focus());
		};
		const pointer = (event) => {
			if (!isOpen.value || !props.closeOnOutside || trigger.value?.contains(event.target) || content.value?.contains(event.target)) return;
			close("outside");
		};
		const keydown = (event) => {
			if (isOpen.value && event.key === "Escape") {
				event.preventDefault();
				close("escape", true);
			}
		};
		onMounted(() => {
			mounted.value = true;
			document.addEventListener("pointerdown", pointer);
			document.addEventListener("keydown", keydown);
		});
		onBeforeUnmount(() => {
			document.removeEventListener("pointerdown", pointer);
			document.removeEventListener("keydown", keydown);
		});
		return () => h("span", { class: "kv-popover-root" }, [h("button", {
			ref: trigger,
			class: "kv-popover__trigger",
			type: "button",
			"aria-label": props.triggerLabel,
			"aria-haspopup": "dialog",
			"aria-expanded": isOpen.value,
			onClick: () => isOpen.value = !isOpen.value
		}, slots.trigger?.() ?? props.triggerLabel), isOpen.value && h(Teleport, {
			to: props.teleportTo,
			disabled: !mounted.value
		}, h("div", {
			ref: content,
			class: "kv-popover",
			role: "dialog",
			style: style.value,
			"data-placement": resolvedPlacement.value
		}, slots.default?.({ close })))]);
	}
});
var KvTooltip = defineComponent({
	name: "KvTooltip",
	props: {
		text: {
			type: String,
			required: true
		},
		placement: {
			type: String,
			default: "top"
		},
		delay: {
			type: Number,
			default: 350
		},
		disabled: Boolean,
		teleportTo: {
			type: String,
			default: "body"
		}
	},
	setup(props, { slots }) {
		const open = ref(false);
		const trigger = ref(null);
		const content = ref(null);
		const mounted = ref(false);
		const id = useKvId("tooltip");
		const { style, resolvedPlacement } = useKvPosition(trigger, content, open, computed(() => props.placement));
		let timer;
		const show = () => {
			if (props.disabled) return;
			clearTimeout(timer);
			timer = setTimeout(() => {
				open.value = true;
			}, props.delay);
		};
		const hide = () => {
			clearTimeout(timer);
			open.value = false;
		};
		onMounted(() => {
			mounted.value = true;
		});
		onBeforeUnmount(() => clearTimeout(timer));
		return () => h("span", {
			ref: trigger,
			class: "kv-tooltip__trigger",
			tabindex: 0,
			"aria-describedby": open.value ? id.value : void 0,
			onPointerenter: show,
			onPointerleave: hide,
			onFocus: show,
			onBlur: hide,
			onKeydown: (event) => {
				if (event.key === "Escape") hide();
			}
		}, [slots.default?.(), open.value && h(Teleport, {
			to: props.teleportTo,
			disabled: !mounted.value
		}, h("span", {
			ref: content,
			class: "kv-tooltip",
			id: id.value,
			role: "tooltip",
			style: style.value,
			"data-placement": resolvedPlacement.value
		}, props.text))]);
	}
});
//#endregion
//#region src/components/data.ts
var KvCard = defineComponent({
	name: "KvCard",
	props: {
		as: {
			type: String,
			default: "article"
		},
		interactive: Boolean,
		padding: {
			type: String,
			default: "md"
		}
	},
	setup: (props, { slots }) => () => h(props.as, { class: [
		"kv-card",
		`kv-card--${props.padding}`,
		props.interactive && "kv-card--interactive"
	] }, [
		slots.header && h("header", { class: "kv-card__header" }, slots.header()),
		h("div", { class: "kv-card__body" }, slots.default?.()),
		slots.footer && h("footer", { class: "kv-card__footer" }, slots.footer())
	])
});
var KvAccordion = defineComponent({
	name: "KvAccordion",
	props: {
		modelValue: {
			type: [String, Array],
			default: void 0
		},
		defaultValue: {
			type: [String, Array],
			default: () => []
		},
		items: {
			type: Array,
			required: true
		},
		multiple: Boolean,
		headingLevel: {
			type: Number,
			default: 3
		}
	},
	emits: ["update:modelValue", "change"],
	setup(props, { emit, slots }) {
		const state = useKvControllable(props, "modelValue", props.defaultValue, emit);
		const baseId = useKvId("accordion");
		const isOpen = (id) => Array.isArray(state.value) ? state.value.includes(id) : state.value === id;
		const toggle = (id) => {
			if (props.multiple) {
				const current = Array.isArray(state.value) ? state.value : state.value ? [state.value] : [];
				state.value = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
			} else state.value = isOpen(id) ? "" : id;
			emit("change", state.value);
		};
		return () => h("div", { class: "kv-accordion" }, props.items.map((item) => {
			const open = isOpen(item.id);
			const triggerId = `${baseId.value}-trigger-${item.id}`;
			const panelId = `${baseId.value}-panel-${item.id}`;
			return h("section", { class: "kv-accordion__item" }, [h(`h${props.headingLevel}`, { class: "kv-accordion__heading" }, h("button", {
				class: "kv-accordion__trigger",
				id: triggerId,
				type: "button",
				disabled: item.disabled,
				"aria-expanded": open,
				"aria-controls": panelId,
				onClick: () => toggle(item.id)
			}, [h("span", item.title), h("span", {
				class: "kv-accordion__icon",
				"aria-hidden": "true"
			}, open ? "−" : "+")])), open && h("div", {
				class: "kv-accordion__panel",
				id: panelId,
				role: "region",
				"aria-labelledby": triggerId
			}, slots[`item-${item.id}`]?.({ item }) ?? slots.default?.({ item }) ?? item.content)]);
		}));
	}
});
var KvTable = defineComponent({
	name: "KvTable",
	props: {
		items: {
			type: Array,
			required: true
		},
		columns: {
			type: Array,
			required: true
		},
		rowKey: {
			type: [String, Function],
			required: true
		},
		sort: {
			type: Object,
			default: void 0
		},
		defaultSort: {
			type: Object,
			default: void 0
		},
		selectedKeys: {
			type: Array,
			default: void 0
		},
		defaultSelectedKeys: {
			type: Array,
			default: () => []
		},
		selectable: Boolean,
		loading: Boolean,
		loadingText: {
			type: String,
			default: "Loading data"
		},
		emptyText: {
			type: String,
			default: "No data available"
		},
		caption: String
	},
	emits: [
		"update:sort",
		"sort-change",
		"update:selectedKeys",
		"selection-change",
		"row-click"
	],
	setup(props, { emit, slots }) {
		const sort = useKvControllable(props, "sort", props.defaultSort, emit);
		const selection = useKvControllable(props, "selectedKeys", props.defaultSelectedKeys, emit);
		const keyFor = (item) => typeof props.rowKey === "function" ? props.rowKey(item) : item[props.rowKey];
		const sortable = (column) => {
			if (!column.sortable) return;
			const next = {
				key: column.key,
				direction: sort.value?.key === column.key && sort.value.direction === "asc" ? "desc" : "asc"
			};
			sort.value = next;
			emit("sort-change", next);
		};
		const setSelected = (key, next) => {
			selection.value = next ? [.../* @__PURE__ */ new Set([...selection.value, key])] : selection.value.filter((item) => item !== key);
			emit("selection-change", selection.value);
		};
		const allSelected = () => props.items.length > 0 && props.items.every((item) => selection.value.includes(keyFor(item)));
		const toggleAll = (next) => {
			const visible = props.items.map(keyFor);
			selection.value = next ? [.../* @__PURE__ */ new Set([...selection.value, ...visible])] : selection.value.filter((key) => !visible.includes(key));
			emit("selection-change", selection.value);
		};
		return () => h("div", {
			class: "kv-table-wrap",
			"aria-busy": props.loading || void 0
		}, h("table", { class: "kv-table" }, [
			props.caption && h("caption", props.caption),
			h("thead", h("tr", [props.selectable && h("th", {
				class: "kv-table__select",
				scope: "col"
			}, h("input", {
				type: "checkbox",
				"aria-label": "Select all visible rows",
				checked: allSelected(),
				onChange: (event) => toggleAll(event.target.checked)
			})), ...props.columns.map((column) => h("th", {
				scope: "col",
				style: { width: column.width },
				class: `kv-table__cell--${column.align ?? "start"}`,
				"aria-sort": sort.value?.key === column.key ? sort.value.direction === "asc" ? "ascending" : "descending" : void 0
			}, column.sortable ? h("button", {
				class: "kv-table__sort",
				type: "button",
				onClick: () => sortable(column)
			}, [column.label, h("span", { "aria-hidden": "true" }, sort.value?.key === column.key ? sort.value.direction === "asc" ? " ↑" : " ↓" : " ↕")]) : column.label))])),
			h("tbody", props.loading ? h("tr", h("td", {
				colspan: props.columns.length + (props.selectable ? 1 : 0),
				class: "kv-table__state"
			}, [h("span", {
				class: "kv-spinner",
				"aria-hidden": "true"
			}), h("span", props.loadingText)])) : props.items.length === 0 ? h("tr", h("td", {
				colspan: props.columns.length + (props.selectable ? 1 : 0),
				class: "kv-table__state"
			}, slots.empty?.() ?? props.emptyText)) : props.items.map((item, rowIndex) => {
				const key = keyFor(item);
				return h("tr", {
					class: selection.value.includes(key) && "is-selected",
					onClick: () => emit("row-click", item, rowIndex)
				}, [props.selectable && h("td", { class: "kv-table__select" }, h("input", {
					type: "checkbox",
					"aria-label": `Select row ${rowIndex + 1}`,
					checked: selection.value.includes(key),
					onClick: (event) => event.stopPropagation(),
					onChange: (event) => setSelected(key, event.target.checked)
				})), ...props.columns.map((column) => {
					const cellValue = column.value ? column.value(item) : item[column.key];
					return h("td", { class: `kv-table__cell--${column.align ?? "start"}` }, slots[`cell-${column.key}`]?.({
						item,
						value: cellValue,
						rowIndex
					}) ?? String(cellValue ?? ""));
				})]);
			}))
		]));
	}
});
//#endregion
//#region src/components/feedback.ts
var KvAlert = defineComponent({
	name: "KvAlert",
	props: {
		title: String,
		status: {
			type: String,
			default: "neutral"
		},
		dismissible: Boolean,
		closeLabel: {
			type: String,
			default: "Dismiss"
		}
	},
	emits: ["dismiss"],
	setup: (props, { emit, slots }) => () => h("div", {
		class: ["kv-alert", `kv-alert--${props.status}`],
		role: props.status === "error" ? "alert" : "status"
	}, [
		h("span", {
			class: "kv-alert__marker",
			"aria-hidden": "true"
		}),
		h("div", { class: "kv-alert__content" }, [props.title && h("div", { class: "kv-alert__title" }, props.title), h("div", { class: "kv-alert__description" }, slots.default?.())]),
		props.dismissible && h("button", {
			class: "kv-alert__close",
			type: "button",
			"aria-label": props.closeLabel,
			onClick: () => emit("dismiss")
		}, "×")
	])
});
var KvBadge = defineComponent({
	name: "KvBadge",
	props: {
		status: {
			type: String,
			default: "neutral"
		},
		dot: Boolean
	},
	setup: (props, { slots }) => () => h("span", { class: ["kv-badge", `kv-badge--${props.status}`] }, [props.dot && h("span", {
		class: "kv-badge__dot",
		"aria-hidden": "true"
	}), slots.default?.()])
});
var KvProgress = defineComponent({
	name: "KvProgress",
	props: {
		value: {
			type: Number,
			default: void 0
		},
		max: {
			type: Number,
			default: 100
		},
		label: {
			type: String,
			required: true
		},
		showValue: Boolean
	},
	setup(props) {
		return () => {
			const percent = props.value === void 0 ? void 0 : Math.max(0, Math.min(100, props.value / props.max * 100));
			return h("div", { class: "kv-progress-wrap" }, [h("div", { class: "kv-progress__meta" }, [h("span", props.label), props.showValue && percent !== void 0 && h("span", `${Math.round(percent)}%`)]), h("div", {
				class: ["kv-progress", percent === void 0 && "kv-progress--indeterminate"],
				role: "progressbar",
				"aria-label": props.label,
				"aria-valuemin": 0,
				"aria-valuemax": props.max,
				"aria-valuenow": props.value
			}, h("span", {
				class: "kv-progress__bar",
				style: percent === void 0 ? void 0 : { width: `${percent}%` }
			}))]);
		};
	}
});
var KvSpinner = defineComponent({
	name: "KvSpinner",
	props: {
		label: {
			type: String,
			default: "Loading"
		},
		size: {
			type: String,
			default: "md"
		}
	},
	setup: (props) => () => h("span", {
		class: ["kv-spinner", `kv-spinner--${props.size}`],
		role: "status"
	}, [h("span", { class: "kv-visually-hidden" }, props.label)])
});
var KvSkeleton = defineComponent({
	name: "KvSkeleton",
	props: {
		width: {
			type: String,
			default: "100%"
		},
		height: {
			type: String,
			default: "1rem"
		},
		radius: {
			type: String,
			default: "var(--kv-radius-sm)"
		}
	},
	setup: (props) => () => h("span", {
		class: "kv-skeleton",
		"aria-hidden": "true",
		style: {
			width: props.width,
			height: props.height,
			borderRadius: props.radius
		}
	})
});
var KvEmptyState = defineComponent({
	name: "KvEmptyState",
	props: {
		title: {
			type: String,
			required: true
		},
		description: String
	},
	setup: (props, { slots }) => () => h("div", { class: "kv-empty-state" }, [
		slots.icon && h("div", {
			class: "kv-empty-state__icon",
			"aria-hidden": "true"
		}, slots.icon()),
		h("h3", { class: "kv-empty-state__title" }, props.title),
		props.description && h("p", { class: "kv-empty-state__description" }, props.description),
		slots.default && h("div", { class: "kv-empty-state__action" }, slots.default())
	])
});
var toastKey = Symbol("KvToast");
function useKvToast() {
	const api = inject(toastKey, null);
	if (!api) throw new Error("useKvToast must be used inside KvToastProvider");
	return api;
}
var toastSequence = 0;
var KvToastProvider = defineComponent({
	name: "KvToastProvider",
	props: {
		placement: {
			type: String,
			default: "bottom-right"
		},
		defaultDuration: {
			type: Number,
			default: 5e3
		},
		teleportTo: {
			type: String,
			default: "body"
		}
	},
	setup(props, { slots }) {
		const toasts = ref([]);
		const mounted = ref(false);
		const timers = /* @__PURE__ */ new Map();
		const dismiss = (id) => {
			toasts.value = toasts.value.filter((item) => item.id !== id);
			clearTimeout(timers.get(id));
			timers.delete(id);
		};
		const toast = (options) => {
			const id = `kv-toast-${++toastSequence}`;
			toasts.value.push({
				...options,
				id
			});
			const duration = options.duration ?? props.defaultDuration;
			if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration));
			return id;
		};
		const clear = () => [...toasts.value].forEach((item) => dismiss(item.id));
		provide(toastKey, {
			toast,
			dismiss,
			clear
		});
		onMounted(() => {
			mounted.value = true;
		});
		onBeforeUnmount(clear);
		return () => [slots.default?.(), mounted.value && h(Teleport, { to: props.teleportTo }, h("div", {
			class: ["kv-toasts", `kv-toasts--${props.placement}`],
			"aria-label": "Notifications"
		}, toasts.value.map((item) => h("section", {
			class: ["kv-toast", `kv-toast--${item.status ?? "info"}`],
			role: item.status === "error" ? "alert" : "status"
		}, [
			h("span", {
				class: "kv-toast__marker",
				"aria-hidden": "true"
			}),
			h("div", { class: "kv-toast__content" }, [h("div", { class: "kv-toast__title" }, item.title), item.description && h("div", { class: "kv-toast__description" }, item.description)]),
			item.actionLabel && h("button", {
				class: "kv-toast__action",
				type: "button",
				onClick: () => item.onAction?.()
			}, item.actionLabel),
			h("button", {
				class: "kv-toast__close",
				type: "button",
				"aria-label": "Dismiss notification",
				onClick: () => dismiss(item.id)
			}, "×")
		]))))];
	}
});
//#endregion
//#region src/index.ts
var components = {
	KvProvider,
	KvContainer,
	KvStack,
	KvCluster,
	KvGrid,
	KvDivider,
	KvVisuallyHidden,
	KvHeading,
	KvText,
	KvLink,
	KvCode,
	KvButton,
	KvIconButton,
	KvButtonGroup,
	KvField,
	KvInput,
	KvTextarea,
	KvSelect,
	KvCombobox,
	KvCheckbox,
	KvRadioGroup,
	KvSwitch,
	KvSlider,
	KvFileInput,
	KvTabs,
	KvBreadcrumbs,
	KvPagination,
	KvSteps,
	KvDropdownMenu,
	KvDialog,
	KvAlertDialog,
	KvDrawer,
	KvPopover,
	KvTooltip,
	KvCard,
	KvAccordion,
	KvTable,
	KvAlert,
	KvBadge,
	KvProgress,
	KvSpinner,
	KvSkeleton,
	KvEmptyState,
	KvToastProvider
};
var KinkyVibes = { install(app) {
	for (const [name, component] of Object.entries(components)) app.component(name, component);
} };
//#endregion
export { KinkyVibes, KinkyVibes as default, KvAccordion, KvAlert, KvAlertDialog, KvBadge, KvBreadcrumbs, KvButton, KvButtonGroup, KvCard, KvCheckbox, KvCluster, KvCode, KvCombobox, KvContainer, KvDialog, KvDivider, KvDrawer, KvDropdownMenu, KvEmptyState, KvField, KvFileInput, KvGrid, KvHeading, KvIconButton, KvInput, KvLink, KvPagination, KvPopover, KvProgress, KvProvider, KvRadioGroup, KvSelect, KvSkeleton, KvSlider, KvSpinner, KvStack, KvSteps, KvSwitch, KvTable, KvTabs, KvText, KvTextarea, KvToastProvider, KvTooltip, KvVisuallyHidden, useKvControllable, useKvFocusTrap, useKvId, useKvPosition, useKvToast };

//# sourceMappingURL=index.js.map