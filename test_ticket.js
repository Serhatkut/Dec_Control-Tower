const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

const scriptContent = fs.readFileSync('app.js', 'utf8');
const scriptEl = document.createElement("script");
scriptEl.textContent = scriptContent;
document.body.appendChild(scriptEl);

setTimeout(() => {
    try {
        console.log("Initial Role:", document.getElementById('roleSelect').value);
        console.log("Initial Tickets length:", window.SYSTEM_TICKETS.length);
        
        // Open the Reds board to auto-generate
        window.autoFilterWorst();
        
        console.log("Tickets after autoFilterWorst:", window.SYSTEM_TICKETS.length);
        
        // Manual ticket click
        const firstBtn = document.getElementById('ticket-btn-3');
        if(firstBtn) {
            console.log("Clicking manual ticket btn...");
            firstBtn.click();
            console.log("Tickets after manual click:", window.SYSTEM_TICKETS.length);
        } else {
            console.log("No manual ticket button found at idx 3. Attempting 4.");
            const secBtn = document.getElementById('ticket-btn-4');
            if(secBtn) secBtn.click();
        }

        // Try to show inbox
        window.showTicketInbox();
        console.log("Ticket Modal display logic:", document.getElementById('ticket-modal').style.display);
        console.log("Ticket List content length:", document.getElementById('ticket-list').innerHTML.length);
        
        let sampleHTML = document.getElementById('ticket-list').innerHTML.substring(0, 300);
        console.log("Sample List HTML:", sampleHTML);
        
    } catch(e) {
        console.error("ERROR DETECTED:", e);
    }
    process.exit(0);
}, 2000);
