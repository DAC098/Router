const nURL = require('url');

const pathToRegexp = require('path-to-regexp');
const _            = require('lodash');

const global = require('../global');

const default_route_options = {
	path: null,
	methods: [],
	options: {},
	no_final: false
};
const default_options = {
	methods: ['get', 'post', 'put', 'delete', 'options', 'trace', 'connect', 'patch'],
	name: ''
};
const route_types = {
	'endpoint': 1,
	'middleware': 2,
	'mount': 3
};

class Router {
	constructor(options) {

		this.opts          = _.merge({},default_options,options);
		this.named_entries = new Map();
		this.routes        = [];
		this.parent        = null;
		this.children      = new Map();
	}

	static async handleRoute(route,method,req,res,options) {
		let rtn = {
			found_path: false,
			valid_method: false
		};
		let method_opts = route.methods.get(method);

		if(route.type === route_types.endpoint) {
			rtn.found_path = true;

			if(!method_opts) {
				return rtn;
			}

			rtn.valid_method = true;
		}

		for(let mid of route.middleware) {
			let next = await Router.runMethod(req,res,mid);

			if(typeof next === 'boolean') {
				if(!next)
					return {found_path: true, valid_method: true};
			}
		}

		if(method_opts) {
			for(let mid of method_opts.middleware) {
				let next = await Router.runMethod(req,res,mid);

				if(typeof next === 'boolean') {
					if(!next)
						return {found_path: true,valid_method: true};
				}
			}

			if(!method_opts.final && route.type === route_types.endpoint)
				throw new Error('no final method for route');
			else if(!method_opts.final)
				return rtn;

			await Router.runMethod(req,res,method_opts.final);
		}

		return rtn;
	}

	static async handleMount(mount,url,req,res,options) {
		options['no_map'] = true;

		for(let mid of mount.middleware) {
			let next = await Router.runMethod(req,res,mid);

			if(typeof next === 'boolean') {
				if(!next)
					return {found_path: true, valid_method: true};
			}
		}

		let next_url = mount.path === '/' ? mount.path : url.pathname.replace(mount.path, '');
		return await mount.router.run(req, res, next_url, options);
	}

