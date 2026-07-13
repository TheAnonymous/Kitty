import { type PropType } from 'vue';
import type { KvSize, KvStatus, KvToastOptions } from '../types';
export declare const KvAlert: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    title: StringConstructor;
    status: {
        type: PropType<KvStatus>;
        default: string;
    };
    dismissible: BooleanConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, "dismiss"[], "dismiss", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    title: StringConstructor;
    status: {
        type: PropType<KvStatus>;
        default: string;
    };
    dismissible: BooleanConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onDismiss?: ((...args: any[]) => any) | undefined;
}>, {
    closeLabel: string;
    dismissible: boolean;
    status: KvStatus;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvBadge: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    status: {
        type: PropType<KvStatus>;
        default: string;
    };
    dot: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    status: {
        type: PropType<KvStatus>;
        default: string;
    };
    dot: BooleanConstructor;
}>> & Readonly<{}>, {
    dot: boolean;
    status: KvStatus;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvProgress: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    value: {
        type: NumberConstructor;
        default: undefined;
    };
    max: {
        type: NumberConstructor;
        default: number;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    showValue: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    value: {
        type: NumberConstructor;
        default: undefined;
    };
    max: {
        type: NumberConstructor;
        default: number;
    };
    label: {
        type: StringConstructor;
        required: true;
    };
    showValue: BooleanConstructor;
}>> & Readonly<{}>, {
    value: number;
    max: number;
    showValue: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSpinner: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    label: {
        type: StringConstructor;
        default: string;
    };
    size: {
        type: PropType<KvSize>;
        default: string;
    };
}>> & Readonly<{}>, {
    label: string;
    size: KvSize;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvSkeleton: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    width: {
        type: StringConstructor;
        default: string;
    };
    height: {
        type: StringConstructor;
        default: string;
    };
    radius: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    width: {
        type: StringConstructor;
        default: string;
    };
    height: {
        type: StringConstructor;
        default: string;
    };
    radius: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    height: string;
    width: string;
    radius: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvEmptyState: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
}>> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
interface KvToastApi {
    toast: (options: KvToastOptions) => string;
    dismiss: (id: string) => void;
    clear: () => void;
}
export declare function useKvToast(): KvToastApi;
export declare const KvToastProvider: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    placement: {
        type: PropType<"top-right" | "top-left" | "bottom-right" | "bottom-left">;
        default: string;
    };
    defaultDuration: {
        type: NumberConstructor;
        default: number;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>, () => (false | import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> | import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>[] | undefined)[], {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    placement: {
        type: PropType<"top-right" | "top-left" | "bottom-right" | "bottom-left">;
        default: string;
    };
    defaultDuration: {
        type: NumberConstructor;
        default: number;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    placement: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    teleportTo: string;
    defaultDuration: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export {};
//# sourceMappingURL=feedback.d.ts.map