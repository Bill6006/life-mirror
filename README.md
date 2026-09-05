# Life Mirror

A phone-first web app for one person: three short check-ins a day, one reading out of 100, one small move, and a record that learns only from what actually happened. Everything stays on the phone.

Live: https://bill6006.github.io/life-mirror/

Built in numbered phases. The live build's About screen names the commit and links to the pipeline run that tested it; one job tests, builds and deploys a single folder.

    npm run dev        # local
    npm test           # unit tests
    npm run build      # dist/
    npm run e2e        # phone smoke test against dist/
