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

function updateBreadcrumbs() {
    const b = document.getElementById('breadcrumbs');
    if (!b) return;
    
    let html = '';
    if (activeHubFilter) {
        html += `<span class="breadcrumb-chip" onclick="filterHub('${activeHubFilter}')">${activeHubFilter} &times;</span>`;
    }
    if (activeRouteFilter) {
        html += `<span class="breadcrumb-chip" onclick="filterRoute('${activeRouteFilter}')">${activeRouteFilter} &times;</span>`;
    }
    
    b.innerHTML = html;
    
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
        if (activeHubFilter || activeRouteFilter) {
            resetBtn.style.display = 'inline-block';
        } else {
            resetBtn.style.display = 'none';
        }
    }
}

function clearFilters() {
    activeHubFilter = null;
    activeRouteFilter = null;
    document.getElementById('resetFiltersBtn').style.display = 'none';
    const b = document.getElementById('breadcrumbs');
    if (b) b.innerHTML = '';
    renderCharts();
}

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

    const makeCard = (title, val, wow, iconPath, suffix = '') => {
        const id = title.replace(/\s+/g, '');
        return `
        <div class="kpi-card">
            <div class="kpi-header">
                ${iconPath ? `<img src="${iconPath}" style="height:14px; margin-right:6px; opacity:0.8; filter:brightness(0) invert(1);">` : ''}
                <span class="kpi-title">${title}</span>
            </div>
            <div class="kpi-val">${typeof val === 'number' ? (Number.isInteger(val) ? formatNumber(val) : formatDec(val)) : val}${suffix}</div>
            ${wow ? `<div class="kpi-wow ${wow.bg}">${wow.arrow} ${wow.text} WoW</div>` : `<div class="kpi-wow trend-neutral" style="color:#aaa;">LIVE PROJECTION</div>`}
            <div class="kpi-trend">
                <canvas id="eff-trend-${id}" width="200" height="40" style="display:block; margin-top:8px;"></canvas>
            </div>
        </div>
        `;
    };

    const makePowerBICard = (title, val, suffix, ly, ytd, wowLy, wowYtd) => {
        const id = title.replace(/[^a-zA-Z0-9]/g, '');
        const formatWow = (w) => w >= 0 ? `<span style="color:#22c55e;">${w.toFixed(2)} %</span>` : `<span style="color:#ef4444;">${Math.abs(w).toFixed(2)} %</span>`;
        return `
        <div class="kpi-card" style="display:flex; flex-direction:column; padding:15px; background:var(--bg-panel); border:1px solid var(--border-color); border-radius:4px; box-shadow:none; height: 160px; justify-content: space-between;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column; text-align:left; gap:8px;">
                    <span style="color:var(--text-secondary); font-size:14px; font-weight:600;">${title}</span>
                    <span style="font-size:28px; font-weight:bold; color:var(--text-primary);">${val}${suffix}</span>
                </div>
            </div>
            <div style="display:flex; margin-top:10px;">
                <div style="flex:1; display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-secondary);">
                    <div style="display:flex; justify-content:space-between; padding-right:15px;"><span><span style="color:#aaa;">LY</span> ${ly}</span> ${formatWow(wowLy)}</div>
                    <div style="display:flex; justify-content:space-between; padding-right:15px;"><span><span style="color:#aaa;">YTD LY</span> ${ytd}</span> ${formatWow(wowYtd)}</div>
                </div>
                <div style="flex:1;">
                    <canvas id="eff-trend-${id}" width="100" height="40" style="display:block; width:100%;"></canvas>
                </div>
            </div>
        </div>
        `;
    };

    const kpiContainerRoute = document.getElementById('kpi-container');
    const kpiContainerHub = document.getElementById('kpi-container-hub');
    const kpiContainerLinehaul = document.getElementById('kpi-container-linehaul');

    if (kpiContainerRoute) {
        // We are on Route Board
        kpiContainerRoute.innerHTML = [
            makeCard('Network SPR', tSpr, sprWow, 'assets/icons/logistic.png'),
            makeCard('Network SPORH', tSpor, sporWow, 'assets/icons/logistic.png'),
            makeCard('Active Fleet Size', today.routes, null, 'assets/icons/logistic.png'),
            makeCard('Live Attempted Stops', today.stops, null, 'assets/icons/post.png'),
            makeCard('EOD Projected Stops', today.projectedStops, null, 'assets/icons/live_tracking_rgb_red.png'),
            makeCard('Active Payroll Assign', 35, null, 'assets/icons/document.png', '%'),
            makeCard('Active Agency Assign', 65, null, 'assets/icons/document.png', '%')
        ].join('');
        
        requestAnimationFrame(() => {
            drawEffTrendLine('NetworkSPR', sprWow ? sprWow.bg : '');
            drawEffTrendLine('NetworkSPORH', sporWow ? sporWow.bg : '');
            drawEffTrendLine('ActiveFleetSize', 'trend-neutral');
            drawEffTrendLine('LiveAttemptedStops', 'trend-up');
            drawEffTrendLine('EODProjectedStops', 'trend-up');
            drawEffTrendLine('ActivePayrollAssign', 'trend-neutral');
        });
    } else if (kpiContainerHub) {
        // We are on Hub Board
        let pphData = [2850, 2820, 2870, 2880, 2830, 2810, 2790, 2875];
        let pphGrowth = ((2875 - 2790) / 2790) * 100;
        kpiContainerHub.innerHTML = makePowerBICard('PPH', '2,875', '', '2,872', '2,857', 0.10, 0.10, true, pphData);
    } else if (kpiContainerLinehaul) {
        // We are on Linehaul Board
        kpiContainerLinehaul.innerHTML = [
            makePowerBICard('Daily Avg. Shipments', '33,151', '', '31,828', '22,353', 4.16, 4.19),
            makePowerBICard('LU%', '66.96', ' %', '66.49 %', '66.51 %', 0.71, 0.33),
            makePowerBICard('Daily Avg. Utilized Load', '306.52K', '', '292.98K', '342.11K', 4.62, 24.72)
        ].join('');
        
        requestAnimationFrame(() => {
            drawEffTrendLine('DailyAvgShipments', 'trend-up');
            drawEffTrendLine('LU', 'trend-up');
            drawEffTrendLine('DailyAvgUtilizedLoad', 'trend-up');
        });
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
    
    // 1. Hubs (Strictly Spanish Nodes for Leaflet Mapping)
    const hubList = ['MAD', 'BCN', 'VLC', 'SVQ', 'ZAZ', 'ALC', 'AGP', 'BIO'];
    
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

    // 4. Linehaul Mid-Mile Networks (LU%) entirely internal within Spain
    const edges = [];
    for(let i=0; i<hubList.length; i++) {
        for(let j=i+1; j<hubList.length; j++) {
            // Guarantee MAD connects to everything (Hub & Spoke core), plus random mesh edges (30% probability)
            if(hubList[i] === 'MAD' || hubList[j] === 'MAD' || Math.random() > 0.70) {
                edges.push({ src: hubList[i], dst: hubList[j], cap: Math.floor(Math.random()*6000) + 2000 });
            }
        }
    }
    
    granularLinehauls = edges.map(e => {
        const vol = Math.floor(e.cap * (0.65 + Math.random() * 0.33)); // 65% to 98% utilization
        return { src: e.src, dst: e.dst, vol: vol, cap: e.cap, lu: vol / e.cap };
    }).sort((a,b) => b.lu - a.lu);
}

