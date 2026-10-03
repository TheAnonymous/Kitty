import { createApp, h } from "vue";
import { KinkyVibes, KvProvider, KvToastProvider } from "@kinky-vibes/ui";
import "@kinky-vibes/ui/styles.css";
import App from "./App.vue";
import "./styles.css";

const Root = {
  setup: () => () => h(KvProvider, { grain: true }, {
    default: () => h(KvToastProvider, { placement: "bottom-right", defaultDuration: 4500 }, { default: () => h(App) }),
  }),
};

createApp(Root).use(KinkyVibes).mount("#app");

// The toast stack carries a name but no role, which ARIA does not allow; as a region it is the landmark for messages.
// It is teleported to the body once the provider has mounted.
function labelToasts(): boolean {
  const toasts = document.querySelector(".kv-toasts");
  if (!toasts) return false;
  toasts.setAttribute("role", "region");
  toasts.setAttribute("aria-label", "Meldungen");
  return true;
}
if (!labelToasts()) {
  const observer = new MutationObserver(() => { if (labelToasts()) observer.disconnect(); });
  observer.observe(document.body, { childList: true });
}

const audioTestRequested = new URLSearchParams(window.location.search).get("audio-test") === "1";
const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
if (audioTestRequested && localHost) {
  void import("./audio/offline-test").then(({ installAudioTestApi }) => installAudioTestApi());
}
