(function() {
  var EventEmitter, Nick, NickServError, cmds, notices, queue, test;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  test = require('./regex.js');

  notices = require('./notices.js');

  NickServError = require('./NickServError.js');

  queue = require('./queue.js');

  cmds = require('./cmds.js');

  Nick = (function() {

    __extends(Nick, EventEmitter);

    function Nick(irc, options) {
      var blob, checkError, checkSuccess, cmd, cmdState, dcb, identified, listen, nickserv, orignick, queues, registered;
      var _this = this;
      this.options = options != null ? options : {};
      listen = function(notice) {
        return irc.on('notice', function(nick, to, text) {
          if (nick === 'NickServ') return notice(text);
        });
      };
      this.send = function(cmd) {
        var args;
        args = Array.prototype.slice.call(arguments).join(' ');
        _this.emit('send', args);
        return irc.say('NickServ', args);
      };
      blob = '';
      listen(function(text) {
        blob += text + '\n';
        _this.emit('notice', text);
        return _this.emit('blob', blob);
      });
      registered = identified = false;
      orignick = irc.nick;
      irc.on('registered', function() {
        return registered = identified = false;
      });
      irc.on('nick', function(oldnick, newnick) {
        if (oldnick === orignick) {
          orignick = newnick;
          return registered = identified = false;
        }
      });
      this.on('isregistered', function(result, nick) {
        if (nick === irc.nick) return registered = result;
      });
      this.on('identified', function() {
        return identified = registered = true;
      });
      this.on('loggedout', function() {
        return identified = false;
      });
      this.on('registered', function() {
        return identified = registered = true;
      });
      this.on('dropped', function(nick) {
        if (nick === irc.nick) return identified = registered = false;
      });
      irc.isConnected = function() {
        var _ref;
        return (_ref = irc.conn) != null ? _ref.connected : void 0;
      };
      cmdState = {};
      for (cmd in cmds) {
        cmdState[cmd] = 0;
      }
      dcb = function(err) {
        return _this.emit('error', err);
      };
      checkError = function(task, text, wait, cb) {
        var error, m, name, result, _i, _len, _ref, _ref2;
        cmd = task.cmd;
        _ref = notices[cmd].error;
        for (name in _ref) {
          error = _ref[name];
          if (error.match) {
            _ref2 = error.match;
            for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
              m = _ref2[_i];
              result = m.exec(text);
              if (result) {
                _this.removeListener('blob', wait);
                blob = '';
                if (name === 'unknownCommand' && cmdState[cmd] !== (cmds[cmd].length - 1)) {
                  cmdState[cmd]++;
                  _this.nickserv(cmd, task.args, task.cb, task.args2);
                } else {
                  new NickServError(cb, name, notices[cmd], task.args2, result);
                }
                return true;
              }
            }
          }
        }
        return false;
      };
      checkSuccess = function(cmd, text, wait, cb) {
        var m, result, _i, _len, _ref;
        _ref = notices[cmd].success;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          m = _ref[_i];
          result = m.exec(text);
          if (result) {
            _this.removeListener('blob', wait);
            blob = '';
            return cb(null, result);
          }
        }
        return false;
      };
      queues = {};
      nickserv = function(cmd, args, cb, args2) {
        var _ref;
        if ((_ref = queues[cmd]) == null) {
          queues[cmd] = queue(function(task, callback) {
            var newcb, wait;
            newcb = function() {
              task.cb.apply(null, arguments);
              return callback();
            };
            wait = function(text) {
              if (!checkError(task, text, wait, newcb)) {
                return checkSuccess(task.cmd, text, wait, newcb);
              }
            };
            return _this.on('blob', wait);
          }, 1);
        }
        queues[cmd].push({
          cmd: cmd,
          args: args,
          cb: cb,
          args2: args2
        });
        return _this.send.apply(_this, [cmds[cmd][cmdState[cmd]]].concat(args));
      };
      this.ready = function(cb, options) {
        var connected;
        var _this = this;
        if (cb == null) cb = dcb;
        if (options == null) options = this.options;
        connected = function() {
          if (options.password) {
            return _this.isRegistered(irc.nick, function(err, registered) {
              if (registered) {
                return _this.identify(options.password, cb);
              } else {
                if (options.email) {
                  return _this.register(options.password, options.email, cb);
                } else {
                  return new NickServError(cb, 'notRegistered', notices.isRegistered, [irc.nick]);
                }
              }
            });
          } else {
            return cb();
          }
        };
        if (irc.isConnected()) {
          return connected();
        } else {
          return irc.connect(connected);
        }
      };
      this.isIdentified = function() {
        return identified;
      };
      this.isRegistered = function(nick, cb) {
        var _this = this;
        if (cb == null) cb = dcb;
        this.emit('checkingregistered');
        if (!(nick != null)) return registered;
        if (test.nick(nick)) {
          return new NickServError(cb, 'invalidNick', notices.isRegistered, [nick]);
        }
        return this.info(nick, function(err) {
          registered = (err != null ? err.type : void 0) !== 'notRegistered';
          _this.emit('isregistered', registered, nick);
          return cb(null, registered);
        });
      };
      this.info = function(nick, cb) {
        var newcb;
        var _this = this;
        if (nick == null) nick = irc.nick;
        if (cb == null) cb = dcb;
        this.emit('gettinginfo');
        if (test.nick(nick)) {
          return new NickServError(cb, 'invalidNick', notices.info, [nick]);
        }
        newcb = function(err, result) {
          var info;
          if (err) return cb(err);
          info = {
            nick: result[1],
            realname: result[2]
          };
          if (result[4]) {
            info.online = result[4] === 'online' ? true : false;
          } else if (result[6]) {
            info.online = true;
            info.host = result[6];
          }
          info.registered = result[7];
          if (result[9]) info.lastseen = result[9];
          if (result[11]) info.lastquitmsg = result[11];
          if (result[13]) info.email = result[13];
          if (result[14]) info.options = result[14].split(', ');
          _this.emit('info', info);
          return cb(null, info);
        };
        return nickserv('info', [nick, 'all'], newcb, [nick]);
      };
      this.identify = function(password, cb) {
        var newcb;
        var _this = this;
        if (password == null) password = this.options.password;
        if (cb == null) cb = dcb;
        this.emit('identifying');
        if (this.isIdentified()) {
          return new NickServError(cb, 'alreadyIdentified', notices.identify);
        }
        if (test.password(password)) {
          return new NickServError(cb, 'invalidPassword', notices.identify, [password]);
        }
        newcb = function(err) {
          if (err) return cb(err);
          _this.emit('identified');
          return cb();
        };
        return nickserv('identify', [password], newcb, [irc.nick]);
      };
      this.logout = function(cb) {
        var newcb;
        var _this = this;
        if (cb == null) cb = dcb;
        this.emit('loggingout');
        if (!this.isIdentified()) {
          return new NickServError(cb, 'notIdentified', notices.logout);
        }
        newcb = function() {
          _this.emit('loggedout');
          return cb();
        };
        return nickserv('logout', [], newcb);
      };
      this.register = function(password, email, cb) {
        var newcb;
        var _this = this;
        if (password == null) password = this.options.password;
        if (email == null) email = this.options.email;
        if (cb == null) cb = dcb;
        this.emit('registering');
        if (this.isIdentified()) {
          return new NickServError(cb, 'alreadyIdentified', notices.register);
        }
        if (this.isRegistered()) {
          return new NickServError(cb, 'alreadyRegistered', notices.register);
        }
        if (test.password(password)) {
          return new NickServError(cb, 'invalidPassword', notices.register, [password]);
        }
        if (test.email(email)) {
          return new NickServError(cb, 'invalidEmail', notices.register, [email]);
        }
        newcb = function(err) {
          var time;
          if (err) {
            if (err.type === 'tooSoon') {
              time = parseInt(err.match[1]);
              setTimeout(function() {
                return _this.register(password, email, cb);
              }, time * 1000);
            } else {
              if (err) cb(err);
            }
            return;
          }
          _this.emit('registered');
          return cb();
        };
        return nickserv('register', [password, email], newcb, [email]);
      };
      this.drop = function(nick, cb) {
        var newcb;
        var _this = this;
        if (nick == null) nick = irc.nick;
        if (cb == null) cb = dcb;
        this.emit('dropping');
        if (!this.isIdentified()) {
          return new NickServError(cb, 'notIdentified', notices.drop);
        }
        if (test.nick(nick)) {
          return new NickServError(cb, 'invalidNick', notices.drop, [nick]);
        }
        newcb = function(err) {
          if (err) return cb(err);
          _this.emit('dropped');
          return cb();
        };
        return nickserv('drop', [nick], newcb, [nick]);
      };
      this.verify = function(nick, key, cb) {
        var newcb;
        var _this = this;
        if (cb == null) cb = dcb;
        this.emit('verifying');
        if (!this.isIdentified()) {
          return new NickServError(cb, 'notIdentified', notices.verifyRegistration);
        }
        if (test.nick(nick)) {
          return new NickServError(cb, 'invalidNick', notices.verifyRegistration, [nick]);
        }
        if (test.key(key)) {
          return new NickServError(cb, 'invalidKey', notices.verifyRegistration, [key]);
        }
        newcb = function(err) {
          if (err) return cb(err);
          _this.emit('verified');
          return cb();
        };
        return nickserv('verify', [nick, key], newcb, [nick]);
      };
      this.setPassword = function(password, cb) {
        var newcb;
        var _this = this;
        if (cb == null) cb = dcb;
        this.emit('settingpassword');
        if (!this.isIdentified()) {
          return new NickServError(cb, 'notIdentified', notices.setPassword);
        }
        if (test.password(password)) {
          return new NickServError(cb, 'invalidPassword', notices.setPassword, [password]);
        }
        newcb = function(err) {
          if (err) return cb(err);
          _this.emit('passwordset');
          return cb();
        };
        return nickserv('setPassword', [password], newcb, [password]);
      };
    }

    return Nick;

  })();

  module.exports = {
    NickServ: Nick,
    create: function(client, options) {
      return client.nickserv = new Nick(client, options);
    }
  };

}).call(this);
