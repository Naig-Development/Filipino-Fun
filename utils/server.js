//Express Server
const config = require("../config.js");
const express = require("express");
const compression = require('compression');
const path = require("path");
const app = express();
const logger = require("../utils/logger");

const port = config.port;

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use("/", express.static(path.join(__dirname, "../website")));

// Start the server
app.listen(port, () => {
  logger.debug(`Server is running at http://localhost:${port}`);
});
