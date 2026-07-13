import { type PropType } from 'vue';
import type { KvBreadcrumbItem, KvMenuItem, KvPlacement, KvStep, KvTabItem } from '../types';
export declare const KvTabs: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: StringConstructor;
        default: undefined;
    };
    defaultValue: StringConstructor;
    items: {
        type: PropType<KvTabItem[]>;
        required: true;
    };
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: StringConstructor;
        default: undefined;
    };
    defaultValue: StringConstructor;
    items: {
        type: PropType<KvTabItem[]>;
        required: true;
    };
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    label: string;
    orientation: "horizontal" | "vertical";
    modelValue: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvBreadcrumbs: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<KvBreadcrumbItem[]>;
        required: true;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<KvBreadcrumbItem[]>;
        required: true;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvPagination: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: NumberConstructor;
        default: undefined;
    };
    defaultValue: {
        type: NumberConstructor;
        default: number;
    };
    total: {
        type: NumberConstructor;
        required: true;
    };
    pageSize: {
        type: NumberConstructor;
        default: number;
    };
    siblingCount: {
        type: NumberConstructor;
        default: number;
    };
    label: {
        type: StringConstructor;
        default: string;
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
    total: {
        type: NumberConstructor;
        required: true;
    };
    pageSize: {
        type: NumberConstructor;
        default: number;
    };
    siblingCount: {
        type: NumberConstructor;
        default: number;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    label: string;
    modelValue: number;
    defaultValue: number;
    pageSize: number;
    siblingCount: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSteps: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<KvStep[]>;
        required: true;
    };
    current: {
        type: PropType<number | string>;
        default: number;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<KvStep[]>;
        required: true;
    };
    current: {
        type: PropType<number | string>;
        default: number;
    };
    label: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
    current: string | number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvDropdownMenu: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    items: {
        type: PropType<KvMenuItem[]>;
        required: true;
    };
    triggerLabel: {
        type: StringConstructor;
        default: string;
    };
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("select" | "update:open")[], "select" | "update:open", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    items: {
        type: PropType<KvMenuItem[]>;
        required: true;
    };
    triggerLabel: {
        type: StringConstructor;
        default: string;
    };
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
}>> & Readonly<{
    onSelect?: ((...args: any[]) => any) | undefined;
    "onUpdate:open"?: ((...args: any[]) => any) | undefined;
}>, {
    open: boolean;
    defaultOpen: boolean;
    triggerLabel: string;
    placement: KvPlacement;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=navigation.d.ts.map