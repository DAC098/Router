import * as nURL from "url";
import {pathToRegexp, ParseOptions, TokensToRegexpOptions, Key, Path} from "path-to-regexp";
import RoutingData from "./RoutingData";
import RouterError from "./error/RouterError";

type PathToRegexpOptions = ParseOptions & TokensToRegexpOptions;
type CallbackReturnType = boolean | void;
type CallbackResult = CallbackReturnType | Promise<CallbackReturnType>;

export interface Callback<T extends any[]> {
    (...args: [...T, RoutingData<T>]):  CallbackResult
}

export interface RouteOptions {
    path: string,
    name?: string,
    methods?: string | string[],
    no_final?: boolean,
    options?: PathToRegexpOptions,
    regex?: RegExp
};

export interface MountOptions {
    path?: string,
    name?: string,
    options?: PathToRegexpOptions,
    regex?: RegExp
}

enum RouteTypes {
    MOUNT = "mount",
    ENDPT = "endpt",
    MDLWR = "mdlwr"
}

interface RouteBase<T extends any[]> {
    path: string,
    name: string,
    regex: RegExp,
    keys: Key[],
    middleware: Callback<T>[],
    type: RouteTypes
}

interface MethodContainer<T extends any[]> {
    middleware: Callback<T>[],
    final?: Callback<T>
}

export interface Route<T extends any[]> extends RouteBase<T> {
    methods: Map<string, MethodContainer<T>>
}

export interface Mount<T extends any[]> extends RouteBase<T> {
    router: Router<T>
}

export interface RouterOptions {
    name?: string,
    method_case?: number
}

export interface RouterRunResult {
    found_path: boolean,
    valid_method: boolean
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
    name: "",
    method_case: 0
};

declare interface Router<T extends any[]> {}

class Router<T extends any[]> {
    
    private opts: RouterOptions;
    private routes: Map<string,Route<T> | Mount<T>> = new Map();
    private children: Router<T>[] = [];

    readonly mount_key_name: string = "MOUNTPATHKEY";
    
    readonly name: string;
    
    constructor(options?: RouterOptions) {
        let opts: RouterOptions = {
            ...default_router_options, 
            ...(options ?? {})
        };

        if (typeof opts["name"] !== "string") {
            throw new RouterError("options.name must be a string");
        }

        this.opts = opts;
        this.name = opts.name;
    }

    private checkMountPath(given: string) {
        let rtn = given;

        if (rtn[rtn.length - 1] !== "/") {
            rtn += "/";
        }

        rtn += `:${this.mount_key_name}(.*)`;

        return rtn;
    }

    private getMethodStr(method: string) {
        switch(this.opts.method_case) {
            case 1:
                return method.toLowerCase();
            case 2:
                return method.toUpperCase();
            case 0:
            default:
                return method;
        }
    }

    public static routerToStr(router: Router<any[]>, depth: number, count: number) {
        let name = `${getTabs(count)}name: ${router.name}\n`;
        let rots = `${getTabs(count)}routes:\n`;

        for(let [k,v] of router.routes) {
            if(v.type === RouteTypes.MOUNT) {
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

    private static mapRegexToObj(res: RegExpExecArray, keys: Key[]) {
        let parsed = {};

        for (let i = 1, len = res.length; i < len; ++i) {
            parsed[keys[i - 1].name] = res[i];
        }

        return parsed;
    }

    public static getRegex(route: Path, options: PathToRegexpOptions) {
        let keys = [];
        let regex = pathToRegexp(route, keys, options);

        return {keys, regex};
    }

    private async handleRoute(
        route: Route<T>, 
        method: string, 
        passing: T,
        data: RoutingData<T>
    ) {
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
            let next = await Promise.resolve(mid(...passing, data));

            if (typeof next === "boolean") {
                if (!next) {
                    return {found_path: true, valid_method: true};
                }
            }
        }

        if (method_opts) {
            for (let mid of method_opts.middleware) {
                let next = await Promise.resolve(mid(...passing, data));

                if (typeof next === "boolean") {
                    if (!next) {
                        return {found_path: true,valid_method: true};
                    }
                }
            }

            if (!method_opts.final && route.type === RouteTypes.ENDPT) {
                throw new RouterError("no final method for route");
            } else if (!method_opts.final) {
                return rtn;
            }

            await Promise.resolve(method_opts.final(...passing, data));
        }

        return rtn;
    }

    private async handleMount(
        mount: Mount<T>, 
        url: nURL.URL, 
        method: string, 
        passing: T,
        data: RoutingData<T>
    ) {
        let mount_path = data.params[this.mount_key_name];
        let new_url = new nURL.URL("/" + mount_path + url.search, url);

        delete data.params[this.mount_key_name];

        for (let mid of mount.middleware) {
            let next = await Promise.resolve(mid(...passing, data));

            if (typeof next === "boolean") {
                if (!next) {
                    return {found_path: true, valid_method: true};
                }
            }
        }

        return await mount.router.runInternal(new_url, method, passing, data);
    }

    private async runInternal(url: nURL.URL, method: string, passing: T, data: RoutingData<T>) {
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
                    data.params = {...data.params, ...Router.mapRegexToObj(test, route.keys)};
                }

                switch(route.type) {
                    case RouteTypes.ENDPT:
                    case RouteTypes.MDLWR:
                        rtn = await this.handleRoute(<Route<T>>route, method, passing, data);
                        break;
                    case RouteTypes.MOUNT:
                        rtn = await this.handleMount(<Mount<T>>route, url, method, passing, data);
                        break;
                }

                if (rtn.found_path) {
                    return rtn;
                }
            }
        }

