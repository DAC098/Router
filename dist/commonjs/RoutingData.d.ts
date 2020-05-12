/// <reference types="node" />
import Router from "./Router";
import { URL } from "url";
interface ParamsObject {
    [key: string]: string;
}
declare class RoutingData<T extends any[]> {
    readonly prev_routers: Router<T>[];
    readonly prev_urls: URL[];
    params: ParamsObject;
    constructor(router_list: Router<T>[], url_list: URL[]);
    getRouter(): Router<T>;
    getURL(): URL;
}
export default RoutingData;
