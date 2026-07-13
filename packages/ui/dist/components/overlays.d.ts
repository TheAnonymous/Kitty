import { type PropType } from 'vue';
import type { KvPlacement } from '../types';
export declare const KvDialog: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> | null, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("cancel" | "close" | "update:open" | "confirm")[], "cancel" | "close" | "update:open" | "confirm", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
    onClose?: ((...args: any[]) => any) | undefined;
    "onUpdate:open"?: ((...args: any[]) => any) | undefined;
    onConfirm?: ((...args: any[]) => any) | undefined;
}>, {
    size: "sm" | "md" | "lg";
    open: boolean;
    side: "left" | "right";
    defaultOpen: boolean;
    destructive: boolean;
    closeLabel: string;
    closeOnOutside: boolean;
    closeOnEscape: boolean;
    teleportTo: string;
    cancelLabel: string;
    confirmLabel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvAlertDialog: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> | null, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("cancel" | "close" | "update:open" | "confirm")[], "cancel" | "close" | "update:open" | "confirm", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
    onClose?: ((...args: any[]) => any) | undefined;
    "onUpdate:open"?: ((...args: any[]) => any) | undefined;
    onConfirm?: ((...args: any[]) => any) | undefined;
}>, {
    size: "sm" | "md" | "lg";
    open: boolean;
    side: "left" | "right";
    defaultOpen: boolean;
    destructive: boolean;
    closeLabel: string;
    closeOnOutside: boolean;
    closeOnEscape: boolean;
    teleportTo: string;
    cancelLabel: string;
    confirmLabel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvDrawer: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> | null, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("cancel" | "close" | "update:open" | "confirm")[], "cancel" | "close" | "update:open" | "confirm", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    title: {
        type: StringConstructor;
        required: true;
    };
    description: StringConstructor;
    closeLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    closeOnEscape: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
    side: {
        type: PropType<"left" | "right">;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    cancelLabel: {
        type: StringConstructor;
        default: string;
    };
    confirmLabel: {
        type: StringConstructor;
        default: string;
    };
    destructive: BooleanConstructor;
}>> & Readonly<{
    onCancel?: ((...args: any[]) => any) | undefined;
    onClose?: ((...args: any[]) => any) | undefined;
    "onUpdate:open"?: ((...args: any[]) => any) | undefined;
    onConfirm?: ((...args: any[]) => any) | undefined;
}>, {
    size: "sm" | "md" | "lg";
    open: boolean;
    side: "left" | "right";
    defaultOpen: boolean;
    destructive: boolean;
    closeLabel: string;
    closeOnOutside: boolean;
    closeOnEscape: boolean;
    teleportTo: string;
    cancelLabel: string;
    confirmLabel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvPopover: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
    triggerLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("close" | "update:open")[], "close" | "update:open", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    open: {
        type: BooleanConstructor;
        default: undefined;
    };
    defaultOpen: BooleanConstructor;
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
    triggerLabel: {
        type: StringConstructor;
        default: string;
    };
    closeOnOutside: {
        type: BooleanConstructor;
        default: boolean;
    };
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{
    onClose?: ((...args: any[]) => any) | undefined;
    "onUpdate:open"?: ((...args: any[]) => any) | undefined;
}>, {
    open: boolean;
    defaultOpen: boolean;
    triggerLabel: string;
    placement: KvPlacement;
    closeOnOutside: boolean;
    teleportTo: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvTooltip: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    text: {
        type: StringConstructor;
        required: true;
    };
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
    delay: {
        type: NumberConstructor;
        default: number;
    };
    disabled: BooleanConstructor;
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    text: {
        type: StringConstructor;
        required: true;
    };
    placement: {
        type: PropType<KvPlacement>;
        default: string;
    };
    delay: {
        type: NumberConstructor;
        default: number;
    };
    disabled: BooleanConstructor;
    teleportTo: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    disabled: boolean;
    placement: KvPlacement;
    teleportTo: string;
    delay: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=overlays.d.ts.map