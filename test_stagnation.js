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
    const data = window.shipments;
    const now = Date.now();
    let oldParcels = 0;
    
    console.log("TOTAL INITIAL SHIPMENTS:", data.length);
    
    const stuck = data.filter(s => {
        const hoursStagnant = (now - s.last_scan_timestamp) / 3600000;
        return (hoursStagnant > 48 && s.current_phase === 'Out for Delivery');
    });
    
    console.log("NUMBER OF PARCELS STUCK > 48h STILL IN 'Out for Delivery':", stuck.length);
    
    if (stuck.length > 0) {
        console.log("SAMPLE STUCK PARCEL:");
        console.log(JSON.stringify(stuck[0], null, 2));
        
        let baselineCheck = stuck[0].last_scan_timestamp;
        console.log("Hours Stagnant mathematical diff:", (now - baselineCheck) / 3600000);
    }
    
    const exceptions = data.filter(s => s.current_phase === 'Exception' && (now - s.last_scan_timestamp)/3600000 > 48);
    console.log("NUMBER OF EXCEPTIONS FORCED OVER 48h:", exceptions.length);

    process.exit(0);
}, 2000);
