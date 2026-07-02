document.addEventListener("DOMContentLoaded", function () {

        // Safe event delegation for all current and future links
        document.body.addEventListener("click", function (e) {
            const recentActivitiesLink = e.target.closest(".recent-activities-link");
            if (recentActivitiesLink) {
                e.preventDefault();
                renderRecentActivities();
                document.getElementById("recent-activities").style.display = "block";
            }
        });


        //---App Preferences & Upcoming Reminders---
        const APP_PREFS_KEY = "serviceAppPreferences";
        const DEFAULT_APP_PREFERENCES = {
            defaultServiceCurrency: "USD",
            reminderSnoozeDays: 3,
            reminderDueSoonDays: 7,
            reminderLookAheadDays: 30,
            themeMode: "system",
            language: "en"
        };
        const REMINDER_PREFS_KEY = "serviceReminderPreferences";
        const REMINDER_MODAL_FOCUS_DELAY_MS = 100;
        const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
        const APP_SUPPORTED_LANGUAGES = ["en", "ro"];
        const APP_SUPPORTED_CURRENCIES = ["USD", "EUR", "RON"];

        function clampPreferenceNumber(value, fallback, min, max) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.min(max, Math.max(min, parsed));
        }

        function sanitizeAppPreferences(rawPreferences = {}) {
            const source = rawPreferences && typeof rawPreferences === "object" ? rawPreferences : {};
            const dueSoonDays = clampPreferenceNumber(
                source.reminderDueSoonDays,
                DEFAULT_APP_PREFERENCES.reminderDueSoonDays,
                1,
                30
            );
            const lookAheadDays = Math.max(
                dueSoonDays,
                clampPreferenceNumber(
                    source.reminderLookAheadDays,
                    DEFAULT_APP_PREFERENCES.reminderLookAheadDays,
                    1,
                    180
                )
            );
            const currencyCandidate = String(source.defaultServiceCurrency || "").trim().toUpperCase();
            const languageCandidate = String(source.language || "").trim().toLowerCase();
            const themeCandidate = String(source.themeMode || "").trim().toLowerCase();

            return {
                defaultServiceCurrency: APP_SUPPORTED_CURRENCIES.includes(currencyCandidate)
                    ? currencyCandidate
                    : DEFAULT_APP_PREFERENCES.defaultServiceCurrency,
                reminderSnoozeDays: clampPreferenceNumber(
                    source.reminderSnoozeDays,
                    DEFAULT_APP_PREFERENCES.reminderSnoozeDays,
                    1,
                    30
                ),
                reminderDueSoonDays: dueSoonDays,
                reminderLookAheadDays: lookAheadDays,
                themeMode: ["light", "dark", "system"].includes(themeCandidate)
                    ? themeCandidate
                    : DEFAULT_APP_PREFERENCES.themeMode,
                language: APP_SUPPORTED_LANGUAGES.includes(languageCandidate)
                    ? languageCandidate
                    : DEFAULT_APP_PREFERENCES.language
            };
        }

        function loadAppPreferences() {
            try {
                const parsed = JSON.parse(localStorage.getItem(APP_PREFS_KEY) || "{}");
                return sanitizeAppPreferences(parsed);
            } catch (error) {
                return { ...DEFAULT_APP_PREFERENCES };
            }
        }

        let appPreferences = loadAppPreferences();

        function getAppPreferences() {
            return { ...appPreferences };
        }

        function updateAppPreferences(nextPreferences = {}) {
            appPreferences = sanitizeAppPreferences({
                ...appPreferences,
                ...(nextPreferences && typeof nextPreferences === "object" ? nextPreferences : {})
            });
            localStorage.setItem(APP_PREFS_KEY, JSON.stringify(appPreferences));
            return getAppPreferences();
        }

        function getReminderPreferences() {
            try {
                const parsed = JSON.parse(localStorage.getItem(REMINDER_PREFS_KEY) || "{}");
                return parsed && typeof parsed === "object" ? parsed : {};
            } catch (error) {
                return {};
            }
        }

        function saveReminderPreferences(preferences) {
            localStorage.setItem(REMINDER_PREFS_KEY, JSON.stringify(preferences || {}));
        }

        function formatReminderDateKey(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }

        function getReminderKey(asset) {
            const dueDate = new Date(asset?.nextServiceDate || "");
            return `${asset?.id || asset?.name || "asset"}::${formatReminderDateKey(dueDate)}`;
        }

        function isReminderSuppressed(reminder, now = new Date()) {
            const preferences = getReminderPreferences();
            const reminderPreference = preferences[getReminderKey(reminder)] || {};
            if (reminderPreference.dismissed) return true;
            if (reminderPreference.snoozeUntil) {
                const snoozeUntil = new Date(reminderPreference.snoozeUntil);
                return !isNaN(snoozeUntil.getTime()) && snoozeUntil > now;
            }
            return false;
        }

        function renderReminderGroupList(listId, reminders, emptyState) {
            const list = document.getElementById(listId);
            if (!list) return;
            const { reminderSnoozeDays } = getAppPreferences();
            if (!reminders.length) {
                list.innerHTML = `<li class="empty-state">${emptyState}</li>`;
                return;
            }
            list.innerHTML = reminders.map(reminder => {
                const assetId = escapeHtml(reminder.id || "");
                return `
                    <li class="reminder-item reminder-${reminder.category}">
                        <div class="reminder-main">
                            <div class="reminder-title-row">
                                <strong>${escapeHtml(reminder.name || "Unnamed Asset")}</strong>
                                <span class="reminder-urgency-pill urgency-${reminder.category}">${escapeHtml(reminder.urgencyText)}</span>
                            </div>
                            <div class="reminder-meta">
                                <span>${escapeHtml(reminder.type || "Asset")}</span>
                                <span>Due: ${escapeHtml(reminder.nextService.toLocaleDateString())}</span>
                                <span>${escapeHtml(reminder.relativeLabel)}</span>
                            </div>
                        </div>
                        <div class="reminder-actions">
                            <button type="button" data-reminder-action="open-asset" data-reminder-asset-id="${assetId}">Open Asset</button>
                            <button type="button" data-reminder-action="record-service" data-reminder-asset-id="${assetId}">Record Service</button>
                            <button type="button" data-reminder-action="snooze" data-reminder-asset-id="${assetId}">Snooze ${reminderSnoozeDays}d</button>
                            <button type="button" data-reminder-action="dismiss" data-reminder-asset-id="${assetId}">Dismiss</button>
                        </div>
                    </li>
                `;
            }).join("");
        }

        function updateReminderCount(id, value) {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value);
        }

        function focusAssetHistoryForm(asset) {
            showAssetDetailsAndHistory(asset);
            setTimeout(() => {
                const modal = document.getElementById("asset-history-modal");
                const noteInput = modal ? modal.querySelector("#history-note") : null;
                if (noteInput) {
                    noteInput.focus();
                    noteInput.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, REMINDER_MODAL_FOCUS_DELAY_MS);
        }

        function getReminderRelativeLabel(nextService, today) {
            const diffDays = Math.round((nextService - today) / MILLISECONDS_PER_DAY);
            if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
            if (diffDays === 0) return "Due today";
            if (diffDays === 1) return "Due tomorrow";
            return `Due in ${diffDays} days`;
        }

        function renderUpcomingReminders() {
            const assets = getStoredAssets();
            const { reminderDueSoonDays, reminderLookAheadDays } = getAppPreferences();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueSoonLimit = new Date(today);
            dueSoonLimit.setDate(today.getDate() + reminderDueSoonDays);
            const lookAheadLimit = new Date(today);
            lookAheadLimit.setDate(today.getDate() + reminderLookAheadDays);

            const now = new Date();
            const reminderGroups = { overdue: [], dueSoon: [], upcomingLater: [] };
            let dueThisMonthCount = 0;

            assets.forEach(asset => {
                if (!asset.nextServiceDate) return;
                const nextService = new Date(asset.nextServiceDate);
                if (isNaN(nextService.getTime())) return;
                nextService.setHours(0, 0, 0, 0);
                if (nextService >= today && nextService > lookAheadLimit) return;
                let category = "upcoming-later";
                let urgencyText = "Upcoming";
                if (nextService < today) {
                    category = "overdue";
                    urgencyText = "Overdue";
                } else if (nextService <= dueSoonLimit) {
                    category = "due-soon";
                    urgencyText = "Due Soon";
                }
                const reminder = {
                    ...asset,
                    nextService,
                    category,
                    urgencyText,
                    relativeLabel: getReminderRelativeLabel(nextService, today)
                };
                if (isReminderSuppressed(reminder, now)) return;
                if (category !== "overdue") dueThisMonthCount++;
                if (category === "overdue") reminderGroups.overdue.push(reminder);
                else if (category === "due-soon") reminderGroups.dueSoon.push(reminder);
                else reminderGroups.upcomingLater.push(reminder);
            });

            reminderGroups.overdue.sort((a, b) => a.nextService - b.nextService);
            reminderGroups.dueSoon.sort((a, b) => a.nextService - b.nextService);
            reminderGroups.upcomingLater.sort((a, b) => a.nextService - b.nextService);

            const overdue = reminderGroups.overdue;
            const dueSoon = reminderGroups.dueSoon;
            const upcomingLater = reminderGroups.upcomingLater;

            updateReminderCount("reminder-overdue-total", overdue.length);
            updateReminderCount("reminder-due-week", dueSoon.length);
            updateReminderCount("reminder-due-month", dueThisMonthCount);
            updateReminderCount("reminder-overdue-count", overdue.length);
            updateReminderCount("reminder-due-soon-count", dueSoon.length);
            updateReminderCount("reminder-upcoming-later-count", upcomingLater.length);
            const reminderWindowLabel = document.getElementById("reminder-window-label");
            if (reminderWindowLabel) reminderWindowLabel.textContent = `Due in ${reminderLookAheadDays} Days`;

            renderReminderGroupList("reminders-overdue-list", overdue, "No overdue reminders.");
            renderReminderGroupList(
                "reminders-due-soon-list",
                dueSoon,
                `No reminders due in the next ${reminderDueSoonDays} days.`
            );
            renderReminderGroupList(
                "reminders-upcoming-later-list",
                upcomingLater,
                "No upcoming reminders in the selected look-ahead window."
            );
        }

        const remindersSection = document.getElementById("upcoming-reminders");
        if (remindersSection) {
            remindersSection.addEventListener("click", (event) => {
                const actionButton = event.target.closest("button[data-reminder-action]");
                if (!actionButton) return;
                const action = actionButton.getAttribute("data-reminder-action");
                const assetId = actionButton.getAttribute("data-reminder-asset-id") || "";
                if (!assetId) return;
                const assets = getStoredAssets();
                const asset = assets.find(item => String(item.id) === String(assetId));
                if (!asset) {
                    showFeedback("Asset no longer exists.", "info");
                    renderUpcomingReminders();
                    return;
                }
                if (action === "open-asset") {
                    showAssetDetailsAndHistory(asset);
                    return;
                }
                if (action === "record-service") {
                    focusAssetHistoryForm(asset);
                    return;
                }
                if (action === "dismiss") {
                    const preferences = getReminderPreferences();
                    preferences[getReminderKey(asset)] = { dismissed: true };
                    saveReminderPreferences(preferences);
                    showFeedback("Reminder dismissed locally.", "success");
                    renderUpcomingReminders();
                    return;
                }
                if (action === "snooze") {
                    const { reminderSnoozeDays } = getAppPreferences();
                    const snoozeUntil = new Date();
                    snoozeUntil.setDate(snoozeUntil.getDate() + reminderSnoozeDays);
                    const preferences = getReminderPreferences();
                    preferences[getReminderKey(asset)] = { snoozeUntil: snoozeUntil.toISOString() };
                    saveReminderPreferences(preferences);
                    showFeedback(`Reminder snoozed for ${reminderSnoozeDays} days.`, "success");
                    renderUpcomingReminders();
                }
            });
        }

        renderUpcomingReminders();

        //---Recent Activities---
        const ACTIVITY_DETAIL_SEPARATOR = " • ";

        function getRelativeTimeLabel(dateValue) {
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            if (isNaN(date.getTime())) return "Unknown time";
            const deltaMs = Date.now() - date.getTime();
            if (deltaMs < -45000) return "in the future";
            const seconds = Math.floor(Math.abs(deltaMs) / 1000);
            if (seconds < 45) return "just now";
            if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
            }
            if (seconds < 86400) {
                const hours = Math.floor(seconds / 3600);
                return `${hours} hour${hours === 1 ? "" : "s"} ago`;
            }
            const days = Math.floor(seconds / 86400);
            return `${days} day${days === 1 ? "" : "s"} ago`;
        }

        function mapActivityType(operation = "", note = "") {
            const op = String(operation || "").trim().toLowerCase();
            const noteLower = String(note || "").toLowerCase();

            if (op === "created" || noteLower.includes("asset created")) {
                return "asset-created";
            }
            if (op === "maintenance") return "maintenance-recorded";
            if (op === "service" || op === "repair" || op === "parts change") return "service-logged";
            if (op === "updated" || op === "edit" || op === "edited" || noteLower.includes("updated")) {
                return "asset-updated";
            }
            return "activity";
        }

        function getActivityMeta(type) {
            const meta = {
                "asset-created": { icon: "🆕", action: "Asset created" },
                "asset-updated": { icon: "✏️", action: "Asset updated" },
                "service-logged": { icon: "🛠️", action: "Service logged" },
                "maintenance-recorded": { icon: "🔧", action: "Maintenance recorded" },
                comment: { icon: "💬", action: "Comment added" },
                activity: { icon: "📌", action: "Activity recorded" }
            };
            return meta[type] || meta.activity;
        }

        function formatActivityOperationLabel(operation) {
            return String(operation || "")
                .split(" ")
                .filter(Boolean)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        }

        function renderRecentActivities(limit = 15) {
            const assets = getStoredAssets();
            const comments = JSON.parse(localStorage.getItem("assetComments") || "[]");

            let activityList = [];

            assets.forEach(asset => {
                (asset.history || []).forEach(ev => {
                    const operationLabel = formatActivityOperationLabel(ev.operation || ev.type);
                    activityList.push({
                        type: mapActivityType(ev.operation || ev.type, ev.note),
                        asset: asset.name,
                        date: new Date(ev.date),
                        detail: operationLabel ? `${operationLabel}${ev.label ? `${ACTIVITY_DETAIL_SEPARATOR}${ev.label}` : ""}` : "Service Event",
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

            list.innerHTML = activityList.slice(0, limit).map(ev => {
                const eventMeta = getActivityMeta(ev.type);
                const relativeTime = getRelativeTimeLabel(ev.date);
                const exactTime = formatDisplayDate(ev.date, "Unknown date");
                const isoDate = ev.date instanceof Date && !isNaN(ev.date.getTime()) ? ev.date.toISOString() : "";
                const safeAsset = escapeHtml(ev.asset || "General");
                const safeDetail = escapeHtml(ev.detail || "");
                const safeNote = escapeHtml(ev.note || "");

                return `<li class="activity-item activity-${ev.type}">
                    <span class="activity-icon" aria-hidden="true">${eventMeta.icon}</span>
                    <div class="activity-content">
                        <div class="activity-line">
                            <strong class="activity-asset">${safeAsset}</strong>
                            <span class="activity-action">${eventMeta.action}</span>
                        </div>
                        <div class="activity-description">
                            <span>${safeDetail}</span>
                            ${safeNote ? `<span class="activity-note">${safeNote}</span>` : ""}
                        </div>
                        <div class="activity-time">
                            <time datetime="${isoDate}" title="${exactTime}">${relativeTime}</time>
                            <span class="activity-time-absolute">${exactTime}</span>
                        </div>
                    </div>
                </li>`;
            }).join("");
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
        const SERVICE_EVENT_OPERATIONS = new Set(["service", "maintenance", "repair", "parts change"]);
        const SUPPORTED_SERVICE_CURRENCIES = ["USD", "EUR", "RON"];
        const DEFAULT_SERVICE_CURRENCY = "USD";
        const ASSETS_MODAL_COLUMNS = ["Select", "Name", "Type", "Status", "Health", "Latest Cost", "VIN", "Year", "Color", "Added", "Actions"];
        let activeAssetFilter = "all";
        let activeAssetSearchQuery = "";
        let activeAssetSort = "name";
        let selectedAssetIds = new Set();

        function isServiceEvent(event) {
            return SERVICE_EVENT_OPERATIONS.has(String(event?.operation || event?.type || "").toLowerCase());
        }

        function parseCostValue(value) {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        }

        function normalizeServiceCurrency(currency) {
            const normalized = String(currency || "").trim().toUpperCase();
            return SUPPORTED_SERVICE_CURRENCIES.includes(normalized) ? normalized : DEFAULT_SERVICE_CURRENCY;
        }

        function getPreferredServiceCurrency() {
            return normalizeServiceCurrency(getAppPreferences().defaultServiceCurrency);
        }

        function formatCurrency(value, currency = DEFAULT_SERVICE_CURRENCY) {
            const amount = Number(value) || 0;
            const normalizedCurrency = normalizeServiceCurrency(currency);
            try {
                return amount.toLocaleString(undefined, { style: "currency", currency: normalizedCurrency });
            } catch (error) {
                return `${amount.toFixed(2)} ${normalizedCurrency}`;
            }
        }

        function initializeCurrencyTotals(initialValue = 0) {
            return SUPPORTED_SERVICE_CURRENCIES.reduce((acc, currency) => {
                acc[currency] = initialValue;
                return acc;
            }, {});
        }

        function getServiceCostEntry(event, asset = null) {
            const amount = parseCostValue(event?.serviceCost);
            if (amount <= 0) return null;
            const currency = normalizeServiceCurrency(event?.serviceCurrency || asset?.serviceCurrency);
            return { amount, currency };
        }

        function getAssetFallbackCostEntry(asset) {
            const amount = parseCostValue(asset?.serviceCost);
            if (amount <= 0) return null;
            const currency = normalizeServiceCurrency(asset?.serviceCurrency);
            return { amount, currency };
        }

        function formatCurrencyBreakdownText(valuesByCurrency = {}) {
            const parts = SUPPORTED_SERVICE_CURRENCIES
                .filter(currency => Number(valuesByCurrency[currency]) > 0)
                .map(currency => `${currency}: ${formatCurrency(valuesByCurrency[currency], currency)}`);
            return parts.length ? parts.join(" | ") : "—";
        }

        function formatHighCostAssetBreakdownText(highestCostAssetByCurrency = {}) {
            const parts = SUPPORTED_SERVICE_CURRENCIES
                .filter(currency => Number(highestCostAssetByCurrency[currency]?.value) > 0)
                .map(currency => `${currency}: ${highestCostAssetByCurrency[currency].name} (${formatCurrency(highestCostAssetByCurrency[currency].value, currency)})`);
            return parts.length ? parts.join(" | ") : "—";
        }

        function renderCurrencyBreakdownHtml(valuesByCurrency = {}) {
            const parts = SUPPORTED_SERVICE_CURRENCIES
                .filter(currency => Number(valuesByCurrency[currency]) > 0)
                .map(currency => `<span>${currency}: ${escapeHtml(formatCurrency(valuesByCurrency[currency], currency))}</span>`);
            return parts.length ? parts.join("<br>") : "—";
        }

        function renderHighCostAssetBreakdownHtml(highestCostAssetByCurrency = {}) {
            const parts = SUPPORTED_SERVICE_CURRENCIES
                .filter(currency => Number(highestCostAssetByCurrency[currency]?.value) > 0)
                .map(currency => `<span>${currency}: ${escapeHtml(highestCostAssetByCurrency[currency].name)} (${escapeHtml(formatCurrency(highestCostAssetByCurrency[currency].value, currency))})</span>`);
            return parts.length ? parts.join("<br>") : "—";
        }

        function getServiceCurrencyOptionsHtml(selectedCurrency = getPreferredServiceCurrency()) {
            const normalizedSelection = normalizeServiceCurrency(selectedCurrency);
            return SUPPORTED_SERVICE_CURRENCIES
                .map(currency => `<option value="${currency}"${currency === normalizedSelection ? " selected" : ""}>${currency}</option>`)
                .join("");
        }

        function getLatestServiceCost(asset) {
            const history = Array.isArray(asset?.history) ? [...asset.history] : [];
            history.sort((a, b) => new Date(b.date) - new Date(a.date));
            const fromHistory = history.find(ev => getServiceCostEntry(ev, asset));
            if (fromHistory) return getServiceCostEntry(fromHistory, asset);
            return getAssetFallbackCostEntry(asset);
        }

        function getServiceCostInsightsData(assets = getStoredAssets()) {
            const now = Date.now();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const totalCostByCurrency = initializeCurrencyTotals();
            const recentCostByCurrency = initializeCurrencyTotals();
            const serviceEventsWithCostByCurrency = initializeCurrencyTotals();
            const assetSpendByCurrency = SUPPORTED_SERVICE_CURRENCIES.reduce((acc, currency) => {
                acc[currency] = {};
                return acc;
            }, {});

            assets.forEach(asset => {
                const assetTotalsByCurrency = initializeCurrencyTotals();
                let hasHistoryCost = false;
                (asset.history || []).forEach(ev => {
                    if (!isServiceEvent(ev)) return;
                    const eventCostEntry = getServiceCostEntry(ev, asset);
                    if (!eventCostEntry) return;
                    hasHistoryCost = true;
                    const { amount, currency } = eventCostEntry;
                    serviceEventsWithCostByCurrency[currency]++;
                    totalCostByCurrency[currency] += amount;
                    assetTotalsByCurrency[currency] += amount;
                    const eventDate = new Date(ev.date);
                    if (!isNaN(eventDate.getTime()) && (now - eventDate.getTime()) <= thirtyDaysMs) {
                        recentCostByCurrency[currency] += amount;
                    }
                });
                if (!hasHistoryCost) {
                    const fallbackCostEntry = getAssetFallbackCostEntry(asset);
                    if (fallbackCostEntry) {
                        const { amount, currency } = fallbackCostEntry;
                        totalCostByCurrency[currency] += amount;
                        assetTotalsByCurrency[currency] += amount;
                    }
                }
                SUPPORTED_SERVICE_CURRENCIES.forEach(currency => {
                    if (assetTotalsByCurrency[currency] > 0) {
                        assetSpendByCurrency[currency][asset.name || "Unnamed Asset"] =
                            (assetSpendByCurrency[currency][asset.name || "Unnamed Asset"] || 0) + assetTotalsByCurrency[currency];
                    }
                });
            });

            const highestCostAssetByCurrency = SUPPORTED_SERVICE_CURRENCIES.reduce((acc, currency) => {
                let highestName = "—";
                let highestValue = 0;
                Object.entries(assetSpendByCurrency[currency]).forEach(([assetName, spend]) => {
                    if (spend > highestValue) {
                        highestValue = spend;
                        highestName = assetName;
                    }
                });
                acc[currency] = { name: highestName, value: highestValue };
                return acc;
            }, {});

            const avgCostPerServiceByCurrency = SUPPORTED_SERVICE_CURRENCIES.reduce((acc, currency) => {
                const eventCount = serviceEventsWithCostByCurrency[currency];
                acc[currency] = eventCount ? totalCostByCurrency[currency] / eventCount : 0;
                return acc;
            }, {});

            const totalCost = SUPPORTED_SERVICE_CURRENCIES.reduce((sum, currency) => sum + totalCostByCurrency[currency], 0);
            const recentCost = SUPPORTED_SERVICE_CURRENCIES.reduce((sum, currency) => sum + recentCostByCurrency[currency], 0);
            const serviceEventsWithCost = SUPPORTED_SERVICE_CURRENCIES.reduce((sum, currency) => sum + serviceEventsWithCostByCurrency[currency], 0);
            const avgCostPerService = serviceEventsWithCost ? totalCost / serviceEventsWithCost : 0;
            const assetSpend = {};
            SUPPORTED_SERVICE_CURRENCIES.forEach(currency => {
                Object.entries(assetSpendByCurrency[currency]).forEach(([assetName, spend]) => {
                    assetSpend[assetName] = (assetSpend[assetName] || 0) + spend;
                });
            });

            let highestCostAsset = "—";
            let highestCostValue = 0;
            Object.entries(assetSpend).forEach(([assetName, spend]) => {
                if (spend > highestCostValue) {
                    highestCostValue = spend;
                    highestCostAsset = assetName;
                }
            });

            return {
                totalCost,
                recentCost,
                highestCostAsset,
                highestCostValue,
                avgCostPerService,
                serviceEventsWithCost,
                assetSpend,
                totalCostByCurrency,
                recentCostByCurrency,
                highestCostAssetByCurrency,
                avgCostPerServiceByCurrency,
                serviceEventsWithCostByCurrency,
                assetSpendByCurrency
            };
        }

        function renderServiceCostInsights(assets = getStoredAssets(), insights = getServiceCostInsightsData(assets)) {
            const container = document.getElementById("service-cost-insights");
            if (!container) return;
            const highCostAssetText = renderHighCostAssetBreakdownHtml(insights.highestCostAssetByCurrency);

            container.innerHTML = `
                <div class="service-cost-card">
                    <span class="service-cost-label">Total Service Spend</span>
                    <strong class="service-cost-value">${renderCurrencyBreakdownHtml(insights.totalCostByCurrency)}</strong>
                </div>
                <div class="service-cost-card">
                    <span class="service-cost-label">Spend (Last 30 Days)</span>
                    <strong class="service-cost-value">${renderCurrencyBreakdownHtml(insights.recentCostByCurrency)}</strong>
                </div>
                <div class="service-cost-card">
                    <span class="service-cost-label">Average Cost per Service</span>
                    <strong class="service-cost-value">${renderCurrencyBreakdownHtml(insights.avgCostPerServiceByCurrency)}</strong>
                </div>
                <div class="service-cost-card">
                    <span class="service-cost-label">High-Cost Asset</span>
                    <strong class="service-cost-value">${highCostAssetText}</strong>
                </div>
            `;
        }

        function escapeRegExp(value) {
            return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }

        function highlightSearchMatch(value, query) {
            const text = String(value ?? "");
            const normalizedQuery = String(query || "").trim();
            if (!normalizedQuery) return escapeHtml(text);
            const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig");
            return escapeHtml(text).replace(pattern, "<mark class=\"search-highlight\">$1</mark>");
        }

        function assetMatchesQuery(asset, query) {
            const q = String(query || "").trim().toLowerCase();
            if (!q) return true;
            return [
                asset?.name,
                asset?.type,
                asset?.status,
                asset?.vin,
                asset?.year,
                asset?.color,
                asset?.technician,
                asset?.location
            ].some(value => String(value || "").toLowerCase().includes(q));
        }

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
            const costInsights = getServiceCostInsightsData(assets);

            assets.forEach(asset => {
                const statusInfo = getAssetStatusInfo(asset, now);
                if (statusInfo.isOverdue) overdueServices++;
                if (statusInfo.isDueSoon) upcomingServices++;

                (asset.history || []).forEach(ev => {
                    if (isServiceEvent(ev)) {
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
                { label: "Total Service Spend", value: formatCurrencyBreakdownText(costInsights.totalCostByCurrency), detail: "Cost insights", action: "open-analytics" },
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
                if (action === "open-analytics") {
                    const analyticsSection = document.getElementById("analytics-section");
                    if (analyticsSection) analyticsSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
        function applyThemePreference(themeMode = getAppPreferences().themeMode) {
            const normalizedTheme = ["light", "dark", "system"].includes(themeMode) ? themeMode : "system";
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            const shouldUseDark = normalizedTheme === "dark" || (normalizedTheme === "system" && prefersDark);
            document.body.classList.toggle("dark-mode", shouldUseDark);
            if (darkModeToggle) {
                darkModeToggle.textContent = shouldUseDark ? "☀️ Light Mode" : "🌙 Dark Mode";
            }
        }
        applyThemePreference();
        if (darkModeToggle) {
            darkModeToggle.addEventListener("click", () => {
                const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
                updateAppPreferences({ themeMode: nextTheme });
                applyThemePreference(nextTheme);
            });
        }

        // --- LANGUAGE SELECTOR ---
        const translations = {
            en: { title: "Service History", welcome: "Welcome Back, Vols40!", dashboard: "Your Service History Dashboard" },
            ro: { title: "Istoric Service", welcome: "Bine ai revenit, Vols40!", dashboard: "Tabloul de bord al istoricului de servicii" }
        };
        const languageSelector = document.getElementById("language-selector");
        function applyLanguagePreference(languageCode = getAppPreferences().language) {
            const selected = translations[languageCode] ? languageCode : "en";
            const title = document.querySelector(".app-title");
            if (title) title.textContent = translations[selected].title;
            const welcome = document.querySelector(".welcome-section h2");
            const dash = document.querySelector(".welcome-section p");
            if (welcome) welcome.textContent = translations[selected].welcome;
            if (dash) dash.textContent = translations[selected].dashboard;
            if (languageSelector) languageSelector.value = selected;
        }
        applyLanguagePreference();
        if (languageSelector) {
            languageSelector.addEventListener("change", (event) => {
                const selected = event.target.value;
                if (!translations[selected]) return;
                updateAppPreferences({ language: selected });
                applyLanguagePreference(selected);
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

        const openPreferencesBtn = document.getElementById("open-preferences");
        function openPreferencesModal() {
            let modal = document.getElementById("preferences-modal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "preferences-modal";
                modal.style.position = "fixed";
                modal.style.top = "0";
                modal.style.left = "0";
                modal.style.width = "100vw";
                modal.style.height = "100vh";
                modal.style.background = "rgba(0,0,0,0.5)";
                modal.style.display = "flex";
                modal.style.alignItems = "center";
                modal.style.justifyContent = "center";
                modal.style.zIndex = "2100";
                modal.addEventListener("click", (event) => {
                    if (event.target === modal) modal.remove();
                });
                document.body.appendChild(modal);
            }

            const preferences = getAppPreferences();
            modal.innerHTML = `
                <div class="preferences-modal-inner">
                    <button id="close-preferences-modal" class="preferences-close" type="button" aria-label="Close preferences">&times;</button>
                    <h3 class="preferences-modal-title">Settings &amp; Preferences</h3>
                    <p class="preferences-modal-intro">Update your default cost currency, reminder behavior, and basic UI choices.</p>
                    <form id="preferences-form">
                        <div class="preferences-grid">
                            <div class="preferences-field">
                                <label for="pref-default-currency">Default service currency</label>
                                <select id="pref-default-currency">${getServiceCurrencyOptionsHtml(preferences.defaultServiceCurrency)}</select>
                            </div>
                            <div class="preferences-field">
                                <label for="pref-snooze-days">Reminder snooze (days)</label>
                                <input type="number" id="pref-snooze-days" min="1" max="30" value="${preferences.reminderSnoozeDays}">
                            </div>
                            <div class="preferences-field">
                                <label for="pref-due-soon-days">Due soon threshold (days)</label>
                                <input type="number" id="pref-due-soon-days" min="1" max="30" value="${preferences.reminderDueSoonDays}">
                            </div>
                            <div class="preferences-field">
                                <label for="pref-look-ahead-days">Reminder look-ahead window (days)</label>
                                <input type="number" id="pref-look-ahead-days" min="1" max="180" value="${preferences.reminderLookAheadDays}">
                            </div>
                            <div class="preferences-field">
                                <label for="pref-theme-mode">Theme mode</label>
                                <select id="pref-theme-mode">
                                    <option value="system"${preferences.themeMode === "system" ? " selected" : ""}>System</option>
                                    <option value="light"${preferences.themeMode === "light" ? " selected" : ""}>Light</option>
                                    <option value="dark"${preferences.themeMode === "dark" ? " selected" : ""}>Dark</option>
                                </select>
                            </div>
                            <div class="preferences-field">
                                <label for="pref-language">Language</label>
                                <select id="pref-language">
                                    <option value="en"${preferences.language === "en" ? " selected" : ""}>English</option>
                                    <option value="ro"${preferences.language === "ro" ? " selected" : ""}>Română</option>
                                </select>
                            </div>
                        </div>
                        <p class="preferences-help">Preferences are stored locally in this browser.</p>
                        <div class="preferences-actions">
                            <button type="button" id="cancel-preferences">Cancel</button>
                            <button type="submit">Save Preferences</button>
                        </div>
                    </form>
                </div>
            `;

            const closeModal = () => modal.remove();
            const closeButton = modal.querySelector("#close-preferences-modal");
            if (closeButton) closeButton.addEventListener("click", closeModal);
            const cancelButton = modal.querySelector("#cancel-preferences");
            if (cancelButton) cancelButton.addEventListener("click", closeModal);

            const form = modal.querySelector("#preferences-form");
            if (form) {
                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    const nextPreferences = updateAppPreferences({
                        defaultServiceCurrency: form.querySelector("#pref-default-currency").value,
                        reminderSnoozeDays: form.querySelector("#pref-snooze-days").value,
                        reminderDueSoonDays: form.querySelector("#pref-due-soon-days").value,
                        reminderLookAheadDays: form.querySelector("#pref-look-ahead-days").value,
                        themeMode: form.querySelector("#pref-theme-mode").value,
                        language: form.querySelector("#pref-language").value
                    });
                    applyThemePreference(nextPreferences.themeMode);
                    applyLanguagePreference(nextPreferences.language);
                    renderUpcomingReminders();
                    showFeedback("Preferences saved locally.", "success");
                    closeModal();
                });
            }
        }

        if (openPreferencesBtn) {
            openPreferencesBtn.addEventListener("click", openPreferencesModal);
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
                    event.target.value = "";
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsedData = JSON.parse(e.target.result);
                        let rawAssets;
                        if (Array.isArray(parsedData)) {
                            rawAssets = parsedData;
                        } else if (parsedData && typeof parsedData === "object" && Array.isArray(parsedData.assets)) {
                            rawAssets = parsedData.assets;
                        } else {
                            showFeedback("Unsupported JSON shape: expected an array or an object with an \"assets\" array.", "error");
                            event.target.value = "";
                            return;
                        }
                        const normalized = rawAssets.map(normalizeAsset).filter(Boolean);
                        if (normalized.length === 0) {
                            showFeedback("No valid assets found in the imported file.", "error");
                            event.target.value = "";
                            return;
                        }
                        saveStoredAssets(normalized);
                        refreshAssetDependentViews();
                        showFeedback(`Imported ${normalized.length} asset${normalized.length === 1 ? "" : "s"} successfully.`, "success");
                    } catch {
                        showFeedback("Invalid JSON format.", "error");
                    }
                    event.target.value = "";
                };
                reader.readAsText(file);
            });
        }
        const PDF_SECTION_COLORS = [
            { header: [56, 142, 60], body: [198, 239, 206] },   // green
            { header: [30, 136, 229], body: [187, 222, 251] },  // blue
            { header: [245, 124, 0], body: [255, 224, 178] },   // orange
            { header: [123, 31, 162], body: [225, 190, 231] },  // purple
        ];

        function createServiceHistoryPdfDocument() {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                showFeedback("PDF export is unavailable (jsPDF not loaded).", "error");
                return null;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            if (typeof doc.autoTable !== "function") {
                showFeedback("PDF export is unavailable (AutoTable not loaded).", "error");
                return null;
            }
            return doc;
        }

        function buildAssetPdfMetadataRows(asset) {
            return [
                ["Type", asset?.type || "-"],
                ["Status", asset?.status || "-"],
                ["VIN", asset?.vin || "-"],
                ["Year", asset?.year || "-"],
                ["Color", asset?.color || "-"],
                ["Added", asset?.created ? new Date(asset.created).toLocaleString() : "-"],
            ];
        }

        function buildAssetPdfHistoryRows(asset) {
            return (Array.isArray(asset?.history) ? asset.history : []).map(ev => ({
                date: new Date(ev.date).toLocaleDateString(),
                operation: ev.operation || ev.type || "",
                label: ev.label || "",
                cost: (() => {
                    const serviceCostEntry = getServiceCostEntry(ev, asset);
                    return serviceCostEntry ? formatCurrency(serviceCostEntry.amount, serviceCostEntry.currency) : "";
                })(),
                note: ev.note || "",
            }));
        }

        function exportServiceHistoryPdf(assetsToExport, {
            fileName = "service-history.pdf",
        } = {}) {
            const doc = createServiceHistoryPdfDocument();
            if (!doc) return;

            const assets = Array.isArray(assetsToExport) ? assetsToExport.filter(Boolean) : [];
            const PAGE_MARGIN = 14;
            const PAGE_WIDTH = doc.internal.pageSize.getWidth();
            const TABLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
            const COL_DATE = 22;
            const COL_OPERATION = 28;
            const COL_LABEL = 26;
            const COL_COST = 26;
            const COL_NOTE = TABLE_WIDTH - COL_DATE - COL_OPERATION - COL_LABEL - COL_COST;

            let currentY = 14;

            if (assets.length === 0) {
                doc.setFontSize(9);
                doc.setTextColor(140, 140, 140);
                doc.text("No assets available for export.", PAGE_MARGIN, currentY);
                doc.setTextColor(0, 0, 0);
                doc.save(fileName);
                return;
            }

            assets.forEach((asset, idx) => {
                if (idx > 0) {
                    doc.addPage();
                    currentY = 14;
                }

                const colors = PDF_SECTION_COLORS[idx % PDF_SECTION_COLORS.length];
                const assetTitle = `Service History for: ${asset?.name || "Unnamed Asset"}`;

                doc.setFontSize(11);
                doc.setFont(undefined, "bold");
                const titleLines = doc.splitTextToSize(assetTitle, TABLE_WIDTH - 4);
                const titleLineHeight = 5;
                const titleBlockHeight = Math.max(10, titleLines.length * titleLineHeight + 4);
                doc.setFillColor(...colors.header);
                doc.rect(PAGE_MARGIN, currentY, TABLE_WIDTH, titleBlockHeight, "F");
                doc.setTextColor(255, 255, 255);
                doc.text(titleLines, PAGE_MARGIN + 2, currentY + 5);
                doc.setFont(undefined, "normal");
                doc.setTextColor(0, 0, 0);
                currentY += titleBlockHeight + 3;

                doc.autoTable({
                    startY: currentY,
                    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
                    body: buildAssetPdfMetadataRows(asset),
                    showHead: false,
                    theme: "grid",
                    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 2 },
                    columnStyles: {
                        0: { cellWidth: 24, fontStyle: "bold", fillColor: colors.body, textColor: [45, 45, 45] },
                        1: { cellWidth: TABLE_WIDTH - 24, fillColor: [255, 255, 255] },
                    },
                });

                currentY = (doc.lastAutoTable && doc.lastAutoTable.finalY)
                    ? doc.lastAutoTable.finalY + 5
                    : currentY + 5;

                const historyRows = buildAssetPdfHistoryRows(asset);

                if (historyRows.length === 0) {
                    doc.autoTable({
                        startY: currentY,
                        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
                        body: [["No history events recorded for this asset."]],
                        showHead: false,
                        theme: "grid",
                        styles: {
                            fontSize: 8.5,
                            textColor: [120, 120, 120],
                            cellPadding: 3,
                            halign: "center",
                            overflow: "linebreak",
                        },
                        columnStyles: {
                            0: { cellWidth: TABLE_WIDTH, fillColor: [255, 255, 255] },
                        },
                    });
                    currentY = (doc.lastAutoTable && doc.lastAutoTable.finalY)
                        ? doc.lastAutoTable.finalY + 8
                        : currentY + 8;
                    return;
                }

                doc.autoTable({
                    columns: [
                        { header: "Date", dataKey: "date" },
                        { header: "Operation", dataKey: "operation" },
                        { header: "Label", dataKey: "label" },
                        { header: "Cost", dataKey: "cost" },
                        { header: "Note", dataKey: "note" },
                    ],
                    body: historyRows,
                    startY: currentY,
                    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
                    styles: { fontSize: 8, overflow: "linebreak", cellPadding: 2, valign: "top" },
                    headStyles: {
                        fillColor: colors.header,
                        textColor: [255, 255, 255],
                        halign: "center",
                        fontStyle: "bold",
                    },
                    bodyStyles: { fillColor: [255, 255, 255] },
                    alternateRowStyles: { fillColor: colors.body },
                    theme: "grid",
                    columnStyles: {
                        date: { cellWidth: COL_DATE, overflow: "linebreak" },
                        operation: { cellWidth: COL_OPERATION, overflow: "linebreak" },
                        label: { cellWidth: COL_LABEL, overflow: "linebreak" },
                        cost: { cellWidth: COL_COST, overflow: "linebreak" },
                        note: { cellWidth: COL_NOTE, overflow: "linebreak" },
                    },
                });

                currentY = (doc.lastAutoTable && doc.lastAutoTable.finalY)
                    ? doc.lastAutoTable.finalY + 8
                    : currentY + 8;
            });

            doc.save(fileName);
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
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener("click", () => {
                const assets = getStoredAssets();
                exportServiceHistoryPdf(assets, {
                    fileName: "service-history.pdf",
                });
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
                    if (isServiceEvent(ev)) {
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
                const costInsights = getServiceCostInsightsData(assets);
                ss.querySelector("p:nth-of-type(5)").textContent = `Total Service Spend: ${formatCurrencyBreakdownText(costInsights.totalCostByCurrency)}`;
                ss.querySelector("p:nth-of-type(6)").textContent = `Highest Service Spend Asset: ${formatHighCostAssetBreakdownText(costInsights.highestCostAssetByCurrency)}`;
            }
        }
        function renderAssetPerformance() {
            const assets = getStoredAssets();
            let totalIntervals = 0, intervalCount = 0;
            let freqMap = {};
            assets.forEach(asset => {
                const history = (asset.history || [])
                    .filter(ev => isServiceEvent(ev))
                    .sort((a, b) => new Date(a.date) - new Date(b.date));
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
                    if (isServiceEvent(ev)) {
                        const serviceCostEntry = getServiceCostEntry(ev, asset);
                        log.push({
                            date: new Date(ev.date),
                            asset: asset.name,
                            note: ev.note || "",
                            costText: serviceCostEntry ? formatCurrency(serviceCostEntry.amount, serviceCostEntry.currency) : ""
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
                    return `<li>${dateStr} - ${status} for "${ev.asset}"${ev.costText ? ` (${escapeHtml(ev.costText)})` : ""}</li>`;
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
        const analyticsChartInstances = {};
        function destroyAnalyticsChart(containerId) {
            if (analyticsChartInstances[containerId]) {
                analyticsChartInstances[containerId].destroy();
                delete analyticsChartInstances[containerId];
            }
        }

        function renderChartWithFallback({ containerId, chartConfig, fallbackHtml }) {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (window.Chart && chartConfig) {
                container.innerHTML = `<canvas></canvas>`;
                const ctx = container.querySelector("canvas").getContext("2d");
                destroyAnalyticsChart(containerId);
                analyticsChartInstances[containerId] = new Chart(ctx, chartConfig);
                return;
            }
            destroyAnalyticsChart(containerId);
            container.innerHTML = fallbackHtml;
        }

        function renderServiceTrendsChart() {
            const assets = getStoredAssets();
            const now = new Date();
            const months = [];
            const monthLabels = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
                months.push({ year: d.getFullYear(), month: d.getMonth(), label });
                monthLabels.push(label);
            }

            const serviceCounts = months.map(m => {
                let count = 0;
                assets.forEach(asset => {
                    (asset.history || []).forEach(ev => {
                        const evDate = new Date(ev.date);
                        if (isServiceEvent(ev) && evDate.getFullYear() === m.year && evDate.getMonth() === m.month) {
                            count++;
                        }
                    });
                });
                return count;
            });

            const monthlyCostsByCurrency = SUPPORTED_SERVICE_CURRENCIES.reduce((acc, currency) => {
                acc[currency] = months.map(() => 0);
                return acc;
            }, {});
            months.forEach((m, monthIndex) => {
                assets.forEach(asset => {
                    (asset.history || []).forEach(ev => {
                        const evDate = new Date(ev.date);
                        if (isServiceEvent(ev) && evDate.getFullYear() === m.year && evDate.getMonth() === m.month) {
                            const serviceCostEntry = getServiceCostEntry(ev, asset);
                            if (serviceCostEntry) {
                                monthlyCostsByCurrency[serviceCostEntry.currency][monthIndex] += serviceCostEntry.amount;
                            }
                        }
                    });
                });
                SUPPORTED_SERVICE_CURRENCIES.forEach(currency => {
                    monthlyCostsByCurrency[currency][monthIndex] = Number(monthlyCostsByCurrency[currency][monthIndex].toFixed(2));
                });
            });
            const hasMonthlyCosts = SUPPORTED_SERVICE_CURRENCIES.some(currency => monthlyCostsByCurrency[currency].some(cost => cost > 0));
            const costDatasetColors = {
                USD: { bg: "rgba(72, 128, 196, 0.6)", border: "rgba(72, 128, 196, 1)" },
                EUR: { bg: "rgba(90, 170, 112, 0.6)", border: "rgba(90, 170, 112, 1)" },
                RON: { bg: "rgba(208, 142, 74, 0.6)", border: "rgba(208, 142, 74, 1)" }
            };

            const statusCounts = { Active: 0, Inactive: 0, "Out of Service": 0, Other: 0 };
            const dueCounts = { Overdue: 0, "Due Soon": 0, "On Track": 0 };
            assets.forEach(asset => {
                const status = (asset.status || "Active").trim().toLowerCase();
                if (status === "active") statusCounts.Active++;
                else if (status === "inactive") statusCounts.Inactive++;
                else if (["out of service", "out-of-service"].includes(status)) statusCounts["Out of Service"]++;
                else statusCounts.Other++;

                const info = getAssetStatusInfo(asset);
                if (info.isOverdue) dueCounts.Overdue++;
                else if (info.isDueSoon) dueCounts["Due Soon"]++;
                else dueCounts["On Track"]++;
            });

            renderChartWithFallback({
                containerId: "service-trends-chart",
                chartConfig: serviceCounts.some(count => count > 0) ? {
                    type: "line",
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: "Services",
                            data: serviceCounts,
                            borderColor: "rgba(75, 192, 192, 1)",
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                } : null,
                fallbackHtml: serviceCounts.some(count => count > 0)
                    ? `<ul class="chart-fallback-list">${monthLabels.map((label, idx) => `<li>${escapeHtml(label)}: <strong>${serviceCounts[idx]}</strong></li>`).join("")}</ul>`
                    : `<p class="empty-state">No service trend data yet. Add service events to populate this chart.</p>`
            });

            renderChartWithFallback({
                containerId: "status-distribution-chart",
                chartConfig: assets.length ? {
                    type: "doughnut",
                    data: {
                        labels: Object.keys(statusCounts),
                        datasets: [{
                            data: Object.values(statusCounts),
                            backgroundColor: ["#2e8b57", "#8a93a0", "#c24d4d", "#5e7da5"]
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
                } : null,
                fallbackHtml: assets.length
                    ? `<ul class="chart-fallback-list">${Object.entries(statusCounts).map(([label, value]) => `<li>${escapeHtml(label)}: <strong>${value}</strong></li>`).join("")}</ul>`
                    : `<p class="empty-state">Add assets to view status distribution.</p>`
            });

            renderChartWithFallback({
                containerId: "due-overview-chart",
                chartConfig: assets.length ? {
                    type: "bar",
                    data: {
                        labels: Object.keys(dueCounts),
                        datasets: [{
                            label: "Assets",
                            data: Object.values(dueCounts),
                            backgroundColor: ["#cf4f4f", "#e3a432", "#4f8dcf"]
                        }]
                    },
                    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                } : null,
                fallbackHtml: assets.length
                    ? `<ul class="chart-fallback-list">${Object.entries(dueCounts).map(([label, value]) => `<li>${escapeHtml(label)}: <strong>${value}</strong></li>`).join("")}</ul>`
                    : `<p class="empty-state">Add assets to view due-state distribution.</p>`
            });

            renderChartWithFallback({
                containerId: "service-cost-chart",
                chartConfig: hasMonthlyCosts ? {
                    type: "bar",
                    data: {
                        labels: monthLabels,
                        datasets: SUPPORTED_SERVICE_CURRENCIES
                            .filter(currency => monthlyCostsByCurrency[currency].some(cost => cost > 0))
                            .map(currency => ({
                                label: currency,
                                data: monthlyCostsByCurrency[currency],
                                backgroundColor: costDatasetColors[currency].bg,
                                borderColor: costDatasetColors[currency].border,
                                borderWidth: 1
                            }))
                    },
                    options: { responsive: true, scales: { y: { beginAtZero: true } } }
                } : null,
                fallbackHtml: hasMonthlyCosts
                    ? `<ul class="chart-fallback-list">${monthLabels.map((label, idx) => {
                        const monthCosts = SUPPORTED_SERVICE_CURRENCIES
                            .filter(currency => monthlyCostsByCurrency[currency][idx] > 0)
                            .map(currency => `${currency}: <strong>${escapeHtml(formatCurrency(monthlyCostsByCurrency[currency][idx], currency))}</strong>`)
                            .join(" | ");
                        return `<li>${escapeHtml(label)}: ${monthCosts || "—"}</li>`;
                    }).join("")}</ul>`
                    : `<p class="empty-state">Service cost trend data appears once service costs are recorded.</p>`
            });

            renderServiceCostInsights(assets);
        }
        function renderPredictiveMaintenance() {
            const assets = getStoredAssets();
            const today = new Date();
            const soonAssets = assets
                .map(a => {
                    const history = (a.history || []).filter(ev => isServiceEvent(ev));
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
                serviceCurrency: raw.serviceCurrency || "",
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
        function renderAssetsModal(filter = activeAssetFilter, searchQuery = activeAssetSearchQuery) {
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
            activeAssetSearchQuery = String(searchQuery || "").trim();
            renderDashboardQuickFilters();
            const assets = getStoredAssets();
            const validAssetIds = new Set(assets.map(asset => asset.id));
            selectedAssetIds = new Set([...selectedAssetIds].filter(assetId => validAssetIds.has(assetId)));
            const filteredAssets = assets
                .map((asset, index) => ({ asset, index }))
                .filter(({ asset }) => matchesAssetFilter(asset, activeAssetFilter))
                .filter(({ asset }) => assetMatchesQuery(asset, activeAssetSearchQuery));

            // Sort filtered assets
            filteredAssets.sort((a, b) => {
                switch (activeAssetSort) {
                    case "next-service": {
                        const da = a.asset.nextServiceDate ? new Date(a.asset.nextServiceDate).getTime() : Infinity;
                        const db = b.asset.nextServiceDate ? new Date(b.asset.nextServiceDate).getTime() : Infinity;
                        return da - db;
                    }
                    case "latest-cost": {
                        const ca = getLatestServiceCost(a.asset);
                        const cb = getLatestServiceCost(b.asset);
                        const av = ca ? ca.amount : -1;
                        const bv = cb ? cb.amount : -1;
                        return bv - av;
                    }
                    case "name":
                    default:
                        return String(a.asset.name || "").localeCompare(String(b.asset.name || ""));
                }
            });

            const tableHeaderHtml = ASSETS_MODAL_COLUMNS.map(column => `<th>${column}</th>`).join("");

            const tableRows = filteredAssets.length
                ? filteredAssets.map(({ asset, index }) => {
                    const latestServiceCost = getLatestServiceCost(asset);
                    const latestServiceCostText = latestServiceCost
                        ? formatCurrency(latestServiceCost.amount, latestServiceCost.currency)
                        : "—";
                    return `
                        <tr>
                            <td><input type="checkbox" data-select-asset="${escapeHtml(asset.id)}"${selectedAssetIds.has(asset.id) ? " checked" : ""}></td>
                            <td>${highlightSearchMatch(asset.name || "—", activeAssetSearchQuery)}</td>
                            <td>${highlightSearchMatch(asset.type || "—", activeAssetSearchQuery)}</td>
                            <td>${renderStatusBadge(asset.status || "—")}</td>
                            <td>${renderHealthIndicator(asset)}</td>
                            <td>${highlightSearchMatch(latestServiceCostText, activeAssetSearchQuery)}</td>
                            <td>${highlightSearchMatch(asset.vin || "—", activeAssetSearchQuery)}</td>
                            <td>${highlightSearchMatch(asset.year || "—", activeAssetSearchQuery)}</td>
                            <td>${highlightSearchMatch(asset.color || "—", activeAssetSearchQuery)}</td>
                            <td>${escapeHtml(formatDisplayDate(asset.created || asset.lastServiceDate))}</td>
                            <td>
                                <button type="button" data-edit-asset="${escapeHtml(asset.id)}">Edit</button>
                                <button type="button" data-delete-asset="${escapeHtml(asset.id)}" style="margin-left:0.5em;">Delete</button>
                            </td>
                        </tr>`;
                }).join("")
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
                        <div class="asset-live-search-row">
                            <input type="search" id="asset-live-search" placeholder="Live search assets..." value="${escapeHtml(activeAssetSearchQuery)}">
                            <button type="button" id="asset-search-clear">Clear</button>
                        </div>
                        <div class="asset-sort-row">
                            <label for="asset-sort-select">Sort:</label>
                            <select id="asset-sort-select">
                                <option value="name"${activeAssetSort === "name" ? " selected" : ""}>Name (A–Z)</option>
                                <option value="next-service"${activeAssetSort === "next-service" ? " selected" : ""}>Next Service Date</option>
                                <option value="latest-cost"${activeAssetSort === "latest-cost" ? " selected" : ""}>Latest Cost (High→Low)</option>
                            </select>
                        </div>
                        <div class="asset-bulk-actions">
                            <label class="asset-select-all-toggle"><input type="checkbox" id="select-all-assets"> Select all visible</label>
                            <span id="selected-assets-count">${selectedAssetIds.size} selected</span>
                            <select id="bulk-status-select">
                                <option value="">Bulk status…</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="Out of Service">Out of Service</option>
                            </select>
                            <button type="button" data-bulk-action="set-status">Apply Status</button>
                            <button type="button" data-bulk-action="export-json">Export Selected</button>
                            <button type="button" data-bulk-action="clear-selection">Clear Selection</button>
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
                btn.addEventListener("click", () => openEditAssetModal(btn.getAttribute("data-edit-asset")));
            });
            modal.querySelectorAll("button[data-delete-asset]").forEach(btn => {
                btn.addEventListener("click", () => deleteAsset(btn.getAttribute("data-delete-asset")));
            });

            const liveSearchInput = modal.querySelector("#asset-live-search");
            if (liveSearchInput) {
                liveSearchInput.addEventListener("input", () => {
                    renderAssetsModal(activeAssetFilter, liveSearchInput.value);
                });
            }
            const clearSearchBtn = modal.querySelector("#asset-search-clear");
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener("click", () => renderAssetsModal(activeAssetFilter, ""));
            }

            const sortSelect = modal.querySelector("#asset-sort-select");
            if (sortSelect) {
                sortSelect.addEventListener("change", () => {
                    activeAssetSort = sortSelect.value;
                    renderAssetsModal(activeAssetFilter, activeAssetSearchQuery);
                });
            }

            const filteredAssetIds = filteredAssets.map(({ asset }) => asset.id);
            const selectedCountNode = modal.querySelector("#selected-assets-count");
            const selectAllToggle = modal.querySelector("#select-all-assets");
            const updateSelectionUi = () => {
                const selectedVisibleCount = filteredAssetIds.filter(assetId => selectedAssetIds.has(assetId)).length;
                if (selectedCountNode) selectedCountNode.textContent = `${selectedAssetIds.size} selected`;
                if (selectAllToggle) {
                    selectAllToggle.checked = filteredAssetIds.length > 0 && selectedVisibleCount === filteredAssetIds.length;
                    selectAllToggle.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < filteredAssetIds.length;
                }
            };

            if (selectAllToggle) {
                selectAllToggle.addEventListener("change", () => {
                    filteredAssetIds.forEach(assetId => {
                        if (selectAllToggle.checked) selectedAssetIds.add(assetId);
                        else selectedAssetIds.delete(assetId);
                    });
                    renderAssetsModal(activeAssetFilter, activeAssetSearchQuery);
                });
            }

            modal.querySelectorAll("input[data-select-asset]").forEach(checkbox => {
                checkbox.addEventListener("change", () => {
                    const assetId = checkbox.getAttribute("data-select-asset");
                    if (!assetId) return;
                    if (checkbox.checked) selectedAssetIds.add(assetId);
                    else selectedAssetIds.delete(assetId);
                    updateSelectionUi();
                });
            });

            modal.querySelectorAll("button[data-bulk-action]").forEach(button => {
                button.addEventListener("click", () => {
                    const action = button.getAttribute("data-bulk-action");
                    if (action === "clear-selection") {
                        selectedAssetIds.clear();
                        renderAssetsModal(activeAssetFilter, activeAssetSearchQuery);
                        return;
                    }
                    const selectedAssets = assets.filter(asset => selectedAssetIds.has(asset.id));
                    if (!selectedAssets.length) {
                        showFeedback("Select at least one asset for bulk actions.", "info");
                        return;
                    }
                    if (action === "export-json") {
                        const payload = JSON.stringify(selectedAssets, null, 2);
                        const blob = new Blob([payload], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = "selected-assets.json";
                        link.click();
                        URL.revokeObjectURL(url);
                        showFeedback(`Exported ${selectedAssets.length} assets.`, "success");
                        return;
                    }
                    if (action === "set-status") {
                        const statusSelect = modal.querySelector("#bulk-status-select");
                        const nextStatus = statusSelect ? statusSelect.value : "";
                        if (!nextStatus) {
                            showFeedback("Choose a status before applying the bulk update.", "error");
                            return;
                        }
                        const updatedAt = new Date().toISOString();
                        const updatedAssets = assets.map(asset => {
                            if (!selectedAssetIds.has(asset.id)) return asset;
                            const history = Array.isArray(asset.history) ? [...asset.history] : [];
                            history.push({
                                date: updatedAt,
                                operation: "Updated",
                                label: "Status",
                                note: `Bulk status update to ${nextStatus}`
                            });
                            return normalizeAsset({ ...asset, status: nextStatus, history });
                        });
                        saveStoredAssets(updatedAssets);
                        refreshAssetDependentViews();
                        showFeedback(`Updated status for ${selectedAssets.length} assets.`, "success");
                        renderAssetsModal(activeAssetFilter, activeAssetSearchQuery);
                    }
                });
            });
            updateSelectionUi();
        }

        function openEditAssetModal(assetId) {
            const assets = getStoredAssets();
            const asset = assets.find(a => a.id === assetId);
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
                const updatedAt = new Date().toISOString();
                const updatedHistory = Array.isArray(asset.history) ? [...asset.history] : [];
                updatedHistory.push({
                    date: updatedAt,
                    operation: "Updated",
                    label: "Info",
                    note: "Asset details updated"
                });
                const idx = assets.findIndex(a => a.id === assetId);
                if (idx === -1) {
                    showFeedback("Asset no longer exists.", "error");
                    editModal.remove();
                    return;
                }
                assets[idx] = {
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
                    history: updatedHistory
                };

                saveStoredAssets(assets);
                refreshAssetDependentViews();
                renderAssetsModal();
                if (isAssetShownInDetailsModal(originalAsset)) {
                    showAssetDetailsAndHistory(assets[idx]);
                }
                editModal.remove();
                showFeedback("Asset updated successfully.", "success");
            });
        }

        function deleteAsset(assetId) {
            const assets = getStoredAssets();
            const asset = assets.find(a => a.id === assetId);
            if (!asset) {
                renderAssetsModal();
                return;
            }

            const assetLabel = asset.name || asset.id || "asset";
            if (!window.confirm(`Delete "${assetLabel}"? This action cannot be undone.`)) {
                return;
            }

            const shouldCloseDetails = isAssetShownInDetailsModal(asset);
            selectedAssetIds.delete(asset.id);
            const idx = assets.findIndex(a => a.id === assetId);
            if (idx !== -1) assets.splice(idx, 1);
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
            let globalSearchDebounce = null;
            const runAssetSearch = ({ query, triggerSource = "button" }) => {
                const normalizedQuery = String(query || "").trim();
                if (!normalizedQuery) {
                    if (triggerSource === "button") showFeedback("Please enter a search term.", "error");
                    return;
                }
                const assets = getStoredAssets();
                const matched = assets.filter(asset => assetMatchesQuery(asset, normalizedQuery));
                if (matched.length === 0) {
                    if (triggerSource === "button") showFeedback("No matching assets found.", "info");
                    return;
                }

                if (triggerSource === "button" && matched.length === 1) {
                    showAssetDetailsAndHistory(matched[0]);
                    return;
                }

                activeAssetFilter = "all";
                renderAssetsModal("all", normalizedQuery);
                if (triggerSource === "button") {
                    showFeedback(`Showing ${matched.length} matching asset${matched.length === 1 ? "" : "s"}.`, "success");
                }
            };

            globalSearchBtn.addEventListener("click", () => {
                runAssetSearch({ query: globalSearchBar.value, triggerSource: "button" });
            });

            globalSearchBar.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    globalSearchBtn.click();
                }
            });

            globalSearchBar.addEventListener("input", () => {
                if (globalSearchDebounce) clearTimeout(globalSearchDebounce);
                const query = globalSearchBar.value;
                globalSearchDebounce = setTimeout(() => {
                    if (String(query || "").trim().length < 2) return;
                    runAssetSearch({ query, triggerSource: "live" });
                }, 180);
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

            const getHistoryEventVisual = (operation) => {
                const normalizedOperation = String(operation || "").toLowerCase();
                if (normalizedOperation.includes("created")) return { icon: "🆕", badgeClass: "history-badge-created" };
                if (normalizedOperation.includes("updated") || normalizedOperation.includes("edit")) return { icon: "✏️", badgeClass: "history-badge-updated" };
                if (normalizedOperation.includes("maintenance")) return { icon: "🔧", badgeClass: "history-badge-maintenance" };
                if (normalizedOperation.includes("repair")) return { icon: "🛠️", badgeClass: "history-badge-repair" };
                if (normalizedOperation.includes("service") || normalizedOperation.includes("parts")) return { icon: "🧰", badgeClass: "history-badge-service" };
                return { icon: "📌", badgeClass: "history-badge-generic" };
            };

            const sortedHistory = (asset.history || [])
                .map((event, index) => ({ event, index }))
                .sort((left, right) => new Date(right.event.date) - new Date(left.event.date));
            let previousTimelineGroup = "";
            const historyTimelineHtml = sortedHistory.length
                ? sortedHistory.map(({ event, index }) => {
                    const eventDate = new Date(event.date);
                    const timelineGroup = !isNaN(eventDate.getTime())
                        ? eventDate.toLocaleString(undefined, { month: "long", year: "numeric" })
                        : "Undated";
                    const showGroupHeader = timelineGroup !== previousTimelineGroup;
                    previousTimelineGroup = timelineGroup;
                    const visual = getHistoryEventVisual(event.operation || event.type);
                    const operationText = String(event.operation || event.type || "Event").trim();
                    const serviceCostEntry = getServiceCostEntry(event, asset);
                    const af = event.attachedFile;
                    const attachmentBadgeHtml = af && af.data
                        ? `<a class="history-attachment-badge" href="${af.data}" download="${escapeHtml(af.name || "Attachment")}" title="Download ${escapeHtml(af.name || "Attachment")}">📎 ${escapeHtml(af.name || "Attachment")}</a>`
                        : "";
                    return `
                        ${showGroupHeader ? `<li class="history-group-label">${escapeHtml(timelineGroup)}</li>` : ""}
                        <li class="history-timeline-item">
                            <div class="history-timeline-dot" aria-hidden="true">${visual.icon}</div>
                            <div class="history-timeline-content">
                                <div class="history-timeline-main">
                                    <span class="history-operation-badge ${visual.badgeClass}">${escapeHtml(operationText || "Event")}</span>
                                    ${event.label ? `<span class="history-label-pill">${escapeHtml(event.label)}</span>` : ""}
                                    ${serviceCostEntry ? `<span class="history-cost-pill">${escapeHtml(formatCurrency(serviceCostEntry.amount, serviceCostEntry.currency))}</span>` : ""}
                                    ${attachmentBadgeHtml}
                                </div>
                                <div class="history-timeline-note">${escapeHtml(event.note || "No additional note provided.")}</div>
                                <div class="history-timeline-meta">
                                    <span>${escapeHtml(formatDisplayDate(event.date, "Unknown date"))}</span>
                                    <button type="button" data-edit="${index}">Edit</button>
                                </div>
                            </div>
                        </li>
                    `;
                }).join("")
                : `<li class="empty-state">No history events recorded yet.</li>`;

            // Service status info for emphasis
            const statusInfo = getAssetStatusInfo(asset);
            const nextServiceCardClass = statusInfo.isOverdue ? "sdc-overdue" : statusInfo.isDueSoon ? "sdc-due-soon" : "";
            const nextServiceTag = statusInfo.isOverdue
                ? `<span class="service-date-tag sdt-overdue">Overdue</span>`
                : statusInfo.isDueSoon
                    ? `<span class="service-date-tag sdt-due-soon">Due Soon</span>`
                    : "";
            const latestServiceCost = getLatestServiceCost(asset);

            // Modal innerHTML
            modal.innerHTML = `
        <div class="asset-detail-modal-inner">
            <button id="close-history-modal" class="asset-detail-close" title="Close">&times;</button>

            <!-- Header: name + badges -->
            <div class="asset-detail-header">
                <h2 class="asset-detail-name">${escapeHtml(asset.name || "—")}</h2>
                <div class="asset-detail-badges">
                    ${renderStatusBadge(asset.status || "Active")}
                    ${renderHealthIndicator(asset)}
                </div>
            </div>

            <!-- Service Status -->
            <div class="asset-detail-section">
                <h4 class="asset-detail-section-title">Service Status</h4>
                <div class="asset-service-status">
                    <div class="service-date-card">
                        <span class="service-date-label">Last Service</span>
                        <span class="service-date-value">${escapeHtml(formatDisplayDate(asset.lastServiceDate))}</span>
                    </div>
                    <div class="service-date-card ${nextServiceCardClass}">
                        <span class="service-date-label">Next Service</span>
                        <span class="service-date-value">${escapeHtml(formatDisplayDate(asset.nextServiceDate))}</span>
                        ${nextServiceTag}
                    </div>
                </div>
            </div>

            <!-- Overview: metadata fields -->
            <div class="asset-detail-section">
                <h4 class="asset-detail-section-title">Overview</h4>
                <div class="asset-detail-grid">
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Type</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.type || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">VIN</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.vin || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Year</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.year || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Color</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.color || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Technician</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.technician || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Location</span>
                        <span class="asset-detail-field-value">${escapeHtml(asset.location || "—")}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Latest Service Cost</span>
                        <span class="asset-detail-field-value">${latestServiceCost ? escapeHtml(formatCurrency(latestServiceCost.amount, latestServiceCost.currency)) : "—"}</span>
                    </div>
                    <div class="asset-detail-field">
                        <span class="asset-detail-field-label">Added</span>
                        <span class="asset-detail-field-value">${escapeHtml(formatDisplayDate(asset.created || asset.lastServiceDate))}</span>
                    </div>
                </div>
            </div>

            <!-- Service History timeline -->
            <div class="asset-detail-section">
                <h3>Service History Timeline</h3>
                <div class="asset-history-timeline-wrap">
                    <ul class="asset-history-timeline">
                        ${historyTimelineHtml}
                    </ul>
                </div>
            </div>

            <!-- Add History Event form -->
            <div class="asset-detail-section">
                <h4>Add History Event</h4>
                <form id="add-history-form" class="asset-detail-add-form">
                    <div class="form-row">
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
                    <div class="form-row">
                        <label>Label:
                            <select id="history-label" required>
                                <option value="Mechanical">Mechanical</option>
                                <option value="Electrical">Electrical</option>
                                <option value="Other">Other</option>
                            </select>
                        </label>
                    </div>
                    <div class="form-row">
                        <label>Note:
                            <input type="text" id="history-note" required style="width:100%;">
                        </label>
                    </div>
                    <div class="form-row">
                        <span style="font-size:0.88rem;font-weight:500;">Service Cost:</span>
                        <div class="cost-input-group">
                            <div class="cost-amount-wrap">
                                <span class="cost-sub-label">Amount</span>
                                <input type="number" id="history-service-cost" min="0" step="0.01" placeholder="e.g. 100.00">
                            </div>
                            <div class="cost-currency-wrap">
                                <span class="cost-sub-label">Currency</span>
                                <select id="history-service-currency">
                                    ${getServiceCurrencyOptionsHtml()}
                                </select>
                            </div>
                        </div>
                        <span class="cost-helper-text">No automatic currency conversion is performed.</span>
                    </div>
                    <div class="asset-detail-form-actions">
                        <button type="submit">Add Event</button>
                        <button type="button" id="export-service-history-pdf">Export Service History PDF</button>
                    </div>
                </form>
            </div>
        </div>
        `;

            document.body.appendChild(modal);

            // PDF EXPORT BUTTON
            const exportBtn = modal.querySelector("#export-service-history-pdf");
            if (exportBtn) {
                exportBtn.onclick = () => {
                    exportServiceHistoryPdf([asset], {
                        fileName: `${(asset?.name || "asset").replace(/\s+/g, "_")}_Service_History.pdf`,
                    });
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
                const serviceCost = parseCostValue(modal.querySelector("#history-service-cost").value);
                const serviceCurrency = normalizeServiceCurrency(modal.querySelector("#history-service-currency").value);
                const assets = getStoredAssets();
                const idx = findAssetIndex(asset, assets);
                if (idx !== -1) {
                    assets[idx].history = assets[idx].history || [];
                    assets[idx].history.push({
                        date: new Date().toISOString(),
                        operation,
                        label,
                        note,
                        serviceCost: serviceCost > 0 ? serviceCost : "",
                        serviceCurrency: serviceCost > 0 ? serviceCurrency : ""
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
                        <div style="margin-bottom:0.8em;">
                            <span style="font-size:0.92em;font-weight:500;display:block;margin-bottom:0.35em;">Service Cost:</span>
                            <div class="edit-cost-group">
                                <div class="edit-cost-amount">
                                    <label class="edit-cost-sub-label" for="edit-service-cost">Amount</label>
                                    <input type="number" id="edit-service-cost" value="${parseCostValue(h.serviceCost) > 0 ? parseCostValue(h.serviceCost) : ""}" min="0" step="0.01">
                                </div>
                                <div class="edit-cost-currency">
                                    <label class="edit-cost-sub-label" for="edit-service-currency">Currency</label>
                                    <select id="edit-service-currency">
                                        ${getServiceCurrencyOptionsHtml(h.serviceCurrency || asset.serviceCurrency)}
                                    </select>
                                </div>
                            </div>
                            <span class="edit-cost-helper">No automatic currency conversion is performed.</span>
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
                    const serviceCost = parseCostValue(editModal.querySelector("#edit-service-cost").value);
                    const serviceCurrency = normalizeServiceCurrency(editModal.querySelector("#edit-service-currency").value);
                    const assets = getStoredAssets();
                    const idx = findAssetIndex(asset, assets);
                    if (idx !== -1 && assets[idx].history && assets[idx].history[hidx]) {
                        assets[idx].history[hidx].operation = operation;
                        assets[idx].history[hidx].label = label;
                        assets[idx].history[hidx].note = note;
                        assets[idx].history[hidx].serviceCost = serviceCost > 0 ? serviceCost : "";
                        assets[idx].history[hidx].serviceCurrency = serviceCost > 0 ? serviceCurrency : "";
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
          .money-input-group {
            display: flex;
            gap: 0.75em;
            align-items: flex-end;
            flex-wrap: wrap;
            margin-top: 0.3em;
          }
          .money-amount { flex: 1 1 120px; min-width: 100px; }
          .money-currency { flex: 0 0 auto; }
          .money-amount label, .money-currency label {
            display: block;
            font-size: 0.82em;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 3px;
          }
          .money-amount input, .money-currency select {
            width: 100%;
            padding: 0.35em 0.5em;
            border: 1px solid #bbb;
            border-radius: 4px;
            font-size: 0.97em;
          }
          .money-currency select { min-width: 80px; width: 80px; }
          .money-helper {
            font-size: 0.78em;
            color: #777;
            margin: 0.3em 0 0;
            font-style: italic;
          }
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
          <div class="form-section">
            <div class="money-input-group">
              <div class="money-amount">
                <label for="service-cost">Service Cost Amount</label>
                <input type="number" id="service-cost" min="0" step="0.01" placeholder="e.g. 100.00">
              </div>
              <div class="money-currency">
                <label for="service-currency">Currency</label>
                <select id="service-currency">
                  ${getServiceCurrencyOptionsHtml(getPreferredServiceCurrency())}
                </select>
              </div>
            </div>
            <p class="money-helper">No automatic currency conversion is performed.</p>
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
              serviceCurrency: raw.serviceCurrency || '',
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
            var serviceCurrency = document.getElementById('service-currency').value;
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
                serviceCurrency,
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
                  serviceCurrency: serviceCurrency,
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
                  serviceCurrency: serviceCurrency,
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

    });