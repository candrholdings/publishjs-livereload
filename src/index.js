!function (fs, linq, path) {
    'use strict';

    var LOG_FACILITY = 'livereload',
        livereloadJSPath = path.resolve(require.resolve('livereload-js'), '../../dist/livereload.js');

    function LiveReloadServer(options) {
        this._options = options || {};
    }

    LiveReloadServer.prototype.init = function (publishjs) {
        var that = this,
            connections = that._connections = {},
            LRWebSocketServer = require('livereload-server'),
            server = new LRWebSocketServer({ id: 'com.candrholdings.publishjs', name: 'PublishJS', version: '1.0', protocols: { monitoring: 7, saving: 1 }});

        that._publishjs = publishjs;

        server.on('connected', function (connection) {
            var supportMonitoring = linq(connection.parser.negotiatedProtocolDefinitions).any(function (def) { return def.version === 7; }).run();

            if (supportMonitoring) {
                connections[connection.id] = connection;
            }
        }).on('disconnected', function (connection) {
            delete connections[connection.id];
        // }).on('command', function (connection, message) {
        //     console.log(message);
        }).on('error', function (err, connection) {
            publishjs.log(LOG_FACILITY, 'Failed to communicate with browser "' + connection.id + '" due to "' + err + '"');
            delete connections[connection.id];
        }).on('livereload.js', function (req, res) {
            fs.readFile(livereloadJSPath, function (err, data) {
                if (err) {
                    publishjs.log(LOG_FACILITY, 'Failed to read "livereload.js" due to "' + err + '"');
                    res.writeHead(500);
                    res.end();
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/javascript' });
                    res.end(data);
                }
            });
        }).on('httprequest', function (req, res) {
            res.writeHead(404).end();
        }).listen(function (err) {
            err && publishjs.log(LOG_FACILITY, 'Server failed to start due to "' + err + '"');
        });
    }

    LiveReloadServer.prototype.reload = function (urls) {
        var that = this;

        if (typeof urls === 'string') {
            urls = [urls];
        } else if (!urls.length) {
            return;
        }

        var connections = that._connections;

        connections = Object.getOwnPropertyNames(connections).map(function (id) { return connections[id]; });

        if (!connections.length) {
            return;
        }

        that._publishjs.log(LOG_FACILITY, [
            'Pushed ',
            urls.length,
            ' change(s) to ',
            connections.length,
            ' client(s)'
        ].join(''));

        connections.forEach(function (connection) {
            urls.forEach(function (url) {
                connection.send({
                    command: 'reload',
                    path: '/' + url,
                    liveCSS: true
                });
            });
        });
    };

    module.exports = function (options) {
        var livereload = new LiveReloadServer(options || {});

        return {
            _livereload: livereload,
            onmix: function () {
                livereload.init(this);
            },
            onbuild: function (outputs) {
                if (!this.options.watch) {
                    this.log(LOG_FACILITY, 'Warning, LiveReload enabled but not watching for updates');
                }

                Object.getOwnPropertyNames(outputs.newOrChanged).forEach(function (output) {
                    livereload.reload.call(livereload, output);
                });
            }
        };
    };
}(require('fs'), require('async-linq'), require('path'));