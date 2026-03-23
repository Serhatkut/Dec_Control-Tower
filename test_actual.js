const { JSDOM } = require("jsdom");
JSDOM.fromFile(__dirname + "/index.html", { runScripts: "dangerously", resources: "usable" })
  .then(dom => {
      console.log("JSDOM Loaded index.html successfully.");
      setTimeout(() => {
          console.log("Checking if kpi-container has children...");
          const container = dom.window.document.getElementById('kpi-container');
          if (container && container.innerHTML.length > 50) {
              console.log("SUCCESS: kpi-container populated. Length: " + container.innerHTML.length);
          } else {
              console.log("ERROR: kpi-container is empty!");
          }
      }, 1500);
      
      dom.window.addEventListener('error', event => {
          console.error("DOM Window Error:", event.error);
      });
  })
  .catch(err => {
      console.error("JSDOM initialization failed:", err);
  });
