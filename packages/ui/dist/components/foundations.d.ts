import { type PropType } from 'vue';
export declare const KvProvider: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    tokens: {
        type: PropType<Record<string, string>>;
        default: () => {};
    };
    grain: {
        type: BooleanConstructor;
        default: boolean;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    tokens: {
        type: PropType<Record<string, string>>;
        default: () => {};
    };
    grain: {
        type: BooleanConstructor;
        default: boolean;
    };
}>> & Readonly<{}>, {
    tokens: Record<string, string>;
    grain: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvContainer: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    size: {
        type: PropType<"sm" | "md" | "lg" | "full">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    size: {
        type: PropType<"sm" | "md" | "lg" | "full">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    size: "sm" | "md" | "lg" | "full";
    as: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvStack: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    gap: {
        type: PropType<"xs" | "sm" | "md" | "lg" | "xl">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    gap: {
        type: PropType<"xs" | "sm" | "md" | "lg" | "xl">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    gap: "sm" | "md" | "lg" | "xs" | "xl";
    as: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvCluster: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    gap: {
        type: PropType<"xs" | "sm" | "md" | "lg">;
        default: string;
    };
    align: {
        type: PropType<"start" | "center" | "end" | "stretch">;
        default: string;
    };
    justify: {
        type: PropType<"start" | "center" | "end" | "between">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    gap: {
        type: PropType<"xs" | "sm" | "md" | "lg">;
        default: string;
    };
    align: {
        type: PropType<"start" | "center" | "end" | "stretch">;
        default: string;
    };
    justify: {
        type: PropType<"start" | "center" | "end" | "between">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    gap: "sm" | "md" | "lg" | "xs";
    as: string;
    align: "start" | "center" | "end" | "stretch";
    justify: "start" | "center" | "end" | "between";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvGrid: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    min: {
        type: StringConstructor;
        default: string;
    };
    gap: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    min: {
        type: StringConstructor;
        default: string;
    };
    gap: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    as: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    gap: "sm" | "md" | "lg";
    as: string;
    min: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvDivider: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    orientation: {
        type: PropType<"horizontal" | "vertical">;
        default: string;
    };
}>> & Readonly<{}>, {
    orientation: "horizontal" | "vertical";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvVisuallyHidden: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    focusable: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    focusable: BooleanConstructor;
}>> & Readonly<{}>, {
    as: string;
    focusable: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvHeading: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    level: {
        type: PropType<1 | 2 | 3 | 4 | 5 | 6>;
        default: number;
    };
    eyebrow: StringConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    level: {
        type: PropType<1 | 2 | 3 | 4 | 5 | 6>;
        default: number;
    };
    eyebrow: StringConstructor;
}>> & Readonly<{}>, {
    level: 1 | 2 | 3 | 4 | 5 | 6;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvText: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    tone: {
        type: PropType<"default" | "muted" | "signal">;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    size: {
        type: PropType<"sm" | "md" | "lg">;
        default: string;
    };
    tone: {
        type: PropType<"default" | "muted" | "signal">;
        default: string;
    };
}>> & Readonly<{}>, {
    size: "sm" | "md" | "lg";
    as: string;
    tone: "default" | "muted" | "signal";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvLink: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    href: {
        type: StringConstructor;
        required: true;
    };
    external: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    href: {
        type: StringConstructor;
        required: true;
    };
    external: BooleanConstructor;
}>> & Readonly<{}>, {
    external: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvCode: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    block: BooleanConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    block: BooleanConstructor;
}>> & Readonly<{}>, {
    block: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
//# sourceMappingURL=foundations.d.ts.map