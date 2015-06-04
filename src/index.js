!function (fs, linq, path) {
    'use strict';

    var livereloadJSPath = path.resolve(require.resolve('livereload-js'), '../../dist/livereload.js');

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
            publishjs.log('Failed to communicate with LiveReload client "' + connection.id + '" due to "' + err + '"');
            delete connections[connection.id];
        }).on('livereload.js', function (req, res) {
            fs.readFile(livereloadJSPath, function (err, data) {
                if (err) {
                    publishjs.log('Failed to read "livereload/livereload.js" due to "' + err + '"');
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
            err && publishjs.log('LiveReload server failed to start due to "' + err + '"');
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

        if (connections.length) {
            that._publishjs.log([
                'Pushing ',
                urls.length,
                ' change',
                urls.length === 1 ? '' : 's',
                ' to ',
                connections.length,
                ' LiveReload client(s)'
            ].join(''));
        } else {
            return that._publishjs.log('No LiveReload clients were connected');
        }

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
            onmix: function (publishjs) {
                livereload.init(publishjs);
            },
            onbuild: function (outputs) {
                Object.getOwnPropertyNames(outputs.newOrChanged).forEach(function (output) {
                    livereload.reload.call(livereload, output);
                });
            }
        };
    };
}(require('fs'), require('async-linq'), require('path'));