        return rtn;
    }

    public async run(url: string | nURL.URL, method: string, ...passing: T) {
        if (!(url instanceof nURL.URL)) {
            url = new nURL.URL(url);
        }

        method = this.getMethodStr(method);
        let routing_data = new RoutingData<T>([],[], method, passing);

        return this.runInternal(url,method,passing,routing_data);
    }

    public addRoute(data: RouteOptions, ...middleware: Callback<T>[] | [Callback<T>[]]) {
        data = {...default_route_options,...data};

        if(data.path === null || typeof data.path !== 'string')
            throw new RouterError('no path given for route');

        let type = data.no_final ? RouteTypes.MDLWR : RouteTypes.ENDPT;
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${data.path}`;
        let r = <Route<T>>this.routes.get(key);

        if(Array.isArray(middleware[0])) {
            middleware = <Callback<T>[]>middleware[0];
        }

        let custom_regex   = 'regex' in data;
        let {keys, regex}  = Router.getRegex(data.path,data.options);
        let final          = !data.no_final ? <Callback<T>>middleware[middleware.length - 1] : null;
        let middleware_mod = !data.no_final ? middleware.slice(0, middleware.length - 1) : middleware;

        if (!r) {
            r = {
                methods: new Map<string,MethodContainer<T>>(),
                path: data.path,
                name: name,
                regex: custom_regex ? data.regex : regex,
                keys: custom_regex ? [] : keys,
                middleware: [],
                type
            };
    
            if('methods' in data && (data.methods.length > 0)) {
                if(typeof data.methods === 'string') {
                    let k = this.getMethodStr(data.methods);
                    let m = {
                        middleware: <Callback<T>[]>middleware_mod,
                        final
                    };
    
                    r.methods.set(k, m);
                } else {
                    for(let s of data.methods) {
                        let k = this.getMethodStr(s);
                        let m = {
                            middleware: <Callback<T>[]>middleware_mod,
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
                        throw new RouterError(`route and method already exists. path: "${data.path}" method: "${k}"`);
                    }

                    let m = {
                        middleware: <Callback<T>[]>middleware_mod,
                        final
                    }

                    r.methods.set(k,m);
                } else {
                    for (let s of data.methods) {
                        let k = this.getMethodStr(s);

                        if (r.methods.has(k)) {
                            throw new RouterError(`route and method already exists. path: "${data.path}" method: "${k}"`);
                        }

                        let m = {
                            middleware: <Callback<T>[]>middleware_mod,
                            final
                        };

                        r.methods.set(k,m);
                    }
                }
            } else {
                throw new RouterError(`route already exists. path: "${data.path}"`);
            }
        }

        this.routes.set(key, r);
    }

    addMount(data: MountOptions, ...middleware: (Callback<T> | Router<T>)[] | [(Callback<T> | Router<T>)[]]) {
        if(data.path === null || typeof data.path !== 'string') {
            throw new RouterError('no path given for route');
        }

        let type = RouteTypes.MOUNT;
        let name = typeof data.name === "string" ? data.name : "";
        let key = `${type}:${data.path}`;
        let r = <Mount<T>>this.routes.get(key);

        if (middleware.length === 1 && Array.isArray(middleware[0])) {
            middleware = middleware[0];
        }

        if (r) {
            throw new RouterError("mount already exists");
        }
        
        data.options = {...data.options,end:false};
        
        let regex_path = this.checkMountPath(data.path);
        let use_custom_regex = "regex" in data;
        let {keys, regex} = Router.getRegex(regex_path,data.options);
        let router = middleware[middleware.length - 1];

        if (!(router instanceof Router)) {
            throw new RouterError("mount point must be an instance of Router");
        }

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

        this.routes.set(key, r);
    }
}

export default Router;