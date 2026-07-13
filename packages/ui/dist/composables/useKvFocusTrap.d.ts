import { type Ref } from 'vue';
export interface KvFocusTrapOptions {
    onEscape?: () => void;
    restoreFocus?: boolean;
    lockBodyScroll?: boolean;
    initialFocus?: Ref<HTMLElement | null>;
}
export declare function useKvFocusTrap(root: Ref<HTMLElement | null>, active: Ref<boolean>, options?: KvFocusTrapOptions): {
    focusInitial: () => Promise<void>;
};
//# sourceMappingURL=useKvFocusTrap.d.ts.map