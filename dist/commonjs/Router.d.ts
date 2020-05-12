/// <reference types="node" />
import * as nURL from "url";
import pathToRegexp from "path-to-regexp";
import RoutingData from "./RoutingData";
declare type CallableTypeReturn = boolean | void;
export interface Callback<T extends any[]> {
    (args: T, params?: RoutingData<T>): CallableTypeReturn | Promise<CallableTypeReturn>;
}
export interface RouteOptions {
    path: string;
    name?: string;
    methods?: string | string[];
    no_final?: boolean;
    options?: pathToRegexp.RegExpOptions;
    regex?: RegExp;
}
export interface MountOptions {
    path?: string;
    name?: string;
    options?: pathToRegexp.RegExpOptions;
    regex?: RegExp;
}
declare enum RouteTypes {
    MOUNT = "mount",
    ENDPT = "endpt",
    MDLWR = "mdlwr"
}
interface RouteBase<T extends any[]> {
    path: string;
    name: string;
    regex: RegExp;
    keys: pathToRegexp.Key[];
    middleware: Callback<T>[];
    type: RouteTypes;
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
    name?: string;
    method_case?: number;
}
export interface RouterRunResult {
    found_path: boolean;
    valid_method: boolean;
}
declare interface Router<T extends any[]> {
}
declare class Router<T extends any[]> {
    private opts;
    private routes;
    private parent;
    private children;
    readonly mount_key_name: string;
    readonly name: string;
    constructor(options?: RouterOptions);
    private checkMountPath;
    private getMethodStr;
    static routerToStr(router: Router<any[]>, depth: number, count: number): string;
    private static mapRegexToObj;
    static getRegex(route: pathToRegexp.Path, options: pathToRegexp.RegExpOptions): {
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
