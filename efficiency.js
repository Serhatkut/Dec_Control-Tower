// Global state
let laborData = [];

document.addEventListener('DOMContentLoaded', () => {
    generateLaborData();
    renderKPIs();
    renderCharts();
    renderGranularTables();
    
    // Auto re-render Sankey on resize since logic depends on clientWidth
    window.addEventListener('resize', () => { setTimeout(renderLinehaulSankey, 200); });
    
    // Start live timing and volume simulation
    setInterval(() => {
        const d = new Date();
        document.getElementById('countdownTimer').innerText = d.toTimeString().split(' ')[0];
    }, 1000);
    
    setInterval(() => {
        const today = laborData[laborData.length - 1];
        today.pieces += Math.floor(Math.random() * 5);
        today.stops += Math.floor(Math.random() * 2);
        renderKPIs();
    }, 3000);
});

// UI Modal Handlers to prevent console errors
function showHelpModal() { document.getElementById('help-modal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('help-modal').style.display = 'none'; }
function showTicketInbox() { document.getElementById('ticket-modal').style.display = 'flex'; }
function closeTicketModal() { document.getElementById('ticket-modal').style.display = 'none'; }
function closeRedsModal() { document.getElementById('reds-modal').style.display = 'none'; }
function clearFilters() {}
function autoFilterWorst() { alert('Efficiency Dashboard focuses on site-wide labor logic. Switch to Operations Board to drill into geographical exceptions.'); }

// Formatters
const formatNumber = num => num.toLocaleString();
const formatDec = num => num.toFixed(1);

function calcWow(t_val, l_val, inverse = false) {
    if (l_val === 0 && t_val === 0) return { val: t_val, text: '0.0%', bg: 'trend-neutral', arrow: '▬' };
    if (l_val === 0 && t_val !== 0) return { val: t_val, text: '+100%', bg: inverse ? 'trend-negative' : 'trend-positive', arrow: '▲' };
    const pct = ((t_val - l_val) / l_val) * 100;
    let bg = 'trend-neutral'; let arrow = '▬';
    if (pct > 0) { bg = inverse ? 'trend-negative' : 'trend-positive'; arrow = '▲'; }
    if (pct < 0) { bg = inverse ? 'trend-positive' : 'trend-negative'; arrow = '▼'; }
    return { val: t_val, text: (pct > 0 ? '+' : '') + Math.abs(pct).toFixed(1) + '%', bg: bg, arrow: arrow };
}

function generateLaborData() {
    // Generate 56 days of data (8 weeks)
    const now = Date.now();
    const currentHour = new Date(now).getHours();
    
    for (let i = 56; i >= 0; i--) {
        const date = new Date(now - i * 86400000);
        const isToday = i === 0;
        
        // Base targets
        const baseStops = 14000;
        const baseRoutes = 120;
        const basePieces = 22000;
        
        // Minor daily variance
        const varStops = (Math.random() - 0.5) * 2000;
        const varRoutes = (Math.random() - 0.5) * 10;
        const varPieces = (Math.random() - 0.5) * 4000;
        
        let stops = Math.round(baseStops + varStops);
        let routes = Math.round(baseRoutes + varRoutes);
        let pieces = Math.round(basePieces + varPieces);
        let payrollHours = pieces / 24; // Implicit ~24 PPH average
        
        // Extrapolation Logic for "Today"
        let hoursElapsed = 14; 
        if (isToday) {
            // Assume 6 AM to 8 PM operational shift window (14 hours)
            hoursElapsed = Math.max(1, currentHour - 6);
            if (currentHour < 6) hoursElapsed = 1;
            if (currentHour >= 20) hoursElapsed = 14;
            
            const completionPct = hoursElapsed / 14;
            stops = Math.round(stops * completionPct);
            pieces = Math.round(pieces * completionPct);
            payrollHours = Math.round(payrollHours * completionPct);
        }
        
        // Sub-metrics
        let routeHours = routes * 8;
        if (isToday) routeHours = routes * Math.min(8, hoursElapsed);
        
        laborData.push({
            date: date,
            isToday: isToday,
            stops: Math.max(stops, 1),
            routes: Math.max(routes, 1),
            pieces: Math.max(pieces, 1),
            routeHours: Math.max(routeHours, 1),
            payrollHours: Math.max(payrollHours, 1),
            hoursElapsed: hoursElapsed,
            projectedStops: isToday ? Math.round(stops / (hoursElapsed/14)) : stops,
            projectedPieces: isToday ? Math.round(pieces / (hoursElapsed/14)) : pieces
        });
    }
}

function renderKPIs() {
    const today = laborData[laborData.length - 1];
    const lwDay = laborData[laborData.length - 8];
    
    // SPR
    const tSpr = today.stops / today.routes;
    const lSpr = lwDay.stops / lwDay.routes;
    const sprWow = calcWow(tSpr, lSpr);
    
    // SPOR
    const tSpor = today.stops / today.routeHours;
    const lSpor = lwDay.stops / lwDay.routeHours;
    const sporWow = calcWow(tSpor, lSpor);
    
    // PPH
    const tPph = today.pieces / today.payrollHours;
    const lPph = lwDay.pieces / lwDay.payrollHours;
    const pphWow = calcWow(tPph, lPph);

    const makeCard = (title, val, wow, suffix = '') => `
        <div class="kpi-mini">
            <div class="kpi-mini-title">${title}</div>
            <div class="kpi-mini-val">${typeof val === 'number' ? (Number.isInteger(val) ? formatNumber(val) : formatDec(val)) : val}${suffix}</div>
            <div class="kpi-mini-wow ${wow ? wow.bg : 'trend-neutral'}" style="color:${wow ? '' : '#aaa'};">${wow ? wow.arrow + ' ' + wow.text + ' WoW' : 'LIVE'}</div>
        </div>
    `;

    const kpiContainer = document.getElementById('kpi-container');
    if (!kpiContainer) return;

    if (document.getElementById('scScatterChart')) {
        // We are on Route Board
        kpiContainer.innerHTML = `
            <div class="kpi-group-card" style="border-top: 3px solid #10b981; flex: 2; height:100%;">
                <div class="kg-header"><span class="kg-title">Routing Target Execution</span></div>
                <div class="kg-body" style="grid-template-columns: repeat(2, 1fr) !important; display: grid;">
                    ${makeCard('Stops per Route (SPR)', tSpr, sprWow)}
                    ${makeCard('Stops per On-Route Hr (SPORH)', tSpor, sporWow)}
                </div>
            </div>
            <div class="kpi-group-card" style="border-top: 3px solid #f59e0b; flex: 2; height:100%;">
                <div class="kg-header"><span class="kg-title">Delivery Pacing (Live)</span></div>
                <div class="kg-body" style="grid-template-columns: repeat(2, 1fr) !important; display: grid;">
                    ${makeCard('Current Active Stops', today.stops, null)}
                    ${makeCard('EOD Projected Stops', today.projectedStops, null)}
                </div>
            </div>
        `;
    } else {
        // We are on Hub Board
        kpiContainer.innerHTML = `
            <div class="kpi-group-card" style="border-top: 3px solid #3b82f6; flex: 2; height:100%;">
                <div class="kg-header"><span class="kg-title">Facility Throughput</span></div>
                <div class="kg-body" style="grid-template-columns: repeat(1, 1fr) !important; display: grid;">
                    ${makeCard('Pieces per Hour (PPH)', tPph, pphWow)}
                </div>
            </div>
            <div class="kpi-group-card" style="border-top: 3px solid #d40511; flex: 2; height:100%;">
                <div class="kg-header"><span class="kg-title">Network Linehaul Constraints</span></div>
                <div class="kg-body" style="grid-template-columns: repeat(2, 1fr) !important; display: grid;">
                    ${makeCard('Expected Pieces (Today)', today.projectedPieces, null)}
                    ${makeCard('Avg Network Capacity', '91.4', null, '% LU')}
                </div>
            </div>
        `;
    }
}

function renderCharts() {
    // Setup Chart Defaults
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.color = document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#555';
    Chart.defaults.plugins.tooltip.backgroundColor = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.8)';

    const weeks = [];
    const pphs = [];
    const spors = [];
    const sprs = [];
    
    for(let w=0; w<8; w++) {
        let weekVol = 0; let weekHours = 0;
        let weekStops = 0; let weekRouteHours = 0; let weekRoutes = 0;
        for(let d=0; d<7; d++) {
            const day = laborData[w*7 + d];
            if(!day.isToday) {
                weekVol += day.pieces; weekHours += day.payrollHours + (day.payrollHours * 0.2); // approx agency
                weekStops += day.stops; weekRouteHours += day.routeHours; weekRoutes += day.routes;
            }
        }
        weeks.push('Week ' + (w+1));
        pphs.push(weekVol / weekHours);
        spors.push(weekStops / weekRouteHours);
        sprs.push(weekStops / weekRoutes);
    }

    const canvasHist = document.getElementById('historicalChart');
    if (canvasHist && canvasHist.getContext) {
        const isRouteBoard = document.getElementById('scScatterChart') !== null;
        
        let datasets = [];
        let yAxes = {};
        
        if (isRouteBoard) {
            datasets = [
                { label: 'Stops per Route (SPR)', data: sprs, type: 'bar', backgroundColor: 'rgba(16, 185, 129, 0.7)', borderRadius: 4, yAxisID: 'y' },
                { label: 'Stops per On-Route Hr (SPORH)', data: spors, type: 'line', borderColor: '#3b82f6', borderWidth: 3, tension: 0.3, pointBackgroundColor: '#fff', yAxisID: 'y1' }
            ];
            yAxes = {
                y: { min: 80, position: 'left', title: {display:true, text:'Fleet SPR'} },
                y1: { min: 10, position: 'right', grid:{drawOnChartArea:false}, title:{display:true, text:'Fleet SPORH'} }
            };
        } else {
            datasets = [
                { label: 'Network PPH', data: pphs, type: 'bar', backgroundColor: 'rgba(59, 130, 246, 0.7)', borderRadius: 4, yAxisID: 'y' }
            ];
            yAxes = {
                y: { min: 15, position: 'left', title: {display:true, text:'Pieces Per Hour'} }
            };
        }

        new Chart(canvasHist.getContext('2d'), {
            type: 'bar',
            data: { labels: weeks, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: yAxes, plugins: { legend: { position: 'top' } } }
        });
    }

    const last8Days = laborData.slice(-8);
    const labels = last8Days.map((d, i) => i === 7 ? 'Today' : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.date.getDay()]);
    const canvasPacing = document.getElementById('dailyPacingChart');
    
    if (canvasPacing && canvasPacing.getContext) {
        const isRouteBoard = document.getElementById('scScatterChart') !== null;
        
        const actualData = last8Days.map(d => isRouteBoard ? (d.stops / d.routeHours) : (d.pieces / d.payrollHours));
        const projectedData = last8Days.map(d => {
            if (!d.isToday) return null;
            if (isRouteBoard) return (d.stops / (d.hoursElapsed/14)) / (d.routeHours / (d.hoursElapsed/14));
            return (d.pieces / (d.hoursElapsed/14)) / (d.payrollHours / (d.hoursElapsed/14));
        });
        if(projectedData[7] !== null) projectedData[6] = actualData[6];
        
        const mainColor = isRouteBoard ? '#10b981' : '#f59e0b';
        const bgFill = isRouteBoard ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
        const titleStr = isRouteBoard ? 'Intraday Delivery Pacing (SPORH)' : 'Intraday Hub Processing (PPH)';

        new Chart(canvasPacing.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Live Output', data: actualData, borderColor: mainColor, backgroundColor: bgFill, fill: true, tension: 0.4, borderWidth: 3, pointBackgroundColor: '#fff' },
                    { label: 'Extrapolated Shift Close', data: projectedData, borderColor: '#ef4444', borderDash: [6, 4], tension: 0.4, borderWidth: 3, pointRadius: 6, pointBackgroundColor: '#fff' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: {display:true, text:titleStr} } }, plugins: { tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1); } } } } }
        });
    }
}

