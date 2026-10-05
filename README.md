# Service History

Service History is a static browser application for keeping asset details, maintenance records, and document expiry dates together. It is an MVP intended for personal or local use, not a multi-user service.

## Features

- Create, edit, delete, search, filter, and bulk-update assets
- Record and edit service history, including costs and currencies
- Track service reminders with configurable due-soon, look-ahead, and snooze periods
- Dismiss or snooze individual reminders
- Track expiry dates for vehicle documents
- View dashboard statistics, recent activity, service trends, cost summaries, and a basic predictive-maintenance estimate
- Add comments and team-role labels in the current browser
- Choose themes, language, display name, and other local preferences
- Import and export asset data as JSON; export CSV and PDF reports

JSON imports are merged with the current assets rather than replacing them. Assets identified as duplicates are skipped, and existing records are kept unchanged. Export a JSON backup before making bulk changes or moving data.

## Run locally

1. Clone the repository.
2. Open `index.html` in a modern browser, or serve the project with an editor extension such as VS Code Live Server.

No build step or package installation is required. PDF export relies on the jsPDF scripts included by the page.

## Data, privacy, and limitations

- Assets, preferences, comments, team-role labels, and reminder actions are stored in the browser's `localStorage`. They are not shared between browsers or devices.
- Clearing site data or changing browser profiles can remove the data. Export JSON backups regularly; CSV and PDF exports are reports, not complete backups.
- There is no backend, account system, authentication, authorization, or multi-user synchronization. Team roles are labels only and do not restrict access.
- Notification preferences control which reminders appear in the app; there are no push, email, or background notifications.
- Predictive maintenance currently uses a simple estimate of 180 days after the latest recorded service event. It is not a forecast based on usage or component condition.
- Dropbox upload is a placeholder and is not available. No external service credentials or integrations are configured.
- Currency totals are grouped by currency. The app does not perform currency conversion.

Because this is a static client-side app, do not treat locally stored information as protected or as a substitute for a backed-up system of record.

## Technology and layout

- HTML, CSS, and browser JavaScript
- `localStorage` for local persistence
- jsPDF and jsPDF-AutoTable for PDF export

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
└── images/
    └── logo.PNG
```

## Roadmap

Potential future work includes a modular JavaScript structure, automated regression coverage, improved accessibility and responsive behavior, and optional backend storage with properly designed authentication and synchronization. External integrations such as Dropbox require a chosen provider, secure credential handling, and service configuration before implementation.

Repository: <https://github.com/Vols40/Service-history>
