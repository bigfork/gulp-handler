ForkHandle = function(pkg) {
	var path = require('path'),

		gutil = require('gulp-util'),
		c = gutil.colors,
		notification = require('gulp-notify'),
		through = require('through2');

	/* notify */
	notify = {
		opts: function(message, success, opts) {
			opts = (opts ? opts : {});
			notification.logLevel(0);
			return {
				title: 'Task ' + (success !== false ? 'complete' : 'failed'),
				subtitle: pkg.description,
				message: message,
				onLast: opts.onLast ? opts.onLast : true,
				logLevel: 0,
				icon: path.resolve(__dirname, 'assets', 'fork.png')
			};
		},
		show: function(message, success, opts) {
			return notification(this.opts(message, success, opts));
		},
		error: function(err, message) {
			if(!message) message = '<%= error.message %>';
			return notification.onError(notify.opts(message, false, {}))(err);
		}
	},

	/* SCSS lint handler */
	lint = {
		error: function(file) {
			var errorCount = file.scsslint.errorCount,
				plural = errorCount === 1 ? '' : 's',
				error,
				files = [];

			file.scsslint.results.forEach(function(result) {
				var base = path.basename(file.path);

				files.indexOf(base) < 0 && files.push(base);

				generic.log(
					':' + c.red(result.line) + ':' + c.red(result.column) + ' - ' + c.yellow(result.linter) + ': ' + result.reason,
					{type: 'bad', space: false, pipe: false, file: file}
				);
			});

			if(files) {
				gutil.beep();
				error = new gutil.PluginError('scss-lint', 'SCSS lint failed for ' + files.join(', '));

				notify.error(error);

				return error;
			}
		}
	},

	/* everything else handler */
	generic = {
		error: function(err) {
			var alert = {};

			if(err.fileName) err.file = err.fileName; // standardise

			if(err.file) {
				alert = {
					message: c.cyan(path.basename(err.file)) + ':' + c.red(err.lineNumber) + ' ' + err.message,
					notify: path.basename(err.file) + ':<%= error.lineNumber %> <%= error.message %>'
				};
			} else {
				alert = {
					message: err.message,
					notify: '<%= error.message %>'
				};
			}

			generic.log(alert.message, {type: 'bad', space: false, pipe: false});
			gutil.beep();

			notify.error(err, alert.notify);

			this.emit('end');
		},
		/*
			Global logger, appends filename and tick/cross when applicable.

			msg: <string> The message to show
			opt: <object> Options:
			 - type: good|bad Shows either tick or cross
			 - pipe: <boolean> Set to false when calling out of pipe
			 - color: <string> The color of the filename shown - Any colors supported in chalk.
			 - space: <boolean> Append space to end of filename
			 - file: <object> Directly supply a file object (to fetch name)
			mod: <function> Modifier function, exposes the file, message and options vars before logging:

				.pipe(handle.generic.log('Message here', false, function(file, msg, opt) {
					if(file.relative.match(/whatever/)) {
						msg += ' whatever';
						opt.type = 'bad';
						opt.color = 'green';
					}
					return arguments; // always return arguments
				}))
		*/
		log: function(msg, opt, mod) {
			if(!opt) opt = {};
			var defaults = {
				type: 'good',
				pipe: true,

				color: null,
				space: true,

				file: false
			};
			Object.keys(defaults).forEach(function(key) {
				if(!(key in opt)) opt[key] = defaults[key];
			});

			var log = function(file, enc, cb) {
				var mods = mod ? mod(file, msg, opt) : false;
				if(mods) {
					file = mods[0]; msg = mods[1]; opt = mods[2];
				}

				if(opt.type == 'bad') opt.color = 'cyan';

				var start = (opt.type == 'good' ? c.green('✔') : c.red('✘')) + ' ',
					filename = file ? path.basename(file.relative) + (opt.space ? ' ' : '') : '';

				if(opt.color in c) filename = c[opt.color](filename);

				gutil.log(start + filename + msg);

				file && opt.pipe && this.push(file);
				cb && cb();
			};

			return opt.pipe ? through.obj(log) : log.apply(this, [opt.file]);
		}
	},

	/* small plugin to minify CSS, without the bells & whistles */
	minify = function() {
		return through.obj(function(file, enc, cb) {
			if(file.isNull() || file.isStream()) return cb();

			if(file.isBuffer()) {
				var min = file.clone()
					contents = min.contents.toString(),

					layers = [
						[/\/\*(?:(?!\*\/)[\s\S])*\*\/|[\r\n\t]+/g, ''],
						[/ {2,}/g, ''],
						[/ ([{:}]) /g, '$1'],
						[/([;,]) /g, '$1'],
						[/ !/g, '!']
					];

				for(var i = 0; i < layers.length; i++) {
					contents = contents.replace(layers[i][0], layers[i][1]);
				}

				min.contents = new Buffer(contents);
				this.push(min);

				return cb();
			}
		});
	};

	return {
		notify: notify,
		lint: lint,
		generic: generic,
		minify: minify
	};
};

module.exports = ForkHandle;