// ----------------------------------------------------
// PHASE 5: GRANULAR EFFICIENCY VIEWS & MID-MILE SANKEY
// ----------------------------------------------------

let granularSCs = [];
let granularDrivers = [];
let granularHubs = [];
let granularLinehauls = [];

function generateGranularData() {
    const today = laborData[laborData.length - 1];
    
    // 1. Hubs (Global List matching app.js exactly)
    const hubList = ['BCN', 'MAD', 'FRA', 'CDG', 'LHR', 'AMS', 'IST', 'JFK', 'DEL', 'KUL', 'BKK', 'SYD'];
    
    granularHubs = hubList.map(name => {
        const pFactor = 1 / hubList.length;
        const pieces = Math.floor(today.pieces * pFactor) + Math.floor((Math.random()-0.5)*1000);
        const hours = Math.floor(today.payrollHours * pFactor) + Math.floor((Math.random()-0.5)*20);
        const agencyPct = 0.2 + Math.random() * 0.4;
        return { name, pieces, hours: Math.max(hours, 1), agencyHours: Math.round(hours * agencyPct), payrollHours: Math.round(hours * (1-agencyPct)) };
    }).sort((a,b) => (a.pieces/a.hours) - (b.pieces/b.hours)); // Sort worst PPH first

    // 2. Service Centers (Dynamically mapped to Hubs: e.g. BCN-SC1 to BCN-SC3)
    let scList = [];
    hubList.forEach(hub => {
        // Assume 2 to 3 SCs per Hub
        const scCount = 2 + Math.floor(Math.random() * 2);
        for(let i=1; i<=scCount; i++) {
            scList.push(`${hub}-SC${i}`);
        }
    });
    
    granularSCs = scList.map(name => {
        const routes = Math.max(5, Math.floor(today.routes / scList.length) + Math.floor((Math.random()-0.5)*5));
        const rFactor = routes / today.routes;
        const stops = Math.floor(today.stops * rFactor) + Math.floor((Math.random()-0.5)*50);
        const hours = (routes * 8) * (today.hoursElapsed / 14); // Average 8 hours projected per route
        const agencyPct = 0.1 + Math.random() * 0.3; // 10% to 40% agency
        return { name, routes, payrollRoutes: Math.round(routes * (1-agencyPct)), agencyRoutes: Math.round(routes * agencyPct), stops, hours: Math.max(hours, 1) };
    }).sort((a,b) => (b.stops/(b.routes||1)) - (a.stops/(a.routes||1)));

    // 3. Drivers / Routes (Map routes to SCs!)
    granularDrivers = [];
    granularSCs.forEach(sc => {
        for(let i=1; i<=sc.routes; i++) {
            const stops = Math.floor(sc.stops / sc.routes) + Math.floor((Math.random()-0.5)*20);
            const hours = (8) * (today.hoursElapsed / 14) + (Math.random()-0.5)*2;
            const type = Math.random() > 0.75 ? 'Agency' : 'Payroll';
            // Output example: BCN-SC1-R01
            granularDrivers.push({ name: `${sc.name}-R${i.toString().padStart(2, '0')}`, type, stops: Math.max(1, stops), hours: Math.max(0.5, hours) });
        }
    });
    granularDrivers.sort((a,b) => (b.stops/b.hours) - (a.stops/a.hours));

    // 4. Linehaul Mid-Mile Networks (LU%)
    const edges = [
        { src: 'MAD', dst: 'BCN', cap: 5000 },
        { src: 'FRA', dst: 'MUC', cap: 8000 },
        { src: 'CDG', dst: 'LYS', cap: 4000 },
        { src: 'AMS', dst: 'FRA', cap: 3000 },
        { src: 'LHR', dst: 'CDG', cap: 2500 },
        { src: 'MAD', dst: 'LYS', cap: 3500 },
        { src: 'IST', dst: 'FRA', cap: 6000 },
        { src: 'JFK', dst: 'LHR', cap: 12000 }
    ];
    
    granularLinehauls = edges.map(e => {
        const vol = Math.floor(e.cap * (0.75 + Math.random() * 0.23)); // 75% to 98% utilization
        return { src: e.src, dst: e.dst, vol: vol, cap: e.cap, lu: vol / e.cap };
    }).sort((a,b) => b.lu - a.lu);
}

