import { type PropType } from 'vue';
import type { KvComboboxOption, KvSelectOption, KvSize } from '../types';
export declare const KvField: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    error: StringConstructor;
    required: BooleanConstructor;
    disabled: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    error: StringConstructor;
    required: BooleanConstructor;
    disabled: BooleanConstructor;
}>> & Readonly<{}>, {
    required: boolean;
    disabled: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvInput: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    type: {
        type: PropType<"text" | "email" | "password" | "search" | "tel" | "url" | "number" | "date" | "time" | "datetime-local">;
        default: string;
    };
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    type: {
        type: PropType<"text" | "email" | "password" | "search" | "tel" | "url" | "number" | "date" | "time" | "datetime-local">;
        default: string;
    };
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    type: "number" | "search" | "time" | "text" | "email" | "password" | "tel" | "url" | "date" | "datetime-local";
    invalid: boolean;
    size: KvSize;
    required: boolean;
    disabled: boolean;
    modelValue: string | number;
    defaultValue: string | number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvTextarea: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    rows: {
        type: NumberConstructor;
        default: number;
    };
    resize: {
        type: PropType<"none" | "vertical" | "both">;
        default: string;
    };
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    rows: {
        type: NumberConstructor;
        default: number;
    };
    resize: {
        type: PropType<"none" | "vertical" | "both">;
        default: string;
    };
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    invalid: boolean;
    resize: "vertical" | "none" | "both";
    size: KvSize;
    required: boolean;
    disabled: boolean;
    modelValue: string | number;
    defaultValue: string | number;
    rows: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSelect: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    options: {
        type: PropType<KvSelectOption[]>;
        default: () => never[];
    };
    placeholder: StringConstructor;
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    options: {
        type: PropType<KvSelectOption[]>;
        default: () => never[];
    };
    placeholder: StringConstructor;
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    invalid: boolean;
    size: KvSize;
    required: boolean;
    disabled: boolean;
    modelValue: string | number;
    defaultValue: string | number;
    options: KvSelectOption[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvCombobox: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: StringConstructor;
        default: undefined;
    };
    defaultValue: {
        type: StringConstructor;
        default: string;
    };
    options: {
        type: PropType<KvComboboxOption[]>;
        default: () => never[];
    };
    placeholder: StringConstructor;
    id: StringConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    noResultsText: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("select" | "close" | "update:modelValue" | "open")[], "select" | "close" | "update:modelValue" | "open", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: StringConstructor;
        default: undefined;
    };
    defaultValue: {
        type: StringConstructor;
        default: string;
    };
    options: {
        type: PropType<KvComboboxOption[]>;
        default: () => never[];
    };
    placeholder: StringConstructor;
    id: StringConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    required: {
        type: BooleanConstructor;
        default: undefined;
    };
    invalid: {
        type: BooleanConstructor;
        default: undefined;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    noResultsText: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onSelect?: ((...args: any[]) => any) | undefined;
    onClose?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
    onOpen?: ((...args: any[]) => any) | undefined;
}>, {
    invalid: boolean;
    size: KvSize;
    required: boolean;
    disabled: boolean;
    modelValue: string;
    defaultValue: string;
    options: KvComboboxOption[];
    noResultsText: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvCheckbox: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultValue: BooleanConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    disabled: BooleanConstructor;
    indeterminate: BooleanConstructor;
    value: StringConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultValue: BooleanConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    disabled: BooleanConstructor;
    indeterminate: BooleanConstructor;
    value: StringConstructor;
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    disabled: boolean;
    modelValue: boolean;
    defaultValue: boolean;
    indeterminate: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvRadioGroup: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    options: {
        type: PropType<KvSelectOption[]>;
        default: () => never[];
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    name: StringConstructor;
    disabled: BooleanConstructor;
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: PropType<string | number>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | number>;
        default: string;
    };
    options: {
        type: PropType<KvSelectOption[]>;
        default: () => never[];
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    name: StringConstructor;
    disabled: BooleanConstructor;
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    orientation: "horizontal" | "vertical";
    disabled: boolean;
    modelValue: string | number;
    defaultValue: string | number;
    options: KvSelectOption[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSwitch: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultValue: BooleanConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    disabled: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultValue: BooleanConstructor;
    label: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    disabled: BooleanConstructor;
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    disabled: boolean;
    modelValue: boolean;
    defaultValue: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSlider: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: NumberConstructor;
        default: undefined;
    };
    defaultValue: {
        type: NumberConstructor;
        default: number;
    };
    min: {
        type: NumberConstructor;
        default: number;
    };
    max: {
        type: NumberConstructor;
        default: number;
    };
    step: {
        type: NumberConstructor;
        default: number;
    };
    id: StringConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    showValue: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: NumberConstructor;
        default: undefined;
    };
    defaultValue: {
        type: NumberConstructor;
        default: number;
    };
    min: {
        type: NumberConstructor;
        default: number;
    };
    max: {
        type: NumberConstructor;
        default: number;
    };
    step: {
        type: NumberConstructor;
        default: number;
    };
    id: StringConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    showValue: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    min: number;
    disabled: boolean;
    modelValue: number;
    defaultValue: number;
    max: number;
    step: number;
    showValue: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvFileInput: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    accept: StringConstructor;
    multiple: BooleanConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    prompt: {
        type: StringConstructor;
        default: string;
    };
    emptyText: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:files")[], "change" | "update:files", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    id: StringConstructor;
    accept: StringConstructor;
    multiple: BooleanConstructor;
    disabled: {
        type: BooleanConstructor;
        default: undefined;
    };
    prompt: {
        type: StringConstructor;
        default: string;
    };
    emptyText: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:files"?: ((...args: any[]) => any) | undefined;
}>, {
    disabled: boolean;
    multiple: boolean;
    prompt: string;
    emptyText: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=forms.d.ts.map