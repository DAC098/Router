import * as nURL from "url";
import pathToRegexp from "path-to-regexp";
import RoutingData from "./RoutingData";
;
var RouteTypes;
(function (RouteTypes) {
    RouteTypes["MOUNT"] = "mount";
    RouteTypes["ENDPT"] = "endpt";
    RouteTypes["MDLWR"] = "mdlwr";
})(RouteTypes || (RouteTypes = {}));
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
    name: "",
    method_case: 0
};
class Router {
    constructor(options) {
        this.routes = new Map();
        this.parent = null;
        this.children = [];
        this.mount_key_name = "MOUNTPATHKEY";
        let opts = {
            ...default_router_options,
            ...(options == null ? {} : options)
        };
        if (typeof opts["name"] !== "string") {
            throw new Error("options.name must be a string");
        }
        this.opts = opts;
        this.name = opts.name;
    }
    checkMountPath(given) {
        let rtn = given;
        if (rtn[rtn.length - 1] !== "/") {
            rtn += "/";
        }
        rtn += `:${this.mount_key_name}(.*)`;
        return rtn;
    }
    getMethodStr(method) {
        switch (this.opts.method_case) {
            case 1:
                return method.toLowerCase();
            case 2:
                return method.toUpperCase();
            case 0:
            default:
                return method;
        }
    }
    static routerToStr(router, depth, count) {
        let name = `${getTabs(count)}name: ${router.name}\n`;
        let rots = `${getTabs(count)}routes:\n`;
        for (let [k, v] of router.routes) {
            if (v.type === RouteTypes.MOUNT) {
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
    async handleRoute(route, method, passing, data) {
        let rtn = {
            found_path: false,
            valid_method: false,
        };
        let method_opts = route.methods.get(method);
        if (route.type === RouteTypes.ENDPT) {
            rtn.found_path = true;
            if (!method_opts) {
                return rtn;
            }
            rtn.valid_method = true;
        }
        for (let mid of route.middleware) {
            let next = await Promise.resolve(mid(passing, data));
            if (typeof next === "boolean") {
                if (!next) {
                    return { found_path: true, valid_method: true };
                }
            }
        }
        if (method_opts) {
            for (let mid of method_opts.middleware) {
                let next = await Promise.resolve(mid(passing, data));
                if (typeof next === "boolean") {
                    if (!next) {
                        return { found_path: true, valid_method: true };
                    }
                }
            }
            if (!method_opts.final && route.type === RouteTypes.ENDPT) {
                throw new Error("no final method for route");
            }
            else if (!method_opts.final) {
                return rtn;
            }
            await Promise.resolve(method_opts.final(passing, data));
        }
        return rtn;
    }
    async handleMount(mount, url, method, passing, data) {
        let mount_path = data.params[this.mount_key_name];
        let new_url = new nURL.URL("/" + mount_path + url.search, url);
        delete data.params[this.mount_key_name];
        for (let mid of mount.middleware) {
            let next = await Promise.resolve(mid(passing, data));
            if (typeof next === "boolean") {
                if (!next) {
                    return { found_path: true, valid_method: true };
                }
            }
        }
        return await mount.router.runInternal(new_url, method, passing, data);
    }
    async runInternal(url, method, passing, data) {
        let rtn = {
            found_path: false,
            valid_method: false
        };
        data["prev_urls"].push(url);
        data["prev_routers"].push(this);
        for (let [key, route] of this.routes) {
            let test = route.regex.exec(url.pathname);
            if (test) {
                if (route.keys != null) {
                    data.params = { ...data.params, ...Router.mapRegexToObj(test, route.keys) };
                }
                switch (route.type) {
                    case RouteTypes.ENDPT:
                    case RouteTypes.MDLWR:
                        rtn = await this.handleRoute(route, method, passing, data);
                        break;
                    case RouteTypes.MOUNT:
                        rtn = await this.handleMount(route, url, method, passing, data);
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
        let routing_data = new RoutingData([], []);
        return this.runInternal(url, method, passing, routing_data);
    }
    addRoute(data, ...middleware) {
        data = { ...default_route_options, ...data };
        if (data.path === null || typeof data.path !== 'string')
            throw new Error('no path given for route');
        let type = data.no_final ? RouteTypes.MDLWR : RouteTypes.ENDPT;
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${data.path}`;
        let r = this.routes.get(key);
        if (Array.isArray(middleware[0])) {
            middleware = middleware[0];
        }
        let custom_regex = 'regex' in data;
        let { keys, regex } = Router.getRegex(data.path, data.options);
        let final = !data.no_final ? middleware[middleware.length - 1] : null;
        let middleware_mod = !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware;
        if (!r) {
            r = {
                methods: new Map(),
                path: data.path,
                name: name,
                regex: custom_regex ? data.regex : regex,
                keys: custom_regex ? [] : keys,
                middleware: [],
                type
            };
            if ('methods' in data && (data.methods.length > 0)) {
                if (typeof data.methods === 'string') {
                    let k = this.getMethodStr(data.methods);
                    let m = {
                        middleware: middleware_mod,
                        final
                    };
                    r.methods.set(k, m);
                }
                else {
                    for (let s of data.methods) {
                        let k = this.getMethodStr(s);
                        let m = {
                            middleware: middleware_mod,
                            final
                        };
                        r.methods.set(k, m);
                    }
                }
            }
        }
        else {
            if ("methods" in data && data.methods.length > 0) {
                if (typeof data.methods === "string") {
                    let k = this.getMethodStr(data.methods);
                    if (r.methods.has(k)) {
                        throw new Error(`route and method already exists. path: "${data.path}" method: "${k}"`);
                    }
                    let m = {
                        middleware: middleware_mod,
                        final
                    };
                    r.methods.set(k, m);
                }
                else {
                    for (let s of data.methods) {
                        let k = this.getMethodStr(s);
                        if (r.methods.has(k)) {
                            throw new Error(`route and method already exists. path: "${data.path}" method: "${k}"`);
                        }
                        let m = {
                            middleware: middleware_mod,
                            final
                        };
                        r.methods.set(k, m);
                    }
                }
            }
            else {
                throw new Error(`route already exists. path: "${data.path}"`);
            }
        }
        this.routes.set(key, r);
    }
    addMount(data, ...middleware) {
        if (data.path === null || typeof data.path !== 'string') {
            throw new Error('no path given for route');
        }
        let type = RouteTypes.MOUNT;
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${data.path}`;
        let r = this.routes.get(key);
        if (middleware.length === 1 && Array.isArray(middleware[0])) {
            middleware = middleware[0];
        }
        if (r) {
            throw new Error("mount already exists");
        }
        data.options = { ...data.options, end: false };
        let regex_path = this.checkMountPath(data.path);
        let use_custom_regex = "regex" in data;
        let { keys, regex } = Router.getRegex(regex_path, data.options);
        let router = middleware[middleware.length - 1];
        if (!(router instanceof Router)) {
            throw new Error("mount point must be an instance of Router");
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
        this.routes.set(key, r);
    }
}
export default Router;
//# sourceMappingURL=Router.js.map