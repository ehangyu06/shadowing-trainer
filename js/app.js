import { renderLibrary } from "./screens/library.js";
import { renderSettings } from "./screens/settings.js";
import { renderEditor } from "./screens/editor.js";
import { renderShadowing, destroyShadowing } from "./screens/shadowing.js";

const root = document.getElementById("app");
let current = { name: "", key: "" };
let renderGen = 0;

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "settings") return { name: "settings", key: "settings" };
  if (parts[0] === "new") return { name: "editor", key: "new", id: null };
  if (parts[0] === "edit" && parts[1]) return { name: "editor", key: `edit:${parts[1]}`, id: parts[1] };
  if (parts[0] === "train" && parts[1]) return { name: "shadowing", key: `train:${parts[1]}`, id: parts[1] };
  return { name: "library", key: "library" };
}

async function render() {
  const route = parseRoute();
  const myGen = ++renderGen;
  if (current.name === "shadowing" && route.name !== "shadowing") {
    destroyShadowing();
  }
  if (current.key === route.key && route.name === "shadowing") return;
  current = { name: route.name, key: route.key };
  const editing = route.name === "editor";
  document.documentElement.classList.toggle("editor-lock", editing);
  document.body.classList.toggle("editor-lock", editing);
  window.scrollTo(0, 0);
  if (route.name === "settings") renderSettings(root);
  else if (route.name === "editor") await renderEditor(root, route.id);
  else if (route.name === "shadowing") await renderShadowing(root, route.id);
  else await renderLibrary(root);
  if (myGen !== renderGen) return;
}

window.addEventListener("hashchange", () => {
  render().catch((err) => {
    console.error(err);
    root.textContent = "Something went wrong. Reload the page.";
  });
});

render().catch((err) => {
  console.error(err);
  root.textContent = "Something went wrong. Reload the page.";
});
