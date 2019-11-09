import * as nURL from "url";
import pathToRegexp from "path-to-regexp";
import _ from "lodash";
;
function getTabs(count, character = "  ") {
    let rtn = '';
    for (let c = 0; c < count; ++c) {
        rtn += character;
    }
    return rtn;
}
const default_route_options = {
    path: null,
    name: "",
    methods: [],
    no_final: false,
    options: {}
};
const default_router_options = {
    methods: ["get", "post", "put", "delete", "options", "trace", "connect", "patch"],
    name: ""
};
class Router {
    constructor(options) {
        this.routes = new Map();
        this.parent = null;
        this.children = [];
        let opts = _.merge({}, default_router_options, options == null ? {} : options);
        if (typeof opts["name"] !== "string") {
            throw new Error("options.name must be a string");
        }
        this.opts = opts;
        this.name = opts.name;
    }
    static routerToStr(router, depth, count) {
        let name = `${getTabs(count)}name: ${router.name}\n`;
        let rots = `${getTabs(count)}routes:\n`;
        for (let [k, v] of router.routes) {
            if (v.type === 'mount') {
                if (depth === null || depth === undefined || depth !== count) {
                    rots += getTabs(count + 1) + 'key: ' + k + '\n' +
                        getTabs(count + 1) + 'middleware: ' + v.middleware.length + '\n' +
                        getTabs(count + 1) + 'regex: ' + v.regex + '\n' +
                        Router.routerToStr(v.router, depth, count + 2);
                }
            }
            else {
                let methods = '';
                v.methods.forEach((v, k) => {
                    methods += '\n' + getTabs(count + 2) + k + ' middleware: ' + v.middleware.length;
                });
                rots += getTabs(count + 1) + 'key: ' + k + '\n' +
                    getTabs(count + 1) + 'regex: ' + v.regex + '\n' +
                    getTabs(count + 1) + 'methods:' + methods + '\n';
            }
        }
        return name + rots;
    }
    static mapRegexToObj(res, keys) {
        let parsed = {};
        for (let i = 1, len = res.length; i < len; ++i) {
            parsed[keys[i - 1].name] = res[i];
        }
        return parsed;
    }
    static getRegex(route, options) {
        let keys = [];
        let regex = pathToRegexp(route, keys, options);
        return { keys, regex };
    }
    async handleRoute(route, method, passing, params) {
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
                    return { found_path: true, valid_method: true };
                }
            }
        }
        if (method_opts) {
            for (let mid of method_opts.middleware) {
                let next = await Promise.resolve(mid(passing, params));
                if (typeof next === "boolean") {
                    if (!next) {
                        return { found_path: true, valid_method: true };
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
    async handleMount(mount, url, method, passing, params) {
        for (let mid of mount.middleware) {
            let next = await Promise.resolve(mid(passing, params));
            if (typeof next === "boolean") {
                if (!next) {
                    return { found_path: true, valid_method: true };
                }
            }
        }
        let next_url = new nURL.URL(mount.path === "/" ? mount.path : url.pathname.replace(mount.path, ""), url);
        return await mount.router.runInternal(next_url, method, passing, params);
    }
    async runInternal(url, method, passing, params) {
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
                    params = _.merge({}, params, Router.mapRegexToObj(test, route.keys));
                }
                switch (r_type) {
                    case "endpt":
                    case "mdlwr":
                        rtn = await this.handleRoute(route, method, passing, params);
                        break;
                    case "mount":
                        rtn = await this.handleMount(route, url, method, passing, params);
                        break;
                }
                if (rtn.found_path) {
                    return rtn;
                }
            }
        }
        return rtn;
    }
    async run(url, method, passing) {
        if (!(url instanceof nURL.URL)) {
            url = new nURL.URL(url);
        }
        return this.runInternal(url, method, passing, {});
    }
    addRoute(data, ...middleware) {
        data = _.merge({}, default_route_options, data);
        if (data.path === null || typeof data.path !== 'string')
            throw new Error('no path given for route');
        let type = data.no_final ? 'mdlwr' : 'endpt';
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${name}:${data.path}`;
        let r = this.routes.get(key);
        let added = false;
        if (Array.isArray(middleware[0])) {
            middleware = middleware[0];
        }
        if (!r) {
            let custom_regex = 'regex' in data;
            let { keys, regex } = Router.getRegex(data.path, data.options);
            let final = !data.no_final ? middleware[middleware.length - 1] : null;
            let middleware_mod = !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware;
            r = {
                methods: new Map(),
                path: data.path,
                name: data.name,
                regex: custom_regex ? data.regex : regex,
                keys: custom_regex ? [] : keys,
                middleware: [],
                type
            };
            if ('methods' in data && (data.methods.length > 0)) {
                if (typeof data.methods === 'string') {
                    let k = data.methods.toLowerCase();
                    let m = {
                        middleware: middleware_mod,
                        final
                    };
                    r.methods.set(k, m);
                }
                else {
                    for (let s of data.methods) {
                        let k = s.toLowerCase();
                        let m = {
                            middleware: middleware_mod,
                            final
                        };
                        r.methods.set(k, m);
                    }
                }
            }
            else {
                r.middleware = r.middleware.concat(middleware);
            }
            added = true;
        }
        else {
            if ('methods' in data) {
                if (typeof data.methods === 'string') {
                    let k = data.methods.toLowerCase();
                    let method = r.methods.get(k);
                    if (!method) {
                        method = {
                            middleware: (!data.no_final ? middleware.slice(0, middleware.length - 1) : middleware),
                            final: !data.no_final ? middleware[middleware.length - 1] : null
                        };
                    }
                    else {
                        method.middleware = method.middleware.concat(middleware);
                    }
                    r.methods.set(k, method);
                }
                else {
                    for (let m of data.methods) {
                        let k = m.toLowerCase();
                        let method = r.methods.get(k);
                        if (!method) {
                            method = {
                                middleware: (!data.no_final ? middleware.slice(0, middleware.length - 1) : middleware),
                                final: !data.no_final ? middleware[middleware.length - 1] : null
                            };
                        }
                        else {
                            method.middleware = method.middleware.concat(middleware);
                        }
                        r.methods.set(k, method);
                    }
                }
            }
            else {
                r.middleware = r.middleware.concat(middleware);
            }
        }
        // if(added)
        // 	global.emit('addRoute',this,key);
        this.routes.set(key, r);
    }
    addMount(data, ...middleware) {
        if (data.path === null || typeof data.path !== 'string') {
            throw new Error('no path given for route');
        }
        let type = "mount";
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${name}:${data.path}`;
        let added = false;
        let r = this.routes.get(key);
        if (middleware.length === 1 && Array.isArray(middleware[0])) {
            middleware = middleware[0];
        }
        if (!r) {
            data.options = _.merge({}, data.options, { end: false });
            let use_custom_regex = "regex" in data;
            let { keys, regex } = Router.getRegex(data.path, data.options);
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
                middleware: middleware.slice(0, middleware.length - 1),
                router,
                type,
                name
            };
            added = true;
        }
        else {
            r.middleware = r.middleware.concat(middleware);
        }
        // if (added) {
        // 	global.emit("addMount", this, key);
        // }
        this.routes.set(key, r);
    }
}
export default Router;
//# sourceMappingURL=Router.js.map