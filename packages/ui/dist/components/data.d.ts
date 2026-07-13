import { type PropType } from 'vue';
import type { KvAccordionItem, KvRowKey, KvSortState, KvTableColumn } from '../types';
export declare const KvCard: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    interactive: BooleanConstructor;
    padding: {
        type: PropType<"none" | "sm" | "md" | "lg">;
        default: string;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    as: {
        type: StringConstructor;
        default: string;
    };
    interactive: BooleanConstructor;
    padding: {
        type: PropType<"none" | "sm" | "md" | "lg">;
        default: string;
    };
}>> & Readonly<{}>, {
    padding: "sm" | "md" | "lg" | "none";
    as: string;
    interactive: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export declare const KvAccordion: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    modelValue: {
        type: PropType<string | string[]>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | string[]>;
        default: () => never[];
    };
    items: {
        type: PropType<KvAccordionItem[]>;
        required: true;
    };
    multiple: BooleanConstructor;
    headingLevel: {
        type: PropType<2 | 3 | 4 | 5 | 6>;
        default: number;
    };
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("change" | "update:modelValue")[], "change" | "update:modelValue", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    modelValue: {
        type: PropType<string | string[]>;
        default: undefined;
    };
    defaultValue: {
        type: PropType<string | string[]>;
        default: () => never[];
    };
    items: {
        type: PropType<KvAccordionItem[]>;
        required: true;
    };
    multiple: BooleanConstructor;
    headingLevel: {
        type: PropType<2 | 3 | 4 | 5 | 6>;
        default: number;
    };
}>> & Readonly<{
    onChange?: ((...args: any[]) => any) | undefined;
    "onUpdate:modelValue"?: ((...args: any[]) => any) | undefined;
}>, {
    modelValue: string | string[];
    defaultValue: string | string[];
    multiple: boolean;
    headingLevel: 2 | 3 | 4 | 5 | 6;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
type RowId = string | number;
export interface KvTableProps<T> {
    items: T[];
    columns: KvTableColumn<T>[];
    rowKey: KvRowKey<T>;
    sort?: KvSortState;
    defaultSort?: KvSortState;
    selectedKeys?: RowId[];
    defaultSelectedKeys?: RowId[];
    selectable?: boolean;
    loading?: boolean;
    loadingText?: string;
    emptyText?: string;
    caption?: string;
}
export interface KvTableSlots<T> {
    empty?: () => any;
    [name: `cell-${string}`]: ((props: {
        item: T;
        value: unknown;
        rowIndex: number;
    }) => any) | undefined;
}
export declare const KvTable: import("vue").DefineComponent<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<any[]>;
        required: true;
    };
    columns: {
        type: PropType<KvTableColumn<any>[]>;
        required: true;
    };
    rowKey: {
        type: PropType<KvRowKey<any>>;
        required: true;
    };
    sort: {
        type: PropType<KvSortState>;
        default: undefined;
    };
    defaultSort: {
        type: PropType<KvSortState>;
        default: undefined;
    };
    selectedKeys: {
        type: PropType<RowId[]>;
        default: undefined;
    };
    defaultSelectedKeys: {
        type: PropType<RowId[]>;
        default: () => never[];
    };
    selectable: BooleanConstructor;
    loading: BooleanConstructor;
    loadingText: {
        type: StringConstructor;
        default: string;
    };
    emptyText: {
        type: StringConstructor;
        default: string;
    };
    caption: StringConstructor;
}>, () => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}>, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, ("update:sort" | "sort-change" | "update:selectedKeys" | "selection-change" | "row-click")[], "update:sort" | "sort-change" | "update:selectedKeys" | "selection-change" | "row-click", import("vue").PublicProps, Readonly<import("vue").ExtractPropTypes<{
    items: {
        type: PropType<any[]>;
        required: true;
    };
    columns: {
        type: PropType<KvTableColumn<any>[]>;
        required: true;
    };
    rowKey: {
        type: PropType<KvRowKey<any>>;
        required: true;
    };
    sort: {
        type: PropType<KvSortState>;
        default: undefined;
    };
    defaultSort: {
        type: PropType<KvSortState>;
        default: undefined;
    };
    selectedKeys: {
        type: PropType<RowId[]>;
        default: undefined;
    };
    defaultSelectedKeys: {
        type: PropType<RowId[]>;
        default: () => never[];
    };
    selectable: BooleanConstructor;
    loading: BooleanConstructor;
    loadingText: {
        type: StringConstructor;
        default: string;
    };
    emptyText: {
        type: StringConstructor;
        default: string;
    };
    caption: StringConstructor;
}>> & Readonly<{
    "onUpdate:sort"?: ((...args: any[]) => any) | undefined;
    "onSort-change"?: ((...args: any[]) => any) | undefined;
    "onUpdate:selectedKeys"?: ((...args: any[]) => any) | undefined;
    "onSelection-change"?: ((...args: any[]) => any) | undefined;
    "onRow-click"?: ((...args: any[]) => any) | undefined;
}>, {
    sort: KvSortState;
    loading: boolean;
    emptyText: string;
    selectable: boolean;
    defaultSort: KvSortState;
    selectedKeys: RowId[];
    defaultSelectedKeys: RowId[];
    loadingText: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, true, {}, any>;
export {};
//# sourceMappingURL=data.d.ts.map