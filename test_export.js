const fs = require('fs');

// Evaluate app.js context without JSDOM
let appJs = fs.readFileSync('app.js', 'utf8');

// Strip out dom dependencies from app.js to run native
appJs = appJs.replace(/const crypto.*/, "const crypto = require('crypto');");
appJs = appJs.replace(/document\.getElementById.*/g, "null;");
appJs = appJs.replace(/document\.querySelector.*/g, "null;");
appJs = appJs.replace(/window\..*/g, "null;");

eval(appJs);

let localShipments = [];
for(let i=0; i<5000; i++) {
    localShipments.push(generateShipment());
}

const stuck = localShipments.filter(s => {
    return s.current_phase === 'Out for Delivery' && (Date.now() - s.last_scan_timestamp)/3600000 > 48;
});

console.log("Stuck OFD Packages > 48hr age:", stuck.length);

if(stuck.length > 0) {
    console.log(stuck[0]);
}

const customExceptions = localShipments.filter(s => s.current_phase === 'Exception' && ['Bad Address', 'Customer Refused', 'Damaged / Repacked'].includes(s.exception_cause));
console.log("Forced Exceptions applied correctly:", customExceptions.length);
