/// <reference types="node" />
import * as nURL from "url";
import pathToRegexp from "path-to-regexp";
declare type CallableTypeReturn = boolean | void;
export interface Callback<T extends any[]> {
    (args: T, params?: ParamsObject): CallableTypeReturn | Promise<CallableTypeReturn>;
}
export interface RouteOptions {
    path: string;
    name?: string;
    methods?: string | string[];
    no_final?: boolean;
    options?: pathToRegexp.ParseOptions;
    regex?: RegExp;
}
export interface MountOptions {
    path?: string;
    name?: string;
    options?: pathToRegexp.ParseOptions;
    regex?: RegExp;
}
interface RouteBase<T extends any[]> {
    path: string;
    name: string;
    regex: RegExp;
    keys: pathToRegexp.Key[];
    middleware: Callback<T>[];
    type: string;
}
interface MethodContainer<T extends any[]> {
    middleware: Callback<T>[];
    final?: Callback<T>;
}
export interface Route<T extends any[]> extends RouteBase<T> {
    methods: Map<string, MethodContainer<T>>;
}
export interface Mount<T extends any[]> extends RouteBase<T> {
    router: Router<T>;
}
export interface RouterOptions {
    methods?: string[];
    name?: string;
}
export interface RouterRunResult {
    found_path: boolean;
    valid_method: boolean;
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
