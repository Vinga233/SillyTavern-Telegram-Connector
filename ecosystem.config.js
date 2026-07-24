module.exports = {
    apps: [{
        name: "tg-connector",
        script: "server.js",
        cwd: "D:\\AI\\SillyTavern-Telegram-Connector\\server",
        watch: false,
        log_date_format: "YYYY-MM-DD HH:mm:ss",
        error_file: "~/.pm2/logs/tg-connector-error.log",
        out_file: "~/.pm2/logs/tg-connector-out.log",
        env: {
            NODE_ENV: "production"
        }
    }]
};
