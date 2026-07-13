import { mount } from "@vue/test-utils";
import { KvDialog } from "@kinky-vibes/ui";
import axe from "axe-core";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import StepGrid from "@/components/StepGrid.vue";
import { createFactoryProject } from "@/domain/defaults";

describe("zugängliche Vue-Bedienung", () => {
  it("bewegt den Rasterfokus mit Pfeilen und aktiviert mit Enter", async () => {
    const pattern = createFactoryProject().scenes[0]!.tracks[0]!;
    const wrapper = mount(StepGrid, { attachTo: document.body, props: { pattern, selectedBar: 0, selectedStep: null, locks: [false, false, false, false], playheadBar: 0, playheadStep: 0, playing: false } });
    const cells = wrapper.findAll(".kitty-step");
    await cells[0]!.trigger("focus");
    await cells[0]!.trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(cells[1]!.element);
    await cells[1]!.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("cycle")?.at(-1)).toEqual([0, 1]);
    expect(wrapper.findAll(".kitty-step")).toHaveLength(64);
    wrapper.unmount();
  });

  it("öffnet einen beschrifteten Dialog, hält den Fokus und schließt per Escape", async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(true);
        return () => h(KvDialog, { open: open.value, "onUpdate:open": (value: boolean) => { open.value = value; }, title: "Projekt verwalten", description: "Lokale Projekte" }, { default: () => h("button", { type: "button" }, "Aktion") });
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await nextTick();
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-labelledby")).toBeTruthy();
    expect((document.activeElement as HTMLElement | null)?.closest('[role="dialog"]')).toBeTruthy();
    await wrapper.trigger("keydown", { key: "Escape" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it("hat im Step-Raster keine automatisch erkennbaren kritischen A11y-Verstöße", async () => {
    const pattern = createFactoryProject().scenes[0]!.tracks[1]!;
    const wrapper = mount(StepGrid, { attachTo: document.body, props: { pattern, selectedBar: 0, selectedStep: 0, locks: [false, true, false, false], playheadBar: 0, playheadStep: 0, playing: true } });
    const result = await axe.run(wrapper.element, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.filter((entry) => entry.impact === "critical" || entry.impact === "serious")).toEqual([]);
    wrapper.unmount();
  });
});
