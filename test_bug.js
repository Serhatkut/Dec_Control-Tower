const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;

const scriptContent = fs.readFileSync('app.js', 'utf8');
const scriptEl = window.document.createElement("script");
scriptEl.textContent = scriptContent;
window.document.body.appendChild(scriptEl);

setTimeout(() => {
    try {
        const data = window.shipments;
        const now = Date.now();
        console.log("TOTAL INITIAL SHIPMENTS:", data.length);
        
        const stuck = data.filter(s => {
            if (s.current_phase !== 'Out for Delivery') return false;
            const hoursStagnant = (now - s.last_scan_timestamp) / 3600000;
            return hoursStagnant >= 48;
        });
        
        console.log("NUMBER OF PARCELS STUCK > 48h STILL IN 'Out for Delivery':", stuck.length);
        if (stuck.length > 0) {
            console.log("SAMPLE STUCK PARCEL:");
            console.log("Current Phase:", stuck[0].current_phase);
            console.log("Hours Stagnant:", (now - stuck[0].last_scan_timestamp) / 3600000);
            console.log("Is Pending:", stuck[0].edd_timestamp > 0); // Not perfect check, but will do
        }
        
        process.exit(stuck.length > 0 ? 1 : 0);
    } catch(e) {
        console.error("Test Error:", e);
        process.exit(2);
    }
}, 3000);