function getMetricColor(metric, thresholds, inverse = false) {
    if (inverse) {
        if (metric > thresholds[1]) return 'color: #ef4444; font-weight: bold; font-family: monospace;';
        if (metric > thresholds[0]) return 'color: #f59e0b; font-weight: bold; font-family: monospace;';
    } else {
        if (metric < thresholds[0]) return 'color: #ef4444; font-weight: bold; font-family: monospace;'; // Bad
        if (metric < thresholds[1]) return 'color: #f59e0b; font-weight: bold; font-family: monospace;'; // Warn
    }
    return 'color: #10b981; font-weight: bold; font-family: monospace;'; // Good
}

function renderGranularTables() {
    generateGranularData();

    // Render SC Table
    const scDiv = document.getElementById('view-eff-sc');
    if (scDiv) {
        let scHtml = `<div style="max-height: 250px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed;">
            <thead><tr style="height: 36px; border-bottom: 2px solid #ccc;">
                <th style="padding: 4px; text-align: left;">Service Center</th>
                <th class="numeric center" style="padding: 4px;">Routes (Payroll | Agency)</th>
                <th class="numeric center" style="padding: 4px;">Tot Stops</th>
                <th class="numeric center" style="padding: 4px;" title="Stops per Route">SPR</th>
                <th class="numeric center" style="padding: 4px;" title="Stops per On-Route Hr">SPOR</th>
            </tr></thead><tbody>`;
        granularSCs.forEach(sc => {
            const spr = sc.stops / sc.routes;
            const spor = sc.stops / sc.hours;
            scHtml += `<tr style="cursor:pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#333'; this.style.color='#fff';" onmouseout="this.style.background='transparent'; this.style.color='inherit';">
                <td style="padding: 8px 4px; font-weight:600;">${sc.name}</td>
                <td class="numeric center" style="padding: 8px 4px;">${formatNumber(sc.routes)} <span style="color:#aaa; font-size:10px;">(${sc.payrollRoutes} | ${sc.agencyRoutes})</span></td>
                <td class="numeric center" style="padding: 8px 4px;">${formatNumber(sc.stops)}</td>
                <td class="numeric center" style="padding: 8px 4px; ${getMetricColor(spr, [90, 110])}">${spr.toFixed(1)}</td>
                <td class="numeric center" style="padding: 8px 4px; ${getMetricColor(spor, [14, 18])}">${spor.toFixed(1)}</td>
            </tr>`;
        });
        scHtml += `</tbody></table></div>`;
        scDiv.innerHTML = scHtml;
    }

    // Render Route Table
    const routeDiv = document.getElementById('view-eff-route');
    if (routeDiv) {
        let drHtml = `<div style="max-height: 250px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed;">
            <thead><tr style="height: 36px; border-bottom: 2px solid #ccc;">
                <th style="padding: 4px; text-align: left;">Driver / Route Code</th>
                <th class="numeric center" style="padding: 4px;">Worker Type</th>
                <th class="numeric center" style="padding: 4px;">Total Stops</th>
                <th class="numeric center" style="padding: 4px;" title="Stops per Route">SPR</th>
                <th class="numeric center" style="padding: 4px;" title="Stops per On-Route Hr">SPORH</th>
            </tr></thead><tbody>`;
        granularDrivers.slice(0, 50).forEach(dr => {
            const spr = dr.stops; 
            const spor = dr.stops / dr.hours;
            const typeColor = dr.type === 'Agency' ? '#f59e0b' : '#3b82f6';
            drHtml += `<tr style="cursor:pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#333'; this.style.color='#fff';" onmouseout="this.style.background='transparent'; this.style.color='inherit';">
                <td style="padding: 8px 4px; font-weight:600;">${dr.name}</td>
                <td class="numeric center" style="padding: 8px 4px;"><span style="background:${typeColor}; color:white; padding: 2px 6px; border-radius: 4px; font-size:10px;">${dr.type}</span></td>
                <td class="numeric center" style="padding: 8px 4px;">${formatNumber(dr.stops)}</td>
                <td class="numeric center" style="padding: 8px 4px; ${getMetricColor(spr, [90, 110])}">${spr.toFixed(0)}</td>
                <td class="numeric center" style="padding: 8px 4px; ${getMetricColor(spor, [14, 18])}">${spor.toFixed(1)}</td>
            </tr>`;
        });
        drHtml += `</tbody></table></div>`;
        routeDiv.innerHTML = drHtml;
        
        // Setup Scatter Plots exclusively on Route Board
        setTimeout(renderScatterPlots, 100);
    }

    // Render Hub Table
    const hubDiv = document.getElementById('view-eff-hub');
    if (hubDiv) {
        let hubHtml = `<div style="max-height: 250px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed;">
            <thead><tr style="height: 36px; border-bottom: 2px solid #ccc;">
                <th style="padding: 4px; text-align: left;">Inside Hub Operations Center</th>
                <th class="numeric center" style="padding: 4px;">Pieces Processed</th>
                <th class="numeric center" style="padding: 4px;">Labor Hr (Payroll | Agency)</th>
                <th class="numeric center" style="padding: 4px;" title="Pieces per Hour">PPH</th>
            </tr></thead><tbody>`;
        granularHubs.forEach(hub => {
            const pph = hub.pieces / hub.hours;
            hubHtml += `<tr style="cursor:pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#333'; this.style.color='#fff';" onmouseout="this.style.background='transparent'; this.style.color='inherit';">
                <td style="padding: 8px 4px; font-weight:600;">${hub.name}</td>
                <td class="numeric center" style="padding: 8px 4px;">${formatNumber(hub.pieces)}</td>
                <td class="numeric center" style="padding: 8px 4px;">${formatNumber(hub.hours)} <span style="color:#aaa; font-size:10px;">(${hub.payrollHours} | ${hub.agencyHours})</span></td>
                <td class="numeric center" style="padding: 8px 4px; ${getMetricColor(pph, [20, 24])}">${pph.toFixed(1)}</td>
            </tr>`;
        });
        hubHtml += `</tbody></table></div>`;
        hubDiv.innerHTML = hubHtml;
    }

    const sankeyDiv = document.getElementById('view-eff-sankey');
    if (sankeyDiv) {
        renderLinehaulSankey();
    }
}

