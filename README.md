# surge-config-merger
When you have multi proxy servers which provide surge managed configuration. You can use this tool to merge your configurations.

# How
1. `npm i`
2. rename `config.js.example` to `config.js` and change content to your configurations.
3. `node app.js`
4. enter the URL `http://server/port/?u=BASE64(YOURNAME)`

# Feature
1. Custom ProxyName Filter
2. Drop Proxy If Managed Config not work.
3. Replace the placeholder to fix your policy
