document.addEventListener("DOMContentLoaded", function () {

        // Safe event delegation for all current and future links
        document.body.addEventListener("click", function (e) {
            if (e.target.classList.contains("recent-activities-link")) {
                e.preventDefault();
                renderRecentActivities();
                document.getElementById("recent-activities").style.display = "block";
            }
        });


        //---Upcoming Reminders---
        function renderUpcomingReminders(daysAhead = 30) {
            const assets = getStoredAssets();
            const today = new Date();
            const soon = new Date(today);
            soon.setDate(today.getDate() + daysAhead);

            const upcoming = assets
                .filter(a => a.nextServiceDate)
                .map(a => ({
                    ...a,
                    nextService: new Date(a.nextServiceDate)
                }))
                .filter(a => a.nextService > today && a.nextService <= soon)
                .sort((a, b) => a.nextService - b.nextService);

            const list = document.getElementById("upcoming-reminders-list");
            if (!list) return;

            if (upcoming.length === 0) {
                list.innerHTML = `<li class="empty-state">No upcoming services in the next ${daysAhead} days.</li>`;
                return;
            }

            list.innerHTML = upcoming.map(a => `<li>
                <strong>${a.name}</strong> (${a.type || "Asset"})
                – Due: <span style="color:#d2691e;">${a.nextService.toLocaleDateString()}</span>
            </li>`
            ).join("");
        }
        renderUpcomingReminders();

        //---Recent Activities---
        document.querySelectorAll(".recent-activities-link").forEach(function (link) {
            link.addEventListener("click", function (e) {
                e.preventDefault();
                renderRecentActivities();
                document.getElementById("recent-activities").style.display = "block";
            });
        });

        function renderRecentActivities(limit = 15) {
            const assets = getStoredAssets();
            const comments = JSON.parse(localStorage.getItem("assetComments") || "[]");

            let activityList = [];

            assets.forEach(asset => {
                (asset.history || []).forEach(ev => {
                    activityList.push({
                        type: "service",
                        asset: asset.name,
                        date: new Date(ev.date),
                        detail: ev.operation ? `${ev.operation} - ${ev.label}` : "Service Event",
                        note: ev.note || ""
                    });
                });
            });

            comments.forEach(c => {
                activityList.push({
                    type: "comment",
                    asset: "",
                    date: new Date(c.date),
                    detail: "Comment",
                    note: c.text
                });
            });

            activityList.sort((a, b) => b.date - a.date);

            const list = document.getElementById("recent-activities-list");
            if (!list) return;

            if (activityList.length === 0) {
                list.innerHTML = `<li class="empty-state">No recent activities yet.</li>`;
                return;
            }

            list.innerHTML = activityList.slice(0, limit).map(ev => `<li>
                <span style="color:#888;">${ev.date.toLocaleString()}</span> &mdash;
                ${ev.asset ? `<b>${ev.asset}:</b> ` : ""}
                <span>${ev.detail}</span>
                ${ev.note ? `<span style="color:#555;"> &mdash; ${ev.note}</span>` : ""}
            </li>`
            ).join("");
        }

        const DASHBOARD_FILTER_CHIPS = [
            { value: "all", label: "All" },
            { value: "overdue", label: "Overdue" },
            { value: "due-soon", label: "Due Soon" },
            { value: "active", label: "Active" },
            { value: "out-of-service", label: "Out of Service" }
        ];
        // Lightweight score scale used only for UI cues (0-100): healthy > due soon > overdue > out of service.
        const ASSET_HEALTH_SCORES = {
            healthy: 92,
            dueSoon: 68,
            attention: 35,
            outOfService: 20
        };
        const ASSETS_MODAL_COLUMNS = ["Name", "Type", "Status", "Health", "VIN", "Year", "Color", "Added", "Actions"];
        let activeAssetFilter = "all";

        function getAssetStatusInfo(asset, now = new Date()) {
            const statusText = (asset.status || "Active").trim();
            const statusLower = statusText.toLowerCase();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const nextServiceDate = asset.nextServiceDate ? new Date(asset.nextServiceDate) : null;
            if (nextServiceDate && !isNaN(nextServiceDate.getTime())) {
                nextServiceDate.setHours(0, 0, 0, 0);
            }
            const hasNextServiceDate = nextServiceDate && !isNaN(nextServiceDate.getTime());
            const dueSoonLimit = new Date(today);
            dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

            const isOutOfService = ["inactive", "out of service", "out-of-service"].includes(statusLower);
            const isOverdue = hasNextServiceDate && nextServiceDate < today;
            const isDueSoon = hasNextServiceDate && nextServiceDate >= today && nextServiceDate <= dueSoonLimit;

            let healthLabel = "Healthy";
            let healthTone = "good";
            let healthScore = ASSET_HEALTH_SCORES.healthy;

            if (isOutOfService) {
                healthLabel = "Out of Service";
                healthTone = "bad";
                healthScore = ASSET_HEALTH_SCORES.outOfService;
            } else if (isOverdue) {
                healthLabel = "Attention";
                healthTone = "bad";
                healthScore = ASSET_HEALTH_SCORES.attention;
            } else if (isDueSoon) {
                healthLabel = "Due Soon";
                healthTone = "warn";
                healthScore = ASSET_HEALTH_SCORES.dueSoon;
            }

            return { statusText, statusLower, isOutOfService, isOverdue, isDueSoon, healthLabel, healthTone, healthScore };
        }

        function getStatusBadgeClass(statusText) {
            const normalized = (statusText || "").toLowerCase();
            if (normalized === "active") return "status-good";
            if (["inactive", "out of service", "out-of-service"].includes(normalized)) return "status-bad";
            return "status-neutral";
        }

        function renderStatusBadge(statusText) {
            const safeStatus = escapeHtml(statusText || "—");
            return `<span class="status-badge ${getStatusBadgeClass(statusText)}">${safeStatus}</span>`;
        }

        function renderHealthIndicator(asset) {
            const info = getAssetStatusInfo(asset);
            return `<span class="health-indicator health-${info.healthTone}" title="Asset health score">${info.healthLabel} (${info.healthScore})</span>`;
        }

        function matchesAssetFilter(asset, filter) {
            const info = getAssetStatusInfo(asset);
            switch (filter) {
                case "overdue":
                    return info.isOverdue;
                case "due-soon":
                    return info.isDueSoon;
                case "active":
                    return info.statusLower === "active";
                case "out-of-service":
                    return info.isOutOfService;
                case "all":
                default:
                    return true;
            }
        }

        function renderDashboardQuickFilters() {
            const container = document.getElementById("dashboard-quick-filters");
            if (!container) return;
            container.innerHTML = DASHBOARD_FILTER_CHIPS.map(chip => `
                <button type="button" class="filter-chip${activeAssetFilter === chip.value ? " is-active" : ""}" data-dashboard-filter="${chip.value}">
                    ${chip.label}
                </button>
            `).join("");
        }

        function focusAssetView(filter) {
            activeAssetFilter = filter || "all";
            renderDashboardQuickFilters();
            renderAssetsModal(activeAssetFilter);
        }

        //---Quick Statistics---
        function renderQuickStatistics() {
            const assets = getStoredAssets();
            const now = new Date();
            let completedServices = 0;
            let overdueServices = 0;
            let upcomingServices = 0;
            const serviceCounts = {};

            assets.forEach(asset => {
                const statusInfo = getAssetStatusInfo(asset, now);
                if (statusInfo.isOverdue) overdueServices++;
                if (statusInfo.isDueSoon) upcomingServices++;

                (asset.history || []).forEach(ev => {
                    if (["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())) {
                        serviceCounts[asset.name] = (serviceCounts[asset.name] || 0) + 1;
                        if (ev.note && ev.note.toLowerCase().includes("completed")) {
                            completedServices++;
                        }
                    }
                });
            });

            let mostServicedAsset = "";
            let mostServicedCount = 0;
            Object.entries(serviceCounts).forEach(([name, count]) => {
                if (count > mostServicedCount) {
                    mostServicedAsset = name;
                    mostServicedCount = count;
                }
            });

            const statCards = [
                { label: "Total Assets", value: assets.length, action: "open-all-assets" },
                { label: "Overdue Services", value: overdueServices, action: "open-overdue-assets" },
                { label: "Upcoming Services", value: upcomingServices, action: "open-due-soon-assets" },
                { label: "Completed Services", value: completedServices, action: "open-service-summary" },
                { label: "Most Serviced Asset", value: mostServicedAsset || "-", detail: mostServicedCount ? `${mostServicedCount} service events` : "No service events yet", action: "open-most-serviced-asset", assetName: mostServicedAsset || "" }
            ];

            const list = document.getElementById("quick-statistics-list");
            if (!list) return;
            if (assets.length === 0) {
                list.innerHTML = `<li><span class="empty-state">Add your first asset to start building statistics.</span></li>`;
                renderDashboardQuickFilters();
                return;
            }

            list.innerHTML = statCards.map(card => `
                <li>
                    <button type="button" class="quick-stat-card" data-dashboard-action="${card.action}"${card.assetName ? ` data-asset-name="${escapeHtml(card.assetName)}"` : ""}>
                        <span class="quick-stat-label">${card.label}</span>
                        <span class="quick-stat-value">${escapeHtml(String(card.value))}</span>
                        ${card.detail ? `<span class="quick-stat-detail">${escapeHtml(card.detail)}</span>` : ""}
                    </button>
                </li>
            `).join("");
            renderDashboardQuickFilters();
        }

        const dashboardQuickFilters = document.getElementById("dashboard-quick-filters");
        if (dashboardQuickFilters) {
            dashboardQuickFilters.addEventListener("click", (event) => {
                const chip = event.target.closest("button[data-dashboard-filter]");
                if (!chip) return;
                focusAssetView(chip.getAttribute("data-dashboard-filter"));
            });
        }

        const quickStatisticsList = document.getElementById("quick-statistics-list");
        if (quickStatisticsList) {
            quickStatisticsList.addEventListener("click", (event) => {
                const card = event.target.closest("button[data-dashboard-action]");
                if (!card) return;
                const action = card.getAttribute("data-dashboard-action");
                if (action === "open-all-assets") {
                    focusAssetView("all");
                    return;
                }
                if (action === "open-overdue-assets") {
                    focusAssetView("overdue");
                    return;
                }
                if (action === "open-due-soon-assets") {
                    focusAssetView("due-soon");
                    return;
                }
                if (action === "open-service-summary") {
                    showReportSection("service-summary");
                    return;
                }
                if (action === "open-most-serviced-asset") {
                    const assetName = card.getAttribute("data-asset-name") || "";
                    if (!assetName) {
                        showFeedback("No serviced asset is available yet.", "info");
                        return;
                    }
                    const assets = getStoredAssets();
                    const targetAsset = assets.find(a => a.name === assetName);
                    if (targetAsset) {
                        showAssetDetailsAndHistory(targetAsset);
                    } else {
                        showFeedback("That asset is no longer available.", "info");
                    }
                }
            });
        }

        renderQuickStatistics();

        // --- DARK MODE TOGGLE ---
        const darkModeToggle = document.getElementById("dark-mode-toggle");
        if (darkModeToggle) {
            darkModeToggle.addEventListener("click", () => {
                document.body.classList.toggle("dark-mode");
                const isDark = document.body.classList.contains("dark-mode");
                darkModeToggle.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
            });
        }

        // --- LANGUAGE SELECTOR ---
        const translations = {
            en: { title: "Service History", welcome: "Welcome Back, Vols40!", dashboard: "Your Service History Dashboard" },
            ro: { title: "Istoric Service", welcome: "Bine ai revenit, Vols40!", dashboard: "Tabloul de bord al istoricului de servicii" }
        };
        const languageSelector = document.getElementById("language-selector");
        if (languageSelector) {
            languageSelector.addEventListener("change", (event) => {
                const selected = event.target.value;
                const title = document.querySelector(".app-title");
                if (title && translations[selected]) {
                    title.textContent = translations[selected].title;
                }
                const welcome = document.querySelector(".welcome-section h2");
                const dash = document.querySelector(".welcome-section p");
                if (welcome && translations[selected]) {
                    welcome.textContent = translations[selected].welcome;
                }
                if (dash && translations[selected]) {
                    dash.textContent = translations[selected].dashboard;
                }
            });
        }

        let feedbackTimer = null;
        function showFeedback(message, type = "info") {
            const toast = document.getElementById("feedback-toast");
            if (!toast) return;
            toast.textContent = message;
            toast.className = `feedback-toast feedback-${type}`;
            requestAnimationFrame(() => toast.classList.add("is-visible"));
            if (feedbackTimer) clearTimeout(feedbackTimer);
            feedbackTimer = setTimeout(() => {
                toast.classList.remove("is-visible");
            }, 2400);
        }

        // --- DROPDOWN MENUS ---
        // Menus are handled by CSS (:hover/:focus-within) to avoid hover gaps.

        // --- IMPORT/EXPORT & DROPBOX ---
        const importJsonInput = document.getElementById("import-json");
        if (importJsonInput) {
            importJsonInput.addEventListener("change", (event) => {
                const file = event.target.files[0];
                if (!file) return;
                if (file.type !== "application/json") {
                    showFeedback("Please select a valid JSON file.", "error");
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsedData = JSON.parse(e.target.result);
                        const importedCount = Array.isArray(parsedData) ? parsedData.length : 1;
                        showFeedback(`JSON file validated successfully (${importedCount} record${importedCount === 1 ? "" : "s"}).`, "success");
                    } catch {
                        showFeedback("Invalid JSON format.", "error");
                    }
                };
                reader.readAsText(file);
            });
        }
        const exportJsonBtn = document.getElementById("export-json");
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener("click", () => {
                const assets = getStoredAssets();
                const blob = new Blob([JSON.stringify(assets, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "service-history.json";
                a.click();
                URL.revokeObjectURL(url);
            });
        }
        const exportCsvBtn = document.getElementById("export-csv");
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener("click", () => {
                const assets = getStoredAssets();
                let csv = "Name,Type,Status,VIN,Year,Color,Added\n";
                csv += assets.map(a => `"${a.name}","${a.type}","${a.status}","${a.vin || ""}","${a.year || ""}","${a.color || ""}","${new Date(a.created).toLocaleString()}"`).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "service-history.csv";
                a.click();
                URL.revokeObjectURL(url);
            });
        }
        const exportPdfBtn = document.getElementById("export-pdf");
        if (exportPdfBtn && window.jspdf) {
            exportPdfBtn.addEventListener("click", () => {
                const assets = getStoredAssets();
                const doc = new window.jspdf.jsPDF();
                doc.text("Service History Report", 10, 10);
                assets.forEach((a, i) => {
                    doc.text(
                        `${a.name} - ${a.type} - ${a.status} - ${a.vin || ""} - ${a.year || ""} - ${a.color || ""} - ${new Date(a.created).toLocaleString()}`,
                        10,
                        20 + i * 10
                    );
                });
                doc.save("service-history.pdf");
            });
        }
        const dropboxBtn = document.getElementById("upload-to-dropbox");
        if (dropboxBtn) {
            dropboxBtn.addEventListener("click", () => {
                showFeedback("Dropbox upload is not available in this demo.", "info");
            });
        }

        // ========== DASHBOARD FEATURES ==========
        function renderServiceSummary() {
            const assets = getStoredAssets();
            let totalServices = 0, overdue = 0, upcoming = 0, completed = 0;
            const today = new Date();
            assets.forEach(asset => {
                (asset.history || []).forEach(ev => {
                    if (["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())) {
                        totalServices++;
                        const evDate = new Date(ev.date);
                        if (evDate < today && ev.note && ev.note.toLowerCase().includes("overdue")) overdue++;
                        if (evDate > today) upcoming++;
                        if (ev.note && ev.note.toLowerCase().includes("completed")) completed++;
                    }
                });
            });
            const ss = document.querySelector("#service-summary");
            if (ss) {
                ss.querySelector("p:nth-of-type(1)").textContent = `Total Services Performed: ${totalServices}`;
                ss.querySelector("p:nth-of-type(2)").textContent = `Overdue Services: ${overdue}`;
                ss.querySelector("p:nth-of-type(3)").textContent = `Upcoming Services: ${upcoming}`;
                ss.querySelector("p:nth-of-type(4)").textContent = `Completed Services: ${completed}`;
            }
        }
        function renderAssetPerformance() {
            const assets = getStoredAssets();
            let totalIntervals = 0, intervalCount = 0;
            let freqMap = {};
            assets.forEach(asset => {
                const history = (asset.history || []).filter(ev => ["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())
                ).sort((a, b) => new Date(a.date) - new Date(b.date));
                for (let i = 1; i < history.length; i++) {
                    const prev = new Date(history[i - 1].date);
                    const curr = new Date(history[i].date);
                    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
                    if (!isNaN(diff) && diff > 0) {
                        totalIntervals += diff;
                        intervalCount++;
                    }
                }
                if (history.length > 0) {
                    freqMap[asset.name] = (freqMap[asset.name] || 0) + history.length;
                }
            });
            const avgInterval = intervalCount ? Math.round(totalIntervals / intervalCount) : 0;
            let mostFreqAsset = "";
            let mostFreqCount = 0;
            Object.entries(freqMap).forEach(([name, count]) => {
                if (count > mostFreqCount) {
                    mostFreqAsset = name;
                    mostFreqCount = count;
                }
            });
            const ap = document.querySelector("#asset-performance");
            if (ap) {
                ap.querySelector("p:nth-of-type(1)").textContent = `Average Service Interval: ${avgInterval || 0} days`;
                ap.querySelector("p:nth-of-type(2)").textContent = `Most Frequently Serviced Asset: "${mostFreqAsset || "-"}"`;
            }
        }
        function renderServiceHistoryLog() {
            const assets = getStoredAssets();
            let log = [];
            assets.forEach(asset => {
                (asset.history || []).forEach(ev => {
                    if (["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())) {
                        log.push({
                            date: new Date(ev.date),
                            asset: asset.name,
                            note: ev.note || ""
                        });
                    }
                });
            });
            log.sort((a, b) => b.date - a.date);
            const ul = document.querySelector("#service-history-log ul");
            if (ul)
                ul.innerHTML = log.slice(0, 10).map(ev => {
                    let dateStr = ev.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                    let status = ev.note && ev.note.toLowerCase().includes("overdue")
                        ? "Service overdue"
                        : (ev.note && ev.note.toLowerCase().includes("completed"))
                            ? "Completed service"
                            : "Service event";
                    return `<li>${dateStr} - ${status} for "${ev.asset}"</li>`;
                }).join("") || '<li>No service events found.</li>';
        }
        window.printSection = function (id) {
            const section = document.getElementById(id);
            if (!section) return;

            // Clone the section so we can remove the print button(s) without affecting the real DOM
            const sectionClone = section.cloneNode(true);

            // Remove all print buttons from the clone
            sectionClone.querySelectorAll('.print-button').forEach(btn => btn.remove());

            // Open print window
            const printWindow = window.open('', '', 'height=700,width=900');
            printWindow.document.write('<html><head><title>Print Report</title>');

            // Copy stylesheets
            Array.from(document.querySelectorAll('link[rel=stylesheet], style')).forEach(link => {
                printWindow.document.write(link.outerHTML);
            });

            printWindow.document.write('</head><body>');
            printWindow.document.write(sectionClone.outerHTML);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();

            // Trigger print (with slight delay for rendering)
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        };
        const highContrastToggle = document.getElementById("high-contrast-toggle");
        if (highContrastToggle) {
            highContrastToggle.addEventListener("change", () => {
                document.body.classList.toggle("high-contrast", highContrastToggle.checked);
                localStorage.setItem("highContrast", highContrastToggle.checked ? "1" : "0");
            });
            if (localStorage.getItem("highContrast") === "1") {
                highContrastToggle.checked = true;
                document.body.classList.add("high-contrast");
            }
        }
        function renderAuditLogs() {
            const logs = JSON.parse(localStorage.getItem("auditLogs") || "[]");
            const tbody = document.querySelector("#audit-logs tbody");
            if (tbody)
                tbody.innerHTML = logs.map(log => `<tr>
                    <td>${log.action}</td>
                    <td>${log.user}</td>
                    <td>${log.timestamp}</td>
                    <td>${log.ip || "-"}</td>
                </tr>`
                ).join("") || tbody.innerHTML;
        }
        renderServiceSummary();
        renderAssetPerformance();
        renderServiceHistoryLog();
        renderAuditLogs();



        // --- ANALYTICS COLLABORATION FEATURES ---
        function renderServiceTrendsChart() {
            const chartDiv = document.getElementById("service-trends-chart");
            if (!chartDiv) return;
            if (window.Chart) {
                chartDiv.innerHTML = `<canvas id="serviceTrendsCanvas" width="400" height="200"></canvas>`;
                const ctx = document.getElementById('serviceTrendsCanvas').getContext('2d');
                const assets = getStoredAssets();
                const now = new Date();
                const months = [];
                const monthLabels = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                    months.push({ year: d.getFullYear(), month: d.getMonth(), label });
                    monthLabels.push(label);
                }
                const counts = months.map(m => {
                    let count = 0;
                    assets.forEach(asset => {
                        (asset.history || []).forEach(ev => {
                            const evDate = new Date(ev.date);
                            if (evDate.getFullYear() === m.year &&
                                evDate.getMonth() === m.month &&
                                ["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())) {
                                count++;
                            }
                        });
                    });
                    return count;
                });

                if (!counts.some(count => count > 0)) {
                    chartDiv.innerHTML = `<p class="empty-state">No service trend data yet. Add service events to populate this chart.</p>`;
                    return;
                }

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: 'Number of Services',
                            data: counts,
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            } else {
                chartDiv.textContent = "Service trend data will appear here when Chart.js is available.";
            }
        }
        function renderPredictiveMaintenance() {
            const assets = getStoredAssets();
            const today = new Date();
            const soonAssets = assets
                .map(a => {
                    const history = (a.history || []).filter(ev => ["service", "maintenance", "repair", "parts change"].includes((ev.operation || ev.type || "").toLowerCase())
                    );
                    if (history.length === 0) return { ...a, lastService: null, predicted: null };
                    const lastEvent = history.reduce((latest, ev) => (latest && new Date(latest.date) > new Date(ev.date)) ? latest : ev,
                        null);
                    const lastDate = lastEvent ? new Date(lastEvent.date) : null;
                    let predicted = null;
                    if (lastDate) {
                        const predDate = new Date(lastDate);
                        predDate.setDate(predDate.getDate() + 180);
                        if (predDate > today) return null;
                        predicted = predDate;
                    }
                    return { ...a, lastService: lastDate, predicted };
                })
                .filter(a => a && a.predicted)
                .sort((a, b) => a.predicted - b.predicted)
                .slice(0, 5);

            const list = soonAssets.map(a => `<li>
                Asset "<b>${a.name}</b>"
                - Predicted Service Date: <b>${a.predicted ? a.predicted.toLocaleDateString() : "?"}</b>
                ${a.lastService ? `(last: ${a.lastService.toLocaleDateString()})` : ""}
            </li>`
            ).join("");

            const ul = document.createElement("ul");
            ul.innerHTML = soonAssets.length ? list : `<li class="empty-state">No predicted maintenance due soon.</li>`;

            const predDiv = document.querySelector("#analytics-section .predictive-maintenance ul");
            if (predDiv) {
                predDiv.parentNode.replaceChild(ul, predDiv);
            }
        }
        renderServiceTrendsChart();
        renderPredictiveMaintenance();

        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        }

        function normalizeAsset(raw) {
            if (!raw || typeof raw !== "object") return null;
            return {
                id: raw.id || generateId(),
                name: raw.name || "",
                type: raw.type || "",
                status: raw.status || "Active",
                vin: raw.vin || "",
                year: raw.year || "",
                color: raw.color || "",
                created: raw.created || raw.lastServiceDate || new Date().toISOString(),
                lastServiceDate: raw.lastServiceDate || "",
                nextServiceDate: raw.nextServiceDate || "",
                odometer: raw.odometer || "",
                technician: raw.technician || "",
                location: raw.location || "",
                serviceCost: raw.serviceCost || "",
                attachedFile: raw.attachedFile !== undefined ? raw.attachedFile : null,
                history: Array.isArray(raw.history) ? raw.history : []
            };
        }

        function getStoredAssets() {
            const raw = JSON.parse(localStorage.getItem("assets") || "[]");
            return Array.isArray(raw) ? raw.map(normalizeAsset).filter(Boolean) : [];
        }

        function saveStoredAssets(assets) {
            localStorage.setItem("assets", JSON.stringify(
                Array.isArray(assets) ? assets.map(normalizeAsset).filter(Boolean) : []
            ));
        }

        function escapeHtml(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function formatDisplayDate(value, fallback = "—") {
            if (!value) return fallback;
            const date = new Date(value);
            return isNaN(date.getTime()) ? fallback : date.toLocaleString();
        }

        function formatDateInputValue(value) {
            if (!value) return "";
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
            const date = new Date(value);
            if (isNaN(date.getTime())) return "";
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }

        function findAssetIndex(asset, assets = getStoredAssets()) {
            if (!asset) return -1;
            if (asset.id) {
                const idx = assets.findIndex(c => c && c.id === asset.id);
                if (idx !== -1) return idx;
            }
            const targetName = typeof asset.name === "string" ? asset.name : "";
            const targetCreated = asset.created || asset.lastServiceDate || "";
            const targetVin = asset.vin || "";
            return assets.findIndex(candidate => {
                if (!candidate) return false;
                const candidateName = typeof candidate.name === "string" ? candidate.name : "";
                const candidateCreated = candidate.created || candidate.lastServiceDate || "";
                const candidateVin = candidate.vin || "";
                if (targetCreated && candidateCreated && targetName === candidateName && targetCreated === candidateCreated) {
                    return true;
                }
                if (targetVin && candidateVin && targetName === candidateName && targetVin === candidateVin) {
                    return true;
                }
                return !targetCreated && !targetVin && targetName && targetName === candidateName;
            });
        }

        function refreshAssetDependentViews() {
            renderUpcomingReminders();
            renderRecentActivities();
            renderQuickStatistics();
            renderServiceSummary();
            renderAssetPerformance();
            renderServiceHistoryLog();
            renderServiceTrendsChart();
            renderPredictiveMaintenance();
        }

        function isAssetShownInDetailsModal(asset) {
            const modal = document.getElementById("asset-history-modal");
            if (!modal || !asset) return false;
            if (asset.id && modal.dataset.assetId) {
                return modal.dataset.assetId === asset.id;
            }
            const modalName = modal.dataset.assetName || "";
            const modalCreated = modal.dataset.assetCreated || "";
            const modalVin = modal.dataset.assetVin || "";
            const assetName = asset.name || "";
            const assetCreated = asset.created || asset.lastServiceDate || "";
            const assetVin = asset.vin || "";
            if (modalCreated && assetCreated && modalName && assetName) {
                return modalCreated === assetCreated && modalName === assetName;
            }
            if (modalVin && assetVin && modalName && assetName) {
                return modalVin === assetVin && modalName === assetName;
            }
            return modalName && assetName && modalName === assetName;
        }

        // ========== HOME SECTION FUNCTIONALITY ==========
        // --- Add New Asset (with modal form & history support) ---
        const addNewAssetBtn = document.getElementById("add-new-asset");
        if (addNewAssetBtn) {
            addNewAssetBtn.addEventListener("click", () => {
                let modal = document.getElementById("add-asset-modal");
                if (!modal) {
                    modal = document.createElement("div");
                    modal.id = "add-asset-modal";
                    modal.style.position = "fixed";
                    modal.style.top = "0";
                    modal.style.left = "0";
                    modal.style.width = "100vw";
                    modal.style.height = "100vh";
                    modal.style.background = "rgba(0,0,0,0.5)";
                    modal.style.display = "flex";
                    modal.style.alignItems = "center";
                    modal.style.justifyContent = "center";
                    modal.style.zIndex = "1000";
                    modal.innerHTML = `
                    <div style="background: #fff; padding: 2em; border-radius: 8px; max-width: 450px; width: 100%; position:relative">
                        <button id="close-asset-modal" style="position:absolute;top:1em;right:1em;font-size:1.2em;">&times;</button>
                        <h2>Add New Asset</h2>
                        <form id="add-asset-form">
                            <div style="margin-bottom:1em;">
                                <label for="asset-name">Name:</label>
                                <input type="text" id="asset-name" name="asset-name" required style="width:100%">
                            </div>
                            <div style="margin-bottom:1em;">
                                <label for="asset-type">Type:</label>
                                <input type="text" id="asset-type" name="asset-type" required style="width:100%">
                            </div>
                            <div style="margin-bottom:1em;">
                                <label for="asset-status">Status:</label>
                                <select id="asset-status" name="asset-status" required style="width:100%">
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Out of Service">Out of Service</option>
                                </select>
                            </div>
                            <div style="margin-bottom:1em;">
                                <label for="asset-vin">VIN:</label>
                                <input type="text" id="asset-vin" name="asset-vin" style="width:100%">
                            </div>
                            <div style="margin-bottom:1em;">
                                <label for="asset-year">Year of Manufacturing:</label>
                                <input type="number" id="asset-year" name="asset-year" min="1900" max="2100" style="width:100%">
                            </div>
                            <div style="margin-bottom:1em;">
                                <label for="asset-color">Color:</label>
                                <input type="text" id="asset-color" name="asset-color" style="width:100%">
                            </div>
                            <button type="submit" style="margin-top:1em;">Add Asset</button>
                        </form>
                    </div>
                `;
                    document.body.appendChild(modal);

                    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
                    modal.querySelector("#close-asset-modal").addEventListener("click", () => modal.remove());
                    const form = modal.querySelector("#add-asset-form");
                    form.addEventListener("submit", (e) => {
                        e.preventDefault();
                        const name = form.querySelector("#asset-name").value.trim();
                        const type = form.querySelector("#asset-type").value.trim();
                        const status = form.querySelector("#asset-status").value;
                        const vin = form.querySelector("#asset-vin").value.trim();
                        const year = form.querySelector("#asset-year").value;
                        const color = form.querySelector("#asset-color").value.trim();
                        if (!name || !type) {
                            showFeedback("Please fill in all required fields.", "error");
                            return;
                        }
                        // Save asset with history array and new fields
                        const assets = getStoredAssets();
                        const created = new Date().toISOString();
                        assets.push(normalizeAsset({
                            name, type, status, vin, year, color, created,
                            history: [{
                                date: created,
                                operation: "Created",
                                label: "Info",
                                note: "Asset created"
                            }]
                        }));
                        saveStoredAssets(assets);
                        refreshAssetDependentViews();
                        showFeedback("Asset added successfully.", "success");
                        modal.remove();
                    });
                }
            });
        }



        // --- View All Assets ---
        const viewAllAssetsBtn = document.getElementById("view-all-assets");
        function renderAssetsModal(filter = activeAssetFilter) {
            let modal = document.getElementById("view-assets-modal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "view-assets-modal";
                modal.style.position = "fixed";
                modal.style.top = "0";
                modal.style.left = "0";
                modal.style.width = "100vw";
                modal.style.height = "100vh";
                modal.style.background = "rgba(0,0,0,0.5)";
                modal.style.display = "flex";
                modal.style.alignItems = "center";
                modal.style.justifyContent = "center";
                modal.style.zIndex = "1000";
                modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
                document.body.appendChild(modal);
            }

            activeAssetFilter = filter || "all";
            renderDashboardQuickFilters();
            const assets = getStoredAssets();
            const filteredAssets = assets
                .map((asset, index) => ({ asset, index }))
                .filter(({ asset }) => matchesAssetFilter(asset, activeAssetFilter));
            const tableHeaderHtml = ASSETS_MODAL_COLUMNS.map(column => `<th>${column}</th>`).join("");

            const tableRows = filteredAssets.length
                ? filteredAssets.map(({ asset, index }) => `
                        <tr>
                            <td>${escapeHtml(asset.name || "—")}</td>
                            <td>${escapeHtml(asset.type || "—")}</td>
                            <td>${renderStatusBadge(asset.status || "—")}</td>
                            <td>${renderHealthIndicator(asset)}</td>
                            <td>${escapeHtml(asset.vin || "—")}</td>
                            <td>${escapeHtml(asset.year || "—")}</td>
                            <td>${escapeHtml(asset.color || "—")}</td>
                            <td>${escapeHtml(formatDisplayDate(asset.created || asset.lastServiceDate))}</td>
                            <td>
                                <button type="button" data-edit-asset="${index}">Edit</button>
                                <button type="button" data-delete-asset="${index}" style="margin-left:0.5em;">Delete</button>
                            </td>
                        </tr>`).join("")
                : `<tr><td colspan="${ASSETS_MODAL_COLUMNS.length}" class="empty-state-cell">No assets match this filter.</td></tr>`;

            const modalFilterChips = DASHBOARD_FILTER_CHIPS.map(chip => `
                <button type="button" class="filter-chip${activeAssetFilter === chip.value ? " is-active" : ""}" data-asset-filter="${chip.value}">${chip.label}</button>
            `).join("");

            modal.innerHTML = `
                    <div style="background: #fff; padding: 2em; border-radius: 8px; max-width: 900px; width: 100%; position:relative">
                        <button id="close-assets-modal" style="position:absolute;top:1em;right:1em;font-size:1.2em;">&times;</button>
                        <h2>All Assets</h2>
                        <div class="asset-filter-chips">
                            ${modalFilterChips}
                        </div>
                        <div class="asset-filter-summary">Showing ${filteredAssets.length} of ${assets.length} assets</div>
                        <div style="max-height:60vh; overflow-y:auto;">
                            <table border="1" style="width:100%;border-collapse:collapse;">
                                <thead>
                                    <tr>${tableHeaderHtml}</tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

            modal.querySelector("#close-assets-modal").addEventListener("click", () => modal.remove());
            modal.querySelectorAll("button[data-asset-filter]").forEach(btn => {
                btn.addEventListener("click", () => renderAssetsModal(btn.getAttribute("data-asset-filter")));
            });
            modal.querySelectorAll("button[data-edit-asset]").forEach(btn => {
                btn.addEventListener("click", () => openEditAssetModal(parseInt(btn.getAttribute("data-edit-asset"), 10)));
            });
            modal.querySelectorAll("button[data-delete-asset]").forEach(btn => {
                btn.addEventListener("click", () => deleteAsset(parseInt(btn.getAttribute("data-delete-asset"), 10)));
            });
        }

        function openEditAssetModal(assetIndex) {
            const assets = getStoredAssets();
            const asset = assets[assetIndex];
            if (!asset) {
                renderAssetsModal();
                return;
            }

            let editModal = document.getElementById("edit-asset-modal");
            if (editModal) editModal.remove();

            const currentStatus = asset.status || "Active";
            const statusOptions = Array.from(new Set([currentStatus, "Active", "Inactive", "Out of Service"]));
            editModal = document.createElement("div");
            editModal.id = "edit-asset-modal";
            editModal.style.position = "fixed";
            editModal.style.top = "0";
            editModal.style.left = "0";
            editModal.style.width = "100vw";
            editModal.style.height = "100vh";
            editModal.style.background = "rgba(0,0,0,0.5)";
            editModal.style.display = "flex";
            editModal.style.alignItems = "center";
            editModal.style.justifyContent = "center";
            editModal.style.zIndex = "2500";
            editModal.innerHTML = `
                <div style="background: #fff; padding: 2em; border-radius: 8px; max-width: 500px; width: 100%; position:relative">
                    <button id="close-edit-asset-modal" style="position:absolute;top:1em;right:1em;font-size:1.2em;">&times;</button>
                    <h2>Edit Asset</h2>
                    <form id="edit-asset-form">
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-name">Name:</label>
                            <input type="text" id="edit-asset-name" required style="width:100%" value="${escapeHtml(asset.name || "")}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-type">Type:</label>
                            <input type="text" id="edit-asset-type" style="width:100%" value="${escapeHtml(asset.type || "")}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-status">Status:</label>
                            <select id="edit-asset-status" style="width:100%">
                                ${statusOptions.map(status => `<option value="${escapeHtml(status)}"${status === currentStatus ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}
                            </select>
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-vin">VIN:</label>
                            <input type="text" id="edit-asset-vin" style="width:100%" value="${escapeHtml(asset.vin || "")}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-year">Year of Manufacturing:</label>
                            <input type="number" id="edit-asset-year" min="1900" max="2100" style="width:100%" value="${escapeHtml(asset.year || "")}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-asset-color">Color:</label>
                            <input type="text" id="edit-asset-color" style="width:100%" value="${escapeHtml(asset.color || "")}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-last-service-date">Last Service Date:</label>
                            <input type="date" id="edit-last-service-date" style="width:100%" value="${escapeHtml(formatDateInputValue(asset.lastServiceDate))}">
                        </div>
                        <div style="margin-bottom:1em;">
                            <label for="edit-next-service-date">Next Service Date:</label>
                            <input type="date" id="edit-next-service-date" style="width:100%" value="${escapeHtml(formatDateInputValue(asset.nextServiceDate))}">
                        </div>
                        <button type="submit">Save Changes</button>
                    </form>
                </div>
            `;
            document.body.appendChild(editModal);

            editModal.querySelector("#close-edit-asset-modal").addEventListener("click", () => editModal.remove());
            editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.remove(); });
            editModal.querySelector("#edit-asset-form").addEventListener("submit", (e) => {
                e.preventDefault();
                const updatedName = editModal.querySelector("#edit-asset-name").value.trim();
                const lastServiceDate = editModal.querySelector("#edit-last-service-date").value || "";
                const nextServiceDate = editModal.querySelector("#edit-next-service-date").value || "";
                if (!updatedName) {
                    showFeedback("Asset name is required.", "error");
                    return;
                }
                if (lastServiceDate && nextServiceDate && new Date(nextServiceDate) < new Date(lastServiceDate)) {
                    showFeedback("Next service date must be on or after the last service date.", "error");
                    return;
                }

                const originalAsset = { ...asset };
                assets[assetIndex] = {
                    ...asset,
                    name: updatedName,
                    type: editModal.querySelector("#edit-asset-type").value.trim(),
                    status: editModal.querySelector("#edit-asset-status").value,
                    vin: editModal.querySelector("#edit-asset-vin").value.trim(),
                    year: editModal.querySelector("#edit-asset-year").value,
                    color: editModal.querySelector("#edit-asset-color").value.trim(),
                    created: asset.created || asset.lastServiceDate || new Date().toISOString(),
                    lastServiceDate,
                    nextServiceDate,
                    history: Array.isArray(asset.history) ? asset.history : []
                };

                saveStoredAssets(assets);
                refreshAssetDependentViews();
                renderAssetsModal();
                if (isAssetShownInDetailsModal(originalAsset)) {
                    showAssetDetailsAndHistory(assets[assetIndex]);
                }
                editModal.remove();
                showFeedback("Asset updated successfully.", "success");
            });
        }

        function deleteAsset(assetIndex) {
            const assets = getStoredAssets();
            const asset = assets[assetIndex];
            if (!asset) {
                renderAssetsModal();
                return;
            }

            const assetLabel = asset.name || `asset #${assetIndex + 1}`;
            if (!window.confirm(`Delete "${assetLabel}"? This action cannot be undone.`)) {
                return;
            }

            const shouldCloseDetails = isAssetShownInDetailsModal(asset);
            assets.splice(assetIndex, 1);
            saveStoredAssets(assets);
            refreshAssetDependentViews();
            renderAssetsModal();
            if (shouldCloseDetails) {
                const detailsModal = document.getElementById("asset-history-modal");
                if (detailsModal) detailsModal.remove();
            }
            showFeedback("Asset deleted successfully.", "success");
        }

        if (viewAllAssetsBtn) {
            viewAllAssetsBtn.addEventListener("click", () => renderAssetsModal("all"));
        }



        // --- Analytics Section: Service Trends and Predictive Maintenance ---
        // --- Team Roles: Dynamic ---
        function getTeam() {
            return JSON.parse(localStorage.getItem("teamRoles") || "[]");
        }
        function saveTeam(team) {
            localStorage.setItem("teamRoles", JSON.stringify(team));
        }
        function renderTeamRoles() {
            const listDiv = document.querySelector("#collaboration-section .team-roles ul");
            if (!listDiv) return;
            listDiv.innerHTML = "";
            const team = getTeam();
            if (team.length === 0) {
                listDiv.innerHTML = `<li class="empty-state">No team members yet. Add one below.</li>`;
            } else {
                team.forEach((member, idx) => {
                    listDiv.innerHTML += `<li>
                    <span><b>${member.name}</b> (${member.role})</span>
                    <button data-remove="${idx}" style="margin-left:1em;">Remove</button>
                    <button data-edit="${idx}" style="margin-left:0.5em;">Edit</button>
                </li>`;
                });
            }
            if (!document.getElementById("add-team-form")) {
                const form = document.createElement("form");
                form.id = "add-team-form";
                form.innerHTML = `
                <input type="text" id="new-team-name" placeholder="Name" required style="margin-right:0.5em;">
                <select id="new-team-role" required>
                    <option value="Admin">Admin</option>
                    <option value="Technician">Technician</option>
                    <option value="Viewer">Viewer</option>
                </select>
                <button type="submit" style="margin-left:0.5em;">Add</button>
            `;
                listDiv.parentNode.appendChild(form);

                form.addEventListener("submit", e => {
                    e.preventDefault();
                    const name = form.querySelector("#new-team-name").value.trim();
                    const role = form.querySelector("#new-team-role").value;
                    if (!name) return;
                    const team = getTeam();
                    team.push({ name, role });
                    saveTeam(team);
                    renderTeamRoles();
                    form.reset();
                });
            }

            listDiv.querySelectorAll("button[data-remove]").forEach(btn => {
                btn.onclick = () => {
                    const idx = +btn.getAttribute("data-remove");
                    const team = getTeam();
                    team.splice(idx, 1);
                    saveTeam(team);
                    renderTeamRoles();
                };
            });
            listDiv.querySelectorAll("button[data-edit]").forEach(btn => {
                btn.onclick = () => {
                    const idx = +btn.getAttribute("data-edit");
                    const team = getTeam();
                    const member = team[idx];
                    const name = prompt("Edit name:", member.name);
                    if (!name) return;
                    const role = prompt("Edit role (Admin/Technician/Viewer):", member.role);
                    if (!role || !["Admin", "Technician", "Viewer"].includes(role)) return;
                    team[idx] = { name, role };
                    saveTeam(team);
                    renderTeamRoles();
                };
            });
        }
        renderTeamRoles();

        // --- Comments and Notes ---
        renderComments();

        // --- Global Search: now shows asset details and history, and allows adding/editing history events ---
        const globalSearchBar = document.getElementById("global-search-bar");
        const globalSearchBtn = document.getElementById("global-search-button");
        if (globalSearchBtn && globalSearchBar) {
            globalSearchBtn.addEventListener("click", () => {
                const query = globalSearchBar.value.trim().toLowerCase();
                if (!query) {
                    showFeedback("Please enter a search term.", "error");
                    return;
                }
                const assets = getStoredAssets();
                const matched = assets.filter(
                    a => a && typeof a.name === "string" && (
                        a.name.toLowerCase().includes(query) ||
                        (a.type || "").toLowerCase().includes(query) ||
                        (a.status || "").toLowerCase().includes(query) ||
                        (a.vin || "").toLowerCase().includes(query) ||
                        (a.year ? String(a.year).toLowerCase() : "").includes(query) ||
                        (a.color || "").toLowerCase().includes(query)
                    )
                );
                if (matched.length === 0) {
                    showFeedback("No matching assets found.", "info");
                    return;
                }
                showAssetDetailsAndHistory(matched[0]);
            });

            globalSearchBar.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    globalSearchBtn.click();
                }
            });
        }

        function showAssetDetailsAndHistory(asset) {
            // Remove any existing modal
            let modal = document.getElementById("asset-history-modal");
            if (modal) modal.remove();

            // Create new modal
            modal = document.createElement("div");
            modal.id = "asset-history-modal";
            modal.style.position = "fixed";
            modal.style.top = "0";
            modal.style.left = "0";
            modal.style.width = "100vw";
            modal.style.height = "100vh";
            modal.style.background = "rgba(0,0,0,0.5)";
            modal.style.display = "flex";
            modal.style.alignItems = "center";
            modal.style.justifyContent = "center";
            modal.style.zIndex = "2000";
            modal.dataset.assetId = asset.id || "";
            modal.dataset.assetName = asset.name || "";
            modal.dataset.assetCreated = asset.created || asset.lastServiceDate || "";
            modal.dataset.assetVin = asset.vin || "";

            // Build history rows
            let historyRows = asset.history && asset.history.length
                ? asset.history.map((h, i) => `
                <tr>
                    <td>${escapeHtml(formatDisplayDate(h.date, ""))}</td>
                    <td>${escapeHtml(h.operation || "")}</td>
                    <td>${escapeHtml(h.label || "")}</td>
                    <td>${escapeHtml(h.note || "")}</td>
                    <td>
                        <button data-edit="${i}">Edit</button>
                    </td>
                </tr>
            `).join("")
                : `<tr><td colspan="5" class="empty-state-cell">No history events recorded yet.</td></tr>`;

            // Modal innerHTML
            modal.innerHTML = `
        <div style="background: #fff; padding: 2em; border-radius: 8px; min-width:350px; max-width:650px; position:relative">
            <button id="close-history-modal" style="position:absolute;top:1em;right:1em;font-size:1.2em;">&times;</button>
            <h2>Asset Details</h2>
            <div><b>Name:</b> ${escapeHtml(asset.name || "—")}</div>
            <div><b>Type:</b> ${escapeHtml(asset.type || "—")}</div>
            <div><b>Status:</b> ${escapeHtml(asset.status || "—")}</div>
            <div><b>VIN:</b> ${escapeHtml(asset.vin || "—")}</div>
            <div><b>Year of Manufacturing:</b> ${escapeHtml(asset.year || "—")}</div>
            <div><b>Color:</b> ${escapeHtml(asset.color || "—")}</div>
            <div><b>Last Service Date:</b> ${escapeHtml(formatDisplayDate(asset.lastServiceDate))}</div>
            <div><b>Next Service Date:</b> ${escapeHtml(formatDisplayDate(asset.nextServiceDate))}</div>
            <div><b>Added:</b> ${escapeHtml(formatDisplayDate(asset.created || asset.lastServiceDate))}</div>
            <hr>
            <h3>Service History</h3>
            <div style="max-height:40vh; overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;" border="1">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Operation</th>
                            <th>Label</th>
                            <th>Note</th>
                            <th>Edit</th>
                        </tr>
                    </thead>
                    <tbody>${historyRows}</tbody>
                </table>
            </div>
            <hr>
            <h4>Add History Event</h4>
            <form id="add-history-form">
                <div style="margin-bottom:0.5em;">
                    <label>Operation:
                        <select id="history-operation" required>
                            <option value="Parts Change">Parts Change</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Repair">Repair</option>
                            <option value="Inspection">Inspection</option>
                            <option value="Other">Other</option>
                        </select>
                    </label>
                </div>
                <div style="margin-bottom:0.5em;">
                    <label>Label:
                        <select id="history-label" required>
                            <option value="Mechanical">Mechanical</option>
                            <option value="Electrical">Electrical</option>
                            <option value="Other">Other</option>
                        </select>
                    </label>
                </div>
                <div style="margin-bottom:0.5em;">
                    <label>Note:
                        <input type="text" id="history-note" required style="width:100%;">
                    </label>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top:1em;">
                    <button type="submit">Add Event</button>
                    <button type="button" id="export-service-history-pdf" style="margin-left:auto;">Export Service History PDF</button>
                </div>
            </form>
        </div>
        `;

            document.body.appendChild(modal);

            // PDF EXPORT BUTTON
            const exportBtn = modal.querySelector("#export-service-history-pdf");
            if (exportBtn) {
                exportBtn.onclick = () => {
                    if (!window.jspdf || !window.jspdf.jsPDF) {
                        showFeedback("PDF export is unavailable (jsPDF not loaded).", "error");
                        return;
                    }
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF();
                    if (typeof doc.autoTable !== "function") {
                        showFeedback("PDF export is unavailable (AutoTable not loaded).", "error");
                        return;
                    }

                    let y = 10;
                    doc.setFontSize(16);
                    doc.text(`Service History for: ${asset.name}`, 10, y);
                    y += 10;
                    doc.setFontSize(10);
                    doc.text(`Type: ${asset.type || "-"}`, 10, y);
                    y += 6;
                    doc.text(`Status: ${asset.status || "-"}`, 10, y);
                    y += 6;
                    doc.text(`VIN: ${asset.vin || "-"}`, 10, y);
                    y += 6;
                    doc.text(`Year: ${asset.year || "-"}`, 10, y);
                    y += 10;

                    // Table data
                    doc.autoTable({
                        columns: [
                            { header: "Date", dataKey: "date" },
                            { header: "Operation", dataKey: "operation" },
                            { header: "Label", dataKey: "label" },
                            { header: "Note", dataKey: "note" }
                        ],
                        body: (asset.history || []).map(ev => ({
                            date: new Date(ev.date).toLocaleDateString(),
                            operation: ev.operation || "",
                            label: ev.label || "",
                            note: ev.note || ""
                        })),
                        startY: y,
                        styles: { fontSize: 9 },
                        headStyles: { fillColor: [22, 160, 133],halign:'center' },
                        theme: "grid",
                        tableWidth: "auto",
                        columnStyles: {
                            note: { cellWidth: 95, overflow: 'linebreak' },
                            date: { cellWidth: 28 },
                            operation: { cellWidth: 30 },
                            label: { cellWidth: 30 }
                        }
                    });
                    doc.save(`${asset.name.replace(/\s+/g, "_")}_Service_History.pdf`);
                };
            }

            // CLOSE MODAL BUTTON
            modal.querySelector("#close-history-modal").addEventListener("click", () => modal.remove());
            modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

            // ADD HISTORY EVENT
            modal.querySelector("#add-history-form").addEventListener("submit", (e) => {
                e.preventDefault();
                const operation = modal.querySelector("#history-operation").value;
                const label = modal.querySelector("#history-label").value;
                const note = modal.querySelector("#history-note").value.trim();
                const assets = getStoredAssets();
                const idx = findAssetIndex(asset, assets);
                if (idx !== -1) {
                    assets[idx].history = assets[idx].history || [];
                    assets[idx].history.push({
                        date: new Date().toISOString(), operation, label, note
                    });
                    saveStoredAssets(assets);
                    refreshAssetDependentViews();
                    showAssetDetailsAndHistory(assets[idx]);
                }
            });

            // EDIT HISTORY EVENT
            modal.querySelectorAll("button[data-edit]").forEach(btn => {
                btn.addEventListener("click", () => {
                    const hidx = parseInt(btn.getAttribute("data-edit"));
                    editHistoryEvent(asset, hidx);
                    modal.remove();
                });
            });

            // --- Edit History Event Modal ---
            function editHistoryEvent(asset, hidx) {
                let editModal = document.createElement("div");
                editModal.id = "edit-history-modal";
                editModal.style.position = "fixed";
                editModal.style.top = "0";
                editModal.style.left = "0";
                editModal.style.width = "100vw";
                editModal.style.height = "100vh";
                editModal.style.background = "rgba(0,0,0,0.5)";
                editModal.style.display = "flex";
                editModal.style.alignItems = "center";
                editModal.style.justifyContent = "center";
                editModal.style.zIndex = "3000";
                const h = (asset.history || [])[hidx] || {};
                editModal.innerHTML = `
                <div style="background: #fff; padding: 2em; border-radius: 8px; min-width:300px; max-width:400px; position:relative">
                    <button id="close-edit-history" style="position:absolute;top:1em;right:1em;font-size:1.2em;">&times;</button>
                    <h3>Edit History Event</h3>
                    <form id="edit-history-form">
                        <div style="margin-bottom:0.5em;">
                            <label>Operation:
                                <input type="text" id="edit-operation" value="${escapeHtml(h.operation || "")}" required>
                            </label>
                        </div>
                        <div style="margin-bottom:0.5em;">
                            <label>Label:
                                <input type="text" id="edit-label" value="${escapeHtml(h.label || "")}" required>
                            </label>
                        </div>
                        <div style="margin-bottom:0.5em;">
                            <label>Note:
                                <input type="text" id="edit-note" value="${escapeHtml(h.note || "")}" required>
                            </label>
                        </div>
                        <button type="submit">Save</button>
                    </form>
                </div>
            `;
                document.body.appendChild(editModal);
                editModal.querySelector("#close-edit-history").addEventListener("click", () => editModal.remove());
                editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.remove(); });
                editModal.querySelector("#edit-history-form").addEventListener("submit", (e) => {
                    e.preventDefault();
                    const operation = editModal.querySelector("#edit-operation").value;
                    const label = editModal.querySelector("#edit-label").value;
                    const note = editModal.querySelector("#edit-note").value;
                    const assets = getStoredAssets();
                    const idx = findAssetIndex(asset, assets);
                    if (idx !== -1 && assets[idx].history && assets[idx].history[hidx]) {
                        assets[idx].history[hidx].operation = operation;
                        assets[idx].history[hidx].label = label;
                        assets[idx].history[hidx].note = note;
                        saveStoredAssets(assets);
                        refreshAssetDependentViews();
                        showAssetDetailsAndHistory(assets[idx]);
                        editModal.remove();
                    }
                });
            }
        }

        // --- Collaboration Section: Comments and Notes ---
        const commentsBox = document.getElementById("comments-box");
        const addCommentButton = document.getElementById("add-comment-button");

        function renderComments() {
            let commentsList = document.getElementById("comments-list");
            if (!commentsList) {
                commentsList = document.createElement("ul");
                commentsList.id = "comments-list";
                commentsList.style.marginTop = "1em";
                const notesDiv = document.querySelector(".comments-and-notes");
                if (notesDiv) notesDiv.appendChild(commentsList);
            }
            const comments = JSON.parse(localStorage.getItem("assetComments") || "[]");
            commentsList.innerHTML = comments.length
                ? comments.map(
                    c => `<li><b>${c.author || "User"}:</b> ${c.text} <span style="color:gray;font-size:0.9em;">(${new Date(c.date).toLocaleString()})</span></li>`
                ).join("")
                : `<li class="empty-state">No comments yet. Add one to keep team notes in sync.</li>`;
        }

        if (addCommentButton && commentsBox) {
            addCommentButton.addEventListener("click", () => {
                const text = commentsBox.value.trim();
                if (!text) {
                    showFeedback("Please enter a comment.", "error");
                    return;
                }
                const comments = JSON.parse(localStorage.getItem("assetComments") || "[]");
                comments.unshift({
                    text,
                    date: new Date().toISOString(),
                    author: window.currentUserName || "User"
                });
                localStorage.setItem("assetComments", JSON.stringify(comments));
                commentsBox.value = "";
                renderComments();
                showFeedback("Comment saved.", "success");
            });
        }
        renderComments();

        // --- REPORTS AS POPUP TABS ---
        function hideAllReportSections() {
            document.querySelectorAll('.report-section').forEach(sec => {
                sec.style.display = 'none';
                sec.style.position = '';
                sec.style.top = '';
                sec.style.left = '';
                sec.style.transform = '';
                sec.style.zIndex = '';
                sec.style.background = '';
                sec.style.boxShadow = '';
                sec.style.borderRadius = '';
                sec.style.padding = '';
                sec.style.maxWidth = '';
                sec.style.maxHeight = '';
                sec.style.overflow = '';
            });
            // Remove overlay
            const overlay = document.getElementById('reports-overlay');
            if (overlay) overlay.remove();
        }

        function showReportSection(id) {
            hideAllReportSections();

            const section = document.getElementById(id);
            if (section) {
                section.style.display = 'block';
                // Add overlay for outside click
                let overlay = document.createElement('div');
                overlay.id = 'reports-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = 0;
                overlay.style.left = 0;
                overlay.style.right = 0;
                overlay.style.bottom = 0;
                overlay.style.background = 'rgba(0,0,0,0.1)';
                overlay.style.zIndex = 1000;
                overlay.addEventListener('click', function () {
                    hideAllReportSections();
                });
                document.body.appendChild(overlay);

                // Style section as popup
                section.style.position = 'fixed';
                section.style.top = '50%';
                section.style.left = '50%';
                section.style.transform = 'translate(-50%, -50%)';
                section.style.zIndex = 1001;
                section.style.background = '#fff';
                section.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
                section.style.borderRadius = '10px';
                section.style.padding = '2em';
                section.style.maxWidth = '90vw';
                section.style.maxHeight = '80vh';
                section.style.overflow = 'auto';

                // Add a close (X) button if not present
                if (!section.querySelector('.close-report-tab')) {
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = '×';
                    closeBtn.className = 'close-report-tab';
                    closeBtn.style.position = 'absolute';
                    closeBtn.style.top = '1em';
                    closeBtn.style.right = '1em';
                    closeBtn.style.fontSize = '1.5em';
                    closeBtn.style.background = 'none';
                    closeBtn.style.border = 'none';
                    closeBtn.style.cursor = 'pointer';
                    closeBtn.setAttribute('aria-label', 'Close');
                    closeBtn.addEventListener('click', hideAllReportSections);
                    section.insertBefore(closeBtn, section.firstChild);
                }
            }
        }

        // Map Reports dropdown anchors to section IDs
        const reportMenuMap = {
            "service-summary": "service-summary",
            "asset-performance": "asset-performance",
            "service-history-log": "service-history-log"
        };

        // Attach click handlers to Reports menu links
        document.querySelectorAll('.dropdown-menu a[href^="#"]').forEach(link => {
            const targetId = link.getAttribute('href').replace('#', '');
            if (reportMenuMap[targetId]) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    showReportSection(reportMenuMap[targetId]);
                });
            }
        });

        // Hide all report sections on page load
        hideAllReportSections();

        document.getElementById('fab').addEventListener('click', function () {
            const formHtml = `
      <html>
      <head>
        <title>Add Asset and Service</title>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          .form-section { margin-bottom: 1.5em; }
          .service-checkboxes label { display: flex; align-items: center; margin-bottom: 0.5em; }
          .service-checkboxes input[type="checkbox"] { margin-left: 1em; }
          .multi-axle-side { margin-bottom: 1em; }
          .axle-side-multiselect {
            display: flex;
            flex-direction: row;
            gap: 2em;
            padding: 1em 0;
            align-items: flex-start;
            justify-content: flex-start;
          }
          .axle-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            background: #f6f8fa;
            padding: 0.5em 1em;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            min-width: 90px;
          }
          .axle-label {
            font-weight: bold;
            margin-bottom: 0.3em;
            color: #2a3b4d;
          }
          .axle-sides-row {
            display: flex;
            gap: 1.5em;
            margin-bottom: 0.2em;
          }
          .axle-sides-row label {
            display: flex;
            align-items: center;
            gap: 0.35em;
            font-size: 0.97em;
            color: #444;
          }
          .success-message { color: green; margin: 1em 0; }
          .success-message.error { color: #b63a3a; }
          textarea { width: 100%; min-height: 60px; margin-top: 0.5em;}
          .inline-field { display: flex; gap: 1em; align-items: center; margin-bottom: 1em; }
          .inline-field label { margin-bottom: 0; }
          .services-columns {
            display: flex;
            gap: 2em;
            align-items: flex-start;
          }
          .services-multi, .services-single {
            flex: 1 1 0;
            min-width: 200px;
          }
          .services-multi > label,
          .services-single > label {
            display: flex;
            align-items: center;
            margin-bottom: 0.5em;
          }
          .services-multi .multi-axle-side {
            margin-bottom: 1.2em;
          }
        </style>
      </head>
      <body>
        <h2>Add Asset and Record Services</h2>
        <form id="asset-form" enctype="multipart/form-data">
          <div class="form-section">
            <label for="asset-name">Asset Name:</label>
            <input type="text" id="asset-name" required>
          </div>
          <div class="form-section inline-field">
            <label for="last-service-date">Last Service Date:</label>
            <input type="date" id="last-service-date" required>
            <label for="next-service-date">Next Service Date:</label>
            <input type="date" id="next-service-date" required>
          </div>
          <div class="form-section inline-field">
            <label for="odometer">Odometer / Hourmeter:</label>
            <input type="number" id="odometer" min="0" placeholder="(optional)">
          </div>
          <div class="form-section inline-field">
            <label for="technician">Technician Name:</label>
            <input type="text" id="technician" placeholder="(optional)">
            <label for="location">Service Location:</label>
            <input type="text" id="location" placeholder="(optional)">
          </div>
          <div class="form-section inline-field">
            <label for="service-cost">Service Cost:</label>
            <input type="number" id="service-cost" min="0" step="0.01" placeholder="e.g. 100.00">
          </div>
          <div class="form-section">
            <label for="service-file">Attach File (photo or PDF):</label>
            <input type="file" id="service-file" accept="image/*,application/pdf">
            <span id="file-name-display"></span>
          </div>
          <div class="form-section service-checkboxes">
  <label>Services Performed:</label>
  <div class="services-columns">
    <div class="services-single">
      <label>Maintenance <input type="checkbox" name="services" value="Maintenance"></label>
      <label>Oil Change <input type="checkbox" name="services" value="Oil Change"></label>
      <label>Coolant Change <input type="checkbox" name="services" value="Coolant Change"></label>
      <label>Oil Filter Change <input type="checkbox" name="services" value="Oil Filter Change"></label>
      <label>Air Dryer Filter Change <input type="checkbox" name="services" value="Air Dryer Filter Change"></label>
      <label>Diesel Filter Change <input type="checkbox" name="services" value="Diesel Filter Change"></label>
      <label>Steering Oil Change <input type="checkbox" name="services" value="Steering Oil Change"></label>
      <label>Air Filter Change <input type="checkbox" name="services" value="Air Filter Change"></label>
      <label>Pollen Filter Change <input type="checkbox" name="services" value="Pollen Filter Change"></label>
      <label>Light Bulb Change <input type="checkbox" name="services" value="Light Bulb Change"></label>
    </div>
    <div class="services-multi">
      <label>
        Brake Pads Change
        <input type="checkbox" id="brake-pads-checkbox" name="services" value="Brake Pads Change">
      </label>
      <div class="multi-axle-side" id="brake-pads-multi" style="display:none;">
        <label style="font-weight:bold;">Brake Pads Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        Brake Disc Change
        <input type="checkbox" id="brake-disc-checkbox" name="services" value="Brake Disc Change">
      </label>
      <div class="multi-axle-side" id="brake-disc-multi" style="display:none;">
        <label style="font-weight:bold;">Brake Discs Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        Tyres Change
        <input type="checkbox" id="tyres-checkbox" name="services" value="Tyres Change">
      </label>
      <div class="multi-axle-side" id="tyres-multi" style="display:none;">
        <label style="font-weight:bold;">Tyres Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        Brake Calipers Maintenance
        <input type="checkbox" id="brake-calipers-checkbox" name="services" value="Brake Calipers Maintenance">
      </label>
      <div class="multi-axle-side" id="brake-calipers-multi" style="display:none;">
        <label style="font-weight:bold;">Brake Calipers Maintenance (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        Bearing Wheels Change
        <input type="checkbox" id="bearing-wheels-checkbox" name="services" value="Bearing Wheels Change">
      </label>
      <div class="multi-axle-side" id="bearing-wheels-multi" style="display:none;">
        <label style="font-weight:bold;">Bearing Wheels Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        ABS Sensors Change
        <input type="checkbox" id="abs-sensors-checkbox" name="services" value="ABS Sensors Change">
      </label>
      <div class="multi-axle-side" id="abs-sensors-multi" style="display:none;">
        <label style="font-weight:bold;">ABS Sensors Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
      <label>
        Brake Pads Sensors Change
        <input type="checkbox" id="brake-pads-sensors-checkbox" name="services" value="Brake Pads Sensors Change">
      </label>
      <div class="multi-axle-side" id="brake-pads-sensors-multi" style="display:none;">
        <label style="font-weight:bold;">Brake Pads Sensors Changed (select axles/sides):</label>
        <div class="axle-side-multiselect"></div>
      </div>
    </div>
  </div>
</div>
          <div class="form-section">
            <label for="service-notes">Notes / Other Operations:</label>
            <textarea id="service-notes" placeholder="Describe other operations, observations, or details here..."></textarea>
          </div>
          <button type="submit">Save Asset</button>
        </form>
        <div class="success-message" id="success-message" style="display:none;">Asset and service information saved successfully.</div>
        <script>
          // Note: generateId and normalizeAsset are defined here as local copies because
          // this script runs in a separate browser window (new tab) opened via window.open()
          // and cannot access the parent page's scope. Any logic changes must be kept in sync
          // with the identical functions in the main js/app.js file.
          function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          }
          function normalizeAsset(raw) {
            if (!raw || typeof raw !== 'object') return null;
            return {
              id: raw.id || generateId(),
              name: raw.name || '',
              type: raw.type || '',
              status: raw.status || 'Active',
              vin: raw.vin || '',
              year: raw.year || '',
              color: raw.color || '',
              created: raw.created || raw.lastServiceDate || new Date().toISOString(),
              lastServiceDate: raw.lastServiceDate || '',
              nextServiceDate: raw.nextServiceDate || '',
              odometer: raw.odometer || '',
              technician: raw.technician || '',
              location: raw.location || '',
              serviceCost: raw.serviceCost || '',
              attachedFile: raw.attachedFile !== undefined ? raw.attachedFile : null,
              history: Array.isArray(raw.history) ? raw.history : []
            };
          }
          function renderAxleSideHtml(container, serviceId) {
            var serviceAxles = ['Axle 1', 'Axle 2', 'Axle 3', 'Axle 4', 'Axle 5'];
            var sides = ['Left', 'Right'];
            container.innerHTML = serviceAxles.map(function(axle) {
              return '<div class="axle-col">' +
                '<div class="axle-label">' + axle + '</div>' +
                '<div class="axle-sides-row">' +
                  sides.map(function(side) {
                    return '<label>' +
                      side +
                      '<input type="checkbox" name="' + serviceId + '-' + axle + '-' + side + '" data-axle="' + axle + '" data-side="' + side + '" class="' + serviceId + '-axle-side-checkbox">' +
                    '</label>';
                  }).join('') +
                '</div>' +
              '</div>';
            }).join('');
          }
          [
            'brake-pads',
            'brake-disc',
            'tyres',
            'brake-calipers',
            'bearing-wheels',
            'abs-sensors',
            'brake-pads-sensors'
          ].forEach(function(serviceId) {
            var cb = document.getElementById(serviceId + '-checkbox');
            var multi = document.getElementById(serviceId + '-multi');
            if (!cb || !multi) return;
            var container = multi.querySelector('.axle-side-multiselect');
            cb.addEventListener('change', function() {
              if (this.checked) {
                multi.style.display = 'block';
                if (container) renderAxleSideHtml(container, serviceId);
              } else {
                multi.style.display = 'none';
                if (container) container.innerHTML = '';
              }
            });
          });
          document.getElementById('service-file').addEventListener('change', function() {
            var fileName = this.files[0] ? this.files[0].name : '';
            document.getElementById('file-name-display').textContent = fileName;
          });
          document.getElementById('asset-form').addEventListener('submit', function(e) {
            e.preventDefault();
            var name = document.getElementById('asset-name').value.trim();
            var lastServiceDate = document.getElementById('last-service-date').value;
            var nextServiceDate = document.getElementById('next-service-date').value;
            var odometer = document.getElementById('odometer').value;
            var technician = document.getElementById('technician').value.trim();
            var location = document.getElementById('location').value.trim();
            var serviceCost = document.getElementById('service-cost').value;
            var notes = document.getElementById('service-notes').value.trim();
      
            var services = Array.prototype.slice.call(document.querySelectorAll('input[name="services"]:checked')).map(function(cb) { return cb.value; });
      
            function getAxleSideSelections(serviceId) {
              var selections = [];
              Array.prototype.slice.call(document.querySelectorAll('.' + serviceId + '-axle-side-checkbox')).forEach(function(cb) {
                if (cb.checked) {
                  selections.push({
                    axle: cb.getAttribute('data-axle'),
                    side: cb.getAttribute('data-side')
                  });
                }
              });
              return selections.length > 0 ? selections : null;
            }
            var brakePadsMulti = document.getElementById('brake-pads-checkbox').checked ? getAxleSideSelections('brake-pads') : null;
            var brakeDiscMulti = document.getElementById('brake-disc-checkbox').checked ? getAxleSideSelections('brake-disc') : null;
            var tyresMulti = document.getElementById('tyres-checkbox').checked ? getAxleSideSelections('tyres') : null;
            var brakeCalipersMulti = document.getElementById('brake-calipers-checkbox').checked ? getAxleSideSelections('brake-calipers') : null;
            var bearingWheelsMulti = document.getElementById('bearing-wheels-checkbox').checked ? getAxleSideSelections('bearing-wheels') : null;
            var absSensorsMulti = document.getElementById('abs-sensors-checkbox').checked ? getAxleSideSelections('abs-sensors') : null;
            var brakePadsSensorsMulti = document.getElementById('brake-pads-sensors-checkbox').checked ? getAxleSideSelections('brake-pads-sensors') : null;
            function showTabStatus(message, type) {
              var statusMessage = document.getElementById('success-message');
              if (!statusMessage) return;
              statusMessage.textContent = message;
              statusMessage.classList.remove('error');
              if (type === 'error') statusMessage.classList.add('error');
              statusMessage.style.display = 'block';
            }
            function clearTabStatus() {
              var statusMessage = document.getElementById('success-message');
              if (!statusMessage) return;
              statusMessage.style.display = 'none';
              statusMessage.classList.remove('error');
            }
       
            if (!name || !lastServiceDate || !nextServiceDate) {
              showTabStatus("Please fill in all required fields.", "error");
              return;
            }
            clearTabStatus();
      
            var fileInput = document.getElementById('service-file');
            var attachedFile = null;
            if (fileInput.files.length > 0) {
              var file = fileInput.files[0];
              var reader = new FileReader();
              reader.onload = function(ev) {
                attachedFile = {
                  name: file.name,
                  type: file.type,
                  data: ev.target.result
                };
                saveService();
              };
              reader.readAsDataURL(file);
            } else {
              saveService();
            }
      
            function saveService() {
              var rawAssets = JSON.parse(localStorage.getItem("assets") || "[]");
              var assets = Array.isArray(rawAssets) ? rawAssets : [];
              var asset = assets.find(function(a) { return a.name === name; });
              var nowISO = new Date().toISOString();
      
              var serviceEvent = {
                date: lastServiceDate,
                operation: "Service",
                label: "Performed",
                note: [
                  "Service Types: " + services.join(', '),
                  brakePadsMulti ? "Brake Pads: " + JSON.stringify(brakePadsMulti) : "",
                  brakeDiscMulti ? "Brake Discs: " + JSON.stringify(brakeDiscMulti) : "",
                  tyresMulti ? "Tyres: " + JSON.stringify(tyresMulti) : "",
                  brakeCalipersMulti ? "Calipers: " + JSON.stringify(brakeCalipersMulti) : "",
                  bearingWheelsMulti ? "Bearings: " + JSON.stringify(bearingWheelsMulti) : "",
                  absSensorsMulti ? "ABS Sensors: " + JSON.stringify(absSensorsMulti) : "",
                  brakePadsSensorsMulti ? "Pads Sensors: " + JSON.stringify(brakePadsSensorsMulti) : "",
                  notes ? "Notes: " + notes : ""
                ].filter(Boolean).join(' | '),
                odometer,
                technician,
                location,
                serviceCost,
                attachedFile
              };
      
              if (asset) {
                var updatedHistory = (asset.history || []).concat([serviceEvent]);
                var updated = normalizeAsset(Object.assign({}, asset, {
                  lastServiceDate: lastServiceDate,
                  nextServiceDate: nextServiceDate,
                  odometer: odometer,
                  technician: technician,
                  location: location,
                  serviceCost: serviceCost,
                  attachedFile: attachedFile,
                  history: updatedHistory
                }));
                assets[assets.indexOf(asset)] = updated;
              } else {
                asset = normalizeAsset({
                  name: name,
                  created: nowISO,
                  lastServiceDate: lastServiceDate,
                  nextServiceDate: nextServiceDate,
                  odometer: odometer,
                  technician: technician,
                  location: location,
                  serviceCost: serviceCost,
                  attachedFile: attachedFile,
                  history: [serviceEvent]
                });
                assets.push(asset);
              }
              localStorage.setItem("assets", JSON.stringify(assets.map(function(a) { return normalizeAsset(a) || a; })));
              document.getElementById('success-message').style.display = 'block';
              setTimeout(function(){ window.close(); }, 1300);
            }
          });
        </script>
      </body>
      </html>
      `;
            const newTab = window.open('', '_blank');
            newTab.document.open();
            newTab.document.write(formHtml);
            newTab.document.close();
        });


        // --- Reminder Notification Bar ---
        const reminderBar = document.getElementById("reminder-bar");
        if (reminderBar) {
            setTimeout(() => {
                reminderBar.innerHTML = "<p>You have 2 upcoming service reminders.</p>";
            }, 4000);
        }
    });