import type { Component, VNodeChild } from 'vue';
export type KvSize = 'sm' | 'md' | 'lg';
export type KvVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type KvStatus = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type KvPlacement = 'top' | 'top-start' | 'top-end' | 'right' | 'right-start' | 'right-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end';
export type KvSortDirection = 'asc' | 'desc';
export interface KvSortState {
    key: string;
    direction: KvSortDirection;
}
export interface KvTableColumn<T> {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
    align?: 'start' | 'center' | 'end';
    value?: (item: T) => unknown;
}
export interface KvToastOptions {
    title: string;
    description?: string;
    status?: Exclude<KvStatus, 'neutral'>;
    duration?: number;
    actionLabel?: string;
    onAction?: () => void;
}
export interface KvToast extends KvToastOptions {
    id: string;
}
export interface KvComboboxOption {
    value: string;
    label: string;
    disabled?: boolean;
}
export interface KvMenuItem {
    id: string;
    label: string;
    disabled?: boolean;
    danger?: boolean;
    icon?: Component;
}
export interface KvStep {
    id: string;
    label: string;
    description?: string;
}
export interface KvTabItem {
    id: string;
    label: string;
    disabled?: boolean;
}
export interface KvAccordionItem {
    id: string;
    title: string;
    content?: string;
    disabled?: boolean;
}
export interface KvBreadcrumbItem {
    label: string;
    href?: string;
}
export interface KvSelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}
export type KvRowKey<T> = keyof T | ((item: T) => string | number);
export type KvCellRenderer<T> = (item: T) => VNodeChild;
//# sourceMappingURL=types.d.ts.map