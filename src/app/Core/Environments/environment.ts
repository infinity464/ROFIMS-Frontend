export const environment = {
    production: false,
    apis: {
        core: 'https://localhost:7187/rab/api',
        //core: 'http://114.134.95.234:31999/rab/api',
        auth: 'https://localhost:7187'
        //auth: 'http://114.134.95.234:31999'
    },
    // JsReport CE server. Dev: local Node process on :5488.
    // Prod: '/jsreport-api' (IIS reverse-proxies to localhost:5488 → same-origin).
    jsreportUrl: 'http://localhost:5488'
};

// export const environment = {
//     production: true,
//     apis: {
//         core: 'http://114.134.95.238:9900/rab/api',
//         auth: 'http://114.134.95.238:9900',
//     },
//     // Relative path → same origin as the site; IIS reverse-proxies /jsreport-api
//     // to the jsReport Node process on localhost:5488 (see public/web.config).
//     jsreportUrl: '/jsreport-api'
// };
