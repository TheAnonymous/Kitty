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
