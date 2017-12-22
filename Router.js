const nURL = require('url');

const pathToRegexp = require('path-to-regexp');
const _            = require('lodash');

const default_route_options = {
	path: null,
	methods: [],
	no_final: false
};

class Router {
	constructor() {
		this.routes        = new Map();
		this.valid_methods = new Set(['get', 'post', 'put', 'delete', 'options', 'trace', 'connect', 'patch']);
	}

	static async handleRoute(route,method,url,stream) {
		let rtn = {
			found_path: false,
			valid_method: false
		};
		let method_opts = route.methods.get(method);

		if(route.type === 'endpt') {
			rtn.found_path = true;

			if(!method_opts) {
				return rtn;
			}

			rtn.valid_method = true;
		}

		for(let i = 0, len = route.middleware.length; i < len; ++i) {
			let mid = route.middleware[i];
			let next = await Router.runMethod(stream,mid);

			if(typeof next === 'boolean') {
				if(!next)
					return {found_path: true, valid_method: true};
			}
		}

		if(method_opts) {
			for(let mid of method_opts.middleware) {
				let next = await Router.runMethod(stream,mid);

				if(typeof next === 'boolean') {
					if(!next)
						return {found_path: true,valid_method: true};
				}
			}

			if(!method_opts.final && route.type === 'endpt')
				throw new Error('no final method for route');
			else if(!method_opts.final)
				return rtn;

			await Router.runMethod(stream,method_opts.final);
		}

		return rtn;
	}

	static async handleMount(mount,headers,path,stream) {

		for(let mid of mount.middleware) {
			let next = await Router.runMethod(stream,mid);

			if(typeof next === 'boolean') {
				if(!next)
					return {found_path: true, valid_method: true};
			}
		}

		let next_url = mount.path === '/' ? mount.path : path.replace(mount.path, '');
		return await mount.router.run(stream, headers, next_url);
	}

	/**
	 * will run parse the route given to it from the stream and will attempt
	 * to find the proper route for the path
	 * @param stream     [H2Stream]
	 * @param headers    [Object]
	 * @param modded_url [String]
	 * @returns {Promise.<Object>}
	 */
	async run(stream, headers, modded_url) {
		let method = headers[':method'].toLowerCase();
		let path   = modded_url || headers[':path'];
		let url    = nURL.parse(path, true);
		let rtn    = {
			found_path  : false,
			valid_method: false
		};

		for(let [key, route] of this.routes) {
			let r_type = key.substring(0,5);
			let r_key = key.substring(5);

			try {
				let test = route.regex.exec(url.pathname);

				if(test) {

					if(route.keys !== null)
						stream.params = _.merge(stream.params, Router.mapRegexToObj(test,route.keys));

					switch(r_type) {
						case 'endpt':
						case 'mdlwr':
							rtn = await Router.handleRoute(route,method,url,stream);
							break;
						case 'mount':
							rtn = await Router.handleMount(route,headers,path,stream);
							break;
					}

					if(rtn.found_path)
						return rtn;
				}
			} catch(err) {
				throw err;
			}
		}

		return rtn;
	}

	static checkForRouterInstance(list) {
		if(Array.isArray(list)) {
			for(let i of list) {
				if(i instanceof Router)
					return true;
			}

			return false;
		} else {
			return list instanceof Router;
		}
	}

	/**
	 * will go thru the results of a regular expression and map the values with
	 * a key
	 * @param res  [Regex]
	 * @param keys [Array]
	 * @returns {Object}
	 */
	static mapRegexToObj(res, keys) {
		let parsed = {};

		for(let i = 1, len = res.length; i < len; ++i) {
			parsed[keys[i - 1].name] = res[i];
		}

		return parsed;
	}

	/**
	 * will run the desired route function
	 * @param stream [H2Stream]
	 * @param mid    [function]
	 * @returns {Promise.<*>}
	 */
	static async runMethod(stream, mid) {
		let p   = mid(stream);
		let rtn = true;

		if(typeof p === 'boolean')
			rtn = p;
		else if(p && typeof p.then === 'function')
			rtn = await p;

		return rtn;
	}

	/**
	 * gets the result of parsing the given route with pathToRegexp
	 * @param route
	 * @returns {{keys: Array, regex: RegExp}}
	 */
	static getRegex(route) {
		let keys  = [];
		let regex = pathToRegexp(route, keys);

		return {keys, regex};
	}

