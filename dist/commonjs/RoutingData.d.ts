/// <reference types="node" />
import Router from "./Router";
import { URL } from "url";
interface ParamsObject {
    [key: string]: string;
}
declare class RoutingData<T extends any[]> {
    readonly prev_routers: Router<T>[];
    readonly prev_urls: URL[];
    readonly method: string;
    readonly passing: T;
    params: ParamsObject;
    constructor(router_list: Router<T>[], url_list: URL[], method: string, passing: T);
    get router(): Router<T>;
    get url(): URL;
    getRouter(): Router<T>;
    getURL(): URL;
    redirect(path: string | URL, method?: string): Promise<{
        found_path: boolean;
        valid_method: boolean;
    }>;
    redirectWith(path: string | URL, method?: string, ...passing: T): Promise<{
        found_path: boolean;
        valid_method: boolean;
    }>;
}
export default RoutingData;
