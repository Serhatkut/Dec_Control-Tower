const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;

// Define everything inside the window scope so we don't hit scoping errors
const scriptContent = fs.readFileSync('app.js', 'utf8');
const scriptEl = window.document.createElement("script");
scriptEl.textContent = `
    try {
        ${scriptContent}
        
        // Wait for initialize
        setTimeout(() => {
            console.log("ROLES INIT:", document.getElementById('roleSelect').value);
            
            // Generate auto tickets
            autoFilterWorst();
            console.log("TICKETS LENGTH:", SYSTEM_TICKETS.length);
            
            // Try to open inbox
            showTicketInbox();
            console.log("INBOX MODAL DISPLAY IS:", document.getElementById('ticket-modal').style.display);
            
            let htmlInner = document.getElementById('ticket-list').innerHTML;
            console.log("INBOX LIST HTML LENGTH:", htmlInner.length);
            if(htmlInner.length > 0 && htmlInner.length < 500) {
                console.log("INBOX HTML DETAILS:", htmlInner);
            }
            
            console.log("TEST FINISHED EXECUTING PROPERLY.");
        }, 1500);
    } catch(e) {
        console.error("APP.JS THREW CRITICAL ERROR:", e);
    }
`;
window.document.body.appendChild(scriptEl);

setTimeout(() => {
    process.exit(0);
}, 3000);
