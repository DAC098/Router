/// <reference types="node" />
import * as nURL from "url";
import pathToRegexp from "path-to-regexp";
declare type CallableTypeReturn = boolean | void;
interface Callback<T extends any[]> {
    (args: T, params?: ParamsObject): CallableTypeReturn | Promise<CallableTypeReturn>;
}
interface RouteOptions {
    path: string;
    name?: string;
    methods?: string | string[];
    no_final?: boolean;
    options?: pathToRegexp.ParseOptions;
    regex?: RegExp;
}
interface MountOptions {
    path?: string;
    name?: string;
    options?: pathToRegexp.ParseOptions;
    regex?: RegExp;
}
interface RouterOptions {
    methods?: string[];
    name?: string;
}
interface ParamsObject {
    [key: string]: string;
}
declare interface Router<T extends any[]> {
}
declare class Router<T extends any[]> {
    private opts;
    private routes;
    private parent;
    private children;
    readonly name: string;
    constructor(options?: RouterOptions);
    static routerToStr(router: Router<any[]>, depth: number, count: number): string;
    private static mapRegexToObj;
    static getRegex(route: pathToRegexp.Path, options: pathToRegexp.ParseOptions): {
        keys: any[];
        regex: RegExp;
    };
    private handleRoute;
    private handleMount;
    private runInternal;
    run(url: string | nURL.URL, method: string, passing: T): Promise<{
        found_path: boolean;
        valid_method: boolean;
    }>;
    addRoute(data: RouteOptions, ...middleware: Callback<T>[] | [Callback<T>[]]): void;
    addMount(data: MountOptions, ...middleware: (Callback<T> | Router<T>)[] | [(Callback<T> | Router<T>)[]]): void;
}
export default Router;
