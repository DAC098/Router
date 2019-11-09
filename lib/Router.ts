import * as nURL from "url";

import pathToRegexp from "path-to-regexp";
import _ from "lodash";

type CallableTypeReturn = boolean | void;

interface Callback<T extends any[]> {
	(args: T, params?: ParamsObject):  CallableTypeReturn | Promise<CallableTypeReturn>
}

interface RouteOptions {
	path: string,
	name?: string,
	methods?: string | string[],
	no_final?: boolean,
	options?: pathToRegexp.ParseOptions,
	regex?: RegExp
};

interface MountOptions {
	path?: string,
	name?: string,
	options?: pathToRegexp.ParseOptions,
	regex?: RegExp
}

interface RouteBase<T extends any[]> {
	path: string,
	name: string,
	regex: RegExp,
	keys: pathToRegexp.Key[],
	middleware: Callback<T>[],
	type: string
}

interface MethodContainer<T extends any[]> {
	middleware: Callback<T>[],
	final?: Callback<T>
}

interface Route<T extends any[]> extends RouteBase<T> {
	methods: Map<string, MethodContainer<T>>
}

interface Mount<T extends any[]> extends RouteBase<T> {
	router: Router<T>
}

interface RouterOptions {
	methods?: string[],
	name?: string
}

interface RouterRunResult {
	found_path: boolean,
	valid_method: boolean
}

interface ParamsObject {
	[key: string]: string
}

function getTabs(count: number, character: string = "  ") {
	let rtn = '';

	for(let c = 0; c < count; ++c) {
		rtn += character;
	}

	return rtn;
}

const default_route_options: RouteOptions = {
	path: null,
	name: "",
	methods: [],
	no_final: false,
	options: {}
};

const default_router_options: RouterOptions = {
	methods: ["get","post","put","delete","options","trace","connect","patch"],
	name: ""
};

declare interface Router<T extends any[]> {}

class Router<T extends any[]> {

	private opts: RouterOptions;
	private routes: Map<string,Route<T> | Mount<T>> = new Map();
	private parent: Router<T> = null;
	private children: Router<T>[] = [];
	readonly name: string;
	
	constructor(options?: RouterOptions) {
		let opts: RouterOptions = _.merge({}, default_router_options, options == null ? {} : options);

		if (typeof opts["name"] !== "string") {
			throw new Error("options.name must be a string");
		}

		this.opts = opts;
		this.name = opts.name;
	}

	static routerToStr(router: Router<any[]>, depth: number, count: number) {
		let name = `${getTabs(count)}name: ${router.name}\n`;
		let rots = `${getTabs(count)}routes:\n`;

		for(let [k,v] of router.routes) {
			if(v.type === 'mount') {
				if(depth === null || depth === undefined || depth !== count) {
					rots += getTabs(count + 1) + 'key: ' + k + '\n' +
					        getTabs(count + 1) + 'middleware: ' + v.middleware.length + '\n' +
					        getTabs(count + 1) + 'regex: ' + v.regex + '\n' +
					        Router.routerToStr((<Mount<any[]>>v).router,depth,count + 2);
				}
			} else {
				let methods = '';

				(<Route<any[]>>v).methods.forEach((v,k) => {
					methods += '\n' + getTabs(count + 2) + k + ' middleware: ' + v.middleware.length;
				});

				rots += getTabs(count + 1) + 'key: ' + k + '\n' +
				        getTabs(count + 1) + 'regex: ' + v.regex + '\n' +
				        getTabs(count + 1) + 'methods:' + methods + '\n';
			}
		}

		return name + rots;
	}

	private static mapRegexToObj(res: RegExpExecArray, keys: pathToRegexp.Key[]) {
		let parsed = {};

		for (let i = 1, len = res.length; i < len; ++i) {
			parsed[keys[i - 1].name] = res[i];
		}

		return parsed;
	}

	public static getRegex(route: pathToRegexp.Path, options: pathToRegexp.ParseOptions) {
		let keys = [];
		let regex = pathToRegexp(route,keys, options);

		return {keys, regex};
	}

	private async handleRoute(
		route: Route<T>, 
		method: string, 
		passing: T,
		params: ParamsObject
	) {
		let rtn = {
			found_path: false,
			valid_method: false,
		};
		let method_opts = route.methods.get(method);

		if (route.type === "endpt") {
			rtn.found_path = true;

			if (!method_opts) {
				return rtn;
			}

			rtn.valid_method = true;
		}

		for (let mid of route.middleware) {
			let next = await Promise.resolve(mid(passing, params));

			if (typeof next === "boolean") {
				if (!next) {
					return {found_path: true, valid_method: true};
				}
			}
		}

		if (method_opts) {
			for (let mid of method_opts.middleware) {
				let next = await Promise.resolve(mid(passing, params));

				if (typeof next === "boolean") {
					if (!next) {
						return {found_path: true,valid_method: true};
					}
				}
			}

			if (!method_opts.final && route.type === "endpt") {
				throw new Error("no final method for route");
			}
			else if (!method_opts.final) {
				return rtn;
			}

			await Promise.resolve(method_opts.final(passing, params));
		}
	}

	private async handleMount(
		mount: Mount<T>, 
		url: nURL.URL, 
		method: string, 
		passing: T,
		params: ParamsObject
	) {
		for (let mid of mount.middleware) {
			let next = await Promise.resolve(mid(passing, params));

			if (typeof next === "boolean") {
				if (!next) {
					return {found_path: true, valid_method: true};
				}
			}
		}

		let next_url = new nURL.URL(mount.path === "/" ? mount.path : url.pathname.replace(mount.path,""), url);
		return await mount.router.runInternal(next_url, method, passing, params);
	}

