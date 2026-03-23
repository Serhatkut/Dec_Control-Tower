const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="toast-alert"></div>
    <div id="custom-tooltip"></div>
    <div id="reds-modal"></div>
    <div id="reds-list"></div>
    <div id="breadcrumbs"></div>
    <div id="lastUpdated"></div>
    <div id="countdownTimer"></div>
    <div id="kpi-container"></div>
    <div id="view1-container"></div>
    <div id="view2-container"></div>
    <div id="view3-container"></div>
    <div id="view4-container"></div>
    <div id="view5-container"></div>
    <div id="view6-container"></div>
    <div id="view7-container"></div>
    <div id="view8-container"></div>
    <div id="view9-container"></div>
    <div id="view10-container"></div>
    <button id="resetFiltersBtn"></button>
</body></html>`);

global.window = dom.window;
global.document = dom.window.document;
global.crypto = require('crypto');
global.setTimeout = () => {};
global.setInterval = () => {};
global.requestAnimationFrame = () => {};
try {
    require("./app.js");
    console.log("SUCCESS: No runtime errors thrown.");
} catch(e) {
    console.log("RUNTIME ERROR ENCOUNTERED:");
    console.log(e);
}
