# Life Mirror

A phone-first web app for one person: three short check-ins a day, one reading out of 100, one small move, and a record that learns only from what actually happened. Everything stays on the phone.

Live: https://bill6006.github.io/life-mirror/

Built in numbered phases. The live build's About screen names the commit and links to the pipeline run that tested it; one job tests, builds and deploys a single folder.

How the app checks, by itself, whether its adjusted forecasts beat the plain ones, and switches the adjustment off if
they do not: [docs/forecast-check.md](docs/forecast-check.md).

The week ahead's level-plus-weekday way, built and switched off: what it is, its numbers, what it stores and how it is
switched: [docs/week-ahead-weekdays.md](docs/week-ahead-weekdays.md).

The week ahead from what is known about each day (Stage C), built and switched off: [docs/week-ahead-known.md](docs/week-ahead-known.md).

    npm run dev        # local
    npm test           # unit tests
    npm run build      # dist/
    npm run e2e        # phone smoke test against dist/