	private async runInternal(url: nURL.URL, method: string, passing: T, params: ParamsObject) {
		let rtn = {
			found_path: false,
			valid_method: false
		};
		
		for (let [key, route] of this.routes) {
			let r_type = route.type;
			let r_key = `${route.name}:${route.path}`;

			let test = route.regex.exec(url.pathname);

			if (test) {
				if (route.keys != null) {
					params = _.merge({},params,Router.mapRegexToObj(test, route.keys));
				}

				switch(r_type) {
					case "endpt":
					case "mdlwr":
						rtn = await this.handleRoute(<Route<T>>route, method, passing, params);
						break;
					case "mount":
						rtn = await this.handleMount(<Mount<T>>route, url, method, passing, params);
						break;
				}

				if (rtn.found_path) {
					return rtn;
				}
			}
		}

		return rtn;
	}

	public async run(url: string | nURL.URL, method: string, passing: T) {
		if (!(url instanceof nURL.URL)) {
			url = new nURL.URL(url);
		}

		return this.runInternal(url,method,passing,{});
	}

	public addRoute(data: RouteOptions, ...middleware: Callback<T>[] | [Callback<T>[]]) {
		data = _.merge({},default_route_options,data);

		if(data.path === null || typeof data.path !== 'string')
			throw new Error('no path given for route');

		let type = data.no_final ? 'mdlwr' : 'endpt';
		let name = typeof data.name === "string" ? data.name : "";
		let key = `${type}:${name}:${data.path}`;
		let r = <Route<T>>this.routes.get(key);
		let added = false;

		if(Array.isArray(middleware[0])) {
			middleware = <Callback<T>[]>middleware[0];
		}

		if(!r) {
			let custom_regex   = 'regex' in data;
			let {keys, regex}  = Router.getRegex(data.path,data.options);
			let final          = !data.no_final ? <Callback<T>>middleware[middleware.length - 1] : null;
			let middleware_mod = !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware;

			r = {
				methods: new Map<string,MethodContainer<T>>(),
				path: data.path,
				name: data.name,
				regex: custom_regex ? data.regex : regex,
				keys: custom_regex ? [] : keys,
				middleware: [],
				type
			};

			if('methods' in data && (data.methods.length > 0)) {
				if(typeof data.methods === 'string') {
					let k = data.methods.toLowerCase();
					let m = {
						middleware: <Callback<T>[]>middleware_mod,
						final
					};

					r.methods.set(k, m);
				} 
				else {
					for(let s of data.methods) {
						let k = s.toLowerCase();
						let m = {
							middleware: <Callback<T>[]>middleware_mod,
							final
						};

						r.methods.set(k, m);
					}
				}
			} 
			else {
				r.middleware = r.middleware.concat(<Callback<T>[]>middleware);
			}

			added = true;
		} 
		else {
			if('methods' in data) {
				if(typeof data.methods === 'string') {
					let k      = data.methods.toLowerCase();
					let method = r.methods.get(k);

					if(!method) {
						method = {
							middleware: <Callback<T>[]>(!data.no_final ? middleware.slice(0, middleware.length - 1) : middleware),
							final     : !data.no_final ? <Callback<T>>middleware[middleware.length - 1] : null
						};
					} else {
						method.middleware = method.middleware.concat(<Callback<T>[]>middleware);
					}

					r.methods.set(k, method);
				} 
				else {
					for(let m of data.methods) {
						let k      = m.toLowerCase();
						let method = r.methods.get(k);

						if(!method) {
							method = {
								middleware: <Callback<T>[]>(!data.no_final ? middleware.slice(0, middleware.length - 1) : middleware),
								final     : !data.no_final ? <Callback<T>>middleware[middleware.length - 1] : null
							};
						} 
						else {
							method.middleware = method.middleware.concat(<Callback<T>[]>middleware);
						}

						r.methods.set(k, method);
					}
				}
			} 
			else {
				r.middleware = r.middleware.concat(<Callback<T>[]>middleware);
			}
		}

		// if(added)
		// 	global.emit('addRoute',this,key);

		this.routes.set(key, r);
	}

	addMount(data: MountOptions, ...middleware: (Callback<T> | Router<T>)[] | [(Callback<T> | Router<T>)[]]) {
		if(data.path === null || typeof data.path !== 'string') {
			throw new Error('no path given for route');
		}

		let type = "mount";
		let name = typeof data.name === "string" ? data.name : "";
		let key = `${type}:${name}:${data.path}`;
		let added = false;
		let r = <Mount<T>>this.routes.get(key);

		if (middleware.length === 1 && Array.isArray(middleware[0])) {
			middleware = middleware[0];
		}

		if (!r) {
			data.options = _.merge({},data.options,{end:false});
			let use_custom_regex = "regex" in data;
			let {keys, regex} = Router.getRegex(data.path,data.options);
			let router = middleware[middleware.length - 1];

			if (!(router instanceof Router)) {
				throw new Error("mount poiont must be an instance of Router");
			}

			router.parent = this;
			this.children.push(router);

			r = {
				path: data.path,
				regex: use_custom_regex ? data.regex : regex,
				keys: use_custom_regex ? [] : keys,
				middleware: <Callback<T>[]>middleware.slice(0,middleware.length -1),
				router,
				type,
				name
			};

			added = true;
		}
		else {
			r.middleware = r.middleware.concat(<Callback<T>[]>middleware);
		}

		// if (added) {
		// 	global.emit("addMount", this, key);
		// }

		this.routes.set(key, r);
	}
}

export default Router;