	/**
	 * will run parse the route given to it from the stream and will attempt
	 * to find the proper route for the path
	 * @param req     {Object}
	 * @param res     {Object}
	 * @param mod_url {string}
	 * @param options {Object}
	 * @returns {Promise.<Object>}
	 */
	async run(req, res, mod_url, options = {}) {
		let method = req.method.toLowerCase();
		let url    = nURL.parse(mod_url || req.url, true);
		let rtn    = {
			found_path  : false,
			valid_method: false
		};

		for(let route of this.routes) {
			try {
				let test = route.regex.exec(url.pathname);

				if(test) {

					if(route.keys !== null) {
						if(typeof options['no_map'] === 'boolean') {
							if(options['no_map']) {
								req.params = _.merge({},req.params, Router.mapRegexToObj(test,route.keys));
							}
						} else {
							req.params = _.merge({},req.params, Router.mapRegexToObj(test,route.keys));
						}
					}

					switch(route.type) {
						case route_types.endpoint:
							global.emit('endpoint',this,route);
							rtn = await Router.handleRoute(route,method,req,res,options);
							break;
						case route_types.middleware:
							global.emit('middleware',this,route);
							rtn = await Router.handleRoute(route,method,req,res,options);
							break;
						case route_types.mount:
							global.emit('mount',this,route);
							rtn = await Router.handleMount(route,url,req,res,options);
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
	 * @param req {Object}
	 * @param res {Object}
	 * @param mid {function}
	 * @returns {Promise.<*>}
	 */
	static async runMethod(req, res, mid) {
		let p   = mid(req, res);
		let rtn = true;

		if(typeof p === 'boolean')
			rtn = p;
		else if(p && typeof p.then === 'function')
			rtn = await p;

		return rtn;
	}

	/**
	 * gets the result of parsing the given route with pathToRegexp
	 * @param route   {string}
	 * @param options {Object}
	 * @returns {{
	 *     keys: string[],
	 *     regex: RegExp
	 * }}
	 */
	static getRegex(route,options) {
		let keys  = [];
		let regex = pathToRegexp(route, keys, options);

		return {keys, regex};
	}

	/**
	 * searches for the desired named route in the named_entries list
	 * @param {string} name
	 * @return {number|null} the index of the route
	 */
	findRoute(name) {
		for(let [key,index] of this.named_entries) {
			if(key === name) {
				return index;
			}
		}

		return null;
	}

	/**
	 * adds a route to the list from the given information. the options
	 * that are possible for data are:
	 *     path: the path to mount the route with
	 *     methods: the list of http methods that the route
	 *         will accept
	 *     no_final: will prevent the route from having a final
	 *         method
	 *     regex: the custom regular express to use
	 *     options: options to give path-to-regex
	 * @param {{
	 *     path: string=, the path to mount the route with
	 *     methods: string|string[]=,
	 *     regex: RegExp=,
	 *     name: string=,
	 *     options: Object=,
	 *     no_final: boolean=
	 * }}     data        data to build the route from
	 * @param {function[]|[]} middleware  the list of methods to run for a route
	 */
	addRoute(data, ...middleware) {
		data = _.merge({},default_route_options,data);

		let no_methods = data.methods.length === 0;
		let index = typeof data.name === 'string' ? this.findRoute(data.name) : this.routes.length;
		let type = no_methods || data.no_final ? route_types.middleware : route_types.endpoint;
		let r = this.routes[index];
		let added = false;

		if(middleware.length === 1 && Array.isArray(middleware[0]))
			middleware = middleware[0];

		if(!r) {
			let no_path = data.path === null || typeof data.path !== 'string';

			if(no_path)
				data.path = '/';

			let custom_regex   = 'regex' in data;
			let path_to_regex_options = no_path ?
				{...data.options,end:false} :
				{...data.options};
			let {keys, regex}  = Router.getRegex(data.path,path_to_regex_options);

			r = {
				index,
				methods    : new Map(),
				path       : data.path,
				regex      : custom_regex ? data.regex : regex,
				keys       : custom_regex ? [] : keys,
				middleware : [],
				type
			};

			if(!no_methods) {
				let final          = data.no_final ? null : middleware[middleware.length - 1];
				let middleware_mod = data.no_final ? middleware : middleware.slice(0, middleware.length - 1);

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

			added = true;
		} else {
			if(r.type === route_types.mount)
				throw new Error(`cannot treat mount as a endpoint or middleware`);

			if(!no_methods) {
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

		if(added)
			global.emit('addRoute',this,r);

		this.routes[index] = r;
	}

	/**
	 *
	 * @param {{
	 *     path: string=,
	 *     regex: RegExp=,
	 *     name: string=,
	 *     options: Object=
	 * }} data
	 * @param {function[]|[]} middleware
	 */
	addMount(data,...middleware) {
		let type = 'mount';
		let index = typeof data.name === 'string' ? this.findRoute(data.name) : this.routes.length;
		let r =  this.routes[index];
		let added = false;

		if(middleware.length === 1 && Array.isArray(middleware[0]))
			middleware = middleware[0];

		if(!r) {
			data.options = _.merge({},data.options,{end:false});

			let custom_regex = 'regex' in data;
			let {keys, regex} = Router.getRegex(data.path,data.options);
			let router = middleware[middleware.length - 1];

			if(!(router instanceof Router))
				throw new Error('mount point must be an instance of Router');

			router.parent = this;
			this.children.set(router.name,router);

			r = {
				path: data.path,
				regex: custom_regex ? data.regex : regex,
				keys: custom_regex ? [] : keys,
				middleware: middleware.slice(0,middleware.length - 1),
				router,
				type
			};

			added = true;
		} else {
			if(r.type !== route_types.mount)
				throw new Error(`cannot treat endpoint or middleware as a mount`);

			r.middleware = r.middleware.concat(middleware);
		}

		if(added)
			global.emit('addMount',this,r);

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

		this.addRoute({methods: this.opts.methods, path}, ...middleware);
	}
}

module.exports = Router;
