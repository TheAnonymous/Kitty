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

const audioTestRequested = new URLSearchParams(window.location.search).get("audio-test") === "1";
const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
if (audioTestRequested && localHost) {
  void import("./audio/offline-test").then(({ installAudioTestApi }) => installAudioTestApi());
}
