import { type PropType } from 'vue';
import type { KvSize, KvVariant } from '../types';
export declare const KvButton: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    block: BooleanConstructor;
    variant: {
        type: PropType<KvVariant>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    type: {
        type: PropType<"button" | "submit" | "reset">;
        default: string;
    };
    disabled: BooleanConstructor;
    loading: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, "click"[], "click", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    block: BooleanConstructor;
    variant: {
        type: PropType<KvVariant>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    type: {
        type: PropType<"button" | "submit" | "reset">;
        default: string;
    };
    disabled: BooleanConstructor;
    loading: BooleanConstructor;
}>> & Readonly<{
    onClick?: ((...args: any[]) => any) | undefined;
}>, {
    type: "button" | "reset" | "submit";
    size: KvSize;
    block: boolean;
    variant: KvVariant;
    disabled: boolean;
    loading: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvIconButton: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    variant: {
        type: PropType<KvVariant>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    type: {
        type: PropType<"button" | "submit" | "reset">;
        default: string;
    };
    disabled: BooleanConstructor;
    loading: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, "click"[], "click", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    variant: {
        type: PropType<KvVariant>;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
    type: {
        type: PropType<"button" | "submit" | "reset">;
        default: string;
    };
    disabled: BooleanConstructor;
    loading: BooleanConstructor;
}>> & Readonly<{
    onClick?: ((...args: any[]) => any) | undefined;
}>, {
    type: "button" | "reset" | "submit";
    size: KvSize;
    variant: KvVariant;
    disabled: boolean;
    loading: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvButtonGroup: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
    attached: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        required: true;
    };
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
    attached: BooleanConstructor;
}>> & Readonly<{}>, {
    orientation: "horizontal" | "vertical";
    attached: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=actions.d.ts.map