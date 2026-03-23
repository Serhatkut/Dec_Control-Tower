const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');

// Catch virtual console errors
const virtualConsole = new jsdom.VirtualConsole();
let errorCount = 0;
virtualConsole.on("error", (err) => {
    console.error("DOM ERROR:", err);
    errorCount++;
});
virtualConsole.on("jsdomError", (err) => {
    console.error("JSDOM ERROR:", err);
    errorCount++;
});

const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole });
const window = dom.window;

// Shim missing browser APIs for testing cleanly
window.alert = console.log;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};

const scriptContent = fs.readFileSync('app.js', 'utf8');
const scriptEl = window.document.createElement("script");
scriptEl.textContent = scriptContent;

try {
    window.document.body.appendChild(scriptEl);
} catch(e) {
    console.error("Failed to load app.js:", e);
    process.exit(1);
}

setTimeout(() => {
    console.log("--- Starting Exhaustive Test Engine ---");
    let passed = 0;
    
    const runPhase = (name, fn) => {
        try {
            fn();
            console.log(`✅ [PASS] ${name}`);
            passed++;
        } catch(e) {
            console.error(`❌ [FAIL] ${name}:`, e.message);
            errorCount++;
        }
    };

    runPhase("Data Initialization", () => {
        if (!window.shipments || window.shipments.length === 0) throw new Error("Shipments array is empty!");
        if (!window.SYSTEM_TICKETS) throw new Error("System Tickets array is missing!");
    });
    
    runPhase("Global Render Loop (renderAll)", () => {
        window.renderAll();
        if (window.document.getElementById('kpi-container').innerHTML.trim() === '') throw new Error("KPI container failed to render!");
    });

    runPhase("Breaking News Ticker Generator", () => {
        window.renderNewsTicker(window.shipments);
        const ticker = window.document.getElementById('newsTickerContent');
        if (!ticker || ticker.innerHTML.trim() === '') throw new Error("Ticker rendered empty!");
    });

    runPhase("Multi-Filter Targeting", () => {
        window.setMultiFilter({ origin_hub: 'FRA' });
        if (window.state.filters.origin_hub !== 'FRA') throw new Error("State filters failed to update!");
        if (!window.alertHighlightTarget || window.alertHighlightTarget.type !== 'origin_hub') throw new Error("Highlight target payload failed injection!");
    });
    
    runPhase("Sankey / Network Map Render", () => {
        window.renderView9(window.getFilteredData());
        const v9 = window.document.getElementById('view9-container');
        if (!v9.innerHTML.includes('<svg')) throw new Error("SVG Network Map failed to generate edges!");
    });

    runPhase("Visual Flash Triggering Engine", () => {
        window.triggerAlertFlash({type: 'matrix', value: 's4+ or more-Exception'});
        // Since scrollIntoView is shimmed, it just executes selectors without crashing.
    });

    runPhase("Role-Based Ticket Generator", () => {
        window.autoFilterWorst();
        if (window.SYSTEM_TICKETS.length === 0) throw new Error("Auto-Ticket generator failed to spawn tickets!");
    });

    runPhase("Inbox Modal Invocation", () => {
        window.showTicketInbox('hub_manager', 'FRA');
        const count = window.document.getElementById('ticketBadgeInbox');
        if (!count) throw new Error("Ticket Badge missing from DOM!");
    });

    console.log(`\nTest Execution Complete. Engine checks: ${passed} passed, ${errorCount} failed.`);
    process.exit(errorCount > 0 ? 1 : 0);
}, 2000);