// ----------------------------------------------------
// CHART.JS SCATTER PLOTS (ROUTE EFFICIENCY ONLY)
// ----------------------------------------------------
function renderScatterPlots() {
    const canvasSC = document.getElementById('scScatterChart');
    if (canvasSC) {
        const scData = granularSCs.map(sc => ({ x: sc.stops, y: sc.stops/sc.routes, name: sc.name }));
        new Chart(canvasSC.getContext('2d'), {
            type: 'scatter',
            data: { datasets: [{
                label: 'Service Centers (Vol vs SPR)',
                data: scData,
                backgroundColor: 'rgba(212, 5, 17, 0.7)',
                pointRadius: 6,
                pointHoverRadius: 8
            }]},
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: {display:true, text:'Total Volume Delivered (Parcels/Stops)'} },
                    y: { title: {display:true, text:'Network SPR (Stops per Route)'} }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.name}: Vol=${ctx.parsed.x}, SPR=${ctx.parsed.y.toFixed(1)}`
                        }
                    }
                }
            }
        });
    }

    const canvasDr = document.getElementById('driverScatterChart');
    if (canvasDr) {
        // Sample down to 50 drivers to keep visual clean
        const drData = granularDrivers.slice(0, 60).map(dr => ({ 
            x: dr.stops, y: dr.stops/dr.hours, name: dr.name, type: dr.type 
        }));
        
        new Chart(canvasDr.getContext('2d'), {
            type: 'scatter',
            data: { 
                datasets: [
                    {
                        label: 'Payroll Drivers',
                        data: drData.filter(d => d.type === 'Payroll'),
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        pointRadius: 5
                    },
                    {
                        label: 'Agency Drivers',
                        data: drData.filter(d => d.type === 'Agency'),
                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                        pointRadius: 5, pointStyle: 'rect'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: {display:true, text:'Total Stops Attempted (Density Yield)'} },
                    y: { title: {display:true, text:'Driver SPORH (Pacing/Velocity)'} }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.raw.name}: ${ctx.parsed.x} Stops, ${ctx.parsed.y.toFixed(1)} SPORH`
                        }
                    }
                }
            }
        });
    }
}

