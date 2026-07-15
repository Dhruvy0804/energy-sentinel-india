const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");

class Element {
  constructor(tagName, id) {
    this.tagName = tagName;
    this.id = id || "";
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.files = [];
    this.firstChild = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    this.firstChild = this.children[0] || null;
    return child;
  }

  addEventListener(event, handler) {
    this.listeners[event] = handler;
  }

  click() {
    if (this.listeners.click) this.listeners.click({ target: this });
  }
}

const elements = {};
for (const match of html.matchAll(/id="([^"]+)"/g)) {
  elements[match[1]] = new Element("div", match[1]);
}

for (const match of html.matchAll(/<input[^>]+id="([^"]+)"[^>]*value="([^"]*)"/g)) {
  elements[match[1]].value = match[2];
}

for (const match of html.matchAll(/<textarea[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
  elements[match[1]].value = match[2].trim();
}

for (const match of html.matchAll(/<select[^>]+id="([^"]+)"[\s\S]*?<option value="([^"]+)"/g)) {
  elements[match[1]].value = match[2];
}

const documentListeners = {};
const document = {
  body: new Element("body", "body"),
  getElementById(id) {
    if (!elements[id]) throw new Error(`Missing element #${id}`);
    return elements[id];
  },
  createElement(tagName) {
    return new Element(tagName);
  },
  createElementNS(namespace, tagName) {
    return new Element(tagName);
  },
  addEventListener(event, handler) {
    documentListeners[event] = handler;
  }
};

const context = {
  console,
  document,
  window: null,
  Blob,
  URL: {
    createObjectURL() {
      return "blob:smoke-test";
    },
    revokeObjectURL() {}
  },
  FileReader: function FileReader() {},
  setTimeout(handler) {
    handler();
    return 1;
  },
  clearTimeout() {}
};
context.window = context;
context.global = context;

vm.createContext(context);
["data.js", "engine.js", "app.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
});

documentListeners.DOMContentLoaded();

const checks = {
  nationalRisk: elements.nationalRisk.textContent,
  supplyGap: elements.supplyGap.textContent,
  procurementRows: elements.procurementRows.children.length,
  networkNodes: elements.networkMap.children.length,
  impactNodes: elements.impactChart.children.length,
  reserveNodes: elements.reserveChart.children.length,
  briefItems: elements.decisionBrief.children.length
};

if (!checks.nationalRisk || !checks.supplyGap || checks.procurementRows < 3 || checks.networkNodes < 10 || checks.impactNodes < 5 || checks.reserveNodes < 5 || checks.briefItems < 3) {
  console.error(checks);
  process.exit(1);
}

console.log(JSON.stringify(checks, null, 2));
