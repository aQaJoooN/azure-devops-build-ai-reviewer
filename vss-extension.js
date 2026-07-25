const manifest = require("./vss-extension.json");
const { version } = require("./package.json");

module.exports = () => ({ ...manifest, version });