	/**
	 * adds a route to the list from the given information. the options
	 * that are possible for data are:
	 *     path: [String] the path to mount the route with
	 *     methods: [String|String[]] the list of http methods that the route
	 *         will accept
	 *     no_final: [Boolean] will prevent the route from having a final
	 *         method
	 *     regex: [RegExp] the custom regular express to use
	 * @param data       [Object]     data to build the route from
	 * @param middleware [Function[]] the list of methods to run for a route
	 */
	addRoute(data, ...middleware) {
		data = _.merge({},default_route_options,data);

		if(data.path === null || typeof data.path !== 'string')
			throw new Error('no path given for route');

		let type = data.no_final ? 'mdlwr' : 'endpt';
		let key = `${type}:${data.path}`;
		let r = this.routes.get(key);

		if(!r) {
			let custom_regex   = 'regex' in data;
			let {keys, regex}  = Router.getRegex(data.path);
			let final          = !data.no_final ? middleware[middleware.length - 1] : null;
			let middleware_mod = !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware;

			r = {
				methods     : new Map(),
				path        : data.path,
				regex       : custom_regex ? data.regex : regex,
				keys        : custom_regex ? [] : keys,
				middleware  : [],
				type
			};

			if('methods' in data && (data.methods.length > 0 || data.methods.size > 0)) {
				if(typeof data.methods === 'string') {
					let k = data.methods.toLowerCase();
					let m = {
						middleware: middleware_mod,
						final
					};

					r.methods.set(k, m);
				} else {
					for(let s of data.methods) {
						let k = s.toLowerCase();
						let m = {
							middleware: middleware_mod,
							final
						};

						r.methods.set(k, m);
					}
				}
			} else {
				r.middleware = r.middleware.concat(middleware);
			}
		} else {
			if('methods' in data) {
				if(typeof data.methods === 'string') {
					let k      = data.methods.toLowerCase();
					let method = r.methods.get(k);

					if(!method) {
						method = {
							middleware: !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware,
							final     : !data.no_final ? middleware[middleware.length - 1] : null
						};
					} else {
						method.middleware = method.middleware.concat(middleware);
					}

					r.methods.set(k, method);
				} else {
					for(let m of data.methods) {
						let k      = m.toLowerCase();
						let method = r.methods.get(k);

						if(!method) {
							method = {
								middleware: !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware,
								final     : !data.no_final ? middleware[middleware.length - 1] : null
							};
						} else {
							method.middleware = method.middleware.concat(middleware);
						}

						r.methods.set(k, method);
					}
				}
			} else {
				r.middleware = r.middleware.concat(middleware);
			}
		}

		this.routes.set(key, r);
	}

	addMount(data,...middleware) {
		let type = 'mount';
		let key = `${type}:${data.path}`;
		let r =  this.routes.get(key);

		if(!r) {
			let regex  = new RegExp('^' + data.path.replace('/', '\\/'));

			r = {
				path: data.path,
				regex,
				keys: [],
				middleware: middleware.slice(0,middleware.length - 2),
				router: middleware[middleware.length - 1],
				type
			};
		} else {
			r.middleware = r.middleware.concat(middleware);
		}

		this.routes.set(key,r);
	}

	/**
	 * adds a get method path to the list
	 * @param path       [String] the path for the path
	 * @param middleware [Function[]] the list of function to run for the
	 *        path
	 */
	get(path, ...middleware) {
		if(typeof path !== 'string')
			throw new Error(`invalid variable path, expected string but received ${typeof path}`);

		this.addRoute({methods: 'get', path}, ...middleware);
	}

	/**
	 * adds a post method path to the list
	 * @param path       [String] the path for the path
	 * @param middleware [Function[]] the list of function to run for the
	 *        path
	 */
	post(path, ...middleware) {
		if(typeof path !== 'string')
			throw new Error(`invalid variable path, expected string but received ${typeof path}`);

		this.addRoute({methods: 'post', path}, ...middleware);
	}

	/**
	 * adds a put method route to the list
	 * @param path       [String] the path for the route
	 * @param middleware [Function[]] the list of function to run for the
	 *        route
	 */
	put(path, ...middleware) {
		if(typeof path !== 'string')
			throw new Error(`invalid variable path, expected string but received ${typeof path}`);

		this.addRoute({methods: 'put', path}, ...middleware);
	}

	/**
	 * adds a delete method route to the list
	 * @param path       [String] the path for the route
	 * @param middleware [Function[]] the list of function to run for the
	 *        route
	 */
	del(path, ...middleware) {
		if(typeof path !== 'string')
			throw new Error(`invalid variable path, expected string but received ${typeof path}`);

		this.addRoute({methods: 'delete', path}, ...middleware);
	}

	/**
	 * a middleware method that will be run before any routes are handled, can
	 * be used to mount child Routers to the list
	 * @param mount      [String|Object|Function] the mount point for the middleware
	 * @param middleware [Function[]] the list of functions to run for the
	 *        middleware
	 */
	use(mount, ...middleware) {
		let obj = null;
		let mdlwr = [];

		if(typeof mount === 'function') {
			let mount_path = '/';
			obj = {
				path: mount_path,
				methods: [],
				no_final: true,
				regex: new RegExp('^' + mount_path.replace('/', '\\/'))
			};
			mdlwr = [mount,...middleware];
		} else if(typeof mount === 'string') {
			obj = {
				path: mount,
				methods: [],
				no_final: true,
				regex: new RegExp('^' + mount.replace('/', '\\/'))
			};
			mdlwr = middleware;
		} else {
			obj = {
				path: mount.path,
				methods: mount.methods || [],
				no_final: true,
				regex: mount.regex || new RegExp('^' + mount.path.replace('/', '\\/'))
			};
			mdlwr = middleware;
		}

		this.addRoute(obj,...mdlwr);
	}

	/**
	 * adds a catch-all method route to the list
	 * @param path       [String] the path for the route
	 * @param middleware [Function[]] the list of function to run for the
	 *        route
	 */
	all(path, ...middleware) {
		if(typeof path !== 'string')
			throw new Error(`invalid variable path, expected string but received ${typeof path}`);

		this.addRoute({methods: this.valid_methods, path}, ...middleware);
	}
}

module.exports = Router;