// --- Theme Toggle ---
window.toggleTheme = function() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Natively flip Chart.js text colors to remain legible over glassmorphism
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = newTheme === 'dark' ? '#94a3b8' : '#555';
        Chart.defaults.plugins.tooltip.backgroundColor = newTheme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.8)';
        for (let id in Chart.instances) {
            Chart.instances[id].update();
        }
    }
}

// ----------------------------------------------------
// NATIVE MID-MILE SVG CAPACITY SANKEY RENDERER
function renderLinehaulSankey() {
    const FLAGS = {'MAD':'🇪🇸','BCN':'🇪🇸','FRA':'🇩🇪','MUC':'🇩🇪','CDG':'🇫🇷','LYS':'🇫🇷','AMS':'🇳🇱','LHR':'🇬🇧','JFK':'🇺🇸','DEL':'🇮🇳','KUL':'🇲🇾','BKK':'🇹🇭','SYD':'🇦🇺','IST':'🇹🇷'};
    const w = document.getElementById('view-eff-sankey').clientWidth || 800;
    const h = 400; const nodeW = 12; const pad = 16;
    
    const leftNodes = {}; const rightNodes = {};
    granularLinehauls.forEach(e => { leftNodes[e.src] = (leftNodes[e.src] || 0) + e.vol; rightNodes[e.dst] = (rightNodes[e.dst] || 0) + e.vol; });
    
    const sortedLeft = Object.entries(leftNodes).sort((a,b)=>b[1]-a[1]);
    const sortedRight = Object.entries(rightNodes).sort((a,b)=>b[1]-a[1]);
    
    const maxTotalVol = Math.max(sortedLeft.reduce((s, n) => s + n[1], 0), sortedRight.reduce((s, n) => s + n[1], 0)) || 1;
    const maxNodes = Math.max(sortedLeft.length, sortedRight.length);
    const availableHeight = h - (maxNodes - 1) * pad - 40; 
    const ky = availableHeight / maxTotalVol;

    let curY = 20; const lPos = {};
    sortedLeft.forEach(([n, v]) => { lPos[n] = { y: curY, h: v * ky, offset: 0, v }; curY += v * ky + pad; });

    curY = 20; const rPos = {};
    sortedRight.forEach(([n, v]) => { rPos[n] = { y: curY, h: v * ky, offset: 0, v }; curY += v * ky + pad; });

    let svg = `<div style="text-align: center; font-weight: 800; font-size: 14px; margin-bottom: 5px; color: var(--dhl-red); letter-spacing: 0.5px;">Mid-Mile Trunk Capacity (LU%) Flow Map</div>`;
    svg += `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="background:#fcfcfc; border-radius:8px; font-family:Inter,sans-serif; overflow:visible;">`;
    
    sortedLeft.forEach(([n, v]) => {
        const node = lPos[n];
        const baseFlag = FLAGS[n.split('-')[0]] || '';
        let nText = `${baseFlag} ${n}`;
        svg += `<rect x="80" y="${node.y}" width="${nodeW}" height="${Math.max(2, node.h)}" fill="#f59e0b" stroke="#333" rx="2"></rect>`;
        svg += `<text x="70" y="${node.y + node.h/2}" dy="4" text-anchor="end" font-size="12" font-weight="bold">${nText}</text>`;
    });
    sortedRight.forEach(([n, v]) => {
        const node = rPos[n];
        const baseFlag = FLAGS[n.split('-')[0]] || '';
        let nText = `${n} ${baseFlag}`;
        svg += `<rect x="${w - 80 - nodeW}" y="${node.y}" width="${nodeW}" height="${Math.max(2, node.h)}" fill="#f59e0b" stroke="#333" rx="2"></rect>`;
        svg += `<text x="${w - 70}" y="${node.y + node.h/2}" dy="4" text-anchor="start" font-size="12" font-weight="bold">${nText}</text>`;
    });

    granularLinehauls.forEach(e => {
        const src = lPos[e.src]; const dst = rPos[e.dst]; const lw = e.vol * ky;
        const y0 = src.y + src.offset + lw / 2; const x0 = 80 + nodeW;
        const y1 = dst.y + dst.offset + lw / 2; const x1 = w - 80 - nodeW;
        const xMid = (x0 + x1) / 2;
        
        let bColor = 'rgba(16, 185, 129, 0.4)'; // Good capacity
        if (e.lu >= 0.95) bColor = 'rgba(239, 68, 68, 0.7)'; // Red
        else if (e.lu >= 0.85) bColor = 'rgba(245, 158, 11, 0.6)'; // Yellow
        
        svg += `<path d="M ${x0} ${y0} C ${xMid} ${y0}, ${xMid} ${y1}, ${x1} ${y1}" 
                      fill="none" stroke="${bColor}" stroke-width="${Math.max(2, lw)}" 
                      style="transition: stroke 0.2s; cursor:pointer;"
                      onmouseover="this.setAttribute('stroke','rgba(20,20,20, 0.8)')"
                      title="${e.src}➔${e.dst} : LU ${Math.round(e.lu*100)}% (${e.vol}/${e.cap})"
                      onmouseout="this.setAttribute('stroke', '${bColor}')">
                </path>`;
        // Inject LU% Text into the middle of the path
        svg += `<text x="${xMid}" y="${(y0+y1)/2}" dy="-${Math.max(5, lw/2 + 2)}" text-anchor="middle" font-size="10" font-weight="bold" fill="#333" style="pointer-events:none;">${Math.round(e.lu*100)}% LU</text>`;
        
        src.offset += lw; dst.offset += lw;
    });
    
    // Watermark
    const totalCap = granularLinehauls.reduce((sum, e) => sum + e.cap, 0);
    const totalVol = granularLinehauls.reduce((sum, e) => sum + e.vol, 0);
    const avgLU = Math.round((totalVol / totalCap) * 100);
    svg += `<text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="middle" font-size="84" font-weight="900" fill="var(--dhl-red)" opacity="0.05">NETWORK LU%: ${avgLU}%</text>`;
    
    svg += `</svg>`;
    document.getElementById('view-eff-sankey').innerHTML = svg;
}
