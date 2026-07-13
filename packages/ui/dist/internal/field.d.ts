import type { ComputedRef, InjectionKey } from 'vue';
export interface KvFieldContext {
    inputId: ComputedRef<string>;
    describedBy: ComputedRef<string | undefined>;
    invalid: ComputedRef<boolean>;
    disabled: ComputedRef<boolean>;
    required: ComputedRef<boolean>;
}
export declare const kvFieldKey: InjectionKey<KvFieldContext>;
//# sourceMappingURL=field.d.ts.map