// Coordinate Dictionary for Spatial Analytics
const SPANISH_HUBS = {
    'MAD': { lat: 40.47, lon: -3.56 }, // Madrid Barajas
    'BCN': { lat: 41.30, lon: 2.08 },  // El Prat
    'VLC': { lat: 39.49, lon: -0.47 }, // Manises
    'SVQ': { lat: 37.42, lon: -5.89 }, // Sevilla
    'ZAZ': { lat: 41.66, lon: -1.00 }, // Zaragoza
    'ALC': { lat: 38.28, lon: -0.56 }, // Alicante
    'AGP': { lat: 36.67, lon: -4.49 }, // Malaga
    'BIO': { lat: 43.30, lon: -2.91 }  // Bilbao
};

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
            const isActive = activeRouteFilter === dr.name ? 'background:#1e293b; color:#10b981;' : '';
            drHtml += `<tr class="table-row" onclick="filterRoute('${dr.name}')" style="cursor:pointer; border-bottom: 1px solid #ccc; ${isActive}" onmouseover="if('${activeRouteFilter}'!=='${dr.name}') { this.style.background='#333'; this.style.color='#fff'; }" onmouseout="if('${activeRouteFilter}'!=='${dr.name}') { this.style.background='transparent'; this.style.color='inherit'; }">
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

    // routeDiv is already processed above

    const sankeyDiv = document.getElementById('view-eff-sankey');
    if (sankeyDiv) {
        renderLinehaulSankey();
        renderLinehaulTables();
    }
    
    const hubScatterCanvas = document.getElementById('hubScatterChart');
    if (hubScatterCanvas) {
        renderHubScatterChart();
        renderHubTrendChart();
        renderHubPowerBITables();
    }
    
    const routeMapDiv = document.getElementById('route-map');
    if (routeMapDiv) {
        renderRouteMap();
    }
}

// ----------------------------------------------------
// CHART.JS SCATTER PLOTS (ROUTE EFFICIENCY ONLY)
// ----------------------------------------------------
function renderScatterPlots() {
    const canvasSC = document.getElementById('scScatterChart');
    if (canvasSC) {
        if (window.scChartInstance) window.scChartInstance.destroy(); // Prevent canvas overlap
        const scData = granularSCs.map(sc => ({ x: sc.stops, y: sc.stops/sc.routes, name: sc.name }));
        
        window.scChartInstance = new Chart(canvasSC.getContext('2d'), {
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
        if (window.drChartInstance) window.drChartInstance.destroy();
        // Sample down to 50 drivers to keep visual clean
        const drData = granularDrivers.slice(0, 60).map(dr => ({ 
            x: dr.stops, y: dr.stops/dr.hours, name: dr.name, type: dr.type 
        }));
        
        const getBg = (d, activeRgba) => (activeRouteFilter && d.name !== activeRouteFilter) ? 'rgba(50,50,50,0.1)' : activeRgba;
        const getRad = (d) => (activeRouteFilter && d.name === activeRouteFilter) ? 10 : (activeRouteFilter ? 3 : 5);
        
        const pData = drData.filter(d => d.type === 'Payroll');
        const aData = drData.filter(d => d.type === 'Agency');
        
        window.drChartInstance = new Chart(canvasDr.getContext('2d'), {
            type: 'scatter',
            data: { 
                datasets: [
                    {
                        label: 'Payroll Drivers',
                        data: pData,
                        backgroundColor: pData.map(d => getBg(d, 'rgba(59, 130, 246, 0.8)')),
                        pointRadius: pData.map(d => getRad(d))
                    },
                    {
                        label: 'Agency Drivers',
                        data: aData,
                        backgroundColor: aData.map(d => getBg(d, 'rgba(245, 158, 11, 0.8)')),
                        pointRadius: aData.map(d => getRad(d)), 
                        pointStyle: 'rect'
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
    let plotData = granularLinehauls;
    if (activeHubFilter) {
        plotData = granularLinehauls.filter(e => e.src === activeHubFilter || e.dst === activeHubFilter);
    }
    plotData.forEach(e => { leftNodes[e.src] = (leftNodes[e.src] || 0) + e.vol; rightNodes[e.dst] = (rightNodes[e.dst] || 0) + e.vol; });
    
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

    plotData.forEach(e => {
        const src = lPos[e.src]; const dst = rPos[e.dst]; const lw = e.vol * ky;
        const y0 = src.y + src.offset + lw / 2; const x0 = 80 + nodeW;
        const y1 = dst.y + dst.offset + lw / 2; const x1 = w - 80 - nodeW;
        const xMid = (x0 + x1) / 2;
        
        let bColor = 'rgba(16, 185, 129, 0.4)'; // Good capacity
        if (e.lu > 0.95) bColor = 'rgba(239, 68, 68, 0.6)'; // Red (Over Capacity)
        else if (e.lu > 0.85) bColor = 'rgba(245, 158, 11, 0.6)'; // Yellow (Warning)
        
        svg += `<path d="M ${x0} ${y0} C ${(x0+x1)/2} ${y0}, ${(x0+x1)/2} ${y1}, ${x1} ${y1}" 
                      fill="none" stroke="${bColor}" stroke-width="${Math.max(2, lw)}" 
                      style="transition: 0.3s; cursor:pointer;" 
                      onmouseover="this.setAttribute('stroke', '#3b82f6')" 
                      onmouseout="this.setAttribute('stroke', '${bColor}')">
                </path>`;
        // Inject LU% Text into the middle of the path
        svg += `<text x="${xMid}" y="${(y0+y1)/2}" dy="-${Math.max(5, lw/2 + 2)}" text-anchor="middle" font-size="10" font-weight="bold" fill="#333" style="pointer-events:none;">${Math.round(e.lu*100)}% LU</text>`;
        
        src.offset += lw; dst.offset += lw;
    });
    
    // Watermark
    const totalCap = plotData.reduce((sum, e) => sum + e.cap, 0);
    const totalVol = plotData.reduce((sum, e) => sum + e.vol, 0);
    const avgLU = totalCap ? Math.round((totalVol / totalCap) * 100) : 0;
    
    svg += `<text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="middle" font-size="84" font-weight="900" fill="var(--dhl-red)" opacity="0.05">NETWORK LU%: ${avgLU}%</text>`;
    svg += `</svg>`;
    document.getElementById('view-eff-sankey').innerHTML = svg;
}

// ----------------------------------------------------
// NATIVE GLOBAL FILTERING & SPARKLINE ENGINE
// ----------------------------------------------------
let activeHubFilter = null;
let activeRouteFilter = null;

function filterHub(hubName) {
    activeHubFilter = activeHubFilter === hubName ? null : hubName;
    updateBreadcrumbs();
    renderCharts();
}

function filterRoute(routeName) {
    activeRouteFilter = activeRouteFilter === routeName ? null : routeName;
    updateBreadcrumbs();
    renderCharts();
}

function drawEffTrendLine(id, bgClass) {
    const canvas = document.getElementById(`eff-trend-${id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth || 200;
    const h = canvas.height = 40;
    
    // Generate simulated 14 point variance array
    const pts = [];
    let val = 50;
    for(let i=0; i<30; i++) {
        val += (Math.random()-0.5)*12;
        pts.push(Math.max(10, Math.min(100, val)));
    }
    const max = Math.max(...pts);
    const min = Math.min(...pts);
    
    // Auto-detect KPI semantic color constraints
    const isRed = bgClass && bgClass.includes('trend-down');
    const color = isRed ? '#ef4444' : '#10b981';
    
    ctx.beginPath();
    ctx.moveTo(0, h - ((pts[0]-min)/(max-min+0.1))*h*0.8 - 5);
    for(let i=1; i<pts.length; i++) {
        ctx.lineTo(i*(w/(pts.length-1)), h - ((pts[i]-min)/(max-min+0.1))*h*0.8 - 5);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = color + '22';
    ctx.fill();
}

// ----------------------------------------------------
// NATIVE OPENSTREETMAP LEAFLET INTEGATION
// ----------------------------------------------------
let hubMapInstance = null;
function renderHubScatterChart() {
    const canvas = document.getElementById('hubScatterChart');
    if (!canvas) return;
    if (window.hubScatterIns) window.hubScatterIns.destroy();
    
    const dataPts = [];
    Object.keys(SPANISH_HUBS).forEach(hub => {
        const vol = Math.floor(Math.random() * 60000000 + 5000000); 
        const pph = Math.floor(Math.random() * 1500 + 2000); 
        dataPts.push({ x: pph, y: vol, name: hub + ' HUB' });
    });
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    window.hubScatterIns = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Hubs',
                data: dataPts,
                backgroundColor: dataPts.map(d => (activeHubFilter && d.name !== activeHubFilter+' HUB') ? 'rgba(150,150,150,0.5)' : '#d40511'),
                pointRadius: dataPts.map(d => (activeHubFilter && d.name === activeHubFilter+' HUB') ? 8 : 5),
                hoverRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.name}: ${formatNumber(ctx.parsed.x)} PPH, ${formatNumber(ctx.parsed.y)} Vol` } }
            },
            scales: {
                x: { 
                    title: { display: true, text: 'PPH', color: isDark?'#ccc':'#555' },
                    grid: { color: isDark?'rgba(255,255,255,0.05)':'#eee' },
                    ticks: { color: isDark?'#aaa':'#666' }
                },
                y: { 
                    title: { display: true, text: 'Total Shipments', color: isDark?'#ccc':'#555' },
                    grid: { color: isDark?'#333':'#eee' },
                    ticks: { callback: val => (val/1000000).toFixed(0) + 'M', color: isDark?'#aaa':'#666' }
                }
            }
        }
    });
}

function renderHubTrendChart() {
    const canvas = document.getElementById('hubTrendChart');
    if (!canvas) return;
    if (window.hubTrendIns) window.hubTrendIns.destroy();
    
    const labels = ['24/46', '24/47', '24/48', '24/49', '24/50', '24/51', '24/52', '25/01'];
    const pphData = [2850, 2820, 2870, 2880, 2830, 2810, 2790, 2875];
    const pphLyData = [2830, 2750, 2860, 2850, 2840, 2820, 2800, 2872];
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    window.hubTrendIns = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'PPH',
                    data: pphData,
                    borderColor: '#d40511',
                    backgroundColor: '#d40511',
                    borderWidth: 2,
                    pointRadius: 4,
                    tension: 0.1
                },
                {
                    label: 'PPH LY',
                    data: pphLyData,
                    borderColor: '#facc15',
                    backgroundColor: '#facc15',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 4,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: isDark?'#aaa':'#666' } },
                y: { display: false, min: 2500, max: 3200 }
            }
        }
    });
}

function renderLinehaulTables() {
    const origDiv = document.getElementById('view-eff-origin-table');
    const destDiv = document.getElementById('view-eff-dest-table');
    const routeDiv = document.getElementById('view-eff-route-table');
    
    let plotData = granularLinehauls;
    if (activeHubFilter) {
        plotData = granularLinehauls.filter(e => e.src === activeHubFilter || e.dst === activeHubFilter);
    }
    
    if (origDiv) {
        let h = `<div style="max-height: 250px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
            <thead><tr style="height: 36px; border-bottom: 2px solid var(--border-color); font-size: 13px;">
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Origin Site</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">LU%</th>
            </tr></thead><tbody style="font-size: 13px;">`;
        
        const origins = Array.from(new Set(plotData.map(e => e.src)));
        origins.forEach(hub => {
            const hData = plotData.filter(e => e.src === hub);
            const vol = hData.reduce((sum, e) => sum + e.vol, 0);
            const cap = hData.reduce((sum, e) => sum + e.cap, 0);
            const lu = cap > 0 ? ((vol/cap)*100).toFixed(2) : 0;
            const bgClass = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
            const luColor = lu > 70 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';
            const isActive = activeHubFilter === hub ? 'background:#1e293b; color:#ef4444;' : '';
            h += `<tr class="table-row" onclick="filterHub('${hub}')" style="cursor:pointer; border-bottom: 1px solid var(--border-color); ${isActive}">
                <td style="padding: 8px 4px; font-weight:600;">${hub} SITE</td>
                <td class="numeric center" style="padding: 8px 4px; background:${bgClass};">${formatNumber(vol)}</td>
                <td class="numeric center" style="padding: 8px 4px; background:${luColor}; font-weight:bold;">${lu}%</td>
            </tr>`;
        });
        h += `</tbody></table></div>`;
        origDiv.innerHTML = h;
    }
    
    if (destDiv) {
        let h = `<div style="max-height: 250px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
            <thead><tr style="height: 36px; border-bottom: 2px solid var(--border-color); font-size: 13px;">
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Destination Site</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">LU%</th>
            </tr></thead><tbody style="font-size: 13px;">`;
        const dests = Array.from(new Set(plotData.map(e => e.dst)));
        dests.forEach(hub => {
            const hData = plotData.filter(e => e.dst === hub);
            const vol = hData.reduce((sum, e) => sum + e.vol, 0);
            const cap = hData.reduce((sum, e) => sum + e.cap, 0);
            const lu = cap > 0 ? ((vol/cap)*100).toFixed(2) : 0;
            const bgClass = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
            const luColor = lu > 70 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';
            const isActive = activeHubFilter === hub ? 'background:#1e293b; color:#ef4444;' : '';
            h += `<tr class="table-row" onclick="filterHub('${hub}')" style="cursor:pointer; border-bottom: 1px solid var(--border-color); ${isActive}">
                <td style="padding: 8px 4px; font-weight:600;">${hub} SITE</td>
                <td class="numeric center" style="padding: 8px 4px; background:${bgClass};">${formatNumber(vol)}</td>
                <td class="numeric center" style="padding: 8px 4px; background:${luColor}; font-weight:bold;">${lu}%</td>
            </tr>`;
        });
        h += `</tbody></table></div>`;
        destDiv.innerHTML = h;
    }
    
    if (routeDiv) {
        let h = `<div style="max-height: 300px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
            <thead><tr style="height: 36px; border-bottom: 2px solid var(--border-color); font-size: 13px;">
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Route</th>
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Origin Site</th>
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Destination Site</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">LU%</th>
            </tr></thead><tbody style="font-size: 13px;">`;
        plotData.forEach(e => {
            const vol = e.vol;
            const lu = (e.lu * 100).toFixed(2);
            const bgClass = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
            h += `<tr class="table-row" style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px 4px; font-weight:600;">${e.src}->${e.dst}</td>
                <td style="padding: 8px 4px; cursor:pointer;" onclick="filterHub('${e.src}')">${e.src} SITE</td>
                <td style="padding: 8px 4px; cursor:pointer;" onclick="filterHub('${e.dst}')">${e.dst} SITE</td>
                <td class="numeric center" style="padding: 8px 4px; background:${bgClass};">${formatNumber(vol)}</td>
                <td class="numeric center" style="padding: 8px 4px; font-weight:bold;">${lu}%</td>
            </tr>`;
        });
        h += `</tbody></table></div>`;
        routeDiv.innerHTML = h;
    }
}

function renderHubPowerBITables() {
    const ctryDiv = document.getElementById('view-eff-country-table');
    const hubDiv = document.getElementById('view-eff-hub-table');
    
    if (ctryDiv) {
        let h = `<div style="max-height: 200px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
            <thead><tr style="height: 36px; border-bottom: 2px solid var(--border-color); font-size: 13px;">
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Country Code</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">PPH</th>
            </tr></thead><tbody style="font-size: 13px;">`;
        ['ESP', 'CZE', 'GBR', 'IND', 'POL', 'PRT', 'TUR'].forEach(code => {
            const vol = Math.floor(Math.random() * 100000 + 2000);
            const pph = Math.floor(Math.random() * 200 + 2700);
            const inlineW = Math.max(5, Math.random() * 85);
            h += `<tr class="table-row" style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px 4px; font-weight:600;">${code}</td>
                <td class="numeric left" style="padding: 8px 4px; position:relative; z-index:1;">
                    <div style="position:absolute; left:0; top:4px; bottom:4px; background:var(--dhl-yellow); width:${inlineW}%; opacity:0.8; z-index:-1; border-radius: 0 4px 4px 0;"></div>
                    <span style="padding-left: 4px; font-size:12px;">${formatNumber(vol)}</span>
                </td>
                <td class="numeric center" style="padding: 8px 4px; background:rgba(250,204,21,0.2); font-weight:bold;">${formatNumber(pph)}</td>
            </tr>`;
        });
        h += `</tbody></table></div>`;
        ctryDiv.innerHTML = h;
    }
    
    if (hubDiv) {
        let h = `<div style="max-height: 550px; overflow-y: auto;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse;">
            <thead><tr style="height: 36px; border-bottom: 2px solid var(--border-color); font-size: 11px;">
                <th style="padding: 4px; text-align: left; color:var(--text-secondary);">Hub</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">Daily Avg. Shipments<br>Growth since Last Week</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">PPH</th>
                <th class="numeric center" style="padding: 4px; color:var(--text-secondary);">PPH Growth<br>since Last Week</th>
            </tr></thead><tbody style="font-size: 12px;">`;
        Object.keys(SPANISH_HUBS).forEach(hub => {
            const vol = Math.floor(Math.random() * 200000 + 50000);
            const volGw = (Math.random() * 100 - 40).toFixed(2);
            const pph = Math.floor(Math.random() * 800 + 2200);
            const pphGw = (Math.random() * 100 - 50).toFixed(2);
            
            let volBg = 'transparent';
            if (volGw > 40) volBg = 'rgba(250,204,21,0.4)'; 
            else if (volGw < 0) volBg = 'rgba(239,68,68,0.3)'; 
            else volBg = 'rgba(250,204,21,0.1)'; 
            
            let pphCol = 'rgba(250,204,21,0.2)'; 
            if (pph > 2800) pphCol = 'rgba(34,197,94,0.3)'; 
            if (pph < 2600) pphCol = 'rgba(239,68,68,0.3)'; 
            
            let pphGwBg = 'transparent';
            if (pphGw > 30) pphGwBg = 'rgba(34,197,94,0.4)'; 
            else if (pphGw < -20) pphGwBg = 'rgba(239,68,68,0.4)'; 
            else pphGwBg = 'rgba(250,204,21,0.3)'; 
            
            const bgClass = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9';
            const isActive = activeHubFilter === hub ? 'background:#1e293b; border: 2px solid #ef4444;' : '';
            h += `<tr class="table-row" onclick="filterHub('${hub}')" style="cursor:pointer; border-bottom: 1px solid var(--border-color); ${isActive}">
                <td style="padding: 8px 4px; font-weight:600;">${hub} HUB</td>
                <td class="numeric center" style="padding: 8px 4px; background:${bgClass};">${formatNumber(vol)}</td>
                <td class="numeric center" style="padding: 8px 4px; background:${volBg}; color:var(--text-primary); font-weight:bold;">${volGw} %</td>
                <td class="numeric center" style="padding: 8px 4px; background:${pphCol}; font-weight:bold;">${formatNumber(pph)}</td>
                <td class="numeric center" style="padding: 8px 4px; background:${pphGwBg}; color:var(--text-primary); font-weight:bold;">${pphGw} %</td>
            </tr>`;
        });
        h += `</tbody></table></div>`;
        hubDiv.innerHTML = h;
    }
}

let routeMapInstance = null;
function renderRouteMap() {
    const mapDiv = document.getElementById('route-map');
    if (!mapDiv) return;

    // Simulate deeply down into Madrid proper
    const centerLat = 40.4168;
    const centerLon = -3.7038;

    if (!routeMapInstance) {
        routeMapInstance = L.map('route-map', { zoomControl: false }).setView([centerLat, centerLon], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(routeMapInstance);
        L.control.zoom({ position: 'bottomright' }).addTo(routeMapInstance);
    }

    routeMapInstance.eachLayer(layer => { if (!!layer.toGeoJSON) routeMapInstance.removeLayer(layer); });

    const driverColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4'];
    
    // Simulate ~7 Driver Territories natively around Madrid center bounds utilizing TSP Math logic!
    for (let i = 0; i < 7; i++) {
        const driverName = granularDrivers[i] ? granularDrivers[i].name : `MAD-SC1-R0${i+1}`;
        if (activeRouteFilter && activeRouteFilter !== driverName) continue; // Instantly cull un-selected arrays when Filtering is Active!

        const offsetLat = (Math.random() - 0.5) * 0.08;
        const offsetLon = (Math.random() - 0.5) * 0.08;
        const boxSize = 0.03 + Math.random() * 0.02; // Varied zone sizes
        
        const bounds = [
            [centerLat + offsetLat, centerLon + offsetLon],
            [centerLat + offsetLat + boxSize, centerLon + offsetLon + (Math.random()*0.01)],
            [centerLat + offsetLat + boxSize, centerLon + offsetLon + boxSize],
            [centerLat + offsetLat - (Math.random()*0.01), centerLon + offsetLon + boxSize]
        ];
        
        const poly = L.polygon(bounds, { color: driverColors[i], fillColor: driverColors[i], fillOpacity: activeRouteFilter ? 0.05 : 0.15, weight: activeRouteFilter ? 1 : 2 }).addTo(routeMapInstance);
        poly.bindTooltip(`<b>Territory Boundary:</b> ${driverName}`);
        
        // Scatter live physical drops heavily hitting 50-75 yields to create massive path arrays!
        const drops = [];
        const numStops = 50 + Math.floor(Math.random()*26);
        let deliveredCount = 0;
        let totalShipmentsArray = 0;
        
        for (let j=0; j<numStops; j++) {
            const dropLat = centerLat + offsetLat + Math.random() * boxSize;
            const dropLon = centerLon + offsetLon + Math.random() * boxSize;
            const shpCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 shipments logic per request
            totalShipmentsArray += shpCount;
            
            const isDelivered = Math.random() > 0.25; // 75% delivered
            if (isDelivered) deliveredCount++;
            
            drops.push({lat: dropLat, lon: dropLon, delivered: isDelivered, shp: shpCount});
        }
        
        // Traveling Salesperson (Nearest Neighbor Euclidean Matrix) routing path execution sequence
        let orderedRoute = [];
        let currentDrop = drops.pop();
        orderedRoute.push(currentDrop);
        
        while(drops.length > 0) {
            let nextIdx = 0;
            let minDist = Infinity;
            for(let k=0; k<drops.length; k++) {
                const dist = Math.pow(drops[k].lat - currentDrop.lat, 2) + Math.pow(drops[k].lon - currentDrop.lon, 2);
                if (dist < minDist) {
                    minDist = dist;
                    nextIdx = k;
                }
            }
            currentDrop = drops.splice(nextIdx, 1)[0];
            orderedRoute.push(currentDrop);
        }
        
        // Draw physical Polyline geometry representing real-time street sequencing flow!
        const routeLatLngs = orderedRoute.map(d => [d.lat, d.lon]);
        L.polyline(routeLatLngs, {color: driverColors[i], weight: 2, opacity: 0.8, dashArray: '5, 8'}).addTo(routeMapInstance).bringToBack();
        
        // Paint final geometric payload clusters
        orderedRoute.forEach(d => {
            const stopColor = d.delivered ? '#10b981' : '#f59e0b';
            L.circleMarker([d.lat, d.lon], {
                radius: activeRouteFilter ? 5 : 4, fillColor: stopColor, color: '#111', weight: 1.5, fillOpacity: 1
            }).addTo(routeMapInstance).bindTooltip(
                `<div style="font-family:Inter;font-size:12px;"><b>${d.delivered ? 'Delivered successfully' : 'Pending Route Scan'}</b><br>
                Driver: ${driverName}<br>Volume Scans At Drop: <b>${d.shp} Shipments</b></div>`
            );
        });
        
        // Add a central anchor icon representing the driver's current coordinates
        if (!activeRouteFilter) {
            const anchorLoc = orderedRoute[deliveredCount] || orderedRoute[orderedRoute.length-1];
            L.circleMarker([anchorLoc.lat, anchorLoc.lon], {
                radius: 8, fillColor: '#fff', color: driverColors[i], weight: 3, fillOpacity: 1
            }).addTo(routeMapInstance).bindTooltip(`<b>Active ETA Navigating Unit</b><br>${driverName}<br>Pacing Yield: ${deliveredCount}/${numStops}`);
        }
    }
}

